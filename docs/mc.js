/* ══════════════════════════════════════════════════
   mc.js — "Meu Cenário": simulação manual do mata-mata
   Depende de: dados.js, app.js (alocarTerceiros, _getSel, flagUrl, flagEmoji)
   ══════════════════════════════════════════════════ */

'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────

const MC_N_SIM     = 20_000;
const MC_FORCA_EXP = 3.0;

// Pares do chaveamento: ordem importa (O antes de Q antes de S antes de F)
const MC_BRACKET_PAIRS = {
  'O1': ['SF1',  'SF2'],  'O2': ['SF3',  'SF4'],
  'O3': ['SF5',  'SF6'],  'O4': ['SF7',  'SF8'],
  'O5': ['SF9',  'SF10'], 'O6': ['SF11', 'SF12'],
  'O7': ['SF13', 'SF14'], 'O8': ['SF15', 'SF16'],
  'Q1': ['O1', 'O2'],     'Q2': ['O3', 'O4'],
  'Q3': ['O5', 'O6'],     'Q4': ['O7', 'O8'],
  'S1': ['Q1', 'Q2'],     'S2': ['Q3', 'Q4'],
  'F':  ['S1', 'S2'],
};

const MC_ROUNDS = {
  SF: ['SF1','SF2','SF3','SF4','SF5','SF6','SF7','SF8',
       'SF9','SF10','SF11','SF12','SF13','SF14','SF15','SF16'],
  O:  ['O1','O2','O3','O4','O5','O6','O7','O8'],
  Q:  ['Q1','Q2','Q3','Q4'],
  S:  ['S1','S2'],
  F:  ['F'],
};

const MC_ROUND_ORDER = ['SF', 'O', 'Q', 'S', 'F'];

const MC_ROUND_NAME = {
  SF: 'Segunda Fase',   O: 'Oitavas de Final',
  Q:  'Quartas de Final', S: 'Semifinal', F: 'Final',
};

// ── Estado ────────────────────────────────────────────────────────────────────

let _mc = {
  step:          1,
  grupos:        {},    // { 'A': ['Brazil', 'Argentina', ...], ... }
  terceiros:     [],    // grupos selecionados (max 8)
  sfGames:       null,  // { 'SF1': { t1, t2, local, data }, ... }
  picks:         {},    // { 'SF1': 'Brazil', 'O1': 'France', ... }
  activeMCRound: 'SF',
  simProbs:      null,
};

let _mcForcas = null;

// ── Modelo de força (porta fiel do Python) ────────────────────────────────────

function _mcGetForcas() {
  if (_mcForcas) return _mcForcas;
  _mcForcas = {};

  const maxRank = 210;
  const annual  = DADOS.annual_balance || [];
  const anoMax  = annual.length ? Math.max(...annual.map(r => r.Year)) : 0;

  DADOS.selecoes.forEach(s => {
    const rankNorm = 1 - ((s.Ranking_FIFA ?? maxRank) - 1) / (maxRank - 1);

    const hist = annual.filter(r => r.Team === s.Club);
    let ppj = 1.5;
    if (hist.length && anoMax) {
      let totPts = 0, totJ = 0;
      for (const r of hist) {
        const peso = Math.exp(-0.5 * (anoMax - r.Year));
        totPts += ((r.Wins || 0) * 3 + (r.Draws || 0)) * peso;
        totJ   += (r.Matches || 0) * peso;
      }
      ppj = totJ > 0 ? totPts / totJ : 1.5;
    }

    const forca = Math.min(Math.max(
      0.60 * rankNorm + 0.40 * Math.min(Math.max(ppj / 3, 0), 1),
      0.05
    ), 1.0);

    _mcForcas[s.Club]    = forca;
    _mcForcas[s.Selecao] = forca;
  });

  return _mcForcas;
}

// Probabilidade knockout — empate → prorrogação/pênaltis → 50/50
function _mcProbKO(clubA, clubB) {
  const f  = _mcGetForcas();
  const fa = Math.pow(f[clubA] ?? 0.5, MC_FORCA_EXP);
  const fb = Math.pow(f[clubB] ?? 0.5, MC_FORCA_EXP);
  const ratio = fa / (fa + fb);
  const diff  = Math.abs(ratio - 0.5) * 2;
  const pE    = Math.max(0.27 * Math.exp(-2.5 * diff), 0.04);
  const pV    = (1 - pE) * ratio;
  const pD    = (1 - pE) * (1 - ratio);
  return { pA: pV + pE / 2, pB: pD + pE / 2 };
}

// ── Inicialização ─────────────────────────────────────────────────────────────

function _mcInit() {
  _mcForcas = null;

  const grupos = {};
  DADOS.selecoes.forEach(s => {
    if (!grupos[s.Grupo]) grupos[s.Grupo] = [];
    grupos[s.Grupo].push(s.Club);
  });

  Object.keys(grupos).forEach(g => {
    grupos[g].sort((a, b) => {
      const ra = DADOS.selecoes.find(x => x.Club === a)?.Ranking_FIFA ?? 999;
      const rb = DADOS.selecoes.find(x => x.Club === b)?.Ranking_FIFA ?? 999;
      return ra - rb;
    });
  });

  _mc = {
    step: 1, grupos, terceiros: [], sfGames: null,
    picks: {}, activeMCRound: 'SF', simProbs: null,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

function renderCenario() {
  if (!Object.keys(_mc.grupos).length) _mcInit();
  _mcRender();
}

function _mcRender() {
  _mcRenderStepBar();
  if      (_mc.step === 1) _mcRenderStep1();
  else if (_mc.step === 2) _mcRenderStep2();
  else if (_mc.step === 3) _mcRenderStep3();
}

// ── Barra de progresso ────────────────────────────────────────────────────────

function _mcRenderStepBar() {
  const labels = [
    'Classificação dos Grupos', 'Selecionar 8 Terceiros',
    'Chaveamento',
  ];
  document.getElementById('mcStepBar').innerHTML = labels.map((l, i) => {
    const n    = i + 1;
    const cls  = n < _mc.step ? 'mc-step done' : n === _mc.step ? 'mc-step active' : 'mc-step';
    const icon = n < _mc.step ? '✓' : n;
    return `
      <div class="${cls}">
        <div class="mc-step-num">${icon}</div>
        <div class="mc-step-label">${l}</div>
      </div>
      ${i < labels.length - 1 ? '<div class="mc-step-sep"></div>' : ''}`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// PASSO 1 — Classificação dos grupos
// ══════════════════════════════════════════════════════════════════════════════

function _mcRenderStep1() {
  const grupos = Object.keys(_mc.grupos).sort();

  const cards = grupos.map(g => {
    const times = _mc.grupos[g];
    const rows  = times.map((club, i) => {
      const s    = _getSel(club);
      const nome = s?.Selecao || club;
      const src  = s?.asset_bandeira || flagUrl(s?.iso2);
      const flag = src
        ? `<img class="mc-g-flag" src="${src}" alt="${nome}" onerror="this.style.display='none'">`
        : `<span style="font-size:16px">${flagEmoji(s?.iso2)}</span>`;
      const repTag = s?.is_repescagem ? `<span class="mc-rep-badge">⚠</span>` : '';

      return `
        <div class="mc-g-row">
          <span class="mc-g-pos">${i + 1}º</span>
          ${flag}
          <span class="mc-g-nome">${nome}</span>
          ${repTag}
          <div class="mc-g-btns">
            <button class="mc-g-btn" onclick="_mcMove('${g}',${i},-1)"
                    ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="mc-g-btn" onclick="_mcMove('${g}',${i},1)"
                    ${i === times.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="mc-group-card">
        <div class="mc-group-title">Grupo ${g}</div>
        ${rows}
      </div>`;
  }).join('');

  document.getElementById('mcBody').innerHTML = `
    <div class="mc-intro">
      <span>Use ↑↓ para reordenar. Grupos ⚠ têm vaga de repescagem.</span>
      <button class="mc-btn-link" onclick="_mcReset()">↺ Resetar para ranking FIFA</button>
    </div>
    <div class="mc-groups-grid">${cards}</div>
    <div class="mc-footer">
      <div></div>
      <button class="mc-btn-primary" onclick="_mcGoStep2()">
        Próximo: Selecionar Terceiros →
      </button>
    </div>`;
}

function _mcMove(grupo, idx, dir) {
  const arr = _mc.grupos[grupo];
  const ni  = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
  _mcRenderStep1();
}

function _mcReset() {
  const backup = {};
  DADOS.selecoes.forEach(s => {
    if (!backup[s.Grupo]) backup[s.Grupo] = [];
    backup[s.Grupo].push(s.Club);
  });
  Object.keys(backup).forEach(g => {
    backup[g].sort((a, b) => {
      const ra = DADOS.selecoes.find(x => x.Club === a)?.Ranking_FIFA ?? 999;
      const rb = DADOS.selecoes.find(x => x.Club === b)?.Ranking_FIFA ?? 999;
      return ra - rb;
    });
  });
  _mc.grupos = backup;
  _mcRenderStep1();
}

function _mcGoStep2() {
  _mc.step      = 2;
  _mc.terceiros = [];
  _mc.sfGames   = null;
  _mc.picks     = {};
  _mc.simProbs  = null;
  _mcRender();
}

// ══════════════════════════════════════════════════════════════════════════════
// PASSO 2 — Selecionar 8 melhores terceiros
// ══════════════════════════════════════════════════════════════════════════════

function _mcRenderStep2() {
  const grupos = Object.keys(_mc.grupos).sort();
  const n      = _mc.terceiros.length;
  const full   = n === 8;

  const cards = grupos.map(g => {
    const club = _mc.grupos[g][2];
    const s    = _getSel(club);
    const nome = s?.Selecao || club;
    const src  = s?.asset_bandeira || flagUrl(s?.iso2);
    const sel  = _mc.terceiros.includes(g);
    const disabled = !sel && full;

    const flag = src
      ? `<img class="mc-t-flag" src="${src}" alt="${nome}" onerror="this.style.display='none'">`
      : `<span style="font-size:24px">${flagEmoji(s?.iso2)}</span>`;

    return `
      <div class="mc-t-card ${sel ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
           onclick="${disabled ? '' : `_mcToggleT('${g}')`}">
        <div class="mc-t-check-wrap">${sel ? '<div class="mc-t-check">✓</div>' : ''}</div>
        <div class="mc-t-grupo">Grupo ${g}</div>
        <div class="mc-t-flag-wrap">${flag}</div>
        <div class="mc-t-nome">${nome}</div>
        <div class="mc-t-rank">${s?.Ranking_FIFA ? `#${s.Ranking_FIFA} FIFA` : '—'}</div>
      </div>`;
  }).join('');

  document.getElementById('mcBody').innerHTML = `
    <div class="mc-t-header">
      <span>Selecione exatamente <strong>8</strong> dos 12 terceiros colocados que avançam.</span>
      <span class="mc-t-counter ${full ? 'ok' : n > 0 ? 'partial' : ''}">${n} / 8 selecionados</span>
    </div>
    <div class="mc-terceiros-grid">${cards}</div>
    <div class="mc-footer">
      <button class="mc-btn-secondary"
              onclick="_mc.step=1;_mc.terceiros=[];_mcRender()">← Voltar</button>
      <button class="mc-btn-primary" onclick="_mcGoStep3()" ${!full ? 'disabled' : ''}>
        Ver Chaveamento →
      </button>
    </div>`;
}

function _mcToggleT(grupo) {
  const idx = _mc.terceiros.indexOf(grupo);
  if (idx >= 0) {
    _mc.terceiros.splice(idx, 1);
  } else {
    if (_mc.terceiros.length >= 8) return;
    _mc.terceiros.push(grupo);
  }
  _mcRenderStep2();
}

function _mcGoStep3() {
  if (_mc.terceiros.length !== 8) return;
  _mc.step          = 3;
  _mc.sfGames       = _mcBuildSFGames();
  _mc.picks         = {};
  _mc.activeMCRound = 'SF';
  _mc.simProbs      = null;
  _mcRender();
}

// ── Resolver confrontos da Segunda Fase ───────────────────────────────────────

function _mcBuildSFGames() {
  const lookup = {};
  Object.entries(_mc.grupos).forEach(([g, ordem]) => {
    lookup[g] = {};
    ordem.forEach((club, i) => { lookup[g][i + 1] = club; });
  });

  const forcas = _mcGetForcas();
  const terceirosArr = _mc.terceiros.map(g => {
    const club = lookup[g]?.[3] ?? null;
    return {
      grupo:  g,
      time:   club,
      ptsMed: forcas[club ?? ''] ?? 0.1,
      stats:  { Pts_Medio: forcas[club ?? ''] ?? 0.1 },
      pct3:   33,
    };
  }).sort((a, b) => b.ptsMed - a.ptsMed);

  const alocacao = alocarTerceiros(terceirosArr);

  function resolveCode(codigo, fase) {
    if (!codigo) return null;
    const pos   = parseInt(codigo[0]);
    const resto = codigo.slice(1);
    if (pos === 3) return alocacao[fase]?.time ?? null;
    return lookup[resto]?.[pos] ?? null;
  }

  const result = {};
  for (const j of (DADOS.jogos_mata || []).filter(j => j.Fase?.startsWith('SF'))) {
    result[j.Fase] = {
      t1: resolveCode(j.Time1, j.Fase), t2: resolveCode(j.Time2, j.Fase),
      t1cod: j.Time1, t2cod: j.Time2,
      local: j.Local,  data: j.DataHora,
    };
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// PASSO 3 — Chaveamento + Mata-Mata
// ══════════════════════════════════════════════════════════════════════════════

function _mcRenderStep3() {
  const sfKeys = Object.keys(_mc.sfGames)
    .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));

  const nPendentes = sfKeys.filter(id => !_mc.sfGames[id].t1 || !_mc.sfGames[id].t2).length;

  const _flag = (club, cod) => {
    const s   = club ? _getSel(club) : null;
    const src = s?.asset_bandeira || flagUrl(s?.iso2);
    if (!club) return `<span class="mc-sf-pending">${cod || '?'}</span>`;
    return src
      ? `<img class="mc-sf-flag" src="${src}" alt="${s?.Selecao || club}"
             onerror="this.style.display='none'">`
      : `<span style="font-size:18px">${flagEmoji(s?.iso2)}</span>`;
  };

  const cards = sfKeys.map(id => {
    const g  = _mc.sfGames[id];
    const s1 = g.t1 ? _getSel(g.t1) : null;
    const s2 = g.t2 ? _getSel(g.t2) : null;
    const n1 = s1?.Selecao || g.t1 || `(${g.t1cod || '?'})`;
    const n2 = s2?.Selecao || g.t2 || `(${g.t2cod || '?'})`;

    return `
      <div class="mc-sf-card ${!g.t1 || !g.t2 ? 'pendente' : ''}">
        <div class="mc-sf-id">${id}</div>
        <div class="mc-sf-confronto">
          <div class="mc-sf-time">${_flag(g.t1, g.t1cod)}<span class="mc-sf-nome">${n1}</span></div>
          <div class="mc-sf-vs">VS</div>
          <div class="mc-sf-time right"><span class="mc-sf-nome">${n2}</span>${_flag(g.t2, g.t2cod)}</div>
        </div>
        ${g.local ? `<div class="mc-sf-local">📍 ${g.local}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('mcBody').innerHTML = `
    <div class="mc-t-header">
      <span>Chaveamento da Segunda Fase — ${sfKeys.length} jogos definidos pelo seu cenário</span>
      ${nPendentes ? `<span class="mc-aviso">⚠ ${nPendentes} jogo(s) com time indefinido</span>` : ''}
    </div>
    <div class="mc-sf-grid">${cards}</div>
    <div class="mc-footer" style="margin-bottom:24px">
      <button class="mc-btn-secondary"
              onclick="_mc.step=2;_mc.sfGames=null;_mc.picks={};_mc.simProbs=null;_mcRender()">
        ← Voltar
      </button>
    </div>
    <div class="mc-bracket-wrap">
      <div class="mc-round-tabs" id="mcRoundTabs"></div>
      <div id="mcBracketContent"></div>
      <div id="mcBracketFooter"></div>
    </div>`;

  _mcRenderRoundTabs();
  _mcRenderCurrentRound();
}

// ── Tabs de rodada ────────────────────────────────────────────────────────────

function _mcRenderRoundTabs() {
  const tabs = MC_ROUND_ORDER.map((r, i) => {
    const prevRound   = i > 0 ? MC_ROUND_ORDER[i - 1] : null;
    const prevDone    = prevRound ? _mcRoundComplete(prevRound) : true;
    const thisActive  = r === _mc.activeMCRound;
    const thisDone    = _mcRoundComplete(r);
    const accessible  = prevDone || thisDone;

    return `
      <button class="mc-round-tab ${thisActive ? 'active' : ''} ${thisDone ? 'done' : ''}"
              ${accessible ? `onclick="_mcSwitchRound('${r}')"` : 'disabled'}>
        ${thisDone ? '✓ ' : ''}${MC_ROUND_NAME[r]}
      </button>`;
  }).join('');

  document.getElementById('mcRoundTabs').innerHTML = tabs;
}

function _mcRoundComplete(round) {
  if (!round) return true;
  const ids = MC_ROUNDS[round];
  return ids ? ids.every(id => _mc.picks[id]) : false;
}

function _mcSwitchRound(round) {
  _mc.activeMCRound = round;
  _mcRenderRoundTabs();
  _mcRenderCurrentRound();
}

// ── Matchup resolver ──────────────────────────────────────────────────────────

function _mcGetMatchup(id) {
  if (id.startsWith('SF')) {
    const g = _mc.sfGames?.[id];
    return { t1: g?.t1 ?? null, t2: g?.t2 ?? null };
  }
  const [id1, id2] = MC_BRACKET_PAIRS[id] ?? [];
  return {
    t1: id1 ? (_mc.picks[id1] ?? null) : null,
    t2: id2 ? (_mc.picks[id2] ?? null) : null,
  };
}

// ── Render da rodada atual ────────────────────────────────────────────────────

function _mcRenderCurrentRound() {
  const round   = _mc.activeMCRound;
  const ids     = MC_ROUNDS[round];
  const nPicked = ids.filter(id => _mc.picks[id]).length;
  const done    = nPicked === ids.length;

  const cards = ids.map(id => _mcMatchCard(id)).join('');

  document.getElementById('mcBracketContent').innerHTML = `
    <div class="mc-round-header">
      <div>
        <span class="mc-round-title">${MC_ROUND_NAME[round]}</span>
        <span class="mc-round-progress">${nPicked} / ${ids.length} definido${ids.length !== 1 ? 's' : ''}</span>
      </div>
      <button class="mc-btn-link" onclick="_mcAutoFill('${round}')">
        ⚡ Preencher com favoritos
      </button>
    </div>
    <div class="mc-matches-grid">${cards}</div>`;

  _mcRenderBracketFooter(round, done);
}

// ── Card de confronto ─────────────────────────────────────────────────────────

function _mcMatchCard(id) {
  const { t1, t2 } = _mcGetMatchup(id);
  const picked     = _mc.picks[id];

  let pA = 0.5, pB = 0.5;
  if (t1 && t2) {
    const p = _mcProbKO(t1, t2);
    pA = p.pA;
    pB = p.pB;
  }

  const _teamRow = (club, prob) => {
    const s    = club ? _getSel(club) : null;
    const nome = s?.Selecao || club || '—';
    const src  = s?.asset_bandeira || flagUrl(s?.iso2);
    const flag = src
      ? `<img class="mc-m-flag" src="${src}" alt="${nome}" onerror="this.style.display='none'">`
      : `<span style="font-size:16px">${club ? flagEmoji(s?.iso2) : '🏳'}</span>`;

    const pct      = Math.round(prob * 100);
    const barW     = Math.max(3, pct);
    const barColor = prob >= 0.55 ? 'var(--green)' : prob >= 0.45 ? 'var(--accent)' : 'var(--muted)';
    const isFav    = !picked && t1 && t2 && prob > 0.5 + 0.04;
    const isWinner = picked === club;
    const isLoser  = picked && picked !== club;
    const clickable = club && !picked;

    return `
      <div class="mc-m-team ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''} ${!club ? 'pending' : ''}"
           ${clickable ? `onclick="_mcPickWinner('${id}','${club}')" title="Escolher ${nome}"` : ''}>
        <div class="mc-m-left">
          ${flag}
          <div class="mc-m-info">
            <span class="mc-m-nome">${nome}</span>
            ${isFav ? '<span class="mc-m-fav">★ favorito</span>' : ''}
          </div>
        </div>
        <div class="mc-m-right">
          ${club ? `
            <div class="mc-m-bar-track">
              <div class="mc-m-bar" style="width:${barW}%;background:${barColor}"></div>
            </div>
            <span class="mc-m-pct" style="color:${barColor}">${pct}%</span>
          ` : ''}
          ${isWinner ? '<span class="mc-m-win-badge">✓</span>' : ''}
          ${clickable ? '<span class="mc-m-hint">escolher</span>' : ''}
        </div>
      </div>`;
  };

  return `
    <div class="mc-match-card ${picked ? 'picked' : ''} ${!t1 || !t2 ? 'mc-match-pending' : ''}">
      <div class="mc-match-id">${id}</div>
      ${_teamRow(t1, pA)}
      <div class="mc-match-sep"></div>
      ${_teamRow(t2, pB)}
    </div>`;
}

// ── Picks ─────────────────────────────────────────────────────────────────────

function _mcPickWinner(id, club) {
  _mc.picks[id] = club;
  _mcClearDownstream(id);
  _mcRenderRoundTabs();
  _mcRenderCurrentRound();

  // Final picked → mostrar campeão após breve delay
  if (_mc.activeMCRound === 'F' && _mcRoundComplete('F')) {
    setTimeout(_mcShowChampion, 500);
  }
}

function _mcClearDownstream(changedId) {
  // Limpa picks de todos os jogos que dependem transitivamente do resultado de changedId
  const queue = [changedId];
  const seen  = new Set();
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const [futureId, [id1, id2]] of Object.entries(MC_BRACKET_PAIRS)) {
      if ((id1 === id || id2 === id) && _mc.picks[futureId]) {
        delete _mc.picks[futureId];
        queue.push(futureId);
      }
    }
  }
}

function _mcAutoFill(round) {
  MC_ROUNDS[round].forEach(id => {
    if (_mc.picks[id]) return;
    const { t1, t2 } = _mcGetMatchup(id);
    if (!t1 && !t2) return;
    if (!t1 || !t2) { _mc.picks[id] = t1 || t2; return; }
    const { pA } = _mcProbKO(t1, t2);
    _mc.picks[id] = pA >= 0.5 ? t1 : t2;
  });
  _mcRenderRoundTabs();
  _mcRenderCurrentRound();
  if (_mc.activeMCRound === 'F' && _mcRoundComplete('F')) {
    setTimeout(_mcShowChampion, 500);
  }
}

// ── Footer da rodada ──────────────────────────────────────────────────────────

function _mcRenderBracketFooter(round, done) {
  const idx   = MC_ROUND_ORDER.indexOf(round);
  const nextR = MC_ROUND_ORDER[idx + 1];
  const prevR = MC_ROUND_ORDER[idx - 1];

  document.getElementById('mcBracketFooter').innerHTML = `
    <div class="mc-footer">
      <div style="display:flex;gap:8px">
        ${prevR ? `
          <button class="mc-btn-secondary" onclick="_mcSwitchRound('${prevR}')">
            ← ${MC_ROUND_NAME[prevR]}
          </button>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${done && nextR ? `
          <button class="mc-btn-primary" onclick="_mcSwitchRound('${nextR}')">
            ${MC_ROUND_NAME[nextR]} →
          </button>` : ''}
        ${done && !nextR ? `
          <button class="mc-btn-primary" onclick="_mcShowChampion()">
            🏆 Ver Campeão
          </button>` : ''}
        <button class="mc-btn-secondary" onclick="_mcFullReset()">↺ Novo Cenário</button>
      </div>
    </div>`;
}

// ── Tela do campeão ───────────────────────────────────────────────────────────

function _mcShowChampion() {
  const champion = _mc.picks['F'];
  if (!champion) return;

  const s    = _getSel(champion);
  const nome = s?.Selecao || champion;
  const src  = s?.asset_bandeira || flagUrl(s?.iso2);

  // Caminho à vitória
  const pathItems = MC_ROUND_ORDER.map(r => {
    const matchId = MC_ROUNDS[r].find(id => _mc.picks[id] === champion);
    if (!matchId) return null;
    const { t1, t2 } = _mcGetMatchup(matchId);
    const opponent  = t1 === champion ? t2 : t1;
    const opp       = opponent ? _getSel(opponent) : null;
    const oppNome   = opp?.Selecao || opponent || '—';
    let champProb   = 0.5;
    if (opponent) {
      const p = _mcProbKO(champion, opponent);
      champProb = t1 === champion ? p.pA : p.pB;
    }
    const zebra = champProb < 0.5;
    return `
      <div class="mc-path-item">
        <span class="mc-path-round">${MC_ROUND_NAME[r]}</span>
        <span class="mc-path-vs">vs ${oppNome}</span>
        <span class="mc-path-prob ${zebra ? 'zebra' : ''}">${(champProb * 100).toFixed(0)}%${zebra ? ' 🔥 zebra!' : ''}</span>
      </div>`;
  }).filter(Boolean).join('');

  document.getElementById('mcBracketContent').innerHTML = `
    <div class="mc-champion-wrap">
      <div class="mc-champion-trophy">🏆</div>
      <div class="mc-champion-label">Campeão do Meu Cenário</div>
      ${src
        ? `<img class="mc-champion-flag" src="${src}" alt="${nome}" onerror="this.style.display='none'">`
        : `<span style="font-size:80px">${flagEmoji(s?.iso2)}</span>`}
      <div class="mc-champion-nome">${nome}</div>

      <div class="mc-path-wrap">
        <div class="mc-path-title">Caminho ao Título</div>
        ${pathItems}
      </div>

      <div class="mc-sim-btn-wrap">
        <button class="mc-btn-primary" onclick="_mcShowSimTable()">
          🎲 Calcular probabilidades completas (Monte Carlo)
        </button>
      </div>
    </div>`;

  document.getElementById('mcBracketFooter').innerHTML = `
    <div class="mc-footer">
      <button class="mc-btn-secondary" onclick="_mcSwitchRound('F');_mcRenderCurrentRound()">
        ← Editar Picks
      </button>
      <button class="mc-btn-secondary" onclick="_mcFullReset()">↺ Novo Cenário</button>
    </div>`;

  _mcRenderRoundTabs();
}

// ── Tabela Monte Carlo (opcional) ─────────────────────────────────────────────

function _mcShowSimTable() {
  const btn = document.querySelector('.mc-sim-btn-wrap');
  if (btn) btn.innerHTML = `
    <div class="mc-sim-loading" style="padding:24px 0">
      <div class="mc-sim-spinner"></div>
      <div>Calculando ${MC_N_SIM.toLocaleString('pt-BR')} cenários...</div>
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    _mc.simProbs = _mcRunSimulation(_mc.sfGames, MC_N_SIM);
    if (btn) btn.outerHTML = _mcBuildSimTable();
  }));
}

function _mcBuildSimTable() {
  const probs    = _mc.simProbs;
  const teams    = Object.keys(probs).sort((a, b) => probs[b].champion - probs[a].champion);
  const cols     = ['O', 'Q', 'S', 'F', 'champion'];
  const colLbls  = ['Oitavas', 'Quartas', 'Semis', 'Final', '🏆'];

  const rows = teams.map(t => {
    const s    = _getSel(t);
    const nome = s?.Selecao || t;
    const src  = s?.asset_bandeira || flagUrl(s?.iso2);
    const flag = src
      ? `<img class="mc-res-flag" src="${src}" alt="${nome}" onerror="this.style.display='none'">`
      : `<span style="font-size:14px">${flagEmoji(s?.iso2)}</span>`;
    const champ = _mc.picks['F'] === t;

    const cells = cols.map((col, ci) => {
      const pct  = probs[t][col] ?? 0;
      const last = ci === cols.length - 1;
      const color = last
        ? (pct >= 20 ? 'var(--accent)' : pct >= 8 ? 'var(--label)' : 'var(--muted)')
        : (pct >= 60 ? 'var(--green)'  : pct >= 30 ? 'var(--text)'  : 'var(--muted)');
      return `<td class="mc-res-pct" style="color:${color};${last ? 'font-weight:800' : ''}">${pct.toFixed(1)}%</td>`;
    }).join('');

    return `<tr class="${champ ? 'mc-res-champ-row' : ''}">
      <td class="mc-res-time">${flag}<span>${nome}</span>${champ ? '<span class="mc-res-champ-badge">🏆 seu pick</span>' : ''}</td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <div class="mc-res-section" style="margin-top:24px">
      <div class="mc-res-title">
        Probabilidades — ${MC_N_SIM.toLocaleString('pt-BR')} simulações
        <span class="mc-res-subtitle">a partir do chaveamento do passo 3</span>
      </div>
      <div class="mc-res-table-wrap">
        <table class="mc-res-table">
          <thead>
            <tr>
              <th>Seleção</th>${colLbls.map(l => `<th>${l}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────

function _mcRunSimulation(sfGames, nSim) {
  const sfKeys = Object.keys(sfGames)
    .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));

  const counts = {};
  sfKeys.forEach(id => {
    [sfGames[id].t1, sfGames[id].t2].forEach(t => {
      if (t && !counts[t]) counts[t] = { O: 0, Q: 0, S: 0, F: 0, champion: 0 };
    });
  });

  for (let sim = 0; sim < nSim; sim++) {
    const w = {};

    for (const id of sfKeys) {
      const { t1, t2 } = sfGames[id];
      if (!t1 || !t2) { w[id] = t1 || t2 || null; continue; }
      const { pA } = _mcProbKO(t1, t2);
      w[id] = Math.random() < pA ? t1 : t2;
    }

    for (const [id, [id1, id2]] of Object.entries(MC_BRACKET_PAIRS)) {
      const t1 = w[id1] ?? null, t2 = w[id2] ?? null;
      if (!t1 || !t2) { w[id] = t1 || t2; continue; }
      const { pA } = _mcProbKO(t1, t2);
      w[id] = Math.random() < pA ? t1 : t2;
    }

    sfKeys.forEach(id => { const x = w[id]; if (x && counts[x]) counts[x].O++; });
    ['O1','O2','O3','O4','O5','O6','O7','O8'].forEach(id => {
      const x = w[id]; if (x && counts[x]) counts[x].Q++;
    });
    ['Q1','Q2','Q3','Q4'].forEach(id => {
      const x = w[id]; if (x && counts[x]) counts[x].S++;
    });
    ['S1','S2'].forEach(id => {
      const x = w[id]; if (x && counts[x]) counts[x].F++;
    });
    const champ = w['F'];
    if (champ && counts[champ]) counts[champ].champion++;
  }

  const probs = {};
  for (const [t, c] of Object.entries(counts)) {
    probs[t] = {
      O: c.O / nSim * 100, Q: c.Q / nSim * 100,
      S: c.S / nSim * 100, F: c.F / nSim * 100,
      champion: c.champion / nSim * 100,
    };
  }
  return probs;
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function _mcFullReset() {
  _mcInit();
  _mcRender();
}
