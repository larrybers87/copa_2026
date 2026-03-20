"""
simulation.py — Simulação Monte Carlo da fase de grupos Copa 2026.

Modelo de força:
    forca(time) = 0.6 * ranking_norm + 0.4 * ppj_norm

    ranking_norm : 1 - (ranking_fifa - 1) / 209   → melhor ranking = maior valor
    ppj_norm     : pontos/jogo dos últimos 5 anos ponderado exponencialmente por ano,
                   normalizado em [0, 1] (max teórico = 3 pts/jogo)

Probabilidades do jogo:
    fa = forca_a ** FORCA_EXP   # amplifica diferenças (exp=3)
    fb = forca_b ** FORCA_EXP
    ratio = fa / (fa + fb)
    diff  = |ratio - 0.5| * 2   # 0 = iguais, 1 = máximo desequilíbrio
    p_empate  = max(0.27 * exp(-2.5 * diff), 0.04)
    p_vitoria_a = (1 - p_empate) * ratio
    p_vitoria_b = (1 - p_empate) * (1 - ratio)

Uso:
    python simulation.py                    # roda com defaults
    python simulation.py --n 100000         # 100k simulações
    python simulation.py --grupos C E G     # só grupos específicos
"""

import argparse
import json
import math
import sys
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    EXCEL_INPUT,
    CSV_ANNUAL_BALANCE,
    DATA_PROCESSED_DIR,
    RANDOM_SEED,
    PONTOS_VITORIA,
    PONTOS_EMPATE,
    PONTOS_DERROTA,  # noqa: F401
)

# ─── Parâmetros do modelo ─────────────────────────────────────────────────────

PESO_RANKING = 0.60
PESO_WINRATE = 0.40
N_DEFAULT = 100_000

# Grupos fechados (sem repescagem pendente)
GRUPOS_FECHADOS = ["C", "E", "G", "H", "J", "L"]

# Critérios de desempate (ordem)
# 1. Pontos  2. Saldo de gols*  3. Gols marcados*  4. Ranking FIFA
# *gols não simulados explicitamente — usamos ranking como tiebreaker final
DESEMPATE_COLS = ["Pontos", "Ranking_FIFA"]

OUTPUT_CSV = DATA_PROCESSED_DIR / "simulacao_grupos.csv"
OUTPUT_JSON = DATA_PROCESSED_DIR / "simulacao_grupos.json"


# ─── Carregamento de dados ────────────────────────────────────────────────────


def carregar_dados():
    selecoes_df = pd.read_excel(EXCEL_INPUT, sheet_name="Selecoes")
    ranking_df = pd.read_excel(EXCEL_INPUT, sheet_name="Ranking_FIFA")
    jogos_df = pd.read_excel(EXCEL_INPUT, sheet_name="Jogos_Grupos")
    annual_df = (
        pd.read_csv(CSV_ANNUAL_BALANCE)
        if CSV_ANNUAL_BALANCE.exists()
        else pd.DataFrame()
    )

    # Normaliza nomes
    selecoes_df["is_repescagem"] = (
        selecoes_df["Obs"].str.strip().str.lower() == "repescagem"
    )
    selecoes_df["Seleção"] = selecoes_df["Seleção"].str.strip()
    selecoes_df["Club"] = selecoes_df["Club"].str.strip()

    return selecoes_df, ranking_df, jogos_df, annual_df


# ─── Cálculo de força ─────────────────────────────────────────────────────────


def calcular_forcas(selecoes_df, ranking_df, annual_df):
    """
    Retorna dict {nome_pt: forca} com valor em [0.05, 1.0].
    Usa nome em PT (coluna 'Seleção') como chave para casar com Jogos_Grupos.
    """
    # Merge ranking
    merged = selecoes_df.merge(
        ranking_df[["Time", "Ranking", "Total_Pontos"]],
        left_on="Club",
        right_on="Time",
        how="left",
    ).drop(columns=["Time"])

    # Ranking normalizado: rank 1 → 1.0, rank 210 → ~0.0
    max_rank = 210
    merged["ranking_norm"] = 1 - (merged["Ranking"].fillna(max_rank) - 1) / (
        max_rank - 1
    )

    # Pontos por jogo recentes — ponderado por ano (mais recente = maior peso)
    # Usamos pts/jogo (3*V + E) / jogos em vez de winrate puro,
    # o que é mais justo entre confederações (premia vitórias mas não ignora empates)
    if not annual_df.empty:
        for col in ["Matches", "Wins", "Draws", "Year"]:
            annual_df[col] = pd.to_numeric(annual_df[col], errors="coerce")

        ano_max = annual_df["Year"].max()

        def pts_por_jogo_pond(g):
            g = g.copy()
            g["peso"] = np.exp(-0.5 * (ano_max - g["Year"]))
            g["pts"] = g["Wins"] * 3 + g["Draws"].fillna(0)
            total_jogos = (g["Matches"] * g["peso"]).sum()
            total_pts = (g["pts"] * g["peso"]).sum()
            return (
                total_pts / total_jogos if total_jogos > 0 else 1.5
            )  # 1.5 = média neutra

        ppj = annual_df.groupby("Team").apply(pts_por_jogo_pond).reset_index()
        ppj.columns = ["Club", "ppj"]
        merged = merged.merge(ppj, on="Club", how="left")
    else:
        merged["ppj"] = 1.5

    merged["ppj"] = merged["ppj"].fillna(1.5)

    # Normaliza ppj: escala linear entre 0 e 3 (máx teórico de pts/jogo)
    merged["winrate_norm"] = (merged["ppj"] / 3.0).clip(0.0, 1.0)

    # Força combinada
    merged["forca"] = (
        PESO_RANKING * merged["ranking_norm"] + PESO_WINRATE * merged["winrate_norm"]
    ).clip(0.05, 1.0)

    # Indexa por nome PT (Seleção) e por Club (inglês)
    forcas_pt = dict(zip(merged["Seleção"], merged["forca"]))
    forcas_en = dict(zip(merged["Club"], merged["forca"]))
    rankings = dict(zip(merged["Seleção"], merged["Ranking"].fillna(999).astype(int)))

    return {**forcas_pt, **forcas_en}, rankings


# ─── Probabilidades do jogo ───────────────────────────────────────────────────

# Expoente aplicado às forças antes de calcular probabilidades.
# Amplifica diferenças: força 0.93 vira 0.804 (exp=3), força 0.60 vira 0.216
# Isso torna jogos desequilibrados muito mais decididos.
FORCA_EXP = 3.0


def prob_jogo(forca_a, forca_b):
    """
    Retorna (p_vitoria_a, p_empate, p_vitoria_b).

    Aplica FORCA_EXP antes do cálculo para amplificar diferenças de nível.
    Depois usa decaimento exponencial no empate.

    Exemplos com exp=3:
    - Argentina x Jordânia:  69% / 8% / 23%
    - Espanha x Cabo Verde:  69% / 8% / 23%
    - Brasil x Marrocos:     35% / 18% / 47%
    - Times iguais:          36% / 27% / 36%
    """
    # Amplifica diferenças de força
    fa = forca_a**FORCA_EXP
    fb = forca_b**FORCA_EXP

    total = fa + fb
    ratio = fa / total  # [0,1], >0.5 favorece A
    diff = abs(ratio - 0.5) * 2  # 0 = iguais, 1 = máximo desequilíbrio

    # Decaimento exponencial do empate
    p_e = max(0.27 * math.exp(-2.5 * diff), 0.04)

    restante = 1.0 - p_e
    p_v = restante * ratio
    p_d = restante * (1.0 - ratio)

    return p_v, p_e, p_d


def classificar_grupo(pts_dict, rankings):
    """
    Ordena os times por pontos, usando ranking FIFA como tiebreaker.
    Retorna lista ordenada [1º, 2º, 3º, 4º].
    """
    times = list(pts_dict.keys())
    times.sort(key=lambda t: (-pts_dict[t], rankings.get(t, 999)))
    return times


# ─── Monte Carlo ─────────────────────────────────────────────────────────────


def monte_carlo_grupo(grupo, times, jogos_grupo, forcas, rankings, n_sim, rng):
    """
    Roda n_sim simulações para um grupo.
    Retorna dict com estatísticas agregadas.

    O `rng` deve ser criado externamente (uma única instância para toda a execução)
    para garantir independência estatística entre grupos.
    """

    # Contadores
    posicoes = {t: defaultdict(int) for t in times}  # {time: {pos: count}}
    pontos_acc = {t: [] for t in times}

    # Contadores de resultado por jogo
    jogos_list = list(jogos_grupo.iterrows())
    res_jogos = {}
    for _, j in jogos_list:
        key = (j["Time1"], j["Time2"])
        res_jogos[key] = {"V": 0, "E": 0, "D": 0}

    for _ in range(n_sim):
        pts = {t: 0 for t in times}
        res_sim = {}

        for _, jogo in jogos_grupo.iterrows():
            t1 = jogo["Time1"]
            t2 = jogo["Time2"]
            f1 = forcas.get(t1, 0.5)
            f2 = forcas.get(t2, 0.5)

            p_v, p_e, p_d = prob_jogo(f1, f2)
            resultado = rng.choice(["V", "E", "D"], p=[p_v, p_e, p_d])
            res_sim[(t1, t2)] = resultado

            if resultado == "V":
                pts[t1] += PONTOS_VITORIA
            elif resultado == "E":
                pts[t1] += PONTOS_EMPATE
                pts[t2] += PONTOS_EMPATE
            else:
                pts[t2] += PONTOS_VITORIA

        # Registra posições
        ordem = classificar_grupo(pts, rankings)
        for pos, time in enumerate(ordem, 1):
            posicoes[time][pos] += 1

        # Registra pontos
        for t in times:
            pontos_acc[t].append(pts[t])

        # Registra resultados dos jogos
        for key, res in res_sim.items():
            if key in res_jogos:
                res_jogos[key][res] += 1

    # ── Agrega resultados ──────────────────────────────────────────────────────
    stats_times = {}
    for t in times:
        pts_arr = np.array(pontos_acc[t])
        stats_times[t] = {
            "P1": round(posicoes[t][1] / n_sim * 100, 2),
            "P2": round(posicoes[t][2] / n_sim * 100, 2),
            "P3": round(posicoes[t][3] / n_sim * 100, 2),
            "P4": round(posicoes[t][4] / n_sim * 100, 2),
            "Pts_Medio": round(float(pts_arr.mean()), 2),
            "Pts_Mediana": round(float(np.median(pts_arr)), 2),
            "Pts_DP": round(float(pts_arr.std()), 2),
            "Pts_Min": int(pts_arr.min()),
            "Pts_Max": int(pts_arr.max()),
            "Classifica": round((posicoes[t][1] + posicoes[t][2]) / n_sim * 100, 2),
        }

    stats_jogos = {}
    for (t1, t2), res in res_jogos.items():
        total = res["V"] + res["E"] + res["D"]
        stats_jogos[f"{t1} x {t2}"] = {
            "V_pct": round(res["V"] / total * 100, 2),
            "E_pct": round(res["E"] / total * 100, 2),
            "D_pct": round(res["D"] / total * 100, 2),
        }

    return {
        "grupo": grupo,
        "times": times,
        "n_sim": n_sim,
        "stats_times": stats_times,
        "stats_jogos": stats_jogos,
    }


# ─── Output ───────────────────────────────────────────────────────────────────


def resultado_para_df(resultado):
    """Converte resultado de um grupo para DataFrame."""
    rows = []
    grupo = resultado["grupo"]
    n_sim = resultado["n_sim"]

    for time, s in resultado["stats_times"].items():
        rows.append(
            {
                "Grupo": grupo,
                "Time": time,
                "N_Simulacoes": n_sim,
                "P_1lugar_%": s["P1"],
                "P_2lugar_%": s["P2"],
                "P_3lugar_%": s["P3"],
                "P_4lugar_%": s["P4"],
                "P_Classifica_%": s["Classifica"],
                "Pts_Medio": s["Pts_Medio"],
                "Pts_Mediana": s["Pts_Mediana"],
                "Pts_DP": s["Pts_DP"],
                "Pts_Min": s["Pts_Min"],
                "Pts_Max": s["Pts_Max"],
            }
        )

    return pd.DataFrame(rows).sort_values(
        ["Grupo", "P_1lugar_%"], ascending=[True, False]
    )


def jogos_para_df(resultado):
    """Converte estatísticas de jogos para DataFrame."""
    rows = []
    grupo = resultado["grupo"]
    for jogo, s in resultado["stats_jogos"].items():
        t1, t2 = jogo.split(" x ", 1)
        rows.append(
            {
                "Grupo": grupo,
                "Time1": t1,
                "Time2": t2,
                "V_Time1_%": s["V_pct"],
                "Empate_%": s["E_pct"],
                "V_Time2_%": s["D_pct"],
            }
        )
    return pd.DataFrame(rows)


def imprimir_grupo(resultado):
    """Print formatado dos resultados de um grupo."""
    g = resultado["grupo"]
    n = resultado["n_sim"]
    print(f"\n{'=' * 62}")
    print(f"  GRUPO {g}  —  {n:,} simulações")
    print(f"{'=' * 62}")

    # Times ordenados por % classificação
    times_ord = sorted(resultado["stats_times"].items(), key=lambda x: -x[1]["P1"])

    print(
        f"  {'Time':<25} {'1º%':>6} {'2º%':>6} {'3º%':>6} {'4º%':>6}  {'Med':>5}  {'Mdn':>5}  {'DP':>5}  {'Classif%':>8}"
    )
    print(
        f"  {'-' * 25} {'-' * 6} {'-' * 6} {'-' * 6} {'-' * 6}  {'-' * 5}  {'-' * 5}  {'-' * 5}  {'-' * 8}"
    )
    for time, s in times_ord:
        print(
            f"  {time:<25} {s['P1']:>5.1f}% {s['P2']:>5.1f}% "
            f"{s['P3']:>5.1f}% {s['P4']:>5.1f}%  "
            f"{s['Pts_Medio']:>4.1f}  {s['Pts_Mediana']:>4.1f}  {s['Pts_DP']:>4.2f}  "
            f"{s['Classifica']:>7.1f}%"
        )

    print("\n  Resultados dos jogos:")
    print(f"  {'Time 1':<20} {'V%':>6} {'E%':>6} {'Time 2':<20} {'V%':>6}")
    print(f"  {'-' * 20} {'-' * 6} {'-' * 6} {'-' * 20} {'-' * 6}")
    for jogo, s in resultado["stats_jogos"].items():
        t1, t2 = jogo.split(" x ", 1)
        print(
            f"  {t1:<20} {s['V_pct']:>5.1f}%  {s['E_pct']:>5.1f}%  {t2:<20} {s['D_pct']:>5.1f}%"
        )


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Simulação Monte Carlo — Fase de Grupos Copa 2026"
    )
    parser.add_argument("--n", type=int, default=N_DEFAULT, help="Número de simulações")
    parser.add_argument(
        "--grupos", nargs="+", default=GRUPOS_FECHADOS, help="Grupos a simular"
    )
    args = parser.parse_args()

    n_sim = args.n
    grupos = [g.upper() for g in args.grupos]

    print("🎲 Simulação Monte Carlo — Copa 2026")
    print(f"   Grupos   : {', '.join(grupos)}")
    print(f"   Simulações: {n_sim:,}")
    print(f"   Semente   : {RANDOM_SEED}")

    # RNG criado uma única vez — garante independência estatística entre grupos
    rng = np.random.default_rng(RANDOM_SEED)

    # Carrega dados
    selecoes_df, ranking_df, jogos_df, annual_df = carregar_dados()
    forcas, rankings = calcular_forcas(selecoes_df, ranking_df, annual_df)

    # Pré-processa jogos
    jogos_df["DataHora"] = pd.to_datetime(jogos_df["DataHora"], errors="coerce")
    jogos_df["Time1"] = jogos_df["Time1"].str.strip()
    jogos_df["Time2"] = jogos_df["Time2"].str.strip()

    todos_resultados = []
    dfs_times = []
    dfs_jogos = []

    for grupo in grupos:
        jogos_grupo = jogos_df[jogos_df["Grupo"] == grupo].copy()
        if jogos_grupo.empty:
            print(f"\n⚠️  Grupo {grupo}: sem jogos encontrados")
            continue

        # Times do grupo
        times = list(set(jogos_grupo["Time1"].tolist() + jogos_grupo["Time2"].tolist()))

        # Verifica se algum time não tem força calculada
        sem_forca = [t for t in times if t not in forcas]
        if sem_forca:
            print(
                f"\n⚠️  Grupo {grupo}: sem dados para {sem_forca} — usando força padrão 0.5"
            )
            for t in sem_forca:
                forcas[t] = 0.5
                rankings[t] = 999

        print(
            f"\n⏳ Simulando Grupo {grupo} ({len(times)} times, {len(jogos_grupo)} jogos)..."
        )
        resultado = monte_carlo_grupo(
            grupo, times, jogos_grupo, forcas, rankings, n_sim, rng
        )
        todos_resultados.append(resultado)
        imprimir_grupo(resultado)

        dfs_times.append(resultado_para_df(resultado))
        dfs_jogos.append(jogos_para_df(resultado))

    # ── Salva CSV ──────────────────────────────────────────────────────────────
    if dfs_times:
        df_times_final = pd.concat(dfs_times, ignore_index=True)
        df_jogos_final = pd.concat(dfs_jogos, ignore_index=True)

        csv_times = DATA_PROCESSED_DIR / "simulacao_grupos_times.csv"
        csv_jogos = DATA_PROCESSED_DIR / "simulacao_grupos_jogos.csv"

        df_times_final.to_csv(csv_times, index=False)
        df_jogos_final.to_csv(csv_jogos, index=False)

        print("\n💾 CSVs salvos:")
        print(f"   {csv_times}")
        print(f"   {csv_jogos}")

    # ── Salva JSON (para o dashboard) ─────────────────────────────────────────
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(todos_resultados, f, ensure_ascii=False, indent=2)
    print(f"   {OUTPUT_JSON}")

    print(f"\n✅ Simulação concluída — {len(todos_resultados)} grupo(s)")


if __name__ == "__main__":
    main()
