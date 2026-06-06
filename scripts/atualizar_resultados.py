"""
scripts/atualizar_resultados.py

Busca resultados da Copa 2026 via football-data.org e atualiza
docs/resultados_reais.js com o objeto RESULTADOS_REAIS no formato
esperado por res.js: chave = "Grupo|Time1|Time2" com nomes em português.

Uso local:
    FOOTBALL_DATA_TOKEN=seu_token python scripts/atualizar_resultados.py

Em produção: executado pelo GitHub Actions (ver .github/workflows/atualizar_resultados.yml).
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERRO: requests não instalado. Execute: pip install requests")
    sys.exit(1)

# ─── Caminhos ─────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
DADOS_JS      = ROOT / "docs" / "dados.js"
RESULTADOS_JS = ROOT / "docs" / "resultados_reais.js"

# ─── API ──────────────────────────────────────────────────────────────────────
API_BASE    = "https://api.football-data.org/v4"
API_COMP    = "WC"
API_SEASON  = "2026"
API_TIMEOUT = 15

TOKEN = os.environ.get("FOOTBALL_DATA_TOKEN", "")

# ─── Mapeamento: nomes da API football-data.org → Club (inglês do projeto) ───
# O campo Club em DADOS.selecoes usa nomes definidos no Excel.
# A API pode devolver variantes — todas estão mapeadas aqui.
API_TO_CLUB: dict[str, str] = {
    # CONCACAF
    "Mexico":                     "Mexico",
    "United States":              "USA",
    "USA":                        "USA",
    "Canada":                     "Canada",
    "Panama":                     "Panama",
    "Haiti":                      "Haiti",
    "Curaçao":                    "Curaçao",
    "Curacao":                    "Curaçao",
    # UEFA
    "Spain":                      "Spain",
    "France":                     "France",
    "Germany":                    "Germany",
    "England":                    "England",
    "Portugal":                   "Portugal",
    "Netherlands":                "Netherlands",
    "Belgium":                    "Belgium",
    "Croatia":                    "Croatia",
    "Switzerland":                "Switzerland",
    "Austria":                    "Austria",
    "Sweden":                     "Sweden",
    "Norway":                     "Norway",
    "Scotland":                   "Scotland",
    "Czechia":                    "Czechia",
    "Czech Republic":             "Czechia",
    "Türkiye":                    "Türkiye",
    "Turkey":                     "Türkiye",
    "Bosnia and Herzegovina":     "Bosnia and Herzegovina",
    "Bosnia":                     "Bosnia and Herzegovina",
    # CONMEBOL
    "Argentina":                  "Argentina",
    "Brazil":                     "Brazil",
    "Uruguay":                    "Uruguay",
    "Colombia":                   "Colombia",
    "Ecuador":                    "Ecuador",
    "Paraguay":                   "Paraguay",
    # CAF
    "Morocco":                    "Morocco",
    "Senegal":                    "Senegal",
    "Egypt":                      "Egypt",
    "Algeria":                    "Algeria",
    "South Africa":               "South Africa",
    "Ghana":                      "Ghana",
    "Tunisia":                    "Tunisia",
    "Côte d'Ivoire":              "Côte d'Ivoire",
    "Ivory Coast":                "Côte d'Ivoire",
    "DR Congo":                   "Congo DR",
    "Congo DR":                   "Congo DR",
    "Congo, DR":                  "Congo DR",
    "Democratic Republic of Congo": "Congo DR",
    "Cabo Verde":                 "Cabo Verde",
    "Cape Verde":                 "Cabo Verde",
    # AFC
    "Japan":                      "Japan",
    "Korea Republic":             "Korea Republic",
    "South Korea":                "Korea Republic",
    "Australia":                  "Australia",
    "Saudi Arabia":               "Saudi Arabia",
    "IR Iran":                    "IR Iran",
    "Iran":                       "IR Iran",
    "Iraq":                       "Iraq",
    "Uzbekistan":                 "Uzbekistan",
    "Jordan":                     "Jordan",
    "Qatar":                      "Qatar",
    "New Zealand":                "New Zealand",
}

# ─── Mapeamento: Club (inglês do projeto) → Selecao (português dos jogos) ────
# Estes nomes devem bater exatamente com Time1/Time2 em DADOS.jogos_grupos.
CLUB_TO_PT: dict[str, str] = {
    "Algeria":                   "Argélia",
    "Argentina":                 "Argentina",
    "Australia":                 "Austrália",
    "Austria":                   "Áustria",
    "Belgium":                   "Bélgica",
    "Bosnia and Herzegovina":    "Bósnia",
    "Brazil":                    "Brasil",
    "Cabo Verde":                "Cabo Verde",
    "Canada":                    "Canadá",
    "Colombia":                  "Colômbia",
    "Congo DR":                  "RD Congo",
    "Croatia":                   "Croácia",
    "Curaçao":                   "Curaçao",
    "Czechia":                   "República Theca",
    "Côte d'Ivoire":             "Costa do Marfim",
    "Ecuador":                   "Equador",
    "Egypt":                     "Egito",
    "England":                   "Inglaterra",
    "France":                    "França",
    "Germany":                   "Alemanha",
    "Ghana":                     "Gana",
    "Haiti":                     "Haiti",
    "IR Iran":                   "Irã",
    "Iraq":                      "Iraque",
    "Japan":                     "Japão",
    "Jordan":                    "Jordânia",
    "Korea Republic":            "Coreia do Sul",
    "Mexico":                    "México",
    "Morocco":                   "Marrocos",
    "Netherlands":               "Holanda",
    "New Zealand":               "Nova Zelândia",
    "Norway":                    "Noruega",
    "Panama":                    "Panamá",
    "Paraguay":                  "Paraguai",
    "Portugal":                  "Portugal",
    "Qatar":                     "Catar",
    "Saudi Arabia":              "Arábia Saudita",
    "Scotland":                  "Escócia",
    "Senegal":                   "Senegal",
    "South Africa":              "África do Sul",
    "Spain":                     "Espanha",
    "Sweden":                    "Suécia",
    "Switzerland":               "Suíça",
    "Tunisia":                   "Tunísia",
    "Türkiye":                   "Turquia",
    "USA":                       "Estados Unidos",
    "Uruguay":                   "Uruguai",
    "Uzbekistan":                "Uzbequistão",
}


def parse_dados_js() -> dict:
    """Lê docs/dados.js e retorna o objeto DADOS como dict Python."""
    txt = DADOS_JS.read_text(encoding="utf-8")
    txt = re.sub(r"^.*?const DADOS\s*=\s*", "", txt, flags=re.DOTALL)
    txt = txt.rstrip().rstrip(";").rstrip()
    txt = re.sub(r":\s*NaN\b", ": null", txt)
    txt = re.sub(r"\[\s*NaN\b", "[null", txt)
    txt = re.sub(r",\s*NaN\b", ", null", txt)
    return json.loads(txt)


def build_jogo_lookup(dados: dict) -> dict[frozenset, str]:
    """
    Constrói {frozenset({time1_pt, time2_pt}): chave} para os 72 jogos.
    A chave é "Grupo|Time1|Time2" como usado em RESULTADOS_REAIS.
    Usa frozenset para ser agnóstico à ordem home/away da API.
    """
    lookup: dict[frozenset, str] = {}
    for j in dados["jogos_grupos"]:
        chave = f"{j['Grupo']}|{j['Time1']}|{j['Time2']}"
        key   = frozenset([j["Time1"], j["Time2"]])
        lookup[key] = chave
    return lookup


def buscar_jogos_api() -> list | None:
    """
    Busca jogos da Copa 2026 via football-data.org.
    Retorna lista de partidas ou None em caso de erro.
    """
    url     = f"{API_BASE}/competitions/{API_COMP}/matches"
    params  = {"season": API_SEASON}
    headers = {"X-Auth-Token": TOKEN} if TOKEN else {}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=API_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return data.get("matches", [])
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            print(f"AVISO: API retornou 404 — Copa 2026 pode ainda não estar disponível na API.")
        elif status == 401:
            print(f"AVISO: API retornou 401 — FOOTBALL_DATA_TOKEN inválido ou ausente.")
        elif status == 429:
            print(f"AVISO: API retornou 429 — rate limit atingido (free tier: 10 req/min).")
        else:
            print(f"AVISO: Erro HTTP {status}: {e}")
        return None
    except Exception as e:
        print(f"AVISO: Erro ao acessar a API: {e}")
        return None


def traduzir_time(api_name: str) -> str | None:
    """
    Converte nome da API → português.
    Retorna None se o time não for reconhecido.
    """
    club = API_TO_CLUB.get(api_name)
    if club is None:
        return None
    return CLUB_TO_PT.get(club)


def processar_jogos(matches_api: list, jogo_lookup: dict) -> dict:
    """
    Filtra jogos FINISHED da fase de grupos e gera dict RESULTADOS_REAIS.
    Retorna {chave: {gols_time1, gols_time2, confirmado}}.
    """
    resultados: dict = {}
    ignorados: list[str] = []

    for m in matches_api:
        if m.get("stage") != "GROUP_STAGE" or m.get("status") != "FINISHED":
            continue

        ft = m.get("score", {}).get("fullTime", {})
        g_home = ft.get("home")
        g_away = ft.get("away")

        if g_home is None or g_away is None:
            continue

        home_name = m.get("homeTeam", {}).get("name", "")
        away_name = m.get("awayTeam", {}).get("name", "")

        home_pt = traduzir_time(home_name)
        away_pt = traduzir_time(away_name)

        if home_pt is None or away_pt is None:
            desconhecidos = [n for n, t in [(home_name, home_pt), (away_name, away_pt)] if t is None]
            ignorados.append(f"{home_name} vs {away_name} (nome(s) nao reconhecido(s): {desconhecidos})")
            continue

        key   = frozenset([home_pt, away_pt])
        chave = jogo_lookup.get(key)

        if chave is None:
            ignorados.append(f"{home_pt} vs {away_pt} (par nao encontrado no calendario)")
            continue

        # chave = "Grupo|Time1|Time2" — Time1 pode ser home ou away na API
        _, t1, _ = chave.split("|", 2)
        if t1 == home_pt:
            g1, g2 = int(g_home), int(g_away)
        else:
            g1, g2 = int(g_away), int(g_home)

        resultados[chave] = {"gols_time1": g1, "gols_time2": g2, "confirmado": True}

    if ignorados:
        print(f"AVISO: {len(ignorados)} jogo(s) ignorado(s) por nome nao reconhecido:")
        for msg in ignorados:
            print(f"  - {msg}")
        print("  → Adicione o(s) nome(s) ao dict API_TO_CLUB em scripts/atualizar_resultados.py")

    return resultados


def escrever_vazio():
    """Grava resultados_reais.js vazio (sem alterar se já existe)."""
    if not RESULTADOS_JS.exists():
        RESULTADOS_JS.write_text("const RESULTADOS_REAIS = {};\n", encoding="utf-8")
        print("  Arquivo criado vazio.")
    else:
        print("  Arquivo existente mantido sem alteracao.")


def gerar_conteudo_js(resultados: dict) -> str:
    """Gera o conteúdo completo de docs/resultados_reais.js."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    partes = [
        f"// Atualizado automaticamente em {ts} UTC",
        "// NÃO edite manualmente — gerado por scripts/atualizar_resultados.py",
        "const RESULTADOS_REAIS =",
        json.dumps(resultados, ensure_ascii=False, indent=2),
        ";",
    ]
    return "\n".join(partes) + "\n"


def main():
    print("Atualizando resultados da Copa 2026...")

    # Lê calendário de jogos do projeto
    try:
        dados = parse_dados_js()
    except Exception as e:
        print(f"ERRO ao ler dados.js: {e}")
        escrever_vazio()
        return

    jogo_lookup = build_jogo_lookup(dados)
    print(f"  {len(jogo_lookup)} jogos de grupos no calendario")

    if not TOKEN:
        print("AVISO: FOOTBALL_DATA_TOKEN nao definido — a API pode rejeitar a requisicao.")

    # Busca via API
    matches = buscar_jogos_api()
    if matches is None:
        print("  API indisponivel — resultados_reais.js nao sera alterado.")
        escrever_vazio()
        return

    print(f"  {len(matches)} partidas retornadas pela API")

    # Processa e filtra
    resultados = processar_jogos(matches, jogo_lookup)
    print(f"  {len(resultados)}/72 jogos com resultado confirmado")

    # Escreve arquivo
    conteudo = gerar_conteudo_js(resultados)
    RESULTADOS_JS.write_text(conteudo, encoding="utf-8")
    print(f"  Salvo: {RESULTADOS_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
