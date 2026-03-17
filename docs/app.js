/* ══════════════════════════════════════════════════
   app.js — Copa do Mundo 2026 Dashboard
   Depende de: dados.js (gerado pelo Python)
   ══════════════════════════════════════════════════ */

'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtData = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const flagUrl = iso2 =>
  iso2 ? `https://flagcdn.com/w80/${iso2.toLowerCase()}.png` : null;

const flagEmoji = iso2 => {
  if (!iso2) return '🏳';
  return [...iso2.toUpperCase()]
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join('');
};

const getNome = club =>
  DADOS.selecoes.find(x => x.Club === club)?.Selecao || club;

// ── Popula o <select> de seleções ────────────────────────────────────────────

// ── Dropdown customizado (substitui <select> nativo) ─────────────────────────

let _dropdownAberto = false;
let _valorAtual = '';

function popularSelect() {
  // Monta estrutura de dados agrupada
  const grupos = {};
  DADOS.selecoes
    .sort((a, b) => a.Selecao.localeCompare(b.Selecao, 'pt-BR'))
    .forEach(s => {
      if (!grupos[s.Grupo]) grupos[s.Grupo] = [];
      grupos[s.Grupo].push(s);
    });

  // Substitui o <select> por um dropdown customizado
  const selectEl = document.getElementById('selecaoSelect');
  const wrapper  = document.createElement('div');
  wrapper.className = 'custom-select-wrap';
  wrapper.id = 'customSelectWrap';

  wrapper.innerHTML = `
    <div class="custom-select-trigger" id="customSelectTrigger">
      <span id="customSelectLabel">Escolha uma seleção...</span>
      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
        <path d="M1 1l5 5 5-5" stroke="#6b7280" stroke-width="1.5"/>
      </svg>
    </div>
    <div class="custom-select-dropdown" id="customSelectDropdown">
      <div class="cs-search-wrap">
        <input type="text" id="csSearchInput" class="cs-search"
               placeholder="Buscar seleção..." autocomplete="off"
               spellcheck="false">
      </div>
      <div id="csOptionsList"></div>
    </div>`;

  selectEl.replaceWith(wrapper);

  // Popula lista de opções
  const lista = document.getElementById('csOptionsList');
  _gruposData = grupos;
  renderOpcoes('');

  // Busca em tempo real
  const searchInput = document.getElementById('csSearchInput');
  searchInput.addEventListener('input', e => {
    renderOpcoes(e.target.value.trim());
  });
  // Impede que clique no input feche o dropdown
  searchInput.addEventListener('click', e => e.stopPropagation());
  // Impede que keydown no input propague
  searchInput.addEventListener('keydown', e => e.stopPropagation());

  // Abre/fecha ao clicar no trigger
  document.getElementById('customSelectTrigger').addEventListener('click', e => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Fecha ao clicar fora
  document.addEventListener('click', () => fecharDropdown());
}

// Guarda estrutura de grupos para o filtro
let _gruposData = {};

function renderOpcoes(filtro) {
  const lista = document.getElementById('csOptionsList');
  if (!lista) return;
  lista.innerHTML = '';

  const q = filtro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let totalVisiveis = 0;

  Object.keys(_gruposData).sort().forEach(g => {
    const opcoesFiltradas = _gruposData[g].filter(s => {
      const nome = s.Selecao.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return nome.includes(q);
    });

    if (!opcoesFiltradas.length) return;
    totalVisiveis += opcoesFiltradas.length;

    // Header do grupo — só mostra se não estiver filtrando ou se tiver resultados
    const header = document.createElement('div');
    header.className = 'cs-group-header';
    header.textContent = `Grupo ${g}`;
    lista.appendChild(header);

    opcoesFiltradas.forEach(s => {
      const item = document.createElement('div');
      item.className = 'cs-option' + (s.Club === _valorAtual ? ' ativo' : '');
      item.dataset.value = s.Club;

      // Destaca o trecho que casou com a busca
      if (filtro) {
        const idx  = s.Selecao.toLowerCase().normalize('NFD')
                      .replace(/[̀-ͯ]/g, '').indexOf(q);
        if (idx >= 0) {
          item.innerHTML =
            s.Selecao.slice(0, idx) +
            `<mark>${s.Selecao.slice(idx, idx + filtro.length)}</mark>` +
            s.Selecao.slice(idx + filtro.length);
        } else {
          item.textContent = s.Selecao;
        }
      } else {
        item.textContent = s.Selecao;
      }

      item.addEventListener('click', () => selecionarOpcao(s.Club, s.Selecao));
      lista.appendChild(item);
    });
  });

  // Mensagem se nada encontrado
  if (totalVisiveis === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'cs-no-result';
    vazio.textContent = 'Nenhuma seleção encontrada';
    lista.appendChild(vazio);
  }
}

function toggleDropdown() {
  _dropdownAberto ? fecharDropdown() : abrirDropdown();
}

function abrirDropdown() {
  _dropdownAberto = true;
  const wrap     = document.getElementById('customSelectWrap');
  const dropdown = document.getElementById('customSelectDropdown');
  const input    = document.getElementById('csSearchInput');
  wrap.classList.add('aberto');
  dropdown.style.display = 'block';

  // Limpa busca anterior e foca o input
  if (input) {
    input.value = '';
    renderOpcoes('');
    requestAnimationFrame(() => input.focus());
  }

  // Centraliza item selecionado após render
  requestAnimationFrame(() => {
    const lista  = document.getElementById('csOptionsList');
    if (!lista || !_valorAtual) return;
    const active = lista.querySelector(`.cs-option[data-value="${_valorAtual}"]`);
    if (!active) return;
    const ddHeight = dropdown.clientHeight;
    const itemTop  = active.offsetTop + lista.offsetTop;
    const itemH    = active.clientHeight;
    dropdown.scrollTop = itemTop - (ddHeight / 2) + (itemH / 2);
  });
}

function fecharDropdown() {
  _dropdownAberto = false;
  const wrap     = document.getElementById('customSelectWrap');
  const dropdown = document.getElementById('customSelectDropdown');
  if (wrap) wrap.classList.remove('aberto');
  if (dropdown) dropdown.style.display = 'none';
}

function selecionarOpcao(club, label) {
  _valorAtual = club;
  document.getElementById('customSelectLabel').textContent = label;

  // Marca visualmente o item ativo
  document.querySelectorAll('.cs-option').forEach(el => {
    el.classList.toggle('ativo', el.dataset.value === club);
  });

  fecharDropdown();
  renderSelecao(club);

  // Se estiver na aba H2H, atualiza também
  if (_abaAtiva === 'h2h') renderH2HFull();
}

// ── Render principal ─────────────────────────────────────────────────────────

function renderVazio() {
  document.getElementById('panelSelecao').innerHTML = `
    <div class="card identity-card fade-in">
      <div class="card-body" style="justify-content:center;min-height:320px;gap:16px">
        <div style="font-size:48px;opacity:.15">⚽</div>
        <div style="font-family:var(--font-head);font-size:16px;font-weight:700;
                    letter-spacing:2px;text-transform:uppercase;color:var(--muted);text-align:center">
          Selecione uma seleção
        </div>
        <div style="font-size:12px;color:var(--border);text-align:center">
          Use o menu no topo direito
        </div>
      </div>
    </div>`;
  document.getElementById('bodyJogos').innerHTML    = '';
  document.getElementById('bodyHistorico').innerHTML = '';
  document.getElementById('bodyH2H').innerHTML       = '';
  document.getElementById('cardJogos').querySelector('.card-title').textContent = '🗓 Jogos na Fase de Grupos';
}

function renderSelecao(club) {
  if (!club) return renderVazio();
  const s = DADOS.selecoes.find(x => x.Club === club);
  if (!s) return;

  renderIdentidade(s);
  renderJogos(s);
  renderHistorico(s);
  renderH2H(s, null);
}

// ── Identidade ───────────────────────────────────────────────────────────────

function renderIdentidade(s) {
  const rankPct = Math.max(5, 100 - (s.Ranking_FIFA / 210 * 100));

  // Bandeira: asset local > flagcdn > emoji
  const bandeiraSrc = s.asset_bandeira || flagUrl(s.iso2);
  const bandeiraHtml = bandeiraSrc
    ? `<img class="flag-img" src="${bandeiraSrc}" alt="${s.Selecao}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const emojiHtml = `
    <div class="flag-fallback" ${bandeiraSrc ? 'style="display:none"' : ''}>
      ${flagEmoji(s.iso2)}
    </div>`;

  // Logo da confederação/federação (só mostra se tiver asset local)
  const logoHtml = s.asset_logo
    ? `<img class="fed-logo" src="${s.asset_logo}" alt="Logo ${s.Selecao}">`
    : '';

  const repescagemHtml = s.is_repescagem
    ? `<div class="repescagem-badge">⚠ Vaga via Repescagem</div>` : '';

  const pontosHtml = s.Total_Pontos
    ? `<span style="font-family:var(--font-head);font-size:12px;color:var(--accent)">${Number(s.Total_Pontos).toFixed(1)} pts</span>`
    : '';

  document.getElementById('panelSelecao').innerHTML = `
    <div class="card identity-card fade-in">
      <div class="card-body">
        <div class="flag-logo-wrap">
          ${bandeiraHtml}
          ${emojiHtml}
          ${logoHtml ? `<div class="fed-logo-wrap">${logoHtml}</div>` : ''}
        </div>

        <div class="selecao-nome">${s.Selecao}</div>
        <div class="selecao-conf">${s.Confederacao || ''}</div>
        <div class="grupo-badge">Grupo ${s.Grupo}</div>

        <div class="stats-grid" style="margin-top:8px">
          <div class="stat-item">
            <span class="stat-value gold">#${s.Ranking_FIFA}</span>
            <span class="stat-label">Ranking FIFA</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${s.Copas_Participacoes}</span>
            <span class="stat-label">Participações</span>
          </div>
          <div class="stat-item" style="grid-column:1/-1">
            <span class="stat-value gold">${s.Copas_Titulos ?? 0}</span>
            <span class="stat-label">Títulos Mundiais</span>
          </div>
        </div>

        <div class="ranking-wrap" style="width:100%;margin-top:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Força Ranking</span>
            ${pontosHtml}
          </div>
          <div class="ranking-bar-bg">
            <div class="ranking-bar-fill" style="width:${rankPct}%"></div>
          </div>
        </div>

        ${repescagemHtml}
      </div>
    </div>`;
}

// ── Jogos do grupo ───────────────────────────────────────────────────────────

function renderJogos(s) {
  const jogos = DADOS.jogos_grupos.filter(j => j.Grupo === s.Grupo);

  if (!jogos.length) {
    document.getElementById('bodyJogos').innerHTML =
      `<p style="color:var(--muted)">Sem jogos encontrados para o Grupo ${s.Grupo}.</p>`;
    return;
  }

  const rows = jogos.map(j => {
    const isHome = j.Time1 === s.Selecao;
    const isAway = j.Time2 === s.Selecao;
    const destaque = (isHome || isAway) ? 'destaque' : '';

    return `
      <div class="jogo-row ${destaque}">
        <span class="jogo-time ${isHome ? 'destaque-time' : ''}">${getNome(j.Time1)}</span>
        <div class="jogo-center">
          <span class="jogo-vs">VS</span>
          <span class="jogo-data">${fmtData(j.DataHora)}</span>
          <span class="jogo-local">${j.Local}</span>
        </div>
        <span class="jogo-time right ${isAway ? 'destaque-time' : ''}">${getNome(j.Time2)}</span>
      </div>`;
  }).join('');

  document.getElementById('bodyJogos').innerHTML =
    `<div class="jogos-grid fade-in">${rows}</div>`;
}

// ── Histórico anual ──────────────────────────────────────────────────────────

function renderHistorico(s) {
  const hist = (DADOS.annual_balance || [])
    .filter(r => r.Team === s.Club)
    .sort((a, b) => b.Year - a.Year)
    .slice(0, 6);

  if (!hist.length) {
    document.getElementById('bodyHistorico').innerHTML =
      `<p style="color:var(--muted);font-size:13px">Sem dados históricos.</p>`;
    return;
  }

  const rows = hist.map(r => {
    const wr = r.Matches > 0 ? (r.Wins / r.Matches * 100) : 0;
    return `
      <tr>
        <td>${r.Year}</td>
        <td>${r.Matches}</td>
        <td class="td-win">${r.Wins}</td>
        <td>${r.Draws}</td>
        <td class="td-loss">${r.Losses}</td>
        <td>
          <div class="wr-wrap">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:13px;color:var(--green)">${wr.toFixed(0)}%</span>
            <div class="wr-bar-bg"><div class="wr-bar" style="width:${wr}%"></div></div>
          </div>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('bodyHistorico').innerHTML = `
    <div class="fade-in">
      <table class="historico-table">
        <thead>
          <tr><th>Ano</th><th>J</th><th>V</th><th>E</th><th>D</th><th>%V</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Head to Head ─────────────────────────────────────────────────────────────

function renderH2H(s, oponente) {
  const outros = DADOS.selecoes
    .filter(x => x.Club !== s.Club)
    .sort((a, b) => a.Selecao.localeCompare(b.Selecao, 'pt-BR'));

  const alvo = oponente || outros[0]?.Club;

  const opts = outros.map(o =>
    `<option value="${o.Club}" ${o.Club === alvo ? 'selected' : ''}>${o.Selecao}</option>`
  ).join('');

  const rec = (DADOS.record_against || []).find(
    r => r.Team === s.Club && r.Opponent === alvo
  );

  let conteudo;
  if (rec) {
    const total = rec.Matches || 0;
    const v = rec.Wins   || 0;
    const e = rec.Draws  || 0;
    const d = rec.Losses || 0;
    const nomeOp = getNome(alvo);

    conteudo = `
      <div class="h2h-placar">
        <div>
          <div class="h2h-time-nome">${s.Selecao}</div>
          <div class="h2h-num win">${v}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase">vitórias</div>
        </div>
        <div>
          <div class="h2h-num draw" style="font-size:28px">${e}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase">empates</div>
        </div>
        <div>
          <div class="h2h-time-nome">${nomeOp}</div>
          <div class="h2h-num lose">${d}</div>
          <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase">vitórias</div>
        </div>
      </div>
      <div class="h2h-stats">
        <div class="h2h-stat">
          <div class="h2h-stat-val">${total}</div>
          <div class="h2h-stat-lbl">Jogos</div>
        </div>
        <div class="h2h-stat">
          <div class="h2h-stat-val" style="color:var(--green)">
            ${total > 0 ? (v / total * 100).toFixed(0) : 0}%
          </div>
          <div class="h2h-stat-lbl">% Vitórias</div>
        </div>
        <div class="h2h-stat">
          <div class="h2h-stat-val" style="color:var(--muted)">
            ${total > 0 ? (e / total * 100).toFixed(0) : 0}%
          </div>
          <div class="h2h-stat-lbl">% Empates</div>
        </div>
      </div>`;
  } else {
    conteudo = `<div class="h2h-no-data">Sem dados de confronto direto.</div>`;
  }

  document.getElementById('bodyH2H').innerHTML = `
    <div class="fade-in">
      <div class="h2h-selector">
        <select onchange="renderH2H(
          DADOS.selecoes.find(x => x.Club === '${s.Club}'),
          this.value
        )">${opts}</select>
      </div>
      ${conteudo}
    </div>`;
}

// ── Init ─────────────────────────────────────────────────────────────────────

popularSelect();
renderVazio();  // começa em branco

// ── Scroll suave global ───────────────────────────────────────────────────────
document.documentElement.style.scrollBehavior = 'smooth';

// ══════════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO DE ABAS
// ══════════════════════════════════════════════════════════════════════════════

let _abaAtiva = 'selecao';

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    mudarAba(tab);
  });
});

function mudarAba(tab) {
  _abaAtiva = tab;

  // Atualiza botões
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );

  // Atualiza conteúdo
  document.querySelectorAll('.tab-content').forEach(el =>
    el.classList.toggle('active', el.id === `tab-${tab}`)
  );

  // Selector só visível nas abas Seleções e H2H
  const selectorWrap = document.getElementById('selectorWrap');
  if (selectorWrap) {
    selectorWrap.style.display = (tab === 'selecao' || tab === 'h2h') ? 'flex' : 'none';
  }

  // Renderiza aba sob demanda
  if (tab === 'h2h')        renderH2HFull();
  if (tab === 'ranking')    renderRanking();
  if (tab === 'calendario') renderCalendario();
  if (tab === 'simulacao')  renderSimulacao();
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA H2H AMPLIADO
// ══════════════════════════════════════════════════════════════════════════════

function renderH2HFull() {
  const s = _valorAtual
    ? DADOS.selecoes.find(x => x.Club === _valorAtual)
    : null;

  const identDiv  = document.getElementById('h2hFullIdentidade');
  const statsDiv  = document.getElementById('h2hFullStats');
  const cardsDiv  = document.getElementById('h2hCards');
  const searchEl  = document.getElementById('h2hSearch');

  if (!s) {
    identDiv.innerHTML = `
      <div style="font-family:var(--font-head);font-size:16px;color:var(--muted);
                  letter-spacing:1px;text-transform:uppercase">
        Selecione uma seleção na aba Seleções primeiro
      </div>`;
    statsDiv.innerHTML = '';
    cardsDiv.innerHTML = '';
    return;
  }

  // Identidade
  const bandSrc = s.asset_bandeira || flagUrl(s.iso2);
  identDiv.innerHTML = `
    <div class="h2h-full-identidade">
      ${bandSrc ? `<img src="${bandSrc}" alt="${s.Selecao}"
        onerror="this.style.display='none'">` : `<span style="font-size:32px">${flagEmoji(s.iso2)}</span>`}
      <span class="h2h-full-nome">${s.Selecao}</span>
    </div>`;

  // Confrontos desta seleção
  const todos = (DADOS.record_against || []).filter(r => r.Team === s.Club);

  if (!todos.length) {
    statsDiv.innerHTML = '';
    cardsDiv.innerHTML = `<div style="color:var(--muted);padding:20px 0">Sem dados de confronto.</div>`;
    return;
  }

  // Totais agregados
  const totJ = todos.reduce((a,r) => a + (r.Matches||0), 0);
  const totV = todos.reduce((a,r) => a + (r.Wins||0),    0);
  const totE = todos.reduce((a,r) => a + (r.Draws||0),   0);
  const totD = todos.reduce((a,r) => a + (r.Losses||0),  0);
  const wr   = totJ > 0 ? (totV/totJ*100).toFixed(1) : 0;

  statsDiv.innerHTML = `
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val">${todos.length}</span>
      <span class="h2h-full-stat-lbl">Oponentes</span>
    </div>
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val">${totJ}</span>
      <span class="h2h-full-stat-lbl">Jogos</span>
    </div>
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val" style="color:var(--green)">${totV}</span>
      <span class="h2h-full-stat-lbl">Vitórias</span>
    </div>
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val" style="color:var(--muted)">${totE}</span>
      <span class="h2h-full-stat-lbl">Empates</span>
    </div>
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val" style="color:var(--red)">${totD}</span>
      <span class="h2h-full-stat-lbl">Derrotas</span>
    </div>
    <div class="h2h-full-stat">
      <span class="h2h-full-stat-val" style="color:var(--accent)">${wr}%</span>
      <span class="h2h-full-stat-lbl">% Vitórias</span>
    </div>`;

  // Busca
  searchEl.value = '';
  searchEl.oninput = () => renderCardsH2H(s, todos, searchEl.value.trim());
  renderCardsH2H(s, todos, '');
}

function renderCardsH2H(s, todos, filtro) {
  const cardsDiv = document.getElementById('h2hCards');
  const q = filtro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const filtrados = todos
    .filter(r => {
      if (!q) return true;
      const nome = (getNome(r.Opponent) + ' ' + r.Opponent)
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nome.includes(q);
    })
    .sort((a, b) => (b.Matches||0) - (a.Matches||0));  // ordena por mais jogos

  if (!filtrados.length) {
    cardsDiv.innerHTML = `<div style="color:var(--muted);padding:20px 0;grid-column:1/-1">
      Nenhum oponente encontrado.</div>`;
    return;
  }

  cardsDiv.innerHTML = filtrados.map(r => {
    const j  = r.Matches || 0;
    const v  = r.Wins    || 0;
    const e  = r.Draws   || 0;
    const d  = r.Losses  || 0;
    const wr = j > 0 ? (v/j*100) : 0;

    // Tenta achar dados da seleção oponente para a bandeira
    const op = DADOS.selecoes.find(x => x.Club === r.Opponent);
    const opNome = op?.Selecao || r.Opponent;
    const opSrc  = op?.asset_bandeira || (op ? flagUrl(op.iso2) : null);
    const opFlag = opSrc
      ? `<img class="h2h-card-flag" src="${opSrc}" alt="${opNome}"
           onerror="this.style.display='none'">`
      : `<span style="font-size:20px">${op ? flagEmoji(op.iso2) : '🏳'}</span>`;

    return `
      <div class="h2h-card">
        <div class="h2h-card-oponente">
          ${opFlag}
          <span class="h2h-card-nome">${opNome}</span>
        </div>
        <div class="h2h-card-placar">
          <div style="text-align:center">
            <div class="h2h-card-num v">${v}</div>
            <div class="h2h-card-lbl">V</div>
          </div>
          <div style="text-align:center">
            <div class="h2h-card-num e">${e}</div>
            <div class="h2h-card-lbl">E</div>
          </div>
          <div style="text-align:center">
            <div class="h2h-card-num d">${d}</div>
            <div class="h2h-card-lbl">D</div>
          </div>
        </div>
        <div class="h2h-card-bar">
          <div class="h2h-card-bar-fill" style="width:${wr}%"></div>
        </div>
        <div class="h2h-card-jogos">${j} jogo${j !== 1 ? 's' : ''} · ${wr.toFixed(0)}% vitórias</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA RANKING FIFA
// ══════════════════════════════════════════════════════════════════════════════

let _rankingOrdem = { col: 'Ranking_FIFA', asc: true };
let _rankingConfs = new Set();   // múltiplas confederações selecionadas
let _rankingBusca = '';

function renderRanking() {
  // Popula filtros de confederação (só na primeira vez)
  const confGroup = document.getElementById('rankingFiltroConf');
  if (confGroup.querySelectorAll('.conf-btn').length === 1) {
    const confs = [...new Set(
      DADOS.selecoes.map(s => s.Confederacao).filter(Boolean).sort()
    )];
    confs.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'conf-btn';
      btn.dataset.conf = c;
      btn.textContent = c;
      btn.addEventListener('click', () => filtrarConf(c));
      confGroup.appendChild(btn);
    });

    // Botão "Todas" começa ativo
    const todasBtn = confGroup.querySelector('.conf-btn[data-conf=""]');
    if (todasBtn) {
      todasBtn.classList.add('active');
      todasBtn.addEventListener('click', () => filtrarConf(''));
    }
  }

  // Eventos de busca e ordenação (bind único)
  const searchEl = document.getElementById('rankingSearch');
  searchEl.oninput = e => {
    _rankingBusca = e.target.value.trim();
    renderLinhasRanking();
  };

  document.querySelectorAll('.ranking-table th.sortable').forEach(th => {
    th.onclick = () => ordenarRanking(th.dataset.col, th);
  });

  renderLinhasRanking();
}

function filtrarConf(conf) {
  if (conf === '') {
    // "Todas" — limpa o Set e atualiza todos os botões
    _rankingConfs.clear();
  } else {
    _rankingConfs.has(conf) ? _rankingConfs.delete(conf) : _rankingConfs.add(conf);
  }

  // Recalcula visual de todos os botões de uma vez
  document.querySelectorAll('.conf-btn').forEach(b => {
    if (b.dataset.conf === '') {
      b.classList.toggle('active', _rankingConfs.size === 0);
    } else {
      b.classList.toggle('active', _rankingConfs.has(b.dataset.conf));
    }
  });

  renderLinhasRanking();
}

function ordenarRanking(col, thEl) {
  if (_rankingOrdem.col === col) {
    _rankingOrdem.asc = !_rankingOrdem.asc;
  } else {
    // Strings começam asc (A→Z), números começam asc exceto Ranking que já é posição
    _rankingOrdem = { col, asc: true };
  }
  document.querySelectorAll('.ranking-table th').forEach(th => {
    th.classList.remove('active-sort', 'asc');
  });
  thEl.classList.add('active-sort');
  if (_rankingOrdem.asc) thEl.classList.add('asc');
  renderLinhasRanking();
}

function renderLinhasRanking() {
  const q = _rankingBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let lista = DADOS.selecoes.filter(s => {
    if (_rankingConfs.size > 0 && !_rankingConfs.has(s.Confederacao)) return false;
    if (q) {
      const nome = (s.Selecao + ' ' + s.Club)
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!nome.includes(q)) return false;
    }
    return true;
  });

  // Ordena — suporta colunas numéricas e strings
  const { col, asc } = _rankingOrdem;
  lista.sort((a, b) => {
    const va = a[col];
    const vb = b[col];
    // Nulos sempre vão para o final
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    // String: comparação alfabética
    if (typeof va === 'string') {
      return asc
        ? va.localeCompare(vb, 'pt-BR')
        : vb.localeCompare(va, 'pt-BR');
    }
    // Número
    return asc ? va - vb : vb - va;
  });

  // Calcula líderes por confederação (primeiro de cada conf no ranking FIFA)
  const lideres = new Set();
  if (_rankingConfs.size > 0) {
    _rankingConfs.forEach(conf => {
      const lider = [...DADOS.selecoes]
        .filter(s => s.Confederacao === conf)
        .sort((a, b) => (a.Ranking_FIFA ?? 9999) - (b.Ranking_FIFA ?? 9999))[0];
      if (lider) lideres.add(lider.Club);
    });
  }

  const tbody = document.getElementById('rankingBody');
  tbody.innerHTML = lista.map((s, i) => {
    const pos     = s.Ranking_FIFA;
    const posClass = pos <= 3 ? 'rank-pos top3' : 'rank-pos';
    const bandSrc = s.asset_bandeira || flagUrl(s.iso2);
    const flagHtml = bandSrc
      ? `<img class="rank-flag" src="${bandSrc}" alt="${s.Selecao}"
           onerror="this.style.display='none'">`
      : `<span style="font-size:20px">${flagEmoji(s.iso2)}</span>`;

    const isLider = lideres.has(s.Club);
    return `
      <tr onclick="irParaSelecao('${s.Club}')" title="Ver ${s.Selecao}"
          class="${isLider ? 'rank-lider' : ''}">
        <td class="${posClass}">
          ${isLider ? '<span class="lider-badge">★</span>' : ''}
          ${pos ?? '—'}
        </td>
        <td>
          <div class="rank-selecao">
            ${flagHtml}
            <div>
              <div class="rank-nome">${s.Selecao}</div>
              <div class="rank-grupo">Grupo ${s.Grupo}</div>
            </div>
          </div>
        </td>
        <td class="rank-pontos">${s.Total_Pontos ? Number(s.Total_Pontos).toFixed(1) : '—'}</td>
        <td><span class="conf-badge">${s.Confederacao || '—'}</span></td>
        <td>${s.Copas_Participacoes ?? '—'}</td>
        <td class="rank-titulo">${s.Copas_Titulos || '—'}</td>
        <td>${s.Segundo_Lugar || '—'}</td>
        <td>${s.Terceiro_Lugar || '—'}</td>
      </tr>`;
  }).join('');
}

// Clique na linha do ranking → vai para aba Seleções com aquela seleção
function irParaSelecao(club) {
  mudarAba('selecao');
  selecionarOpcao(club, DADOS.selecoes.find(x => x.Club === club)?.Selecao || club);
}

// ══════════════════════════════════════════════════════════════════════════════
// SORT NA ABA SELEÇÕES
// ══════════════════════════════════════════════════════════════════════════════

let _selecaoSort = { col: 'Ranking_FIFA', asc: true };

function sortSelecao(btn) {
  const col = btn.dataset.sort;

  if (_selecaoSort.col === col) {
    _selecaoSort.asc = !_selecaoSort.asc;
    btn.textContent = btn.textContent.replace(/ [↑↓]$/, '');
    btn.textContent += _selecaoSort.asc ? ' ↑' : ' ↓';
  } else {
    // Reset botão anterior
    document.querySelectorAll('.sort-btn').forEach(b => {
      b.classList.remove('active');
      b.textContent = b.textContent.replace(/ [↑↓]$/, '');
    });
    _selecaoSort = { col, asc: col === 'Ranking_FIFA' };
    btn.classList.add('active');
    btn.textContent += _selecaoSort.asc ? ' ↑' : ' ↓';
  }

  // Reordena o dropdown customizado
  reordenarDropdown(_selecaoSort.col, _selecaoSort.asc);
}

function reordenarDropdown(col, asc) {
  // Reordena _gruposData internamente por grupo
  Object.keys(_gruposData).forEach(g => {
    _gruposData[g].sort((a, b) => {
      const va = a[col] ?? (asc ? 9999 : -1);
      const vb = b[col] ?? (asc ? 9999 : -1);
      return asc ? va - vb : vb - va;
    });
  });

  // Re-renderiza a lista atual no dropdown
  const input = document.getElementById('csSearchInput');
  renderOpcoes(input ? input.value.trim() : '');
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA CALENDÁRIO
// ══════════════════════════════════════════════════════════════════════════════

let _calGrupos   = new Set();
let _calCidades  = new Set();
let _calBusca    = '';
let _calIniciado = false;

const FASE_LABEL = {
  'SF': 'Segunda Fase', 'O': 'Oitavas de Final',
  'Q': 'Quartas de Final', 'S': 'Semifinal',
  'T': 'Disputa de 3º Lugar', 'F': 'Final',
};

function renderCalendario() {
  if (!_calIniciado) {
    _calIniciado = true;
    _popularFiltrosCalendario();
    const busca = document.getElementById('calBuscaSelecao');
    if (busca) busca.oninput = e => { _calBusca = e.target.value.trim(); _renderCalLista(); };
  }
  // Pequeno delay para garantir que o DOM da aba está visível antes de renderizar
  requestAnimationFrame(() => _renderCalLista());
}

function _popularFiltrosCalendario() {
  // Grupos
  const grupos = [...new Set(
    (DADOS.jogos_grupos || []).map(j => j.Grupo).filter(Boolean)
  )].sort();
  const grupoWrap = document.getElementById('calFiltroGrupo');
  grupos.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'cal-btn';
    btn.dataset.grupo = g;
    btn.textContent = g;
    btn.addEventListener('click', () => _toggleCalFiltro('grupo', g, btn));
    grupoWrap.appendChild(btn);
  });
  grupoWrap.querySelector('[data-grupo=""]')
    .addEventListener('click', () => _limparCalFiltro('grupo'));

  // Cidades (grupos + mata-mata)
  const todasCidades = [
    ...(DADOS.jogos_grupos  || []).map(j => j.Local),
    ...(DADOS.jogos_mata    || []).map(j => j.Local),
  ];
  const cidades = [...new Set(todasCidades.filter(Boolean))].sort();
  const cidadeWrap = document.getElementById('calFiltroCidade');
  cidades.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'cal-btn';
    btn.dataset.cidade = c;
    btn.textContent = c;
    btn.addEventListener('click', () => _toggleCalFiltro('cidade', c, btn));
    cidadeWrap.appendChild(btn);
  });
  cidadeWrap.querySelector('[data-cidade=""]')
    .addEventListener('click', () => _limparCalFiltro('cidade'));
}

function _toggleCalFiltro(tipo, valor, btn) {
  const set = tipo === 'grupo' ? _calGrupos : _calCidades;
  const allBtn = document.querySelector(
    tipo === 'grupo' ? '[data-grupo=""]' : '[data-cidade=""]'
  );
  set.has(valor) ? set.delete(valor) : set.add(valor);
  document.querySelectorAll(
    tipo === 'grupo' ? '[data-grupo]' : '[data-cidade]'
  ).forEach(b => {
    const v = tipo === 'grupo' ? b.dataset.grupo : b.dataset.cidade;
    if (v === '') {
      b.classList.toggle('active', set.size === 0);
    } else {
      b.classList.toggle('active', set.has(v));
    }
  });
  _renderCalLista();
}

function _limparCalFiltro(tipo) {
  const set = tipo === 'grupo' ? _calGrupos : _calCidades;
  set.clear();
  document.querySelectorAll(
    tipo === 'grupo' ? '[data-grupo]' : '[data-cidade]'
  ).forEach(b => {
    const v = tipo === 'grupo' ? b.dataset.grupo : b.dataset.cidade;
    b.classList.toggle('active', v === '');
  });
  _renderCalLista();
}

function _jogosComFase() {
  const grupos = (DADOS.jogos_grupos || []).map(j => ({
    ...j, fase: 'grupos', faseLabel: `Grupo ${j.Grupo}`,
  }));
  const mata = (DADOS.jogos_mata || []).map(j => ({
    ...j, fase: 'mata', faseLabel: FASE_LABEL[j.Fase] || j.Fase || 'Mata-mata',
  }));
  const todos = [...grupos, ...mata];
  return todos.sort((a, b) => {
    const da = a.DataHora ? new Date(a.DataHora) : new Date(0);
    const db = b.DataHora ? new Date(b.DataHora) : new Date(0);
    return da - db;
  });
}

function _nomeSel(clubOrSelecao) {
  const s = DADOS.selecoes.find(x =>
    x.Club === clubOrSelecao || x.Selecao === clubOrSelecao
  );
  return s?.Selecao || clubOrSelecao;
}

function _getSel(clubOrSelecao) {
  return DADOS.selecoes.find(x =>
    x.Club === clubOrSelecao || x.Selecao === clubOrSelecao
  ) || null;
}

function _renderCalLista() {
  const q = _calBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  const todos = _jogosComFase().filter(j => {
    if (_calGrupos.size > 0 && j.fase === 'grupos' && !_calGrupos.has(j.Grupo)) return false;
    if (_calGrupos.size > 0 && j.fase === 'mata') return false; // mata-mata não tem grupo
    if (_calCidades.size > 0 && !_calCidades.has(j.Local)) return false;
    if (q) {
      const t1 = _nomeSel(j.Time1).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const t2 = _nomeSel(j.Time2).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if (!t1.includes(q) && !t2.includes(q)) return false;
    }
    return true;
  });

  // Resumo
  const resumo = document.getElementById('calResumo');
  resumo.innerHTML = `
    <span class="cal-resumo-item">
      <strong>${todos.length}</strong> jogo${todos.length !== 1 ? 's' : ''}
    </span>
    ${_calGrupos.size > 0 ? `<span class="cal-resumo-tag">Grupos: ${[..._calGrupos].join(', ')}</span>` : ''}
    ${_calCidades.size > 0 ? `<span class="cal-resumo-tag">${[..._calCidades].join(', ')}</span>` : ''}
    ${_calBusca ? `<span class="cal-resumo-tag">🔍 "${_calBusca}"</span>` : ''}`;

  if (!todos.length) {
    document.getElementById('calLista').innerHTML =
      `<div style="color:var(--muted);padding:40px;text-align:center">
        Nenhum jogo encontrado com os filtros selecionados.
      </div>`;
    return;
  }

  // Agrupa por data
  const porDia = {};
  todos.forEach(j => {
    const data = j.DataHora ? j.DataHora.split('T')[0] : 'Data indefinida';
    if (!porDia[data]) porDia[data] = [];
    porDia[data].push(j);
  });

  const lista = document.getElementById('calLista');
  lista.innerHTML = Object.keys(porDia).sort().map(data => {
    const jogos = porDia[data];
    const dataFmt = data !== 'Data indefinida'
      ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        })
      : 'Data indefinida';

    const rows = jogos.map(j => {
      const hora = j.DataHora && j.DataHora.includes('T')
        ? j.DataHora.split('T')[1].slice(0,5) : '--:--';
      const s1    = _getSel(j.Time1);
      const s2    = _getSel(j.Time2);
      const nome1 = s1?.Selecao || j.Time1;
      const nome2 = s2?.Selecao || j.Time2;
      const img1  = s1?.asset_bandeira || flagUrl(s1?.iso2);
      const img2  = s2?.asset_bandeira || flagUrl(s2?.iso2);
      const flagHtml1 = img1
        ? `<img class="cal-flag" src="${img1}" alt="${nome1}" onerror="this.style.display='none'">`
        : `<span class="cal-emoji">${s1 ? flagEmoji(s1.iso2) : '🏳'}</span>`;
      const flagHtml2 = img2
        ? `<img class="cal-flag" src="${img2}" alt="${nome2}" onerror="this.style.display='none'">`
        : `<span class="cal-emoji">${s2 ? flagEmoji(s2.iso2) : '🏳'}</span>`;

      const isMata = j.fase === 'mata';

      return `
        <div class="cal-jogo ${isMata ? 'cal-jogo-mata' : ''}">
          <div class="cal-jogo-hora">${hora}</div>
          <div class="cal-jogo-times">
            <div class="cal-time">
              ${flagHtml1}
              <span class="cal-time-nome">${nome1}</span>
            </div>
            <div class="cal-jogo-vs">VS</div>
            <div class="cal-time cal-time-right">
              <span class="cal-time-nome">${nome2}</span>
              ${flagHtml2}
            </div>
          </div>
          <div class="cal-jogo-meta">
            <span class="cal-fase-badge ${isMata ? 'mata' : ''}">${j.faseLabel}</span>
            <span class="cal-local">📍 ${j.Local || '—'}</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="cal-dia fade-in">
        <div class="cal-dia-header">
          <span class="cal-dia-data">${dataFmt}</span>
          <span class="cal-dia-count">${jogos.length} jogo${jogos.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="cal-dia-jogos">${rows}</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA SIMULAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

let _simIniciado  = false;
let _simGrupos    = new Set();   // filtro ativo (vazio = todos)

function renderSimulacao() {
  const sim = DADOS.simulacao;

  if (!sim || !sim.length) {
    document.getElementById('simLista').innerHTML = `
      <div style="color:var(--muted);padding:40px;text-align:center;font-family:var(--font-head);
                  font-size:14px;letter-spacing:1px;text-transform:uppercase">
        Dados de simulação não encontrados.<br>
        <span style="font-size:11px;margin-top:8px;display:block">
          Execute <code>python src/simulation.py</code> e rode <code>python gerar_html.py</code>
        </span>
      </div>`;
    return;
  }

  // Info da simulação
  const nSim = sim[0]?.n_sim || 0;
  document.getElementById('simInfo').innerHTML = `
    <span style="font-family:var(--font-head);font-size:13px;color:var(--muted);letter-spacing:1px;text-transform:uppercase">
      🎲 Monte Carlo —
    </span>
    <span style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--accent)">
      ${nSim.toLocaleString('pt-BR')} simulações
    </span>
    <span style="font-family:var(--font-head);font-size:12px;color:var(--muted);margin-left:8px">
      · ${sim.length} grupo(s) simulado(s)
    </span>`;

  // Filtros de grupo (só na primeira vez)
  if (!_simIniciado) {
    _simIniciado = true;
    const wrap = document.getElementById('simFiltroGrupo');
    const todos = document.createElement('button');
    todos.className = 'cal-btn active';
    todos.textContent = 'Todos';
    todos.addEventListener('click', () => {
      _simGrupos.clear();
      wrap.querySelectorAll('.cal-btn').forEach(b =>
        b.classList.toggle('active', b.textContent === 'Todos')
      );
      _renderSimLista(sim);
    });
    wrap.appendChild(todos);

    sim.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'cal-btn';
      btn.textContent = `Grupo ${r.grupo}`;
      btn.dataset.grupo = r.grupo;
      btn.addEventListener('click', () => {
        const g = r.grupo;
        _simGrupos.has(g) ? _simGrupos.delete(g) : _simGrupos.add(g);
        wrap.querySelectorAll('.cal-btn').forEach(b => {
          if (b.textContent === 'Todos') {
            b.classList.toggle('active', _simGrupos.size === 0);
          } else {
            b.classList.toggle('active', _simGrupos.has(b.dataset.grupo));
          }
        });
        _renderSimLista(sim);
      });
      wrap.appendChild(btn);
    });
  }

  _renderSimLista(sim);
}

function _renderSimLista(sim) {
  const filtrado = _simGrupos.size > 0
    ? sim.filter(r => _simGrupos.has(r.grupo))
    : sim;

  document.getElementById('simLista').innerHTML =
    filtrado.map(r => _htmlGrupoSim(r)).join('');
}

// ── Card de um grupo ──────────────────────────────────────────────────────────

function _htmlGrupoSim(r) {
  return `
    <div class="sim-grupo fade-in">
      <div class="sim-grupo-title">
        <span>Grupo ${r.grupo}</span>
        <span class="sim-grupo-nsim">${r.n_sim.toLocaleString('pt-BR')} simulações</span>
      </div>
      <div class="sim-grupo-body">
        ${_htmlTabelaClassif(r)}
        ${_htmlTabelaJogos(r)}
      </div>
      ${_svgHeatmap(r)}
    </div>`;
}

// ── Tabela de classificação ───────────────────────────────────────────────────

function _htmlTabelaClassif(r) {
  const times = Object.entries(r.stats_times)
    .sort((a, b) => {
      const medA = a[1].Pts_Medio, medB = b[1].Pts_Medio;
      if (Math.abs(medB - medA) > 0.05) return medB - medA;  // ordena por média
      return b[1].P1 - a[1].P1;                               // tiebreaker: % 1º lugar
    });

  const rows = times.map(([time, s], i) => {
    const s2  = _getSel(time);
    const src = s2?.asset_bandeira || flagUrl(s2?.iso2);
    const flag = src
      ? `<img class="sim-flag" src="${src}" alt="${time}" onerror="this.style.display='none'">`
      : `<span style="font-size:14px">${flagEmoji(s2?.iso2)}</span>`;

    const classColor = s.Classifica >= 60 ? 'var(--green)'
                     : s.Classifica >= 40 ? 'var(--accent)'
                     : 'var(--red)';

    return `
      <tr>
        <td class="sim-td-pos">${i + 1}</td>
        <td class="sim-td-time">
          ${flag}
          <span>${s2?.Selecao || time}</span>
        </td>
        <td class="sim-td-num">${s.P1.toFixed(1)}%</td>
        <td class="sim-td-num">${s.P2.toFixed(1)}%</td>
        <td class="sim-td-num">${s.P3.toFixed(1)}%</td>
        <td class="sim-td-num">${s.P4.toFixed(1)}%</td>
        <td class="sim-td-pts" title="Média">${s.Pts_Medio.toFixed(1)}</td>
        <td class="sim-td-num" title="Mediana" style="color:var(--accent2)">${s.Pts_Mediana != null ? s.Pts_Mediana.toFixed(1) : '—'}</td>
        <td class="sim-td-num" title="Desvio Padrão" style="color:var(--muted)">${s.Pts_DP != null ? '±'+s.Pts_DP.toFixed(2) : '—'}</td>
        <td class="sim-td-classif">
          <div class="sim-classif-wrap">
            <span style="color:${classColor};font-weight:800;min-width:42px">
              ${s.Classifica.toFixed(1)}%
            </span>
            <div class="sim-bar-bg">
              <div class="sim-bar-fill" style="width:${s.Classifica}%;background:${classColor}"></div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="sim-section">
      <div class="sim-section-title">Classificação Provável</div>
      <table class="sim-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Seleção</th>
            <th>1º%</th><th>2º%</th><th>3º%</th><th>4º%</th>
            <th title="Média">Med</th>
            <th title="Mediana">Mdn</th>
            <th title="Desvio Padrão">DP</th>
            <th>Classif%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Tabela de resultados dos jogos ────────────────────────────────────────────

function _htmlTabelaJogos(r) {
  const rows = Object.entries(r.stats_jogos).map(([jogo, s]) => {
    const [t1, t2] = jogo.split(' x ');
    const s1 = _getSel(t1);
    const s2 = _getSel(t2);
    const n1 = s1?.Selecao || t1;
    const n2 = s2?.Selecao || t2;

    const v1 = s.V_pct;
    const e  = s.E_pct;
    const v2 = s.D_pct;

    // Cor do nome: verde para favorito, vermelho para azarão
    const c1 = v1 > v2 ? 'var(--green)' : 'var(--red)';
    const c2 = v2 > v1 ? 'var(--green)' : 'var(--red)';

    return `
      <tr>
        <td class="sim-jogo-t1" style="color:${c1}">${n1}</td>
        <td class="sim-jogo-bar-cell">
          <div class="sim-jogo-bar-wrap">
            <div class="sim-jogo-bar-seg t1"  style="width:${v1}%" title="${n1}: ${v1.toFixed(1)}%">
              <span class="sim-bar-label">${v1.toFixed(0)}%</span>
            </div>
            <div class="sim-jogo-bar-seg emp" style="width:${e}%"  title="Empate: ${e.toFixed(1)}%">
              <span class="sim-bar-label">${e.toFixed(0)}%</span>
            </div>
            <div class="sim-jogo-bar-seg t2"  style="width:${v2}%" title="${n2}: ${v2.toFixed(1)}%">
              <span class="sim-bar-label">${v2.toFixed(0)}%</span>
            </div>
          </div>
        </td>
        <td class="sim-jogo-t2" style="color:${c2}">${n2}</td>
      </tr>`;
  }).join('');

  return `
    <div class="sim-section">
      <div class="sim-section-title">Resultados dos Jogos</div>
      <table class="sim-table sim-table-jogos">
        <thead>
          <tr>
            <th class="sim-jogo-t1">Time 1</th>
            <th></th>
            <th class="sim-jogo-t2">Time 2</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Heatmap SVG ───────────────────────────────────────────────────────────────

function _svgHeatmap(r) {
  const times = Object.keys(r.stats_times)
    .sort((a, b) => {
      const medA = r.stats_times[a].Pts_Medio, medB = r.stats_times[b].Pts_Medio;
      if (Math.abs(medB - medA) > 0.05) return medB - medA;
      return r.stats_times[b].P1 - r.stats_times[a].P1;
    });

  const posCols   = ['P1', 'P2', 'P3', 'P4'];
  const posLabels = ['1º Lugar', '2º Lugar', '3º Lugar', '4º Lugar'];

  // Dimensões responsivas — usa viewBox para escalar ao container
  const cellH  = 36;
  const labelH = 28;
  const labelW = 160;
  const cellW  = 130;
  const pad    = 10;
  const W = labelW + posCols.length * cellW + pad * 2;
  const H = labelH + times.length * cellH + pad * 2;

  function pctToColor(pct) {
    const t = Math.min(pct / 100, 1);
    const r = Math.round(22  + (200 - 22)  * t);
    const g = Math.round(27  + (168 - 27)  * t);
    const b = Math.round(44  + (75  - 44)  * t);
    return `rgb(${r},${g},${b})`;
  }

  function textColor(pct) { return pct > 35 ? '#0a0c10' : '#e8eaf0'; }

  let cells = '';

  // Headers de posição
  posLabels.forEach((lbl, ci) => {
    const x = pad + labelW + ci * cellW + cellW / 2;
    const y = pad + labelH / 2;
    cells += `
      <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
            font-family="'Barlow Condensed',sans-serif" font-size="12"
            font-weight="700" letter-spacing="1.5" fill="#9ca3af">
        ${lbl.toUpperCase()}
      </text>`;
  });

  // Separador abaixo do header
  cells += `<line x1="${pad}" y1="${pad + labelH}" x2="${W - pad}" y2="${pad + labelH}"
    stroke="#1e2330" stroke-width="1"/>`;

  // Linhas
  times.forEach((time, ri) => {
    const s2   = _getSel(time);
    const nome = s2?.Selecao || time;
    const y    = pad + labelH + ri * cellH;
    const pts  = r.stats_times[time].Pts_Medio;

    // Fundo alternado
    cells += `<rect x="${pad}" y="${y}" width="${W - pad * 2}" height="${cellH}"
      fill="${ri % 2 === 0 ? '#161920' : '#0f1115'}"/>`;

    // Flag (emoji via foreignObject não funciona bem em SVG — usa inicial)
    const src2 = s2?.asset_bandeira || (s2?.iso2 ? `https://flagcdn.com/w40/${s2.iso2.toLowerCase()}.png` : null);
    if (src2) {
      cells += `<image href="${src2}" x="${pad + 6}" y="${y + cellH/2 - 12}"
        width="24" height="24" style="border-radius:50%;clip-path:circle(12px at 12px 12px)"/>`;
    }

    // Nome do time
    cells += `
      <text x="${pad + 38}" y="${y + cellH / 2}" dominant-baseline="middle"
            font-family="'Barlow Condensed',sans-serif" font-size="13"
            font-weight="700" fill="#e8eaf0">
        ${nome.length > 18 ? nome.slice(0, 17) + '…' : nome}
      </text>`;

    // Pts médio (label pequeno)
    cells += `
      <text x="${pad + labelW - 8}" y="${y + cellH / 2}" dominant-baseline="middle"
            text-anchor="end"
            font-family="'Barlow Condensed',sans-serif" font-size="11"
            font-weight="600" fill="#6b7280">
        ${pts.toFixed(1)} pts
      </text>`;

    // Células de %
    posCols.forEach((col, ci) => {
      const pct = r.stats_times[time][col];
      const cx  = pad + labelW + ci * cellW;
      const bg  = pctToColor(pct);
      const tc  = textColor(pct);
      const margin = 3;

      cells += `
        <rect x="${cx + margin}" y="${y + margin}" 
              width="${cellW - margin * 2}" height="${cellH - margin * 2}"
              fill="${bg}" rx="4"/>
        <text x="${cx + cellW / 2}" y="${y + cellH / 2 - 4}" text-anchor="middle"
              dominant-baseline="middle"
              font-family="'Barlow Condensed',sans-serif" font-size="15"
              font-weight="800" fill="${tc}">
          ${pct.toFixed(1)}%
        </text>
        <text x="${cx + cellW / 2}" y="${y + cellH / 2 + 10}" text-anchor="middle"
              dominant-baseline="middle"
              font-family="'Barlow Condensed',sans-serif" font-size="9"
              font-weight="600" fill="${tc}" opacity="0.7">
          ${pct > 33 ? '▲ FAIXA ALTA' : pct > 18 ? '● MÉDIO' : '▼ FAIXA BAIXA'}
        </text>`;
    });

    // Separador entre linhas
    if (ri < times.length - 1) {
      cells += `<line x1="${pad}" y1="${y + cellH}" x2="${W - pad}" y2="${y + cellH}"
        stroke="#1e2330" stroke-width="1" opacity="0.5"/>`;
    }
  });

  return `
    <div class="sim-heatmap-section">
      <div class="sim-section-title">Heatmap de Probabilidades</div>
      <div class="sim-heatmap-svg-wrap">
        <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
             preserveAspectRatio="xMidYMid meet"
             style="width:100%;height:auto;display:block;border-radius:6px;background:#0a0c10">
          ${cells}
        </svg>
      </div>
    </div>`;
}