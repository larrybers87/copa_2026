"""
plots.py — Visualizações do projeto Copa 2026.

Funções:
    plot_visao_geral(jogos_grupos_df)             -> fig matplotlib
    plot_forca_grupos(grupos_df)                  -> fig plotly
    plot_locais(jogos_grupos_df)                  -> fig plotly
    plot_heatmap_jogos(jogos_grupos_df)           -> fig plotly
    salvar_fig(fig, nome, pasta)                  -> Path
"""

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from config import CORES, PLOT_STYLE, PLOT_PALETTE, PLOT_DPI, FIGURES_DIR
from stats import forca_grupos


# ─── Setup ────────────────────────────────────────────────────────────────────

plt.style.use(PLOT_STYLE)
import seaborn as sns  # noqa: E402

sns.set_palette(PLOT_PALETTE)

ORDEM_DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


# ─── Matplotlib ───────────────────────────────────────────────────────────────


def plot_visao_geral(
    jogos_grupos_df: pd.DataFrame,
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
) -> plt.Figure:
    """
    Painel 3×3 com:
    [0,:] Jogos por dia  |  [1,0] Por período  |  [1,1] Dia da semana
    [1,2] Por horário    |  [2,0] Força grupos |  [2,1] Top cidades
    [2,2] Top 10 FIFA
    """
    jogos_por_dia = jogos_grupos_df["Data"].value_counts().sort_index()
    periodo_counts = jogos_grupos_df["Periodo"].value_counts()
    dia_counts = (
        jogos_grupos_df["DiaSemanaPT"].value_counts().reindex(ORDEM_DIAS, fill_value=0)
    )
    horario_counts = jogos_grupos_df["HoraInt"].value_counts().sort_index()
    grupos_df = forca_grupos(selecoes_df, ranking_df).sort_values("Pontos_Media")
    locais_top = jogos_grupos_df["Local"].value_counts().sort_values().tail(10)

    confirmadas = selecoes_df[~selecoes_df["is_repescagem"]]["Club"].tolist()
    top10_fifa = (
        ranking_df[ranking_df["Time"].isin(confirmadas)]
        .sort_values("Total_Pontos")
        .tail(10)
    )
    colors_top10 = [
        CORES["destaque"] if t in confirmadas else CORES["neutro"]
        for t in top10_fifa["Time"]
    ]

    fig = plt.figure(figsize=(20, 12))
    gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.35, wspace=0.32)

    # Jogos por dia
    ax1 = fig.add_subplot(gs[0, :])
    ax1.bar(
        range(len(jogos_por_dia)),
        jogos_por_dia.values,
        color=CORES["primaria"],
        alpha=0.75,
        edgecolor="black",
        linewidth=0.4,
    )
    ax1.axhline(
        jogos_por_dia.mean(),
        color=CORES["destaque"],
        ls="--",
        lw=1.8,
        label=f"Média {jogos_por_dia.mean():.1f}",
    )
    ax1.set_xlabel("Dias", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Jogos", fontsize=11, fontweight="bold")
    ax1.set_title("Distribuição de Jogos por Dia", fontsize=13, fontweight="bold")
    ax1.legend()
    ax1.grid(axis="y", alpha=0.3)

    # Por período
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.pie(
        periodo_counts.values,
        labels=periodo_counts.index,
        autopct="%1.1f%%",
        startangle=90,
    )
    ax2.set_title("Por Período do Dia", fontsize=11, fontweight="bold")

    # Dia da semana
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.barh(
        dia_counts.index,
        dia_counts.values,
        color=CORES["secundaria"],
        alpha=0.75,
        edgecolor="black",
        linewidth=0.4,
    )
    ax3.set_xlabel("Jogos", fontsize=10, fontweight="bold")
    ax3.set_title("Por Dia da Semana", fontsize=11, fontweight="bold")

    # Por horário
    ax4 = fig.add_subplot(gs[1, 2])
    ax4.plot(
        horario_counts.index,
        horario_counts.values,
        marker="o",
        lw=2,
        color=CORES["destaque"],
    )
    ax4.fill_between(
        horario_counts.index, horario_counts.values, alpha=0.25, color=CORES["destaque"]
    )
    ax4.set_xlabel("Hora", fontsize=10, fontweight="bold")
    ax4.set_title("Por Horário", fontsize=11, fontweight="bold")

    # Força dos grupos
    ax5 = fig.add_subplot(gs[2, 0])
    bar_colors = [
        CORES["destaque"]
        if i == len(grupos_df) - 1
        else CORES["neutro"]
        if i == 0
        else CORES["terciaria"]
        for i in range(len(grupos_df))
    ]
    ax5.barh(
        grupos_df["Grupo"],
        grupos_df["Pontos_Media"],
        color=bar_colors,
        alpha=0.75,
        edgecolor="black",
        linewidth=0.4,
    )
    ax5.set_xlabel("Pontos FIFA (média)", fontsize=10, fontweight="bold")
    ax5.set_title("Força dos Grupos", fontsize=11, fontweight="bold")

    # Top cidades
    ax6 = fig.add_subplot(gs[2, 1])
    ax6.barh(
        locais_top.index,
        locais_top.values,
        color=CORES["primaria"],
        alpha=0.75,
        edgecolor="black",
        linewidth=0.4,
    )
    ax6.set_xlabel("Jogos", fontsize=10, fontweight="bold")
    ax6.set_title("Top Cidades-Sede", fontsize=11, fontweight="bold")

    # Top 10 FIFA
    ax7 = fig.add_subplot(gs[2, 2])
    ax7.barh(
        top10_fifa["Time"],
        top10_fifa["Total_Pontos"],
        color=colors_top10,
        alpha=0.75,
        edgecolor="black",
        linewidth=0.4,
    )
    ax7.set_xlabel("Pontos FIFA", fontsize=10, fontweight="bold")
    ax7.set_title("Top 10 Ranking FIFA", fontsize=11, fontweight="bold")

    fig.suptitle(
        "COPA DO MUNDO 2026 — ANÁLISE EXPLORATÓRIA",
        fontsize=17,
        fontweight="bold",
        y=1.01,
    )

    return fig


# ─── Plotly ───────────────────────────────────────────────────────────────────


def plot_heatmap_jogos(jogos_grupos_df: pd.DataFrame) -> go.Figure:
    """Heatmap: grupos × datas com contagem de jogos."""
    pivot = (
        jogos_grupos_df.groupby(["Grupo", "Data"])
        .size()
        .reset_index(name="Jogos")
        .pivot(index="Grupo", columns="Data", values="Jogos")
        .fillna(0)
    )

    fig = go.Figure(
        go.Heatmap(
            z=pivot.values,
            x=[str(d) for d in pivot.columns],
            y=pivot.index,
            colorscale="YlOrRd",
            text=pivot.values,
            texttemplate="%{text:.0f}",
            colorbar=dict(title="Jogos"),
        )
    )
    fig.update_layout(
        title="🗓️ Jogos por Grupo e Data",
        xaxis_title="Data",
        yaxis_title="Grupo",
        height=600,
    )
    return fig


def plot_forca_grupos(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
) -> go.Figure:
    """Bar + linha: média de pontos FIFA por grupo e desvio padrão."""
    df = forca_grupos(selecoes_df, ranking_df).sort_values("Grupo")

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            name="Média Pontos",
            x=df["Grupo"],
            y=df["Pontos_Media"],
            marker_color=CORES["primaria"],
            text=df["Pontos_Media"].round(1),
            textposition="outside",
        )
    )
    fig.add_trace(
        go.Scatter(
            name="Desvio Padrão",
            x=df["Grupo"],
            y=df["Desvio_Padrao"],
            mode="lines+markers",
            marker_color=CORES["destaque"],
            yaxis="y2",
        )
    )
    fig.update_layout(
        title="💪 Força dos Grupos — Pontos FIFA",
        yaxis=dict(title="Pontos FIFA (média)"),
        yaxis2=dict(title="Desvio Padrão", overlaying="y", side="right"),
        height=480,
    )
    return fig


def plot_locais(jogos_grupos_df: pd.DataFrame) -> go.Figure:
    """Bar horizontal com jogos por cidade."""
    df = jogos_grupos_df["Local"].value_counts().reset_index()
    df.columns = ["Local", "Jogos"]
    df = df.sort_values("Jogos")

    fig = px.bar(
        df,
        x="Jogos",
        y="Local",
        orientation="h",
        title="🏟️ Jogos por Cidade-Sede",
        color="Jogos",
        color_continuous_scale="Blues",
    )
    fig.update_layout(height=600, showlegend=False)
    return fig


# ─── Salvar ───────────────────────────────────────────────────────────────────


def salvar_matplotlib(fig: plt.Figure, nome: str, pasta: Path = FIGURES_DIR) -> Path:
    pasta.mkdir(parents=True, exist_ok=True)
    path = pasta / f"{nome}.png"
    fig.savefig(path, dpi=PLOT_DPI, bbox_inches="tight")
    print(f"💾 Salvo: {path}")
    return path


def salvar_plotly(fig: go.Figure, nome: str, pasta: Path = FIGURES_DIR) -> Path:
    pasta.mkdir(parents=True, exist_ok=True)
    path = pasta / f"{nome}.html"
    fig.write_html(str(path))
    print(f"💾 Salvo: {path}")
    return path


# ─── Execução direta ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(Path(__file__).parent))

    from data_loader import carregar_dados

    selecoes, ranking, jogos_grupos, jogos_mata = carregar_dados()

    fig_painel = plot_visao_geral(jogos_grupos, selecoes, ranking)
    salvar_matplotlib(fig_painel, "visao_geral")
    plt.show()

    salvar_plotly(plot_heatmap_jogos(jogos_grupos), "heatmap_jogos")
    salvar_plotly(plot_forca_grupos(selecoes, ranking), "forca_grupos")
    salvar_plotly(plot_locais(jogos_grupos), "locais")
