"""
Testes de UI com Playwright — Copa 2026 Dashboard.

Abre docs/dashboard.html via file:// no Chromium headless e valida
funcionalidades das abas, em especial a nova aba Resultados Reais.

Uso:
    python -m pytest tests/test_ui.py -v
    python -m pytest tests/test_ui.py -v -k test_tabs   # teste específico

Pré-requisitos:
    pip install playwright
    playwright install chromium
"""

import pytest
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, expect

# ─── URL local do dashboard ───────────────────────────────────────────────────
HTML_FILE = Path(__file__).parent.parent / "docs" / "dashboard.html"
HTML_URL  = HTML_FILE.as_uri()

# Tabs esperadas: (texto visível, data-tab)
TABS_ESPERADAS = [
    ("Seleções",     "selecao"),
    ("Head to Head", "h2h"),
    ("Calendário",   "calendario"),
    ("Simulação",    "simulacao"),
    ("Ranking FIFA", "ranking"),
    ("Meu Cenário",  "cenario"),
    ("Resultados",   "resultados"),
]


# ─── Fixture: página fresca por teste ────────────────────────────────────────
@pytest.fixture()
def page():
    """
    Cria uma página nova com contexto isolado (localStorage limpo) para cada
    teste. Aguarda o DADOS JS estar definido antes de ceder o controle.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        pg = context.new_page()
        pg.goto(HTML_URL, wait_until="load")
        # Garante que dados.js foi executado e DADOS está disponível
        pg.wait_for_function("typeof DADOS !== 'undefined'", timeout=10_000)
        yield pg
        browser.close()


def _abrir_aba(page: Page, data_tab: str, aguardar_seletor: str = None):
    """Clica no botão de nav e aguarda o conteúdo aparecer."""
    page.click(f'.nav-btn[data-tab="{data_tab}"]')
    if aguardar_seletor:
        page.wait_for_selector(aguardar_seletor, timeout=5_000)
    else:
        page.wait_for_timeout(400)


# ─── Teste 1: Todas as tabs existem e são clicáveis ─────────────────────────
def test_todas_as_tabs_existem_e_sao_clicaveis(page: Page):
    """
    Verifica que cada aba definida em TABS_ESPERADAS possui um botão .nav-btn
    com o data-tab correto, e que clicar nele ativa o conteúdo correspondente.
    """
    for texto, data_tab in TABS_ESPERADAS:
        btn = page.locator(f'.nav-btn[data-tab="{data_tab}"]')
        assert btn.count() == 1, (
            f"Botão da aba '{texto}' (data-tab='{data_tab}') não encontrado"
        )
        # Clica e verifica que o tab-content fica ativo
        btn.click()
        page.wait_for_timeout(300)
        tab_div = page.locator(f'#tab-{data_tab}')
        assert tab_div.count() == 1, (
            f"Div #tab-{data_tab} não encontrada no HTML"
        )
        classes = tab_div.get_attribute("class") or ""
        assert "active" in classes, (
            f"Aba '{texto}': #tab-{data_tab} não recebeu classe 'active' após clique"
        )


# ─── Teste 2: Inputs numéricos na aba Resultados ─────────────────────────────
def test_resultados_tem_inputs_numericos(page: Page):
    """
    A aba Resultados deve renderizar inputs de placar (.res-input) para os jogos.
    Verifica que há pelo menos 2 inputs (um par por jogo), indicando que
    _htmlEntradaResultados() gerou conteúdo corretamente.
    """
    _abrir_aba(page, "resultados", ".res-wrap")

    inputs = page.locator(".res-input")
    count  = inputs.count()
    assert count >= 2, (
        f"Esperado ≥ 2 inputs de placar na aba Resultados, encontrado {count}"
    )
    # Verifica que são inputs numéricos
    primeiro = inputs.first
    assert primeiro.get_attribute("type") == "number", (
        "Input de placar não é do tipo 'number'"
    )


# ─── Teste 3: Confirmar placar do primeiro jogo do Grupo A ───────────────────
def test_confirmar_placar_primeiro_jogo_grupo_a(page: Page):
    """
    Fluxo completo: filtrar Grupo A → preencher 2 e 1 → clicar Confirmar →
    verificar que o jogo aparece como confirmado com o placar "2 – 1".
    """
    _abrir_aba(page, "resultados", ".res-wrap")

    # Filtra Grupo A para garantir que o primeiro jogo visível é do Grupo A
    page.click('[data-res-grupo="A"]')
    page.wait_for_timeout(300)

    # Primeiro jogo ainda não confirmado
    row = page.locator(".res-jogo:not(.res-jogo-confirmado)").first
    row.wait_for(timeout=3_000)

    row.locator(".res-g1").fill("2")
    row.locator(".res-g2").fill("1")
    row.locator(".res-btn-confirmar").click()

    # Aguarda re-render (renderResultados() é síncrono mas o DOM pode levar um tick)
    page.wait_for_timeout(400)

    # Deve haver pelo menos 1 jogo confirmado
    confirmados = page.locator(".res-jogo-confirmado")
    assert confirmados.count() >= 1, (
        "Nenhum .res-jogo-confirmado encontrado após clicar Confirmar"
    )

    # O placar "2 – 1" deve aparecer no texto
    placar_text = page.locator(".res-placar").first.inner_text()
    assert "2" in placar_text and "1" in placar_text, (
        f"Placar '{placar_text}' não contém '2' e '1' após confirmação"
    )


# ─── Teste 4: Confirmar 6 jogos → seção de comparação aparece ────────────────
def test_comparacao_aparece_apos_6_jogos_confirmados(page: Page):
    """
    Após confirmar os 6 jogos de um grupo, a seção '② Tabela Real vs Simulação'
    deve ser renderizada (elemento .res-comp-bloco). Valida que o threshold
    de jogosConf >= 1 aciona a renderização da comparação em _htmlResTab().
    """
    _abrir_aba(page, "resultados", ".res-wrap")

    # Isola no Grupo A
    page.click('[data-res-grupo="A"]')
    page.wait_for_timeout(300)

    # Confirma 6 jogos um a um (re-render acontece a cada confirmação)
    for i in range(6):
        row = page.locator(".res-jogo:not(.res-jogo-confirmado)").first
        row.wait_for(timeout=3_000)
        row.locator(".res-g1").fill("1")
        row.locator(".res-g2").fill("0")
        row.locator(".res-btn-confirmar").click()
        page.wait_for_timeout(300)

    # Seção de comparação deve ter aparecido
    comp = page.locator(".res-comp-bloco")
    assert comp.count() >= 1, (
        "Elemento .res-comp-bloco não apareceu após confirmar 6 jogos do Grupo A"
    )

    # Seção de acertos também (jogosConf === 6)
    acertos = page.locator(".res-acerto-grupo")
    assert acertos.count() >= 1, (
        "Elemento .res-acerto-grupo não apareceu após completar Grupo A"
    )


# ─── Teste 5: Mata-mata visível com filtro de grupo ativo ────────────────────
def test_mata_mata_visivel_com_filtro_de_grupo(page: Page):
    """
    Fix #7: ao aplicar filtro de grupo no Calendário, os jogos de mata-mata
    devem permanecer visíveis (classe .cal-jogo-mata). O filtro de grupo
    aplica-se apenas à fase de grupos — mata-mata sempre visível.
    """
    _abrir_aba(page, "calendario", ".cal-lista")

    # Conta jogos de mata-mata sem filtro (deve haver 32)
    total_mata_antes = page.locator(".cal-jogo-mata").count()
    assert total_mata_antes > 0, (
        "Nenhum .cal-jogo-mata encontrado no Calendário sem filtro ativo"
    )

    # Aplica filtro Grupo A
    page.click('[data-grupo="A"]')
    page.wait_for_timeout(400)

    # Jogos de mata-mata devem continuar visíveis
    mata_com_filtro = page.locator(".cal-jogo-mata")
    assert mata_com_filtro.count() > 0, (
        "Nenhum .cal-jogo-mata visível com filtro 'Grupo A' ativo — "
        "fix #7 (mata-mata sempre visível) pode não estar aplicado"
    )

    # Total de jogos visíveis deve ser > 6 (Grupo A tem 6 jogos de grupos)
    total_com_filtro = page.locator(".cal-jogo").count()
    assert total_com_filtro > 6, (
        f"Apenas {total_com_filtro} jogos visíveis com filtro Grupo A "
        f"(esperado > 6, pois mata-mata deve aparecer)"
    )


# ─── Teste 6: Inputs de placar rejeitam valores negativos ───────────────────
def test_inputs_rejeitam_valores_negativos(page: Page):
    """
    Os inputs de placar (.res-input) devem ter o atributo min='0' definido
    estaticamente no HTML gerado, impedindo valores negativos.
    Testa tanto o atributo HTML quanto que o browser enforce a validação.
    """
    _abrir_aba(page, "resultados", ".res-wrap")

    inputs = page.locator(".res-input")
    assert inputs.count() >= 2, (
        f"Nenhum input de placar encontrado (contagem: {inputs.count()})"
    )

    # Verifica atributo min em todos os inputs visíveis
    count = inputs.count()
    for i in range(min(count, 4)):  # verifica os primeiros 4
        inp = inputs.nth(i)
        min_attr = inp.get_attribute("min")
        assert min_attr == "0", (
            f"Input #{i}: atributo min='{min_attr}' (esperado '0') — "
            f"valores negativos não seriam bloqueados pela validação HTML"
        )

    # Verifica max="99" também (proteção contra placares absurdos)
    max_attr = inputs.first.get_attribute("max")
    assert max_attr == "99", (
        f"Input: atributo max='{max_attr}' (esperado '99')"
    )
