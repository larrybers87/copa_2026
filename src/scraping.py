"""
scraping.py — Scraping do Transfermarkt.

Funções:
    get_annual_balance(team_id, team_name) -> DataFrame | None
    get_record_against(team_id, team_name) -> DataFrame | None
    coletar_todos(selecoes_df)             -> (annual_df, record_df)

Usa requests.Session para reuso de conexão e respeita os delays do config.
Retry automático com backoff exponencial em caso de timeout ou erro HTTP.
"""

import time
import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.exceptions import Timeout, ConnectionError as ReqConnectionError

from config import (
    TRANSFERMARKT_BASE,
    HEADERS,
    SCRAPING_DELAY,
    PAGE_DELAY,
    REQUEST_TIMEOUT,
    ANO_INICIO,
    CSV_ANNUAL_BALANCE,
    CSV_RECORD_AGAINST,
    MAX_RETRIES,
    BACKOFF_BASE,
    MAX_RETRY_ROUNDS,
)

# ─── Configuração de retry ────────────────────────────────────────────────────

RETRY_ON_HTTP = {429, 500, 502, 503, 504}  # códigos que justificam retry


# ─── Session compartilhada ────────────────────────────────────────────────────


def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


# ─── Request com retry e backoff ─────────────────────────────────────────────


def _get_with_retry(
    session: requests.Session,
    url: str,
    team_name: str = "",
) -> requests.Response | None:
    """
    Faz GET com retry automático em caso de timeout ou HTTP 5xx/429.
    Backoff exponencial: espera 5s, 10s, 20s entre tentativas.
    Retorna Response ou None se todas as tentativas falharem.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 200:
                return resp

            if resp.status_code in RETRY_ON_HTTP:
                wait = BACKOFF_BASE * (2 ** (attempt - 1))
                print(
                    f"   ⚠️  HTTP {resp.status_code} — tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
                )
                time.sleep(wait)
                continue

            # HTTP definitivo (ex: 403, 404) — não adianta retry
            print(f"   ❌ HTTP {resp.status_code} — {team_name} (sem retry)")
            return None

        except (Timeout, ReqConnectionError) as e:
            wait = BACKOFF_BASE * (2 ** (attempt - 1))
            err_type = "Timeout" if isinstance(e, Timeout) else "ConnectionError"
            print(
                f"   ⚠️  {err_type} — tentativa {attempt}/{MAX_RETRIES}, aguardando {wait}s..."
            )
            time.sleep(wait)

        except Exception as e:
            print(f"   ❌ Erro inesperado — {team_name}: {e}")
            return None

    print(f"   ❌ Falhou após {MAX_RETRIES} tentativas — {team_name}")
    return None


# ─── Annual Balance ───────────────────────────────────────────────────────────


def get_annual_balance(
    team_id: int,
    team_name: str,
    session: requests.Session | None = None,
) -> pd.DataFrame | None:
    """
    Coleta balanço anual de uma seleção desde ANO_INICIO.
    URL: /--/jahresbilanz/verein/{team_id}
    Colunas retornadas: Team, Year, Matches, Wins, Draws, Losses, Points_Per_Match
    """
    s = session or _make_session()
    url = f"{TRANSFERMARKT_BASE}/-/jahresbilanz/verein/{team_id}"

    try:
        resp = _get_with_retry(s, url, team_name)
        if resp is None:
            return None

        soup = BeautifulSoup(resp.content, "html.parser")
        table = soup.find("table", {"class": "items"})
        if not table:
            print(f"   ⚠️  Tabela não encontrada — {team_name}")
            return None

        data = []
        for row in table.find("tbody").find_all("tr"):
            cols = row.find_all("td")
            if len(cols) < 6:
                continue
            year = cols[0].text.strip()
            try:
                if int(year) < ANO_INICIO:
                    continue
            except ValueError:
                continue

            data.append(
                {
                    "Team": team_name,
                    "Year": year,
                    "Matches": cols[1].text.strip(),
                    "Wins": cols[2].text.strip(),
                    "Draws": cols[3].text.strip(),
                    "Losses": cols[4].text.strip(),
                    "Points_Per_Match": cols[5].text.strip(),
                }
            )

        if not data:
            print(f"   ⚠️  Sem dados recentes — {team_name}")
            return None

        df = pd.DataFrame(data)
        for col in ["Matches", "Wins", "Draws", "Losses"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["Points_Per_Match"] = pd.to_numeric(df["Points_Per_Match"], errors="coerce")

        print(f"   ✅ {team_name}: {len(df)} ano(s)")
        return df

    except Exception as e:
        print(f"   ❌ Erro — {team_name}: {e}")
        return None


# ─── Record Against ───────────────────────────────────────────────────────────


def get_record_against(
    team_id: int,
    team_name: str,
    session: requests.Session | None = None,
) -> pd.DataFrame | None:
    """
    Coleta histórico de confrontos diretos contra todas as seleções.
    URL: /--/bilanz/verein/{team_id}[/page/{n}]
    Colunas retornadas: Team, Opponent, Matches, Wins, Draws, Losses
    """
    s = session or _make_session()
    url_base = f"{TRANSFERMARKT_BASE}/-/bilanz/verein/{team_id}"

    try:
        resp = _get_with_retry(s, url_base, team_name)
        if resp is None:
            return None

        soup = BeautifulSoup(resp.content, "html.parser")
        table = soup.find("table", {"class": "items"})
        if not table:
            print(f"   ⚠️  Tabela não encontrada — {team_name}")
            return None

        # Detectar total de páginas
        total_pages = 1
        for item in soup.find_all("li", {"class": "tm-pagination__list-item"}):
            link = item.find("a", {"class": "tm-pagination__link"})
            if link and link.text.strip().isdigit():
                total_pages = max(total_pages, int(link.text.strip()))

        print(f"   📄 {team_name}: {total_pages} página(s)")

        all_data = []

        for page in range(1, total_pages + 1):
            if page > 1:
                time.sleep(PAGE_DELAY)
                url = f"{url_base}/page/{page}"
                resp = _get_with_retry(s, url, f"{team_name} p{page}")
                if resp is None:
                    print(f"      ⚠️  Pulando página {page}/{total_pages}")
                    continue
                soup = BeautifulSoup(resp.content, "html.parser")
                table = soup.find("table", {"class": "items"})
                if not table:
                    continue

            page_count = 0
            for row in table.find("tbody").find_all("tr"):
                cols = row.find_all("td")
                if len(cols) < 8:
                    continue
                all_data.append(
                    {
                        "Team": team_name,
                        "Opponent": cols[2].text.strip(),
                        "Matches": cols[4].text.strip(),
                        "Wins": cols[5].text.strip(),
                        "Draws": cols[6].text.strip(),
                        "Losses": cols[7].text.strip(),
                    }
                )
                page_count += 1

            print(f"      ✓ Página {page}/{total_pages}: {page_count} confrontos")

        if not all_data:
            print(f"   ⚠️  Sem dados — {team_name}")
            return None

        df = pd.DataFrame(all_data)
        for col in ["Matches", "Wins", "Draws", "Losses"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        print(f"   ✅ {team_name}: {len(df)} confrontos")
        return df

    except Exception as e:
        print(f"   ❌ Erro — {team_name}: {e}")
        return None


# ─── Coleta completa ──────────────────────────────────────────────────────────


def coletar_todos(
    selecoes_df: pd.DataFrame,
    skip_annual: bool = False,
    skip_record: bool = False,
    max_retry_rounds: int = MAX_RETRY_ROUNDS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Itera sobre todas as seleções e coleta annual_balance + record_against.

    Parâmetros
    ----------
    skip_annual      : pula balanço anual (usa CSV existente)
    skip_record      : pula confrontos diretos (usa CSV existente)
    max_retry_rounds : quantas rodadas extras de retry para os falhos

    Retorna
    -------
    (annual_df, record_df) — DataFrames consolidados e salvos em CSV
    """
    selecoes_validas = selecoes_df[selecoes_df["id_transfermarkt"].notna()].copy()
    total = len(selecoes_validas)

    session = _make_session()
    annual_list = []
    record_list = []

    # Filas de falhos: lista de (team_id, team_name)
    annual_falhos: list[tuple[int, str]] = []
    record_falhos: list[tuple[int, str]] = []

    # ── Rodada principal ──────────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print(f"🔄 RODADA PRINCIPAL — {total} seleções")
    print(f"{'=' * 60}")

    for i, (_, row) in enumerate(selecoes_validas.iterrows(), start=1):
        team_name = row["Club"]
        team_id = int(row["id_transfermarkt"])

        print(f"\n[{i}/{total}] {team_name} (ID: {team_id})")

        if not skip_annual:
            df = get_annual_balance(team_id, team_name, session)
            if df is not None:
                annual_list.append(df)
            else:
                annual_falhos.append((team_id, team_name))

        if not skip_record:
            df = get_record_against(team_id, team_name, session)
            if df is not None:
                record_list.append(df)
            else:
                record_falhos.append((team_id, team_name))

        time.sleep(SCRAPING_DELAY)

    # ── Rodadas de retry para falhos ──────────────────────────────────────────
    for round_num in range(1, max_retry_rounds + 1):
        ainda_falhos_annual = []
        ainda_falhos_record = []

        if not annual_falhos and not record_falhos:
            break

        total_falhos = len(set(annual_falhos) | set(record_falhos))
        print(f"\n{'=' * 60}")
        print(
            f"♻️  RODADA RETRY {round_num}/{max_retry_rounds} — {total_falhos} seleção(ões) com falha"
        )
        print(f"{'=' * 60}")

        # Espera maior antes de retentar (servidor pode estar sobrecarregado)
        wait_pre = BACKOFF_BASE * (2**round_num)
        print(f"   Aguardando {wait_pre}s antes de retentar...")
        time.sleep(wait_pre)

        # Retry annual
        for team_id, team_name in annual_falhos:
            print(f"\n   [annual] {team_name} (ID: {team_id})")
            df = get_annual_balance(team_id, team_name, session)
            if df is not None:
                annual_list.append(df)
                print(f"   ✅ Recuperado: {team_name} (annual)")
            else:
                ainda_falhos_annual.append((team_id, team_name))
            time.sleep(SCRAPING_DELAY)

        # Retry record
        for team_id, team_name in record_falhos:
            print(f"\n   [record] {team_name} (ID: {team_id})")
            df = get_record_against(team_id, team_name, session)
            if df is not None:
                record_list.append(df)
                print(f"   ✅ Recuperado: {team_name} (record)")
            else:
                ainda_falhos_record.append((team_id, team_name))
            time.sleep(SCRAPING_DELAY)

        annual_falhos = ainda_falhos_annual
        record_falhos = ainda_falhos_record

    # ── Relatório final de falhos ─────────────────────────────────────────────
    _relatorio_falhos(annual_falhos, record_falhos)

    # ── Consolidar e salvar ───────────────────────────────────────────────────
    annual_df = (
        pd.concat(annual_list, ignore_index=True) if annual_list else pd.DataFrame()
    )
    record_df = (
        pd.concat(record_list, ignore_index=True) if record_list else pd.DataFrame()
    )

    if not annual_df.empty:
        annual_df.to_csv(CSV_ANNUAL_BALANCE, index=False)
        print(f"\n💾 Salvo: {CSV_ANNUAL_BALANCE} ({len(annual_df)} linhas)")

    if not record_df.empty:
        record_df.to_csv(CSV_RECORD_AGAINST, index=False)
        print(f"💾 Salvo: {CSV_RECORD_AGAINST} ({len(record_df)} linhas)")

    return annual_df, record_df


def _relatorio_falhos(
    annual_falhos: list[tuple[int, str]],
    record_falhos: list[tuple[int, str]],
) -> None:
    """Imprime relatório final das seleções que não foram coletadas."""
    if not annual_falhos and not record_falhos:
        print("\n✅ Todas as seleções coletadas com sucesso!")
        return

    print(f"\n{'=' * 60}")
    print("⚠️  SELEÇÕES NÃO COLETADAS APÓS TODOS OS RETRIES")
    print(f"{'=' * 60}")

    if annual_falhos:
        print(f"\n   Annual Balance ({len(annual_falhos)}):")
        for tid, tname in annual_falhos:
            print(f"      • {tname} (ID: {tid})")

    if record_falhos:
        print(f"\n   Record Against ({len(record_falhos)}):")
        for tid, tname in record_falhos:
            print(f"      • {tname} (ID: {tid})")

    print("\n   💡 Para retentar manualmente:")
    todos = list({t for t in annual_falhos + record_falhos})
    ids = [str(t[0]) for t in todos]
    names = [t[1] for t in todos]
    print(f"      IDs  : {', '.join(ids)}")
    print(f"      Times: {', '.join(names)}")
    print(f"{'=' * 60}")


# ─── Execução direta ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))

    from data_loader import carregar_dados

    selecoes, *_ = carregar_dados()

    # Teste com apenas 1 seleção
    teste = selecoes[selecoes["Club"] == "Brazil"].iloc[:1]
    print("=== TESTE: Brazil ===")
    session = _make_session()
    team_id = int(teste.iloc[0]["id_transfermarkt"])

    annual = get_annual_balance(team_id, "Brazil", session)
    print(annual)

    record = get_record_against(team_id, "Brazil", session)
    print(record.head() if record is not None else "Sem dados")
