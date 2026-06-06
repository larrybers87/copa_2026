"""
Testes de sanidade do modelo Monte Carlo — Copa 2026.

Lê docs/dados.js (gerado por gerar_html.py após rodar simulation.py) e valida
as invariantes que os fixes implementados devem garantir.

Uso:
    python -m pytest tests/test_simulacao.py -v
"""

import json
import re
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
DADOS_JS      = ROOT / "docs" / "dados.js"
SIMULATION_PY = ROOT / "src" / "simulation.py"


# ─── Parser de dados.js ───────────────────────────────────────────────────────
def _parse_dados_js() -> dict:
    """
    Extrai e faz parse do objeto DADOS do arquivo JS gerado.
    Trata NaN (inválido em JSON) como null.
    """
    txt = DADOS_JS.read_text(encoding="utf-8")
    # Remove tudo antes de 'const DADOS = ' (inclusive comentário de cabeçalho)
    txt = re.sub(r"^.*?const DADOS\s*=\s*", "", txt, flags=re.DOTALL)
    txt = txt.rstrip().rstrip(";").rstrip()
    # NaN não é JSON válido — substitui por null
    txt = re.sub(r"(?<!['\"]):\s*NaN\b", ": null", txt)
    txt = re.sub(r"\[\s*NaN\b", "[null", txt)
    txt = re.sub(r",\s*NaN\b", ", null", txt)
    return json.loads(txt)


# Carrega uma única vez no nível do módulo
DADOS = _parse_dados_js()


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _iter_times():
    """Itera (grupo_id, time_nome, stats_dict) para todos os times simulados."""
    for g in DADOS["simulacao"]:
        for time, stats in g["stats_times"].items():
            yield g["grupo"], time, stats


HOSTS_PT = {"México", "Estados Unidos", "Canadá"}


# ─── Teste 1: soma de P1% ≈ 100% por grupo ───────────────────────────────────
def test_p1_soma_100_por_grupo():
    """
    A soma de P1% (probabilidade de terminar em 1º) de todos os times
    de cada grupo deve ser ≈ 100% com tolerância de ±1 ponto percentual.
    Verifica que as probabilidades são mutuamente exclusivas e exaustivas.
    """
    for g in DADOS["simulacao"]:
        grupo = g["grupo"]
        soma_p1 = sum(s["P1"] for s in g["stats_times"].values())
        assert abs(soma_p1 - 100.0) <= 1.0, (
            f"Grupo {grupo}: soma P1 = {soma_p1:.3f}% "
            f"(esperado 100% ±1pp, desvio = {soma_p1 - 100:.3f}pp)"
        )


# ─── Teste 2: Pts_Medio_3lugar ≤ Pts_Medio ───────────────────────────────────
def test_pts_medio_3lugar_consistente():
    """
    Para cada time, Pts_Medio_3lugar (pontos médios quando termina em 3º lugar)
    deve ser menor ou igual a Pts_Medio (média geral de pontos).
    Um time que termina em 3º nunca tem mais pontos que sua média global.
    Se o campo estiver ausente, o teste falha com mensagem clara — rode simulation.py.
    """
    for grupo, time, stats in _iter_times():
        assert "Pts_Medio_3lugar" in stats, (
            f"Campo 'Pts_Medio_3lugar' ausente em {time!r} (Grupo {grupo}). "
            f"Execute: python src/simulation.py && python gerar_html.py"
        )
        p3  = stats["Pts_Medio_3lugar"]
        med = stats["Pts_Medio"]
        assert p3 <= med + 0.01, (  # +0.01 margem de arredondamento
            f"Grupo {grupo} | {time}: "
            f"Pts_Medio_3lugar={p3} > Pts_Medio={med} (impossível)"
        )


# ─── Teste 3: Classifica% > 0 quando P1+P2 > 5% ─────────────────────────────
def test_classifica_nao_zero_quando_relevante():
    """
    Todo time com P1%+P2% > 5% tem chance real de classificar (1º ou 2º lugar).
    Classifica% = 0 nesse cenário é sintoma do bug dos terceiros colocados
    (ausência do fator 8/12 na qualificação dos melhores terceiros).
    """
    for grupo, time, stats in _iter_times():
        p1p2    = stats["P1"] + stats["P2"]
        classif = stats["Classifica"]
        if p1p2 > 5.0:
            assert classif > 0.0, (
                f"Grupo {grupo} | {time}: P1+P2={p1p2:.2f}% mas Classifica={classif:.2f}% "
                f"— fix dos terceiros colocados (8/12) pode não estar aplicado"
            )


# ─── Teste 4: 72 chaves únicas em jogos_grupos ───────────────────────────────
def test_chaves_jogos_grupos_unicas():
    """
    As 72 partidas da fase de grupos devem ter chaves únicas no formato
    'Grupo|Time1|Time2'. Duplicatas indicariam jogos repetidos no Excel
    ou bug na geração do calendario.
    """
    jogos = DADOS["jogos_grupos"]
    assert len(jogos) == 72, (
        f"Esperado 72 jogos na fase de grupos, encontrado {len(jogos)}"
    )
    chaves = [f"{j['Grupo']}|{j['Time1']}|{j['Time2']}" for j in jogos]
    duplicatas = {c for c in chaves if chaves.count(c) > 1}
    assert not duplicatas, (
        f"{len(duplicatas)} chave(s) duplicada(s): {sorted(duplicatas)}"
    )


# ─── Teste 5: hosts CONCACAF ≥ média do grupo ────────────────────────────────
def test_hosts_classifica_acima_da_media():
    """
    México, Estados Unidos e Canadá devem ter Classifica% ≥ média dos demais
    times do grupo. Sanidade do home factor implementado na simulação:
    México (×1.12), Estados Unidos (×1.06), Canadá (×1.05).
    Se um host ficar abaixo da média, o home factor provavelmente não está ativo.
    """
    for g in DADOS["simulacao"]:
        grupo = g["grupo"]
        times = g["stats_times"]
        hosts_no_grupo = [t for t in times if t in HOSTS_PT]
        if not hosts_no_grupo:
            continue

        media_grupo = sum(s["Classifica"] for s in times.values()) / len(times)

        for host in hosts_no_grupo:
            host_classif = times[host]["Classifica"]
            assert host_classif >= media_grupo, (
                f"Grupo {grupo} | {host}: Classifica={host_classif:.2f}% "
                f"< média do grupo {media_grupo:.2f}% "
                f"— home factor pode não estar ativo em simulation.py"
            )


# ─── Teste 6: DECAY_LAMBDA = 0.3 em simulation.py ───────────────────────────
def test_decay_lambda_definido_em_simulation_py():
    """
    Regressão: DECAY_LAMBDA = 0.30 deve estar definido em src/simulation.py.
    Garante que o fix de decaimento exponencial temporal não foi revertido.
    λ=0.3 → resultado de 3 anos atrás tem peso ~40% menor que resultado recente.
    """
    src = SIMULATION_PY.read_text(encoding="utf-8")
    assert re.search(r"\bDECAY_LAMBDA\s*=\s*0\.3\b", src), (
        "DECAY_LAMBDA = 0.3 não encontrado em src/simulation.py — "
        "o fix de decaimento temporal pode ter sido revertido"
    )
