"""
stats.py — Cálculos e análises estatísticas.

Funções:
    calcular_estatisticas_gerais(annual_df)  -> DataFrame
    forca_grupos(selecoes_df, ranking_df)    -> DataFrame
    resumo_grupos(selecoes_df, ranking_df)   -> None  (print)
    resumo_locais(jogos_grupos_df)           -> None  (print)
    top_favoritos(selecoes_df, ranking_df, n) -> DataFrame
"""

import numpy as np  # noqa: F401
import pandas as pd


# ─── Estatísticas gerais (a partir do balanço anual) ─────────────────────────


def calcular_estatisticas_gerais(annual_df: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega o balanço anual por seleção e calcula taxas e pontos por jogo.

    Entrada: DataFrame com colunas Team, Matches, Wins, Draws, Losses
    Saída:   DataFrame com Win_Rate, Draw_Rate, Loss_Rate, Points_Per_Match
    """
    if annual_df.empty:
        return pd.DataFrame()

    for col in ["Matches", "Wins", "Draws", "Losses"]:
        annual_df[col] = pd.to_numeric(annual_df[col], errors="coerce")

    stats = (
        annual_df.groupby("Team")[["Matches", "Wins", "Draws", "Losses"]]
        .sum()
        .reset_index()
    )

    stats["Win_Rate"] = (stats["Wins"] / stats["Matches"] * 100).round(2)
    stats["Draw_Rate"] = (stats["Draws"] / stats["Matches"] * 100).round(2)
    stats["Loss_Rate"] = (stats["Losses"] / stats["Matches"] * 100).round(2)
    stats["Total_Points"] = stats["Wins"] * 3 + stats["Draws"]
    stats["Points_Per_Match"] = (stats["Total_Points"] / stats["Matches"]).round(2)

    return stats.sort_values("Win_Rate", ascending=False).reset_index(drop=True)


# ─── Força dos grupos ─────────────────────────────────────────────────────────


def forca_grupos(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Calcula média, máx, mín e desvio padrão dos pontos FIFA por grupo.
    Retorna DataFrame ordenado por Pontos_Media desc.
    """
    merged = selecoes_df.merge(
        ranking_df[["Time", "Total_Pontos"]],
        left_on="Club",
        right_on="Time",
        how="left",
    )

    resultado = (
        merged.groupby("Grupo")["Total_Pontos"]
        .agg(
            Pontos_Media="mean",
            Pontos_Max="max",
            Pontos_Min="min",
            Desvio_Padrao="std",
        )
        .reset_index()
        .sort_values("Pontos_Media", ascending=False)
        .round(2)
    )

    return resultado


# ─── Prints de resumo ─────────────────────────────────────────────────────────


def resumo_grupos(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
) -> None:
    """Imprime cada grupo com suas seleções, ranking e pontos FIFA."""
    merged = selecoes_df.merge(
        ranking_df[["Time", "Ranking", "Total_Pontos"]],
        left_on="Club",
        right_on="Time",
        how="left",
    )

    for grupo in sorted(merged["Grupo"].unique()):
        times = merged[merged["Grupo"] == grupo].sort_values("Ranking")
        print(f"\n📌 GRUPO {grupo}:")
        for _, r in times.iterrows():
            tag = " ⚠️ (Repescagem)" if r["is_repescagem"] else ""
            ranking_str = f"#{int(r['Ranking'])}" if pd.notna(r["Ranking"]) else "#?"
            pontos_str = (
                f"{r['Total_Pontos']:.2f}" if pd.notna(r["Total_Pontos"]) else "?"
            )
            print(f"   • {r['Club']:<25s} {ranking_str:>5}  ({pontos_str} pts){tag}")


def resumo_locais(jogos_grupos_df: pd.DataFrame) -> None:
    """Imprime jogos por cidade e grupos por cidade."""
    locais = jogos_grupos_df["Local"].value_counts()
    total = len(jogos_grupos_df)

    print("\n📊 JOGOS POR CIDADE:")
    for local, count in locais.items():
        print(f"   {local:<30s}: {count:3d}  ({count / total * 100:5.1f}%)")

    print("\n🗺️  GRUPOS POR CIDADE:")
    for local in sorted(jogos_grupos_df["Local"].unique()):
        grupos = sorted(
            jogos_grupos_df[jogos_grupos_df["Local"] == local]["Grupo"].unique()
        )
        print(f"   {local:<30s}: {', '.join(grupos)}")


def top_favoritos(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
    n: int = 10,
) -> pd.DataFrame:
    """
    Retorna as n seleções confirmadas (não repescagem) com maior pontuação FIFA.
    """
    confirmadas = selecoes_df[~selecoes_df["is_repescagem"]]["Club"].tolist()
    return (
        ranking_df[ranking_df["Time"].isin(confirmadas)]
        .sort_values("Total_Pontos", ascending=False)
        .head(n)
        .reset_index(drop=True)
    )


def resumo_final(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
    jogos_grupos_df: pd.DataFrame,
    jogos_mata_df: pd.DataFrame,
) -> None:
    """Print consolidado com os números mais relevantes."""
    forca = forca_grupos(selecoes_df, ranking_df)
    favs = top_favoritos(selecoes_df, ranking_df, n=5)

    inicio = jogos_grupos_df["Data"].min()
    fim = jogos_mata_df["Data"].max()
    duracao = (pd.Timestamp(fim) - pd.Timestamp(inicio)).days + 1

    print("=" * 70)
    print("📊 COPA 2026 — RESUMO GERAL")
    print("=" * 70)
    print(f"   Seleções confirmadas : {(~selecoes_df['is_repescagem']).sum()}")
    print(f"   Total de jogos       : {len(jogos_grupos_df) + len(jogos_mata_df)}")
    print(f"   Duração              : {duracao} dias")
    print(f"   Grupos               : {selecoes_df['Grupo'].nunique()}")
    print()
    print(
        f"   💪 Grupo mais forte  : {forca.iloc[0]['Grupo']}  ({forca.iloc[0]['Pontos_Media']:.1f} pts médios)"
    )
    print(
        f"   💤 Grupo mais fraco  : {forca.iloc[-1]['Grupo']} ({forca.iloc[-1]['Pontos_Media']:.1f} pts médios)"
    )
    print()
    print("   🏆 Top 5 Favoritos:")
    for i, row in favs.iterrows():
        print(
            f"      {i + 1}. {row['Time']:<25s} #{int(row['Ranking'])}  ({row['Total_Pontos']:.2f} pts)"
        )
    print("=" * 70)


# ─── Execução direta ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent))

    from data_loader import carregar_dados

    selecoes, ranking, jogos_grupos, jogos_mata = carregar_dados()
    resumo_final(selecoes, ranking, jogos_grupos, jogos_mata)
    print()
    resumo_grupos(selecoes, ranking)
    print()
    resumo_locais(jogos_grupos)
