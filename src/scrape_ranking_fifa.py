"""
scrape_ranking_fifa.py — Busca o ranking FIFA masculino via Selenium e
atualiza a planilha Excel (sheet Ranking_FIFA).

Fonte: https://inside.fifa.com/fifa-world-ranking/men

Uso:
    python scrape_ranking_fifa.py               # atualiza o Excel
    python scrape_ranking_fifa.py --dry-run     # só imprime sem salvar
    python scrape_ranking_fifa.py --headless    # sem abrir janela do browser (padrão)
    python scrape_ranking_fifa.py --no-headless # abre janela visível
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

sys.path.insert(0, str(Path(__file__).parent))
from config import EXCEL_INPUT

FIFA_URL = "https://inside.fifa.com/fifa-world-ranking/men"

# XPath da tabela — aguarda a primeira linha aparecer antes de extrair tudo
TBODY_XPATH      = '//*[@id="content"]/main/div[2]/div[2]/div[4]/div[1]/table/tbody'
FIRST_ROW_XPATH  = TBODY_XPATH + "/tr[1]"
SHOW_ALL_XPATH   = '/html/body/div[1]/div[1]/div[2]/main/div[2]/div[2]/div[5]/button'
TOTAL_SELECOES   = 211


# ─── Scraping via Selenium ────────────────────────────────────────────────────


def _criar_driver(headless: bool) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    # Suprime logs desnecessários do Chrome
    opts.add_experimental_option("excludeSwitches", ["enable-logging"])

    return webdriver.Chrome(options=opts)


def _fetch_selenium(headless: bool = True) -> pd.DataFrame:
    driver = _criar_driver(headless)
    try:
        print(f"  Abrindo {FIFA_URL} ...")
        driver.get(FIFA_URL)

        # Aguarda até a primeira linha da tabela estar presente (timeout 30s)
        wait = WebDriverWait(driver, 30)
        wait.until(EC.presence_of_element_located((By.XPATH, FIRST_ROW_XPATH)))

        # Clica no botão "Ver todas" para expandir de 10 → 211 seleções
        try:
            btn = wait.until(EC.element_to_be_clickable((By.XPATH, SHOW_ALL_XPATH)))
            driver.execute_script("arguments[0].click();", btn)
            print("  Botão 'Ver todas' clicado — aguardando carregamento completo...")
            # Aguarda até todas as linhas estarem presentes
            wait.until(lambda d: len(
                d.find_element(By.XPATH, TBODY_XPATH).find_elements(By.TAG_NAME, "tr")
            ) >= TOTAL_SELECOES)
        except Exception as e:
            print(f"  ⚠️  Botão não encontrado ou já expandido ({e})")

        # Extrai todas as linhas do tbody
        tbody = driver.find_element(By.XPATH, TBODY_XPATH)
        rows = tbody.find_elements(By.TAG_NAME, "tr")

        print(f"  {len(rows)} linhas encontradas na tabela")

        data = []
        for i, tr in enumerate(rows, start=1):
            cells = tr.find_elements(By.TAG_NAME, "td")
            if len(cells) < 6:
                continue
            ranking = i                          # posição = índice da linha
            time    = cells[1].text.strip()      # td[2] = nome do time

            # Pontos ficam em td[6] > h4 > span
            try:
                span = cells[5].find_element(By.CSS_SELECTOR, "h4 span")
                pontos = span.text.strip()
            except Exception:
                pontos = cells[5].text.strip()

            data.append({"Ranking": ranking, "Time": time, "Total_Pontos": pontos})

    finally:
        driver.quit()

    df = pd.DataFrame(data)
    df["Ranking"] = pd.to_numeric(df["Ranking"], errors="coerce")
    df["Total_Pontos"] = pd.to_numeric(
        df["Total_Pontos"].str.replace(",", ".", regex=False),
        errors="coerce",
    )
    df = df.dropna(subset=["Ranking", "Time"]).reset_index(drop=True)

    if len(df) < 50:
        raise RuntimeError(f"Poucos dados extraídos ({len(df)} linhas)")

    return df


# ─── Atualização do Excel ─────────────────────────────────────────────────────


def atualizar_excel(df: pd.DataFrame, dry_run: bool = False) -> None:
    print("\n📊 Top 10 do ranking obtido:")
    print(df.head(10).to_string(index=False))

    if dry_run:
        print("\n⚠️  --dry-run: Excel NÃO foi atualizado.")
        return

    if not EXCEL_INPUT.exists():
        print(f"❌ Arquivo Excel não encontrado: {EXCEL_INPUT}")
        return

    # Lê todas as abas, substitui Ranking_FIFA e reescreve
    with pd.ExcelFile(EXCEL_INPUT) as xls:
        abas = {aba: pd.read_excel(xls, aba) for aba in xls.sheet_names}

    abas["Ranking_FIFA"] = df[["Time", "Ranking", "Total_Pontos"]]

    # Atualiza coluna Ranking_FIFA na aba Selecoes
    selecoes = abas["Selecoes"].copy()
    ranking_map = df.set_index("Time")["Ranking"].to_dict()
    selecoes["Ranking_FIFA"] = selecoes["Club"].map(ranking_map)
    nao_encontrados = selecoes[selecoes["Ranking_FIFA"].isna()]["Club"].tolist()
    if nao_encontrados:
        print(f"  ⚠️  Sem ranking para: {nao_encontrados}")
    abas["Selecoes"] = selecoes

    with pd.ExcelWriter(EXCEL_INPUT, engine="openpyxl") as writer:
        for nome, frame in abas.items():
            frame.to_excel(writer, sheet_name=nome, index=False)

    print(f"\n✅ Excel atualizado: {EXCEL_INPUT}")
    print(f"   Seleções na Ranking_FIFA : {len(df)}")
    print(f"   Seleções atualizadas     : {selecoes['Ranking_FIFA'].notna().sum()}")


# ─── Execução direta ──────────────────────────────────────────────────────────


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Atualiza o ranking FIFA no Excel via Selenium")
    parser.add_argument("--dry-run", action="store_true", help="Imprime sem salvar no Excel")
    parser.add_argument("--no-headless", action="store_true", help="Abre janela visível do Chrome")
    args = parser.parse_args()

    headless = not args.no_headless

    print("🌐 Buscando ranking FIFA...")
    df = _fetch_selenium(headless=headless)
    print(f"  ✅ {len(df)} seleções extraídas")

    atualizar_excel(df, dry_run=args.dry_run)
