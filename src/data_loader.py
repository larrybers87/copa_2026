"""
data_loader.py — Carrega e pré-processa os dados do Excel.
Todas as funções retornam DataFrames prontos para uso.
"""

import pandas as pd
import numpy as np
from pathlib import Path

from config import (
    EXCEL_INPUT,
    SHEET_SELECOES, SHEET_RANKING, SHEET_JOGOS_GRUPOS, SHEET_JOGOS_MATA,
)


# ─── Carregamento ─────────────────────────────────────────────────────────────

def carregar_excel(path: Path = EXCEL_INPUT) -> dict[str, pd.DataFrame]:
    """
    Lê todas as abas do Excel e retorna um dict {nome_aba: DataFrame}.
    Valida se as abas esperadas existem.
    """
    abas_esperadas = [SHEET_SELECOES, SHEET_RANKING, SHEET_JOGOS_GRUPOS, SHEET_JOGOS_MATA]

    with pd.ExcelFile(path) as xls:
        abas_disponiveis = xls.sheet_names
        faltando = [a for a in abas_esperadas if a not in abas_disponiveis]
        if faltando:
            raise ValueError(f"Abas faltando no Excel: {faltando}")

        return {aba: pd.read_excel(xls, aba) for aba in abas_disponiveis}


def carregar_dados(path: Path = EXCEL_INPUT) -> tuple[pd.DataFrame, ...]:
    """
    Atalho: retorna (selecoes_df, ranking_df, jogos_grupos_df, jogos_mata_df)
    já pré-processados.
    """
    dfs = carregar_excel(path)

    selecoes_df     = preprocessar_selecoes(dfs[SHEET_SELECOES])
    ranking_df      = preprocessar_ranking(dfs[SHEET_RANKING])
    jogos_grupos_df = preprocessar_jogos(dfs[SHEET_JOGOS_GRUPOS])
    jogos_mata_df   = preprocessar_jogos(dfs[SHEET_JOGOS_MATA])

    return selecoes_df, ranking_df, jogos_grupos_df, jogos_mata_df


# ─── Pré-processamento ────────────────────────────────────────────────────────

def preprocessar_selecoes(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["is_repescagem"] = df["Obs"].str.strip().str.lower() == "repescagem"
    df["id_transfermarkt"] = pd.to_numeric(df["id_transfermarkt"], errors="coerce")
    return df


def preprocessar_ranking(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Total_Pontos"] = pd.to_numeric(df["Total_Pontos"], errors="coerce")
    df["Ranking"] = pd.to_numeric(df["Ranking"], errors="coerce").astype("Int64")
    return df


def preprocessar_jogos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Converte DataHora e extrai: Data, Hora, HoraInt, DiaSemana, DiaSemanaPT, Periodo.
    Funciona para Jogos_Grupos e Jogos_MataMata.
    """
    df = df.copy()

    # Parse robusto de DataHora
    try:
        df["DataHora"] = pd.to_datetime(df["DataHora"])
    except Exception:
        df["DataHora"] = pd.to_datetime(df["DataHora"], format="%d/%m/%Y %H:%M", errors="coerce")

    df["Data"]       = df["DataHora"].dt.date
    df["Hora"]       = df["DataHora"].dt.time
    df["HoraInt"]    = df["DataHora"].dt.hour
    df["DiaSemana"]  = df["DataHora"].dt.day_name()
    df["DiaSemanaPT"] = df["DiaSemana"].map({
        "Monday": "Segunda", "Tuesday": "Terça",  "Wednesday": "Quarta",
        "Thursday": "Quinta", "Friday": "Sexta",  "Saturday": "Sábado",
        "Sunday": "Domingo",
    })
    df["Periodo"] = df["HoraInt"].apply(_classificar_periodo)

    return df


def _classificar_periodo(hora: int) -> str:
    if 6 <= hora < 12:
        return "Manhã"
    elif 12 <= hora < 18:
        return "Tarde"
    elif 18 <= hora <= 23:
        return "Noite"
    else:
        return "Madrugada"


# ─── Merge utilitário ─────────────────────────────────────────────────────────

def merge_selecoes_ranking(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Junta seleções com ranking FIFA pelo nome em inglês (Club == Time).
    Retorna DataFrame com Ranking e Total_Pontos incluídos.
    """
    return selecoes_df.merge(
        ranking_df[["Time", "Ranking", "Total_Pontos"]],
        left_on="Club",
        right_on="Time",
        how="left",
    ).drop(columns=["Time"])


# ─── Diagnóstico ──────────────────────────────────────────────────────────────

def diagnostico(
    selecoes_df: pd.DataFrame,
    ranking_df: pd.DataFrame,
    jogos_grupos_df: pd.DataFrame,
    jogos_mata_df: pd.DataFrame,
) -> None:
    """Imprime um resumo rápido dos dados carregados."""

    confirmadas   = (~selecoes_df["is_repescagem"]).sum()
    repescagem    = selecoes_df["is_repescagem"].sum()
    num_grupos    = selecoes_df["Grupo"].nunique()
    total_jogos   = len(jogos_grupos_df) + len(jogos_mata_df)
    inicio        = jogos_grupos_df["Data"].min()
    fim           = jogos_mata_df["Data"].max()
    duracao       = (
        pd.Timestamp(fim) - pd.Timestamp(inicio)
    ).days + 1

    print("=" * 70)
    print("🌍  SELEÇÕES")
    print(f"    Confirmadas : {confirmadas}")
    print(f"    Repescagem  : {repescagem}")
    print(f"    Grupos      : {num_grupos}")
    print()
    print("⚽  JOGOS")
    print(f"    Total       : {total_jogos}")
    print(f"    Grupos      : {len(jogos_grupos_df)}")
    print(f"    Mata-mata   : {len(jogos_mata_df)}")
    print()
    print("📅  PERÍODO")
    print(f"    Início      : {inicio}")
    print(f"    Final       : {fim}")
    print(f"    Duração     : {duracao} dias")
    print()
    print(f"🏟️  CIDADES    : {jogos_grupos_df['Local'].nunique()}")
    print("=" * 70)


# ─── Execução direta ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    selecoes, ranking, jogos_grupos, jogos_mata = carregar_dados()
    diagnostico(selecoes, ranking, jogos_grupos, jogos_mata)
    print("\nSelecoes (primeiras linhas):")
    print(selecoes.head())
