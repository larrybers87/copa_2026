"""
gerar_html.py — Lê os dados do projeto e gera o index.html final com os dados embutidos.

Uso:
    python gerar_html.py

Saída:
    outputs/dashboard.html   ← abre direto no browser
"""

import json
import sys
from pathlib import Path

import pandas as pd

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
SRC_DIR = ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from config import (  # noqa: E402 # type: ignore
    EXCEL_INPUT,
    CSV_ANNUAL_BALANCE,
    CSV_RECORD_AGAINST,
    DATA_PROCESSED_DIR,
    OUTPUTS_DIR,  # noqa: F401
)

JSON_SIMULACAO = DATA_PROCESSED_DIR / "simulacao_grupos.json"

OUTPUT_DADOS = ROOT / "outputs" / "dados.js"

# Mapa Club → código ISO 3166-1 alpha-2 (para bandeiras via flagcdn.com)
# Adicione/corrija conforme necessário
ISO2_MAP = {
    "Albania": "al",
    "Algeria": "dz",
    "Argentina": "ar",
    "Australia": "au",
    "Austria": "at",
    "Belgium": "be",
    "Bolivia": "bo",
    "Bosnia and Herzegovina": "ba",
    "Brazil": "br",
    "Cameroon": "cm",
    "Canada": "ca",
    "Chile": "cl",
    "Colombia": "co",
    "Costa Rica": "cr",
    "Croatia": "hr",
    "Czech Republic": "cz",
    "Denmark": "dk",
    "Ecuador": "ec",
    "Egypt": "eg",
    "England": "gb-eng",
    "France": "fr",
    "Germany": "de",
    "Ghana": "gh",
    "Greece": "gr",
    "Honduras": "hn",
    "Hungary": "hu",
    "IR Iran": "ir",
    "Iceland": "is",
    "Indonesia": "id",
    "Ireland": "ie",
    "Israel": "il",
    "Italy": "it",
    "Ivory Coast": "ci",
    "Jamaica": "jm",
    "Japan": "jp",
    "Mexico": "mx",
    "Morocco": "ma",
    "Netherlands": "nl",
    "New Zealand": "nz",
    "Nigeria": "ng",
    "Northern Ireland": "gb-nir",
    "Norway": "no",
    "Panama": "pa",
    "Paraguay": "py",
    "Peru": "pe",
    "Poland": "pl",
    "Portugal": "pt",
    "Qatar": "qa",
    "Romania": "ro",
    "Saudi Arabia": "sa",
    "Scotland": "gb-sct",
    "Senegal": "sn",
    "Serbia": "rs",
    "Slovakia": "sk",
    "Slovenia": "si",
    "South Korea": "kr",
    "Spain": "es",
    "Sweden": "se",
    "Switzerland": "ch",
    "Tunisia": "tn",
    "Turkey": "tr",
    "Ukraine": "ua",
    "United States": "us",
    "Uruguay": "uy",
    "Venezuela": "ve",
    "Wales": "gb-wls",
}


def carregar_dados():
    print("📂 Carregando dados...")

    # Excel principal
    selecoes_df = pd.read_excel(EXCEL_INPUT, sheet_name="Selecoes")
    ranking_df = pd.read_excel(EXCEL_INPUT, sheet_name="Ranking_FIFA")
    jogos_df = pd.read_excel(EXCEL_INPUT, sheet_name="Jogos_Grupos")
    jogos_mata_df = pd.read_excel(EXCEL_INPUT, sheet_name="Jogos_MataMata")
    info_df = pd.read_excel(EXCEL_INPUT, sheet_name="Info_Selecoes")

    # CSVs gerados pelo scraping
    annual_df = (
        pd.read_csv(CSV_ANNUAL_BALANCE)
        if CSV_ANNUAL_BALANCE.exists()
        else pd.DataFrame()
    )
    record_df = (
        pd.read_csv(CSV_RECORD_AGAINST)
        if CSV_RECORD_AGAINST.exists()
        else pd.DataFrame()
    )

    return (
        selecoes_df,
        ranking_df,
        jogos_df,
        jogos_mata_df,
        info_df,
        annual_df,
        record_df,
    )


def montar_selecoes(selecoes_df, ranking_df, info_df):
    # Merge com ranking
    merged = selecoes_df.merge(
        ranking_df[["Time", "Ranking", "Total_Pontos"]],
        left_on="Club",
        right_on="Time",
        how="left",
    ).drop(columns=["Time"])

    # Merge com info (títulos, participações, confederação, arquivo de assets)
    merged = merged.merge(
        info_df[
            [
                "Club",
                "Primeiro_Lugar",
                "Segundo_Lugar",
                "Terceiro_Lugar",
                "Copas_Participacoes",
                "Confederacao",
                "Arquivo",
            ]
        ],
        on="Club",
        how="left",
    )

    # +1 participação (2026)
    merged["Copas_Participacoes"] = (
        merged["Copas_Participacoes"].fillna(0).astype(int) + 1
    )

    # Flag de repescagem
    merged["is_repescagem"] = merged["Obs"].str.strip().str.lower() == "repescagem"

    # Código ISO2 para bandeira (fallback quando não há asset local)
    merged["iso2"] = merged["Club"].map(ISO2_MAP)

    # Resolve paths dos assets locais (tenta .svg primeiro, depois .png)
    assets_dir = ROOT / "outputs" / "assets"

    def resolver_asset(arquivo, sufixo):
        """Retorna o path relativo 'assets/{arquivo}_{sufixo}.ext' se existir, senão None."""
        if pd.isna(arquivo) or not arquivo:
            return None
        for ext in ("svg", "png", "jpg", "webp"):
            nome = f"{arquivo}_{sufixo}.{ext}"
            if (assets_dir / nome).exists():
                return f"assets/{nome}"
        return None

    merged["asset_logo"] = merged["Arquivo"].apply(lambda a: resolver_asset(a, "logo"))
    merged["asset_bandeira"] = merged["Arquivo"].apply(
        lambda a: resolver_asset(a, "bandeira")
    )

    # Renomear para o JSON
    merged = merged.rename(
        columns={
            "Ranking": "Ranking_FIFA",
            "Primeiro_Lugar": "Copas_Titulos",
        }
    )
    merged["Copas_Titulos"] = merged["Copas_Titulos"].fillna(0).astype(int)

    # Renomeia coluna com acento para uso no JSON
    merged = merged.rename(columns={"Seleção": "Selecao"})

    colunas = [
        "Club",
        "Selecao",
        "Grupo",
        "Ranking_FIFA",
        "Total_Pontos",
        "Confederacao",
        "Copas_Titulos",
        "Copas_Participacoes",
        "Segundo_Lugar",
        "Terceiro_Lugar",
        "is_repescagem",
        "iso2",
        "asset_logo",
        "asset_bandeira",
    ]
    return merged[colunas].where(pd.notnull(merged[colunas]), None)


def montar_jogos(jogos_df):
    df = jogos_df.copy()
    df["DataHora"] = pd.to_datetime(df["DataHora"], errors="coerce")
    df["DataHora_str"] = df["DataHora"].dt.strftime("%Y-%m-%dT%H:%M")
    return df[["DataHora_str", "Local", "Grupo", "Time1", "Time2"]].rename(
        columns={"DataHora_str": "DataHora"}
    )


def montar_jogos_mata(jogos_mata_df):
    df = jogos_mata_df.copy()
    df["DataHora"] = pd.to_datetime(df["DataHora"], errors="coerce")
    df["DataHora_str"] = df["DataHora"].dt.strftime("%Y-%m-%dT%H:%M")
    return df[["DataHora_str", "Local", "Fase", "Time1", "Time2"]].rename(
        columns={"DataHora_str": "DataHora"}
    )


def montar_annual(annual_df):
    if annual_df.empty:
        return []
    for col in ["Matches", "Wins", "Draws", "Losses"]:
        annual_df[col] = (
            pd.to_numeric(annual_df[col], errors="coerce").fillna(0).astype(int)
        )
    return annual_df[["Team", "Year", "Matches", "Wins", "Draws", "Losses"]].to_dict(
        "records"
    )


def montar_record(record_df):
    if record_df.empty:
        return []
    for col in ["Matches", "Wins", "Draws", "Losses"]:
        record_df[col] = (
            pd.to_numeric(record_df[col], errors="coerce").fillna(0).astype(int)
        )
    return record_df[
        ["Team", "Opponent", "Matches", "Wins", "Draws", "Losses"]
    ].to_dict("records")


def gerar_dados_js(dados_json: str):
    """Gera dados.js com const DADOS = {...} para ser carregado pelo dashboard.html."""
    conteudo = f"// Gerado automaticamente por gerar_html.py — não edite manualmente\nconst DADOS = {dados_json};\n"
    OUTPUT_DADOS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_DADOS.write_text(conteudo, encoding="utf-8")
    print(f"✅ Dados gerados: {OUTPUT_DADOS}")
    print("   Abra no browser: outputs/dashboard.html")


def main():
    selecoes_df, ranking_df, jogos_df, jogos_mata_df, info_df, annual_df, record_df = (
        carregar_dados()
    )

    selecoes = montar_selecoes(selecoes_df, ranking_df, info_df)
    jogos = montar_jogos(jogos_df)
    jogos_mata = montar_jogos_mata(jogos_mata_df)
    annual = montar_annual(annual_df)
    record = montar_record(record_df)

    # Carrega JSON da simulação se existir
    simulacao = []
    if JSON_SIMULACAO.exists():
        import json as _json

        with open(JSON_SIMULACAO, encoding="utf-8") as f:
            simulacao = _json.load(f)
        print(f"   Simulação      : {len(simulacao)} grupo(s)")
    else:
        print("   Simulação      : não encontrada (rode simulation.py)")

    dados = {
        "selecoes": selecoes.to_dict("records"),
        "jogos_grupos": jogos.to_dict("records"),
        "jogos_mata": jogos_mata.to_dict("records"),
        "annual_balance": annual,
        "record_against": record,
        "simulacao": simulacao,
    }

    dados_json = json.dumps(dados, ensure_ascii=False, indent=2, default=str)

    print("\n📊 Resumo:")
    print(f"   Seleções       : {len(dados['selecoes'])}")
    print(f"   Jogos de grupo : {len(dados['jogos_grupos'])}")
    print(f"   Jogos mata-mata: {len(dados['jogos_mata'])}")
    print(f"   Annual balance : {len(dados['annual_balance'])}")
    print(f"   Record against : {len(dados['record_against'])}")

    gerar_dados_js(dados_json)


if __name__ == "__main__":
    main()
