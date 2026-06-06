# Copa do Mundo 2026 — Análise, Simulação & Dashboard

Pipeline completo de dados e dashboard interativo para a Copa do Mundo 2026.

**[Ver Dashboard ao vivo](https://larrybers87.github.io/copa_2026/dashboard.html)**

---

## Sobre o projeto

Esse projeto nasceu de uma vontade de aprender na prática. Queria entender como coletar dados reais via Python (scraping, leitura de planilhas, pandas), processar essas informações e exibi-las de forma visual e interativa com JavaScript puro — sem frameworks, sem biblioteca de UI.

Não tenho formação em desenvolvimento web. Fui aprendendo conforme a necessidade: Python para os dados, HTML/CSS/JS para o dashboard, GitHub Pages para publicar. Em boa parte do caminho contei com a ajuda do Claude Code, que me auxiliou tanto na estrutura do código quanto na resolução de problemas que eu não sabia nem como nomear.

O resultado é um sistema completo: coleta dados reais do Transfermarkt e do site da FIFA, aplica um modelo de força baseado em ranking e histórico recente, simula a fase de grupos com Monte Carlo (100k iterações), e publica tudo em um dashboard interativo com 7 abas. Com a Copa em andamento, a aba **Resultados Reais** permite registrar os placares e acompanhar quanto o modelo acertou.

---

## Estrutura

```
copa_2026/
├── data/
│   ├── raw/
│   │   └── Dados_Selecoes.xlsx          # fonte principal (48 seleções, calendário, rankings)
│   └── processed/
│       ├── annual_balance.csv           # histórico anual coletado do Transfermarkt
│       ├── record_against.csv           # confrontos diretos históricos
│       ├── estatisticas_gerais.csv      # win/draw/loss rate e pontos/jogo por seleção
│       ├── simulacao_grupos.json        # resultado completo Monte Carlo (para o dashboard)
│       ├── simulacao_grupos_times.csv   # P1/P2/P3/P4 e estatísticas de pontos por time
│       └── simulacao_grupos_jogos.csv   # probabilidades V/E/D por jogo
│
├── src/
│   ├── config.py                        # paths, constantes e parâmetros globais
│   ├── data_loader.py                   # carregamento e pré-processamento do Excel
│   ├── scraping.py                      # coleta Transfermarkt (histórico anual + H2H)
│   ├── scrape_ranking_fifa.py           # atualiza ranking FIFA via Selenium
│   ├── stats.py                         # análises e resumos estatísticos
│   ├── plots.py                         # visualizações (matplotlib + plotly)
│   └── simulation.py                    # simulação Monte Carlo da fase de grupos
│
├── docs/                                # GitHub Pages
│   ├── dashboard.html                   # frontend principal
│   ├── style.css
│   ├── app.js                           # lógica principal do dashboard
│   ├── mc.js                            # "Meu Cenário": simulação manual do mata-mata
│   ├── res.js                           # aba Resultados Reais (placares + comparação)
│   ├── dados.js                         # gerado por gerar_html.py (~500 KB)
│   ├── resultados_reais.js              # store de placares reais (preenchido via UI)
│   └── assets/                          # bandeiras e logos locais (300+ SVG/PNG)
│
├── notebooks/
│   └── exploracao.ipynb
│
├── gerar_html.py                        # consolida tudo em docs/dados.js
└── main.py                              # pipeline completo via CLI
```

---

## Setup

```bash
conda create -n copa2026 python=3.11
conda activate copa2026
pip install -r requirements.txt
```

Para usar o `scrape_ranking_fifa.py`, é necessário ter o **Google Chrome** instalado (o Selenium gerencia o ChromeDriver automaticamente).

O arquivo `Dados_Selecoes.xlsx` deve estar em `data/raw/` com as abas:

| Aba | Descrição |
|---|---|
| `Selecoes` | 48 seleções, grupos A–L, id Transfermarkt, ranking FIFA |
| `Ranking_FIFA` | Ranking e pontuação FIFA de cada seleção |
| `Jogos_Grupos` | Calendário completo da fase de grupos (72 jogos) |
| `Jogos_MataMata` | Calendário do mata-mata com códigos de classificação |
| `Info_Selecoes` | Títulos, participações e confederação de cada seleção |

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

## Atualização do Ranking FIFA

O `scrape_ranking_fifa.py` usa **Selenium** para acessar o site oficial da FIFA, clicar no botão "Ver todas" (que expande de 10 para 211 seleções), extrair a tabela completa e atualizar as abas `Ranking_FIFA` e `Selecoes` do Excel automaticamente.

```bash
# Atualiza o Excel com o ranking mais recente
python src/scrape_ranking_fifa.py

# Só imprime sem salvar (dry-run)
python src/scrape_ranking_fifa.py --dry-run

# Abre janela visível do Chrome (útil para debug)
python src/scrape_ranking_fifa.py --no-headless
```

Isso é útil antes de rodar uma nova simulação — garante que o modelo usa o ranking FIFA mais atualizado.

---

## Scraping Transfermarkt

Coleta dois tipos de dados históricos para cada seleção via `scraping.py`:

- **Annual Balance**: desempenho anual dos últimos 5 anos (vitórias, empates, derrotas, pontos/jogo)
- **Record Against**: confrontos diretos contra todas as seleções

```bash
# Coleta completa (todas as 48 seleções)
python main.py

# Teste rápido de scraping (1 seleção)
python src/scraping.py
```

O scraper tem retry automático com backoff exponencial (3 tentativas, 5–20s de espera) e delay configurável entre seleções (padrão: 3s).

---

## Simulação Monte Carlo

Simula a fase de grupos com um modelo de força combinando dois sinais:

- **60%** — Ranking FIFA normalizado (posição atual no ranking mundial)
- **40%** — Pontos/jogo histórico com decaimento exponencial temporal (λ = 0,3)

**Cálculo de força (0–1):**
```
forca = 0.6 × ranking_norm + 0.4 × ppj_norm

ranking_norm = 1 - (ranking_fifa - 1) / 209
ppj_norm     = min(média_ponderada_por_exp(-λ × Δano) / 3, 1.0)
```

O decaimento com λ = 0,3 faz com que um resultado de 3 anos atrás tenha peso ~40% menor que um resultado recente. Isso evita que times com histórico antigo forte sejam superestimados caso estejam em declínio.

**Probabilidades de resultado:**
```
fa = (forca_a × home_factor_a) ^ 3   # expoente 3 amplifica diferenças de nível
fb = (forca_b × home_factor_b) ^ 3
ratio    = fa / (fa + fb)
diff     = |ratio - 0.5| × 2

p_empate    = max(0.27 × exp(-2.5 × diff), 0.04)
p_vitoria_a = (1 - p_empate) × ratio
p_vitoria_b = (1 - p_empate) × (1 - ratio)
```

**Vantagem de sede (hosts da Copa 2026):**

| Seleção | Fator |
|---|---|
| México | × 1,12 |
| Estados Unidos | × 1,06 |
| Canadá | × 1,05 |

**Classificação e desempate:**

Ao final de cada grupo simulado, os times são classificados por: pontos → ranking FIFA → ruído estocástico (evita desempates determinísticos que distorceriam a distribuição em 100k iterações).

**Critério de avanço:**
- Os 2 primeiros de cada grupo classificam diretamente (24 vagas).
- Os 12 terceiros colocados competem por 8 vagas adicionais. O modelo aproxima isso como `P(3º colocado classifica) ≈ P(3º) × 8/12`.

```bash
# Todos os grupos com 100k iterações
python src/simulation.py --n 100000

# Grupos específicos
python src/simulation.py --n 100000 --grupos C E G H J L

# Um único grupo
python src/simulation.py --n 100000 --grupos H
```

**Outputs gerados:**

| Arquivo | Conteúdo |
|---|---|
| `simulacao_grupos.json` | Dados completos para o dashboard (12 grupos) |
| `simulacao_grupos_times.csv` | P1/P2/P3/P4, P(classifica), Pts médio/mediana/DP por time |
| `simulacao_grupos_jogos.csv` | Probabilidades V/E/D por jogo |

---

## Como atualizar os dados e publicar

Após rodar nova simulação ou atualizar o Excel:

```bash
# 1. Regenera docs/dados.js com os dados mais recentes
python gerar_html.py

# 2. Publica no GitHub Pages
git add docs/dados.js
git commit -m "data: atualiza simulação YYYY-MM-DD"
git push origin main
```

O GitHub Pages serve o conteúdo de `docs/` diretamente. Qualquer push atualiza o site em poucos minutos.

---

## Dashboard

O dashboard é uma aplicação HTML/CSS/JS estática com os dados embutidos em `dados.js`, servida via **GitHub Pages** sem nenhum servidor backend.

### Abas disponíveis

| Aba | Conteúdo |
|---|---|
| **Seleções** | Perfil completo: bandeira, ranking FIFA, títulos, participações, histórico anual de desempenho, confrontos diretos (H2H) |
| **Head to Head** | Confrontos ampliados com cards V/E/D contra todos os oponentes históricos |
| **Calendário** | Todos os 72 jogos da fase de grupos + mata-mata, com filtros por grupo, cidade e seleção |
| **Simulação** | Resultados Monte Carlo por grupo: probabilidade de 1º/2º/3º/4º lugar, pontos esperados, prováveis classificados |
| **Ranking FIFA** | Tabela completa das 48 seleções com busca, filtro por confederação e ordenação por coluna |
| **Meu Cenário** | Simulador manual do mata-mata: você define os classificados e o modelo simula os confrontos |
| **Resultados Reais** | Registro de placares reais, tabela real vs simulação e acertos do modelo (veja abaixo) |

---

## Resultados Reais

A aba **Resultados Reais** foi adicionada com a Copa já em andamento. Ela permite:

- **Registrar placares** — insira o resultado de cada jogo da fase de grupos conforme são encerrados
- **Tabela real vs simulação** — para cada grupo com pelo menos um resultado confirmado, compara a tabela real (pts, saldo, gols) com a classificação prevista pelo Monte Carlo
- **Acertos do modelo** — para grupos com todos os 6 jogos confirmados, mostra se o modelo acertou o 1º e o 2º colocado

Os dados são salvos em **localStorage** no browser — não há backend, não há servidor. Cada usuário mantém seu próprio histórico de placares localmente.

---

## Limitações conhecidas

- **Gols não são simulados**: o modelo decide apenas V/E/D. Desempate por saldo de gols e gols pró não são simulados, o que torna os critérios de classificação dentro do grupo uma aproximação.
- **Terceiros colocados**: a qualificação dos 8 melhores terceiros é aproximada como probabilidade uniforme (8/12 ≈ 66,7%), sem simular a tabela comparativa entre grupos.
- **Fase eliminatória fora do escopo**: a aba Resultados Reais cobre apenas a fase de grupos. O mata-mata real não é rastreado automaticamente.
- **Dados pré-sorteio**: o modelo foi calibrado antes da Copa com dados históricos e ranking FIFA. Não incorpora informações pós-sorteio como escalações, lesões ou forma recente durante o torneio.
- **Vantagem de sede**: os fatores (×1.12, ×1.06, ×1.05) são estimativas manuais, não calibradas estatisticamente.

---

## Módulos isolados

Cada módulo pode ser executado diretamente para diagnóstico:

```bash
python src/data_loader.py    # valida e imprime resumo do Excel
python src/stats.py          # imprime favoritos, resumo por grupo, locais
python src/plots.py          # gera e salva todos os gráficos
python src/scraping.py       # teste de scraping (1 seleção)
python src/simulation.py     # simulação com output no terminal
```

---

## Licença

Este projeto está licenciado sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

Se este projeto te ajudou de alguma forma, dê os devidos créditos: cite o repositório, inclua um link ou referencie meu nome. Não é uma exigência legal, mas é muito apreciado.
