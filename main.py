"""
main.py — Pipeline principal do projeto Copa 2026.

Uso:
    python main.py                    # roda tudo
    python main.py --skip-scraping    # pula scraping (usa CSVs existentes)
    python main.py --skip-plots       # pula geração de gráficos
    python main.py --only-stats       # só carrega dados e imprime resumos
"""

import argparse
import sys
from pathlib import Path

# Garante que src/ está no path independentemente de onde main.py é chamado
sys.path.insert(0, str(Path(__file__).parent / "src"))

import pandas as pd

from config import (  # type: ignore
    CSV_ANNUAL_BALANCE,
    CSV_RECORD_AGAINST,
    CSV_STATS_GERAIS,
    EXCEL_OUTPUT,
    EXCEL_INPUT,
)
from data_loader import carregar_dados  # type: ignore
from scraping import coletar_todos  # type: ignore
from stats import (  # type: ignore
    calcular_estatisticas_gerais,
    resumo_final,
    resumo_grupos,
    resumo_locais,
)  # type: ignore
from plots import (  # type: ignore
    plot_visao_geral,
    plot_heatmap_jogos,
    plot_forca_grupos,
    plot_locais,
    salvar_matplotlib,
    salvar_plotly,
)


# ─── CLI ──────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Pipeline Copa 2026")
    p.add_argument(
        "--skip-scraping",
        action="store_true",
        help="Usa CSVs existentes em vez de rodar o scraping",
    )
    p.add_argument("--skip-plots", action="store_true", help="Pula geração de gráficos")
    p.add_argument(
        "--only-stats",
        action="store_true",
        help="Só carrega dados e imprime resumos (sem scraping, sem plots)",
    )
    return p.parse_args()


# ─── Etapas ───────────────────────────────────────────────────────────────────


def etapa_carregar() -> tuple:
    print("\n" + "=" * 60)
    print("📂 ETAPA 1 — CARREGANDO DADOS")
    print("=" * 60)
    selecoes, ranking, jogos_grupos, jogos_mata = carregar_dados()
    resumo_final(selecoes, ranking, jogos_grupos, jogos_mata)
    return selecoes, ranking, jogos_grupos, jogos_mata


def etapa_scraping(
    selecoes: pd.DataFrame,
    skip: bool,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    print("\n" + "=" * 60)
    print("🌐 ETAPA 2 — SCRAPING TRANSFERMARKT")
    print("=" * 60)

    if skip:
        # Carrega dos CSVs se existirem
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
        if annual_df.empty and record_df.empty:
            print(
                "⚠️  CSVs não encontrados e --skip-scraping foi passado. Sem dados históricos."
            )
        else:
            print("✅ CSVs carregados:")
            print(f"   annual_balance  : {len(annual_df)} linhas")
            print(f"   record_against  : {len(record_df)} linhas")
        return annual_df, record_df

    annual_df, record_df = coletar_todos(selecoes)
    return annual_df, record_df


def etapa_stats(annual_df: pd.DataFrame) -> pd.DataFrame:
    print("\n" + "=" * 60)
    print("📈 ETAPA 3 — ESTATÍSTICAS GERAIS")
    print("=" * 60)

    if annual_df.empty:
        print("⚠️  Sem dados de balanço anual para calcular estatísticas.")
        return pd.DataFrame()

    stats = calcular_estatisticas_gerais(annual_df)

    print(f"✅ {len(stats)} seleções calculadas\n")
    print("🏆 Top 5 por Win Rate:")
    for _, r in stats.head(5).iterrows():
        print(
            f"   {r['Team']:<25s}: {r['Win_Rate']:5.1f}%  ({r['Wins']}/{r['Matches']} vitórias)"
        )

    print("\n📉 Bottom 5 por Win Rate:")
    for _, r in stats.tail(5).iterrows():
        print(
            f"   {r['Team']:<25s}: {r['Win_Rate']:5.1f}%  ({r['Wins']}/{r['Matches']} vitórias)"
        )

    stats.to_csv(CSV_STATS_GERAIS, index=False)
    print(f"\n💾 Salvo: {CSV_STATS_GERAIS}")

    return stats


def etapa_plots(
    selecoes: pd.DataFrame,
    ranking: pd.DataFrame,
    jogos_grupos: pd.DataFrame,
) -> None:
    print("\n" + "=" * 60)
    print("📊 ETAPA 4 — GRÁFICOS")
    print("=" * 60)

    import matplotlib

    matplotlib.use("Agg")  # sem GUI, só salva arquivo
    import matplotlib.pyplot as plt

    fig = plot_visao_geral(jogos_grupos, selecoes, ranking)
    salvar_matplotlib(fig, "visao_geral")
    plt.close(fig)

    salvar_plotly(plot_heatmap_jogos(jogos_grupos), "heatmap_jogos")
    salvar_plotly(plot_forca_grupos(selecoes, ranking), "forca_grupos")
    salvar_plotly(plot_locais(jogos_grupos), "locais")

    print("\n✅ Gráficos salvos em outputs/figures/")


def etapa_salvar_excel(
    annual_df: pd.DataFrame,
    record_df: pd.DataFrame,
    stats_df: pd.DataFrame,
) -> None:
    print("\n" + "=" * 60)
    print("💾 ETAPA 5 — SALVANDO EXCEL COMPLETO")
    print("=" * 60)

    try:
        with pd.ExcelFile(EXCEL_INPUT) as xls:
            df_dict = {sheet: pd.read_excel(xls, sheet) for sheet in xls.sheet_names}

        if not annual_df.empty:
            df_dict["Annual_Balance"] = annual_df
        if not record_df.empty:
            df_dict["Record_Against"] = record_df
        if not stats_df.empty:
            df_dict["Estatisticas_Gerais"] = stats_df

        EXCEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with pd.ExcelWriter(EXCEL_OUTPUT, engine="openpyxl") as writer:
            for sheet_name, df in df_dict.items():
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        print(f"✅ Salvo: {EXCEL_OUTPUT}  ({len(df_dict)} abas)")

    except Exception as e:
        print(f"❌ Erro ao salvar Excel: {e}")
        print("   Dados já salvos em CSV como backup.")


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    args = parse_args()

    selecoes, ranking, jogos_grupos, jogos_mata = etapa_carregar()

    if args.only_stats:
        print("\n")
        resumo_grupos(selecoes, ranking)
        resumo_locais(jogos_grupos)
        return

    annual_df, record_df = etapa_scraping(
        selecoes,
        skip=args.skip_scraping,
    )

    stats_df = etapa_stats(annual_df)

    if not args.skip_plots:
        etapa_plots(selecoes, ranking, jogos_grupos)

    etapa_salvar_excel(annual_df, record_df, stats_df)

    print("\n" + "=" * 60)
    print("✅ PIPELINE CONCLUÍDO")
    print("=" * 60)
    print(f"   Excel     : {EXCEL_OUTPUT}")
    print("   Gráficos  : outputs/figures/")
    print("   CSVs      : data/processed/")


if __name__ == "__main__":
    main()
