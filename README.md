# Copa do Mundo 2026 - Análise & Simulação

Dashboard interativo e motor de simulação Monte Carlo para a Copa do Mundo 2026.

**[Ver Dashboard](https://larrybers87.github.io/copa_2026/dashboard.html)**

---

## Sobre o projeto

Esse projeto nasceu de uma vontade de aprender na prática. A ideia foi coletar dados reais com Python (Scraping, leitura de planilhas, manipulação com pandas), processá-los e apresentá-los de forma visual e interativa usando JavaScript puro - sem frameworks ou bibliotecas de UI.

Não tenho formação em desenvolvimento web; minha base é matemática aplicada. Fui aprendendo HTML, CSS e JavaScript confrome a necessidade ao longo do projeto. Em boa parte do processo, contei com o apaio do Claude.

O resultado é este dashboard: ele reúne dados reais de seleções, ranking FIFA, confrontos históricos, simulação Monte Carlo da fase de grupos e um modo "Meu Cenário", onde é possível montar e simular o mata-mata livremente.

---

## Estrutura

```
copa_2026/
├── data/
│   ├── raw/                        # Dados_Selecoes.xlsx
│   └── processed/                  # CSVs gerados automaticamente
│       ├── annual_balance.csv
│       ├── record_against.csv
│       ├── estatisticas_gerais.csv
│       ├── simulacao_grupos.json
│       ├── simulacao_grupos_times.csv
│       └── simulacao_grupos_jogos.csv
│
├── src/
│   ├── config.py                   # Paths, constantes e parâmetros globais
│   ├── data_loader.py              # Carregamento e pré-processamento do Excel
│   ├── scraping.py                 # Coleta de dados (Transfermarkt)
│   ├── stats.py                    # Análises e resumos estatísticos
│   ├── plots.py                    # Visualizações (matplotlib + plotly)
│   └── simulation.py               # Simulação Monte Carlo (fase de grupos)
│
├── docs/                           # Dashboard HTML (GitHub Pages)
│   ├── dashboard.html
│   ├── style.css
│   ├── app.js
│   ├── mc.js                       # "Meu Cenário" (mata-mata manual)
│   ├── dados.js                    # Gerado por gerar_html.py
│   └── assets/                     # Bandeiras e logos locais
│
├── notebooks/
│   └── exploracao.ipynb
│
├── gerar_html.py                   # Gera dados.js a partir dos dados processados
└── main.py                         # Pipeline completo via CLI
```

---

## Setup

```bash
conda create -n copa2026 python=3.11
conda activate copa2026
pip install -r requirements.txt
```

### requirements.txt

```
pandas
numpy
scipy
matplotlib
seaborn
plotly
requests
beautifulsoup4
openpyxl
```

Coloque `Dados_Selecoes.xlsx` em `data/raw/`. O arquivo deve conter as abas:

| Aba              | Descrição                                             |
| ---------------- | ----------------------------------------------------- |
| `Selecoes`       | Seleções, grupos, id Transfermarkt, ranking FIFA      |
| `Ranking_FIFA`   | Ranking e pontuação FIFA de cada seleção              |
| `Jogos_Grupos`   | Calendário completo da fase de grupos                 |
| `Jogos_MataMata` | Calendário do mata-mata com códigos de classificação  |
| `Info_Selecoes`  | Títulos, participações e confederação de cada seleção |

---

## Pipeline principal

```bash
# Pipeline completo: scraping + stats + plots + Excel
python main.py

# Pula o scraping (usa CSVs já existentes)
python main.py --skip-scraping

# Só carrega dados e imprime resumos
python main.py --only-stats

# Sem gráficos
python main.py --skip-scraping --skip-plots
```

---

## Simulação Monte Carlo

Simula a fase de grupos usando um modelo de força baseado em:

- **60%** Ranking FIFA normalizado
- **40%** Pontos por jogo recentes ponderados por ano (mais recente = maior peso)

As probabilidades de cada resultado (V/E/D) usam decaimento exponencial no empate — jogos desequilibrados têm muito menos chance de empate que jogos equilibrados.

```bash
# Simula todos os grupos fechados com 500k iterações
python src/simulation.py --n 500000

# Só um grupo específico
python src/simulation.py --n 100000 --grupos H

# Múltiplos grupos específicos
python src/simulation.py --n 500000 --grupos C E G H J L
```

**Output gerado:**

- `data/processed/simulacao_grupos.json` — dados completos para o dashboard
- `data/processed/simulacao_grupos_times.csv` — P1/P2/P3/P4, PtsMed, Mediana, DP por time
- `data/processed/simulacao_grupos_jogos.csv` — probabilidades V/E/D por jogo

---

## Dashboard HTML

O dashboard é uma aplicação HTML/CSS/JS estática com 5 abas:

| Aba              | Conteúdo                                                                                |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Seleções**     | Perfil completo: bandeira, ranking, títulos, histórico anual, head to head              |
| **Head to Head** | Confrontos ampliados com cards V/E/D contra todos os oponentes                          |
| **Calendário**   | Todos os jogos com filtros por grupo, cidade e seleção                                  |
| **Simulação**    | Resultados Monte Carlo por grupo + classificados prováveis + confrontos da segunda fase |
| **Ranking FIFA** | Tabela completa com filtros por confederação, busca e ordenação por coluna              |

Para atualizar o dashboard após novos dados ou simulação:

```bash
python gerar_html.py
```

Isso gera `docs/dados.js` com todos os dados embutidos. O dashboard é servido via **GitHub Pages**.

---

## Módulos isolados

```bash
python src/data_loader.py    # diagnóstico dos dados
python src/stats.py          # resumos por grupos e favoritos
python src/plots.py          # gera e salva todos os gráficos
python src/scraping.py       # teste de scraping (1 seleção)
python src/simulation.py     # simulação com output no terminal
```

---

## Grupos simulados

| Fechados (simulados) | Com repescagem pendente |
| -------------------- | ----------------------- |
| C, E, G, H, J, L     | A, B, D, F, I, K        |

Os grupos com repescagem serão adicionados após confirmação das vagas.

---

## Licença

Este projeto está licenciado sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

### Uso e atribuição

Você é livre para usar, modificar e distribuir este projeto para qualquer finalidade, incluindo uso comercial.

Se este projeto te ajudou de alguma forma, peço que dê os devidos créditos. Algumas formas de atribuição incluem:

- Citar este repositório
- Incluir um link para o projeto
- Referenciar meu nome ou perfil

Isso não é uma exigência legal da licença, mas é muito apreciado 🙌
