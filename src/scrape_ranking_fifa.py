"""
scrape_ranking_fifa.py — Busca o ranking FIFA masculino via Selenium e
atualiza a planilha Excel (sheet Ranking_FIFA).

Fonte: https://inside.fifa.com/fifa-world-ranking/men

Uso:
    python scrape_ranking_fifa.py               # atualiza o Excel
    python scrape_ranking_fifa.py --dry-run     # só imprime sem salvar
    python scrape_ranking_fifa.py --no-headless # abre janela visível do Chrome
"""

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException, NoSuchElementException

sys.path.insert(0, str(Path(__file__).parent))
from config import EXCEL_INPUT

FIFA_URL = "https://inside.fifa.com/fifa-world-ranking/men"
TOTAL_SELECOES = 211


# ─── Driver ───────────────────────────────────────────────────────────────────


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
    opts.add_experimental_option("excludeSwitches", ["enable-logging"])
    return webdriver.Chrome(options=opts)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _fechar_cookies(driver, wait):
    """Tenta fechar o banner de cookies clicando em 'I'm OK' ou 'Reject All'."""
    seletores = [
        "//button[contains(translate(text(),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ'), \"I'M OK\")]",
        '//button[contains(text(), "I\'m OK")]',
        "//button[contains(text(), 'Reject All')]",
        "//button[contains(text(), 'Accept')]",
    ]
    for xpath in seletores:
        try:
            btn = wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
            driver.execute_script("arguments[0].click();", btn)
            print("  Banner de cookies fechado.")
            time.sleep(1)
            return
        except TimeoutException:
            continue
    print("  Banner de cookies não encontrado ou já dispensado.")


def _clicar_show_full_rankings(driver, wait):
    """Clica no botão 'Show full rankings' / 'Ver ranking completo'."""
    seletores_xpath = [
        "//button[contains(text(), 'Show full rankings')]",
        "//button[contains(text(), 'Ver ranking completo')]",
        "//button[contains(text(), 'Show all')]",
        "//button[contains(text(), 'Ver todas')]",
        "//a[contains(text(), 'Show full rankings')]",
    ]
    for xpath in seletores_xpath:
        try:
            btn = wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
            driver.execute_script("arguments[0].click();", btn)
            print("  Botão 'Show full rankings' clicado.")
            return True
        except TimeoutException:
            continue

    # Fallback: procura qualquer botão com texto relevante
    try:
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            txt = btn.text.strip().lower()
            if any(
                k in txt
                for k in ["full ranking", "ranking completo", "show all", "ver todas"]
            ):
                driver.execute_script("arguments[0].click();", btn)
                print(f"  Botão encontrado por fallback: '{btn.text.strip()}'")
                return True
    except Exception:
        pass

    print(
        "  ⚠️  Botão 'Show full rankings' não encontrado — extraindo o que estiver visível."
    )
    return False


def _extrair_linhas(driver) -> list[dict]:
    """Extrai todas as linhas da tabela de ranking."""
    # Tenta localizar a tabela por CSS semântico
    tabela = None
    seletores_tabela = [
        "table tbody",
        "[class*='ranking'] tbody",
        "[class*='table'] tbody",
    ]
    for sel in seletores_tabela:
        try:
            tabela = driver.find_element(By.CSS_SELECTOR, sel)
            break
        except NoSuchElementException:
            continue

    if tabela is None:
        raise RuntimeError("Tabela de ranking não encontrada no DOM.")

    rows = tabela.find_elements(By.TAG_NAME, "tr")
    print(f"  {len(rows)} linhas encontradas na tabela")

    data = []
    for i, tr in enumerate(rows, start=1):
        cells = tr.find_elements(By.TAG_NAME, "td")
        if len(cells) < 2:
            continue

        # Posição: tenta ler da primeira célula; fallback = índice
        try:
            ranking_txt = cells[0].text.strip().split()[0]  # ex: "1" ou "1 ↑2"
            ranking = int(ranking_txt)
        except (ValueError, IndexError):
            ranking = i

        # Nome do time: segunda célula
        time_nome = cells[1].text.strip()
        if not time_nome:
            # Algumas estruturas colocam nome em célula diferente
            for cell in cells[2:4]:
                txt = cell.text.strip()
                if txt and not txt.replace(".", "").isdigit():
                    time_nome = txt
                    break

        # Pontos: última célula ou penúltima com número decimal
        pontos = ""
        for cell in reversed(cells):
            txt = cell.text.strip().replace(",", ".")
            try:
                float(txt)
                pontos = txt
                break
            except ValueError:
                continue

        if time_nome:
            data.append({"Ranking": ranking, "Time": time_nome, "Total_Pontos": pontos})

    return data


# ─── Scraping principal ───────────────────────────────────────────────────────


def _fetch_selenium(headless: bool = True) -> pd.DataFrame:
    driver = _criar_driver(headless)
    wait = WebDriverWait(driver, 30)

    try:
        print(f"  Abrindo {FIFA_URL} ...")
        driver.get(FIFA_URL)

        # 1. Fecha banner de cookies (pode bloquear cliques subsequentes)
        _fechar_cookies(driver, WebDriverWait(driver, 10))

        # 2. Aguarda pelo menos uma linha da tabela
        try:
            wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr"))
            )
        except TimeoutException:
            raise RuntimeError(
                "Tabela não carregou em 30s. Verifique se o site mudou a estrutura."
            )

        # 3. Expande para todas as seleções
        expandido = _clicar_show_full_rankings(driver, WebDriverWait(driver, 10))

        if expandido:
            # Aguarda mais linhas aparecerem (até 45s)
            try:
                WebDriverWait(driver, 45).until(
                    lambda d: (
                        len(d.find_elements(By.CSS_SELECTOR, "table tbody tr"))
                        >= TOTAL_SELECOES
                    )
                )
            except TimeoutException:
                n = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))
                print(
                    f"  ⚠️  Timeout aguardando {TOTAL_SELECOES} linhas — encontradas {n}."
                )

        # 4. Extrai dados
        data = _extrair_linhas(driver)

    finally:
        driver.quit()

    df = pd.DataFrame(data)
    df["Ranking"] = pd.to_numeric(df["Ranking"], errors="coerce")
    df["Total_Pontos"] = pd.to_numeric(
        df["Total_Pontos"].astype(str).str.replace(",", ".", regex=False),
        errors="coerce",
    )
    df = df.dropna(subset=["Ranking", "Time"]).reset_index(drop=True)

    if len(df) < 50:
        raise RuntimeError(
            f"Poucos dados extraídos ({len(df)} linhas). Verifique o seletor da tabela."
        )

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

    with pd.ExcelFile(EXCEL_INPUT) as xls:
        abas = {aba: pd.read_excel(xls, aba) for aba in xls.sheet_names}

    abas["Ranking_FIFA"] = df[["Time", "Ranking", "Total_Pontos"]]

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
    parser = argparse.ArgumentParser(
        description="Atualiza o ranking FIFA no Excel via Selenium"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Imprime sem salvar no Excel"
    )
    parser.add_argument(
        "--no-headless", action="store_true", help="Abre janela visível do Chrome"
    )
    args = parser.parse_args()

    print("🌐 Buscando ranking FIFA...")
    df = _fetch_selenium(headless=not args.no_headless)
    print(f"  ✅ {len(df)} seleções extraídas")

    atualizar_excel(df, dry_run=args.dry_run)
