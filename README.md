# Copa do Mundo 2026 — Análise, Simulação & Dashboard

Pipeline completo de dados e dashboard interativo para a Copa do Mundo 2026.

**[Ver Dashboard ao vivo](https://larrybers87.github.io/copa_2026/dashboard.html)**

---

## Sobre o projeto

Esse projeto nasceu de uma vontade de aprender na prática. Queria entender como coletar dados reais via Python (scraping, leitura de planilhas, pandas), processar essas informações e exibi-las de forma visual e interativa com JavaScript puro — sem frameworks, sem biblioteca de UI.

Não tenho formação em desenvolvimento web. Fui aprendendo conforme a necessidade: Python para os dados, HTML/CSS/JS para o dashboard, GitHub Pages para publicar. Em boa parte do caminho contei com a ajuda do Claude Code, que me auxiliou tanto na estrutura do código quanto na resolução de problemas que eu não sabia nem como nomear.

O resultado é um sistema completo: coleta dados reais do Transfermarkt e do site da FIFA, aplica um modelo de força baseado em ranking e histórico recente, simula a fase de grupos com Monte Carlo (500k iterações), e publica tudo em um dashboard interativo com 6 abas, filtros avançados e simulador manual do mata-mata.

O projeto está **finalizado** na sua forma principal. O próximo passo é o **acompanhamento em tempo real** — descrito na seção abaixo.

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
│   ├── app.js                           # lógica do dashboard
│   ├── mc.js                            # "Meu Cenário": simulação manual do mata-mata
│   ├── dados.js                         # gerado por gerar_html.py (~500 KB)
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
| `Jogos_Grupos` | Calendário completo da fase de grupos (64 jogos) |
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
- **40%** — Pontos/jogo histórico ponderado por ano (mais recente = maior peso)

**Cálculo de força (0–1):**
```
forca = 0.6 × ranking_norm + 0.4 × ppj_norm

ranking_norm = 1 - (ranking_fifa - 1) / 209
ppj_norm     = min(pontos_por_jogo_exponencialmente_ponderado / 3, 1.0)
```

**Probabilidades de resultado:**
```
fa = forca_a ^ 3   # expoente 3 amplifica diferenças de nível
fb = forca_b ^ 3
ratio    = fa / (fa + fb)
diff     = |ratio - 0.5| × 2   # 0 = equilíbrio, 1 = desequilíbrio máximo

p_empate    = max(0.27 × exp(-2.5 × diff), 0.04)
p_vitoria_a = (1 - p_empate) × ratio
p_vitoria_b = (1 - p_empate) × (1 - ratio)
```

Exemplos:
- Argentina × Jordânia: **69% / 8% / 23%**
- Brasil × Marrocos: **35% / 18% / 47%**
- Times iguais: **36% / 27% / 36%**

A cada simulação, o grupo é resolvido do zero (6 jogos), com classificação por pontos e ranking FIFA como tiebreaker. Rodando 500k vezes, obtemos distribuições estáveis de probabilidade de classificação.

```bash
# Todos os grupos com 500k iterações
python src/simulation.py --n 500000

# Grupos específicos
python src/simulation.py --n 500000 --grupos C E G H J L

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

## Dashboard

O dashboard é uma aplicação HTML/CSS/JS estática com os dados embutidos em `dados.js`. Para atualizar após nova simulação ou novos dados:

```bash
python gerar_html.py
```

Isso gera `docs/dados.js` (~500 KB) consolidando Excel + CSVs + JSON. O dashboard é servido via **GitHub Pages** sem nenhum servidor backend.

### Abas disponíveis

| Aba | Conteúdo |
|---|---|
| **Seleções** | Perfil completo: bandeira, ranking FIFA, títulos, participações, histórico anual de desempenho, confrontos diretos (H2H) |
| **Head to Head** | Confrontos ampliados com cards V/E/D contra todos os oponentes históricos |
| **Calendário** | Todos os 64 jogos com filtros por grupo, cidade e seleção |
| **Simulação** | Resultados Monte Carlo por grupo: probabilidade de 1º/2º/3º/4º lugar, pontos esperados, prováveis confrontos do mata-mata |
| **Ranking FIFA** | Tabela completa com busca, filtro por confederação e ordenação por coluna |
| **Meu Cenário** | Simulador manual do mata-mata: você define os classificados e o modelo simula os confrontos |

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

## Próximo passo: Acompanhamento em tempo real

Após o início da Copa, o plano é adicionar uma funcionalidade de **acompanhamento ao vivo** — registrar os placares reais conforme os jogos são encerrados e comparar com o que o modelo previu.

A ideia envolve:

- **Entrada de resultados reais**: registrar o placar de cada jogo encerrado
- **Comparação com o modelo**: para cada jogo com resultado conhecido, mostrar se o modelo acertou o vencedor (ou empate), e quão confiante estava (ex: "modelo previa 68% de chance para o Brasil — acertou")
- **Classificação atualizada**: tabela de classificação real de cada grupo, lado a lado com a classificação mais provável pelo modelo
- **Acurácia acumulada**: percentual de acertos do modelo ao longo da fase de grupos
- **Atualização do mata-mata**: conforme as equipes classificadas vão sendo conhecidas, atualizar as previsões das fases seguintes com os confrontos reais

Isso vai permitir avaliar o desempenho do modelo na prática — não apenas "o que prevemos antes", mas "o quanto acertamos de fato".

---

## Licença

Este projeto está licenciado sob a licença MIT — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

Se este projeto te ajudou de alguma forma, dê os devidos créditos: cite o repositório, inclua um link ou referencie meu nome. Não é uma exigência legal, mas é muito apreciado.
