"""
config.py — Constantes, paths e configurações globais do projeto Copa 2026.
Altere aqui sem precisar mexer nos outros módulos.
"""

from pathlib import Path
from datetime import datetime

# ─── Paths ────────────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).resolve().parent.parent

DATA_RAW_DIR = ROOT_DIR / "data" / "raw"
DATA_PROCESSED_DIR = ROOT_DIR / "data" / "processed"
OUTPUTS_DIR = ROOT_DIR / "outputs"
FIGURES_DIR = OUTPUTS_DIR / "figures"

EXCEL_INPUT = DATA_RAW_DIR / "Dados_Selecoes.xlsx"
EXCEL_OUTPUT = DATA_PROCESSED_DIR / "Dados_Selecoes_Completo.xlsx"

CSV_ANNUAL_BALANCE = DATA_PROCESSED_DIR / "annual_balance.csv"
CSV_RECORD_AGAINST = DATA_PROCESSED_DIR / "record_against.csv"
CSV_STATS_GERAIS = DATA_PROCESSED_DIR / "estatisticas_gerais.csv"

# ─── Scraping ─────────────────────────────────────────────────────────────────

TRANSFERMARKT_BASE = "https://www.transfermarkt.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

SCRAPING_DELAY = 3  # segundos entre seleções
PAGE_DELAY = 1  # segundos entre páginas de paginação
REQUEST_TIMEOUT = 15  # segundos

# Retry com backoff exponencial
MAX_RETRIES = 3  # tentativas por request individual
BACKOFF_BASE = 5  # segundos base: 5s, 10s, 20s...
MAX_RETRY_ROUNDS = 2  # rodadas extras de retry no coletar_todos

# ─── Dados ────────────────────────────────────────────────────────────────────

ANO_INICIO = datetime.now().year - 5  # últimos 5 anos no balanço anual

# Abas esperadas no Excel
SHEET_SELECOES = "Selecoes"
SHEET_RANKING = "Ranking_FIFA"
SHEET_JOGOS_GRUPOS = "Jogos_Grupos"
SHEET_JOGOS_MATA = "Jogos_MataMata"

# ─── Visualização ─────────────────────────────────────────────────────────────

CORES = {
    "primaria": "#1f77b4",
    "secundaria": "#ff7f0e",
    "terciaria": "#2ca02c",
    "destaque": "#d62728",
    "neutro": "#7f7f7f",
}

PLOT_STYLE = "seaborn-v0_8-darkgrid"
PLOT_PALETTE = "husl"
PLOT_DPI = 300

# ─── Simulação ────────────────────────────────────────────────────────────────

RANDOM_SEED = 42

# Pontuação fase de grupos
PONTOS_VITORIA = 3
PONTOS_EMPATE = 1
PONTOS_DERROTA = 0
