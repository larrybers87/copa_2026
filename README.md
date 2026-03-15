# Copa do Mundo 2026 — Análise & Simulação

## Estrutura

```
copa2026/
├── data/
│   ├── raw/                  ← coloque Dados_Selecoes.xlsx aqui
│   └── processed/            ← CSVs gerados automaticamente
│
├── src/
│   ├── config.py             ← paths, constantes, parâmetros
│   ├── data_loader.py        ← carrega e pré-processa o Excel
│   ├── scraping.py           ← Transfermarkt (annual balance + record against)
│   ├── stats.py              ← análises e resumos
│   └── plots.py              ← visualizações matplotlib + plotly
│
├── notebooks/
│   └── exploracao.ipynb      ← análise interativa (só imports + chamadas)
│
├── outputs/
│   └── figures/              ← PNGs e HTMLs gerados
│
└── main.py                   ← pipeline completo via CLI
```

## Setup

```bash
conda activate copa2026
pip install pandas numpy matplotlib seaborn plotly requests beautifulsoup4 openpyxl
```

Coloque `Dados_Selecoes.xlsx` em `data/raw/`.

## Uso

```bash
# Pipeline completo (carrega dados + scraping + stats + plots + salva Excel)
python main.py

# Pula o scraping (usa CSVs já existentes em data/processed/)
python main.py --skip-scraping

# Só carrega e imprime resumos (sem scraping, sem plots)
python main.py --only-stats

# Sem gráficos (útil em servidor)
python main.py --skip-scraping --skip-plots
```

## Módulos isolados

Cada módulo em `src/` pode ser rodado diretamente:

```bash
python src/data_loader.py   # diagnóstico dos dados
python src/stats.py         # resumos por grupos e locais
python src/plots.py         # gera e salva todos os gráficos
python src/scraping.py      # teste de scraping (1 seleção)
```

## Próximas etapas

- `src/simulation.py` — simulação da fase de grupos com critérios de desempate
- `src/knockout.py`   — simulação do mata-mata (8 melhores 3ºs colocados)
- Integração com relatório HTML final
