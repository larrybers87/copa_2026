'use strict';

// ── Persistência ──────────────────────────────────────────────────────────────

const _LS_KEY = 'copa2026_resultados_v1';
const _resEdit = new Set();
let _resFiltroG = '';

// Chaves que vieram do resultados_reais.js (arquivo) — não podem ser sobrescritas pelo localStorage
const _LOCKED_KEYS = new Set(Object.keys(RESULTADOS_REAIS));

function _resChave(jogo) {
  return `${jogo.Grupo}|${jogo.Time1}|${jogo.Time2}`;
}

function _resCarregarLS() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (raw) {
      const ls = JSON.parse(raw);
      for (const [k, v] of Object.entries(ls)) {
        if (!_LOCKED_KEYS.has(k)) RESULTADOS_REAIS[k] = v;
      }
    }
  } catch (_) {}
}

function _resSalvarLS() {
  try {
    localStorage.setItem(_LS_KEY, JSON.stringify(RESULTADOS_REAIS));
  } catch (_) {}
}

function _resBaixarArquivo() {
  // Filtra apenas jogos de grupos (chave tem 2 pipes)
  const grupos = Object.fromEntries(
    Object.entries(RESULTADOS_REAIS).filter(([k]) => _resIsGrupoKey(k))
  );
  const ts = new Date().toISOString().slice(0, 19) + 'Z';
  const conteudo = [
    `// Confirmado manualmente em ${ts}`,
    `// NÃO edite manualmente — gerado por scripts/atualizar_resultados.py`,
    `const RESULTADOS_REAIS =`,
    JSON.stringify(grupos, null, 2),
    `;`,
  ].join('\n') + '\n';

  const blob = new Blob([conteudo], { type: 'text/javascript' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'resultados_reais.js';
  a.click();
  URL.revokeObjectURL(url);
}

function _resConfirmar(chave, g1, g2) {
  if (!Number.isInteger(g1) || !Number.isInteger(g2) || g1 < 0 || g2 < 0) return false;
  RESULTADOS_REAIS[chave] = { gols_time1: g1, gols_time2: g2, confirmado: true };
  _resEdit.delete(chave);
  _resSalvarLS();
  renderResultados();
  return true;
}

// ── Helper de bandeira ────────────────────────────────────────────────────────

function _resFlagHtml(s) {
  const src = s?.asset_bandeira || (s?.iso2 ? flagUrl(s.iso2) : null);
  if (src) return `<img class="res-flag" src="${src}" alt="${s?.Selecao ?? ''}" onerror="this.style.display='none'">`;
  return `<span class="res-flag-emoji">${s ? flagEmoji(s.iso2) : '🏳'}</span>`;
}

// ── Cálculo da tabela real ────────────────────────────────────────────────────

function _calcTabelaReal(grupo) {
  const jogos = (DADOS.jogos_grupos || []).filter(j => j.Grupo === grupo);

  // Inicializa com times extraídos dos próprios jogos (nomes PT)
  const tabela = {};
  jogos.forEach(j => {
    if (!tabela[j.Time1]) tabela[j.Time1] = { selecao: j.Time1, pts: 0, sg: 0, gp: 0, gc: 0, j: 0, v: 0, e: 0, d: 0 };
    if (!tabela[j.Time2]) tabela[j.Time2] = { selecao: j.Time2, pts: 0, sg: 0, gp: 0, gc: 0, j: 0, v: 0, e: 0, d: 0 };
  });

  let jogosConf = 0;

  jogos.forEach(j => {
    const res = RESULTADOS_REAIS[_resChave(j)];
    if (!res?.confirmado) return;
    jogosConf++;
    const { gols_time1: g1, gols_time2: g2 } = res;
    tabela[j.Time1].j++;   tabela[j.Time2].j++;
    tabela[j.Time1].gp += g1; tabela[j.Time1].gc += g2;
    tabela[j.Time2].gp += g2; tabela[j.Time2].gc += g1;
    tabela[j.Time1].sg += g1 - g2; tabela[j.Time2].sg += g2 - g1;
    if (g1 > g2) {
      tabela[j.Time1].pts += 3; tabela[j.Time1].v++; tabela[j.Time2].d++;
    } else if (g1 < g2) {
      tabela[j.Time2].pts += 3; tabela[j.Time2].v++; tabela[j.Time1].d++;
    } else {
      tabela[j.Time1].pts += 1; tabela[j.Time1].e++;
      tabela[j.Time2].pts += 1; tabela[j.Time2].e++;
    }
  });

  const ordenada = Object.values(tabela).sort(
    (a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp
  );

  return { tabela: ordenada, jogosConf, totalJogos: jogos.length };
}

// ── Posição simulada ──────────────────────────────────────────────────────────

function _posSimulada(grupo) {
  const sim = (DADOS.simulacao || []).find(r => r.grupo === grupo);
  if (!sim) return [];
  return Object.entries(sim.stats_times)
    .sort((a, b) => b[1].P1 - a[1].P1 || b[1].P2 - a[1].P2)
    .map(([time]) => time);
}

// ── Acertos ───────────────────────────────────────────────────────────────────

function _calcAcertos() {
  const grupos = [...new Set((DADOS.jogos_grupos || []).map(j => j.Grupo))].sort();
  return grupos
    .filter(g => _calcTabelaReal(g).jogosConf === 6)
    .map(g => {
      const { tabela } = _calcTabelaReal(g);
      const posSim = _posSimulada(g);
      const real1 = tabela[0]?.selecao;
      const real2 = tabela[1]?.selecao;
      const sim1  = posSim[0];
      const sim2  = posSim[1];
      const primeiro_ok = !!(real1 && sim1 && real1 === sim1);
      const segundo_ok  = !!(real2 && sim2 && real2 === sim2);
      return { grupo: g, real1, real2, sim1, sim2, primeiro_ok, segundo_ok, ambos_ok: primeiro_ok && segundo_ok };
    });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderResultados() {
  const el = document.getElementById('tab-resultados');
  if (!el) return;
  el.innerHTML = _htmlResTab();
}

// Grupo key: "A|México|África do Sul" — tem exatamente 2 pipes (3 partes)
const _resIsGrupoKey = k => k.split('|').length === 3;

function _htmlResTab() {
  const grupos    = [...new Set((DADOS.jogos_grupos || []).map(j => j.Grupo))].sort();
  const gruposConf = Object.keys(RESULTADOS_REAIS)
    .filter(k => _resIsGrupoKey(k) && RESULTADOS_REAIS[k]?.confirmado).length;
  const temComp   = grupos.some(g => _calcTabelaReal(g).jogosConf > 0);
  const temAcert  = grupos.some(g => _calcTabelaReal(g).jogosConf === 6);
  const algumCompleto = temAcert;

  const filtroHtml = `
    <div class="res-filtro-grupo">
      <button class="cal-btn${_resFiltroG === '' ? ' active' : ''}" data-res-grupo="">Todos</button>
      ${grupos.map(g => `<button class="cal-btn${_resFiltroG === g ? ' active' : ''}" data-res-grupo="${g}">Grupo ${g}</button>`).join('')}
    </div>`;

  return `
    <div class="res-wrap">

      <div class="res-section-block">
        <div class="res-section-header">
          <span class="res-section-title">① Entrada de Resultados</span>
          <span class="res-section-sub">${gruposConf} de 72 confirmados</span>
          <button class="res-btn-exportar" onclick="_resBaixarArquivo()" title="Gera resultados_reais.js com todos os resultados confirmados">
            ⬇ Baixar resultados_reais.js
          </button>
        </div>
        ${filtroHtml}
        <div class="res-grupos-lista">
          ${_htmlEntradaResultados(grupos)}
        </div>
      </div>

      ${temComp ? `
      <div class="res-section-block">
        <div class="res-section-header">
          <span class="res-section-title">② Tabela Real vs Simulação</span>
          <span class="res-section-sub">Grupos com ≥ 1 resultado confirmado</span>
        </div>
        ${_htmlTabelaComparacao(grupos)}
      </div>` : ''}

      ${temAcert ? `
      <div class="res-section-block">
        <div class="res-section-header">
          <span class="res-section-title">③ Acertos da Simulação</span>
          <span class="res-section-sub">Apenas grupos com 6 jogos confirmados</span>
        </div>
        ${_htmlAcertos()}
      </div>` : ''}

      <div class="res-section-block">
        <div class="res-section-header">
          <span class="res-section-title">④ Fase Eliminatória</span>
          <span class="res-section-sub">${algumCompleto ? 'Times definidos pelos grupos classificados' : 'Disponível após conclusão dos grupos'}</span>
        </div>
        ${_htmlFaseEliminatoria()}
      </div>

    </div>`;
}

// ── Seção 1: Entrada de resultados ────────────────────────────────────────────

function _htmlEntradaResultados(grupos) {
  const gruposVis = _resFiltroG ? [_resFiltroG] : grupos;

  return gruposVis.map(grupo => {
    const jogos = (DADOS.jogos_grupos || []).filter(j => j.Grupo === grupo);
    const { jogosConf } = _calcTabelaReal(grupo);

    const rows = jogos.map(j => {
      const chave  = _resChave(j);
      const res    = RESULTADOS_REAIS[chave];
      const s1     = _getSel(j.Time1);
      const s2     = _getSel(j.Time2);
      const nome1  = s1?.Selecao || j.Time1;
      const nome2  = s2?.Selecao || j.Time2;
      const hora   = (j.DataHora || '').split('T')[1]?.slice(0, 5) || '';
      const flag1  = _resFlagHtml(s1);
      const flag2  = _resFlagHtml(s2);

      if (res?.confirmado && !_resEdit.has(chave)) {
        const locked = _LOCKED_KEYS.has(chave);
        // Modo confirmado
        return `
          <div class="res-jogo res-jogo-confirmado" data-chave="${chave}">
            <span class="res-jogo-hora">${hora}</span>
            <div class="res-jogo-time res-time-left">${flag1}<span class="res-jogo-nome">${nome1}</span></div>
            <div class="res-placar-wrap">
              <span class="res-placar">${res.gols_time1}&nbsp;–&nbsp;${res.gols_time2}</span>
              <span class="res-check">${locked ? '🔒' : '✓'}</span>
            </div>
            <div class="res-jogo-time res-time-right"><span class="res-jogo-nome">${nome2}</span>${flag2}</div>
            <div class="res-btn-wrap">
              ${locked ? '' : `<button class="res-btn-editar" data-chave="${chave}">Editar</button>`}
            </div>
          </div>`;
      }

      // Modo edição (novo ou re-edição)
      const v1 = res?.confirmado ? res.gols_time1 : '';
      const v2 = res?.confirmado ? res.gols_time2 : '';

      return `
        <div class="res-jogo" data-chave="${chave}">
          <span class="res-jogo-hora">${hora}</span>
          <div class="res-jogo-time res-time-left">${flag1}<span class="res-jogo-nome">${nome1}</span></div>
          <div class="res-input-wrap">
            <input type="number" min="0" max="99" class="res-input res-g1" value="${v1}" placeholder="–">
            <span class="res-input-sep">–</span>
            <input type="number" min="0" max="99" class="res-input res-g2" value="${v2}" placeholder="–">
          </div>
          <div class="res-jogo-time res-time-right"><span class="res-jogo-nome">${nome2}</span>${flag2}</div>
          <div class="res-btn-wrap">
            <button class="res-btn-confirmar">Confirmar</button>
            ${res?.confirmado ? `<button class="res-btn-cancelar" data-chave="${chave}">Cancelar</button>` : ''}
            <span class="res-aviso"></span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="res-grupo-card">
        <div class="res-grupo-header">
          <span class="res-grupo-titulo">Grupo ${grupo}</span>
          <span class="res-grupo-prog">${jogosConf}/6 confirmados</span>
        </div>
        <div class="res-jogos-lista">${rows}</div>
      </div>`;
  }).join('');
}

// ── Seção 2: Comparação real vs simulação ─────────────────────────────────────

function _htmlTabelaComparacao(grupos) {
  const blocos = grupos
    .map(grupo => {
      const { tabela, jogosConf } = _calcTabelaReal(grupo);
      if (jogosConf === 0) return '';

      const sim     = (DADOS.simulacao || []).find(r => r.grupo === grupo);
      const posSim  = _posSimulada(grupo);
      const completo = jogosConf === 6;

      // Mapa posição real: time → posição (1-based)
      const posRealMap = {};
      tabela.forEach((r, i) => { posRealMap[r.selecao] = i + 1; });

      const rowsReal = tabela.map((r, i) => {
        const s = _getSel(r.selecao);
        return `
          <tr>
            <td class="res-td-pos">${i + 1}</td>
            <td class="res-td-time">${_resFlagHtml(s)}<span>${s?.Selecao || r.selecao}</span></td>
            <td class="res-td-num">${r.pts}</td>
            <td class="res-td-num">${r.sg >= 0 ? '+' + r.sg : r.sg}</td>
            <td class="res-td-num">${r.gp}</td>
            <td class="res-td-num res-td-j">${r.j}</td>
          </tr>`;
      }).join('');

      const timesSim = posSim.length ? posSim : (sim ? Object.keys(sim.stats_times) : []);
      const rowsSim = timesSim.map((time, i) => {
        const st      = sim?.stats_times[time];
        const s       = _getSel(time);
        const posReal = posRealMap[time];
        const diverge = completo && posReal !== undefined && posReal !== i + 1;
        return `
          <tr class="${diverge ? 'pos-divergente' : ''}">
            <td class="res-td-pos">${i + 1}${diverge ? `<span class="res-delta">${posReal < i + 1 ? '↑' : '↓'}${posReal}º</span>` : ''}</td>
            <td class="res-td-time">${_resFlagHtml(s)}<span>${s?.Selecao || time}</span></td>
            <td class="res-td-num">${st ? st.P1.toFixed(1) + '%' : '—'}</td>
            <td class="res-td-num">${st ? st.P2.toFixed(1) + '%' : '—'}</td>
            <td class="res-td-num res-td-classif">${st ? st.Classifica.toFixed(1) + '%' : '—'}</td>
          </tr>`;
      }).join('');

      return `
        <div class="res-comp-bloco">
          <div class="res-comp-titulo">Grupo ${grupo} · ${jogosConf}/6 jogo${jogosConf !== 1 ? 's' : ''} confirmado${jogosConf !== 1 ? 's' : ''}</div>
          <div class="res-comp-grid">
            <div class="res-comp-col">
              <div class="res-comp-col-title">Tabela Real</div>
              <table class="res-table">
                <thead><tr><th>#</th><th>Seleção</th><th>Pts</th><th>SG</th><th>GP</th><th>J</th></tr></thead>
                <tbody>${rowsReal}</tbody>
              </table>
            </div>
            <div class="res-comp-col">
              <div class="res-comp-col-title">Simulação Monte Carlo${completo ? '' : ' <span class="res-badge-parcial">parcial</span>'}</div>
              <table class="res-table">
                <thead><tr><th>#</th><th>Seleção</th><th>1º%</th><th>2º%</th><th>Class%</th></tr></thead>
                <tbody>${rowsSim}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    })
    .join('');

  return blocos || '<div class="res-empty">Nenhum grupo com resultados confirmados.</div>';
}

// ── Seção 3: Acertos ──────────────────────────────────────────────────────────

function _htmlAcertos() {
  const acertos = _calcAcertos();
  if (!acertos.length) return '<div class="res-empty">Nenhum grupo completado ainda.</div>';

  const total      = acertos.length;
  const acertos1   = acertos.filter(a => a.primeiro_ok).length;
  const acertosAmb = acertos.filter(a => a.ambos_ok).length;

  const linhas = acertos.map(a => {
    const s1r = _getSel(a.real1); const s2r = _getSel(a.real2);
    const s1s = _getSel(a.sim1);  const s2s = _getSel(a.sim2);
    const badge = a.ambos_ok
      ? '<span class="res-badge res-badge-ok">✓ Ambos certos</span>'
      : a.primeiro_ok
        ? '<span class="res-badge res-badge-half">½ 1º certo</span>'
        : '<span class="res-badge res-badge-err">✗ Errou</span>';

    return `
      <div class="res-acerto-grupo">
        <div class="res-acerto-titulo">Grupo ${a.grupo} ${badge}</div>
        <div class="res-acerto-linha">
          <span class="res-acerto-label">1º real</span>
          ${_resFlagHtml(s1r)}<span>${s1r?.Selecao || a.real1}</span>
          <span class="${a.primeiro_ok ? 'res-ok' : 'res-err'}">${a.primeiro_ok ? '✓' : '✗'} (sim: ${s1s?.Selecao || a.sim1 || '—'})</span>
        </div>
        <div class="res-acerto-linha">
          <span class="res-acerto-label">2º real</span>
          ${_resFlagHtml(s2r)}<span>${s2r?.Selecao || a.real2}</span>
          <span class="${a.segundo_ok ? 'res-ok' : 'res-err'}">${a.segundo_ok ? '✓' : '✗'} (sim: ${s2s?.Selecao || a.sim2 || '—'})</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="res-acerto-resumo">
      <div class="res-acerto-stat">
        <span class="res-acerto-num">${acertos1}/${total}</span>
        <span class="res-acerto-desc">grupos com 1º lugar correto</span>
      </div>
      <div class="res-acerto-stat">
        <span class="res-acerto-num">${acertosAmb}/${total}</span>
        <span class="res-acerto-desc">grupos com ambos classificados corretos</span>
      </div>
    </div>
    <div class="res-acertos-lista">${linhas}</div>
    ${_htmlAcertosMata()}`;
}

// ── Eventos (delegação) ───────────────────────────────────────────────────────

document.addEventListener('click', e => {
  // Confirmar placar
  if (e.target.matches('.res-btn-confirmar')) {
    const row   = e.target.closest('[data-chave]');
    if (!row) return;
    const chave = row.dataset.chave;
    const g1v   = row.querySelector('.res-g1')?.value;
    const g2v   = row.querySelector('.res-g2')?.value;
    const aviso = e.target.closest('.res-btn-wrap')?.querySelector('.res-aviso');

    if (g1v === '' || g1v == null || g2v === '' || g2v == null) {
      if (aviso) aviso.textContent = 'Preencha os dois placares';
      return;
    }
    const n1 = parseInt(g1v, 10);
    const n2 = parseInt(g2v, 10);
    if (isNaN(n1) || isNaN(n2) || n1 < 0 || n2 < 0) {
      if (aviso) aviso.textContent = 'Valor inválido';
      return;
    }
    if (aviso) aviso.textContent = '';
    _resConfirmar(chave, n1, n2);
    return;
  }

  // Editar resultado confirmado
  if (e.target.matches('.res-btn-editar')) {
    const chave = e.target.dataset.chave;
    if (chave) { _resEdit.add(chave); renderResultados(); }
    return;
  }

  // Cancelar edição
  if (e.target.matches('.res-btn-cancelar')) {
    const chave = e.target.dataset.chave;
    if (chave) { _resEdit.delete(chave); renderResultados(); }
    return;
  }

  // Filtro de grupo
  if (e.target.matches('[data-res-grupo]') && e.target.closest('.res-filtro-grupo')) {
    _resFiltroG = e.target.dataset.resGrupo;
    renderResultados();
    return;
  }

  // Tab de rodada do mata-mata
  if (e.target.matches('[data-mata-round]')) {
    _resMataRound = e.target.dataset.mataRound;
    renderResultados();
    return;
  }

  // Confirmar resultado de mata-mata
  if (e.target.matches('.res-mm-btn-confirmar')) {
    const card  = e.target.closest('[data-chave]');
    if (!card) return;
    const chave = card.dataset.chave;
    const aviso = card.querySelector('.res-aviso');

    const g1v = card.querySelector('.res-mm-g1')?.value;
    const g2v = card.querySelector('.res-mm-g2')?.value;

    if (g1v === '' || g1v == null || g2v === '' || g2v == null) {
      if (aviso) aviso.textContent = 'Preencha os dois placares';
      return;
    }
    const g1 = parseInt(g1v, 10);
    const g2 = parseInt(g2v, 10);
    if (isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) {
      if (aviso) aviso.textContent = 'Valor inválido';
      return;
    }

    const prorrg = card.querySelector('.res-mm-prorr')?.checked || false;
    const pen    = card.querySelector('.res-mm-pen')?.checked    || false;

    // No mata-mata deve haver vencedor
    if (g1 === g2 && !pen) {
      if (aviso) aviso.textContent = 'Empate: marque Prorrogação e depois Pênaltis';
      return;
    }

    let p1 = null, p2 = null;
    if (pen) {
      const p1v = card.querySelector('.res-mm-p1')?.value;
      const p2v = card.querySelector('.res-mm-p2')?.value;
      if (p1v === '' || p2v === '') {
        if (aviso) aviso.textContent = 'Preencha o placar dos pênaltis';
        return;
      }
      p1 = parseInt(p1v, 10);
      p2 = parseInt(p2v, 10);
      if (isNaN(p1) || isNaN(p2)) {
        if (aviso) aviso.textContent = 'Pênaltis inválidos';
        return;
      }
      if (p1 === p2) {
        if (aviso) aviso.textContent = 'Placares nos pênaltis não podem ser iguais';
        return;
      }
    }

    if (aviso) aviso.textContent = '';
    _resConfirmarMata(chave, g1, g2, prorrg, pen, p1, p2);
    return;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MATA-MATA (FASE ELIMINATÓRIA)
// ════════════════════════════════════════════════════════════════════════════

// ── Constantes ────────────────────────────────────────────────────────────────

const _RES_ROUNDS = [
  { rnd: 'R16', label: 'Segunda Fase', count: 16 },
  { rnd: 'O',   label: 'Oitavas',     count: 8  },
  { rnd: 'Q',   label: 'Quartas',     count: 4  },
  { rnd: 'S',   label: 'Semis',       count: 2  },
  { rnd: 'F',   label: 'Final',       count: 1  },
  { rnd: '3P',  label: '3º Lugar',    count: 1  },
];

// Fase dos dados.js → chave em RESULTADOS_REAIS
const _MC_FASE_TO_RES = {
  'SF1':'R16|1',  'SF2':'R16|2',  'SF3':'R16|3',  'SF4':'R16|4',
  'SF5':'R16|5',  'SF6':'R16|6',  'SF7':'R16|7',  'SF8':'R16|8',
  'SF9':'R16|9',  'SF10':'R16|10','SF11':'R16|11','SF12':'R16|12',
  'SF13':'R16|13','SF14':'R16|14','SF15':'R16|15','SF16':'R16|16',
  'O1':'O|1','O2':'O|2','O3':'O|3','O4':'O|4',
  'O5':'O|5','O6':'O|6','O7':'O|7','O8':'O|8',
  'Q1':'Q|1','Q2':'Q|2','Q3':'Q|3','Q4':'Q|4',
  'S1':'S|1','S2':'S|2',
  'T':'3P|1','F':'F|1',
};

// Bracket: quem alimenta cada jogo (winners das partidas anteriores)
const _RES_BRACKET = {
  'O|1':['R16|1','R16|2'],   'O|2':['R16|3','R16|4'],
  'O|3':['R16|5','R16|6'],   'O|4':['R16|7','R16|8'],
  'O|5':['R16|9','R16|10'],  'O|6':['R16|11','R16|12'],
  'O|7':['R16|13','R16|14'], 'O|8':['R16|15','R16|16'],
  'Q|1':['O|1','O|2'],   'Q|2':['O|3','O|4'],
  'Q|3':['O|5','O|6'],   'Q|4':['O|7','O|8'],
  'S|1':['Q|1','Q|2'],   'S|2':['Q|3','Q|4'],
  'F|1':['S|1','S|2'],
  '3P|1':['S|1','S|2'],  // perdedores das semis
};

let _resMataRound = 'R16';

// ── Terceiros reais ───────────────────────────────────────────────────────────

function _resGetRealTerceiros() {
  const grupos = [...new Set((DADOS.jogos_grupos||[]).map(j => j.Grupo))].sort();
  const terceiros = [];
  grupos.forEach(g => {
    const { tabela, jogosConf, totalJogos } = _calcTabelaReal(g);
    if (jogosConf < totalJogos) return;
    const t3 = tabela[2];
    if (!t3) return;
    terceiros.push({
      grupo: g,
      time: t3.selecao,
      ptsMed: t3.pts * 1000 + (t3.sg + 100) * 10 + t3.gp,
      stats: { Pts_Medio: t3.pts },
      pct3: 33,
    });
  });
  return terceiros.sort((a, b) => b.ptsMed - a.ptsMed).slice(0, 8);
}

// ── Times da Segunda Fase via standings reais ─────────────────────────────────

function _resGetR16Teams() {
  const grupos = [...new Set((DADOS.jogos_grupos||[]).map(j => j.Grupo))].sort();
  const lookup = {};
  grupos.forEach(g => {
    const { tabela } = _calcTabelaReal(g);
    lookup[g] = {};
    tabela.forEach((r, i) => { lookup[g][i + 1] = r.selecao; });
  });

  const terceiros = _resGetRealTerceiros();
  const alocacao  = alocarTerceiros(terceiros);

  function resolve(codigo, fase) {
    if (!codigo) return null;
    const pos   = parseInt(codigo[0]);
    const resto = codigo.slice(1);
    if (pos === 3) return alocacao[fase]?.time ?? null;
    return lookup[resto]?.[pos] ?? null;
  }

  const result = {};
  (DADOS.jogos_mata || [])
    .filter(j => j.Fase?.startsWith('SF'))
    .forEach(j => {
      const resKey = _MC_FASE_TO_RES[j.Fase];
      if (!resKey) return;
      result[resKey] = {
        time1: resolve(j.Time1, j.Fase),
        time2: resolve(j.Time2, j.Fase),
      };
    });
  return result;
}

// ── Matchup e vencedor de um jogo ─────────────────────────────────────────────

function _resGetMataMatchup(chave) {
  if (chave.startsWith('R16|')) {
    const g = _resGetR16Teams()[chave];
    return { time1: g?.time1 ?? null, time2: g?.time2 ?? null };
  }

  const [src1, src2] = _RES_BRACKET[chave] || [];
  if (!src1) return { time1: null, time2: null };

  if (chave === '3P|1') {
    const { time1: m1t1, time2: m1t2 } = _resGetMataMatchup(src1);
    const { time1: m2t1, time2: m2t2 } = _resGetMataMatchup(src2);
    const w1 = _resMataWinner(src1);
    const w2 = _resMataWinner(src2);
    return {
      time1: w1 ? (w1 === m1t1 ? m1t2 : m1t1) : null,
      time2: w2 ? (w2 === m2t1 ? m2t2 : m2t1) : null,
    };
  }

  return {
    time1: _resMataWinner(src1),
    time2: _resMataWinner(src2),
  };
}

function _resMataWinner(chave) {
  const res = RESULTADOS_REAIS[chave];
  if (!res?.confirmado) return null;
  const { time1, time2 } = _resGetMataMatchup(chave);
  if (!time1 || !time2) return null;
  if (res.gols_time1 > res.gols_time2) return time1;
  if (res.gols_time2 > res.gols_time1) return time2;
  if (res.penaltis && res.pen_time1 != null && res.pen_time2 != null)
    return res.pen_time1 > res.pen_time2 ? time1 : time2;
  return null;
}

// ── Confirmação de resultado ──────────────────────────────────────────────────

function _resConfirmarMata(chave, g1, g2, prorrg, pen, p1, p2) {
  RESULTADOS_REAIS[chave] = {
    gols_time1:  g1,
    gols_time2:  g2,
    prorrogacao: !!prorrg,
    penaltis:    !!pen,
    pen_time1:   pen ? (p1 ?? null) : null,
    pen_time2:   pen ? (p2 ?? null) : null,
    confirmado:  true,
  };
  _resEdit.delete(chave);
  _resSalvarLS();
  renderResultados();
}

// ── Metadados do jogo (local, data) ──────────────────────────────────────────

function _resFindJogoMata(chave) {
  const fase = Object.entries(_MC_FASE_TO_RES).find(([, v]) => v === chave)?.[0];
  if (!fase) return null;
  return (DADOS.jogos_mata || []).find(j => j.Fase === fase) || null;
}

// ── Acertos do mata-mata ──────────────────────────────────────────────────────

function _calcAcertosMata() {
  const hasMc = typeof _mc !== 'undefined' && _mc.picks && Object.keys(_mc.picks).length > 0;

  // Campeão real vs mc.js
  const campeaoReal = _resMataWinner('F|1');
  let campeaoSim = null;
  if (hasMc) {
    const mcChamp = _mc.picks['F'];
    campeaoSim = mcChamp ? (_getSel(mcChamp)?.Selecao || mcChamp) : null;
  }

  // % de jogos da R16 acertados vs mc.js picks
  let acertosR16 = 0, totalR16 = 0;
  if (hasMc) {
    for (let i = 1; i <= 16; i++) {
      const chave   = `R16|${i}`;
      const winner  = _resMataWinner(chave);
      if (!winner) continue;
      const mcFase  = Object.entries(_MC_FASE_TO_RES).find(([, v]) => v === chave)?.[0];
      const mcPick  = mcFase ? _mc.picks[mcFase] : null;
      if (!mcPick) continue;
      totalR16++;
      const mcSel = _getSel(mcPick)?.Selecao || mcPick;
      if (mcSel === winner || mcPick === winner) acertosR16++;
    }
  }

  return { campeaoReal, campeaoSim, acertosR16, totalR16, hasMc };
}

function _htmlAcertosMata() {
  const d = _calcAcertosMata();

  const linhas = [];

  if (d.campeaoReal) {
    const sSim  = d.campeaoSim ? _getSel(d.campeaoSim) : null;
    const sReal = _getSel(d.campeaoReal);
    const igual = d.campeaoSim && (d.campeaoSim === d.campeaoReal ||
                  _getSel(d.campeaoSim)?.Selecao === d.campeaoReal);
    linhas.push(`
      <div class="res-campeao-linha">
        <span class="res-campeao-label">🏆 Campeão real</span>
        ${_resFlagHtml(sReal)}<span style="font-weight:700">${sReal?.Selecao || d.campeaoReal}</span>
        ${d.hasMc && d.campeaoSim ? `
          <span style="color:var(--muted);margin-left:8px">
            vs sim: ${_resFlagHtml(sSim)}<span>${sSim?.Selecao || d.campeaoSim}</span>
            <span class="${igual ? 'res-ok' : 'res-err'}">${igual ? ' ✓' : ' ✗'}</span>
          </span>` : ''}
      </div>`);
  }

  if (d.hasMc && d.totalR16 > 0) {
    linhas.push(`
      <div class="res-campeao-linha" style="margin-top:8px">
        <span class="res-campeao-label">Segunda Fase</span>
        <span style="font-weight:700;color:var(--accent)">${d.acertosR16}/${d.totalR16}</span>
        <span style="color:var(--muted)">classificados corretos (vs Meu Cenário)</span>
      </div>`);
  }

  if (!linhas.length) return '';

  return `
    <div class="res-acerto-mata">
      <div class="res-acerto-mata-titulo">⚔️ Mata-mata</div>
      ${linhas.join('')}
    </div>`;
}

// ── HTML da seção eliminatória ────────────────────────────────────────────────

function _htmlFaseEliminatoria() {
  const grupos = [...new Set((DADOS.jogos_grupos||[]).map(j => j.Grupo))].sort();
  const algumCompleto = grupos.some(g => _calcTabelaReal(g).jogosConf === 6);

  if (!algumCompleto) {
    return '<div class="res-empty">Fase eliminatória disponível após conclusão dos grupos.</div>';
  }

  const tabs = _RES_ROUNDS.map(({ rnd, label }) => {
    const active = rnd === _resMataRound ? ' active' : '';
    const chaves = _resClavesDoRound(rnd);
    const nConf  = chaves.filter(c => RESULTADOS_REAIS[c]?.confirmado).length;
    const done   = nConf > 0 && nConf === chaves.length ? ' done' : '';
    return `<button class="res-mm-tab${active}${done}" data-mata-round="${rnd}">${label}</button>`;
  }).join('');

  const content = _htmlMataRound(_resMataRound);
  return `<div class="res-mm-tabs">${tabs}</div><div class="res-mm-content">${content}</div>`;
}

function _resClavesDoRound(rnd) {
  if (rnd === 'F')   return ['F|1'];
  if (rnd === '3P')  return ['3P|1'];
  const cfg = _RES_ROUNDS.find(r => r.rnd === rnd);
  if (!cfg) return [];
  return Array.from({ length: cfg.count }, (_, i) => `${rnd}|${i + 1}`);
}

function _htmlMataRound(rnd) {
  const chaves    = _resClavesDoRound(rnd);
  const gridClass = chaves.length === 1 ? 'res-mm-grid-single' : 'res-mm-grid';
  return `<div class="${gridClass}">${chaves.map(_htmlMataCard).join('')}</div>`;
}

// ── Card de um confronto ──────────────────────────────────────────────────────

function _htmlMataCard(chave) {
  const { time1, time2 } = _resGetMataMatchup(chave);
  const res    = RESULTADOS_REAIS[chave];
  const isEdit = _resEdit.has(chave);
  const jogo   = _resFindJogoMata(chave);

  const hora  = jogo?.DataHora?.split('T')[1]?.slice(0, 5) || '';
  const local = jogo?.Local || '';
  const meta  = [chave, hora, local].filter(Boolean).join(' · ');

  const s1    = time1 ? _getSel(time1) : null;
  const s2    = time2 ? _getSel(time2) : null;
  const nome1 = s1?.Selecao || time1 || 'A definir';
  const nome2 = s2?.Selecao || time2 || 'A definir';
  const flag1 = time1 ? _resFlagHtml(s1) : '<span class="res-flag-tbd">?</span>';
  const flag2 = time2 ? _resFlagHtml(s2) : '<span class="res-flag-tbd">?</span>';

  // ── Confirmado ────────────────────────────────────────────────────────────
  if (res?.confirmado && !isEdit) {
    let scoreStr = `${res.gols_time1}–${res.gols_time2}`;
    if (res.penaltis && res.pen_time1 != null)
      scoreStr += ` <span style="font-size:11px;color:var(--label)">(${res.pen_time1}–${res.pen_time2} pen.)</span>`;
    else if (res.prorrogacao)
      scoreStr += ` <span style="font-size:11px;color:var(--muted)">(p.e.)</span>`;

    return `
      <div class="res-mm-card res-mm-confirmed" data-chave="${chave}">
        <div class="res-mm-meta">${meta}</div>
        <div class="res-mm-confronto">
          <div class="res-mm-time">${flag1}<span class="res-mm-nome">${nome1}</span></div>
          <div class="res-mm-score">${scoreStr}<span class="res-check">✓</span></div>
          <div class="res-mm-time res-mm-time-right"><span class="res-mm-nome">${nome2}</span>${flag2}</div>
        </div>
        <div class="res-btn-wrap">
          <button class="res-btn-editar" data-chave="${chave}">Editar</button>
        </div>
      </div>`;
  }

  // ── Times ainda indefinidos ────────────────────────────────────────────────
  if (!time1 || !time2) {
    return `
      <div class="res-mm-card res-mm-tbd" data-chave="${chave}">
        <div class="res-mm-meta">${meta}</div>
        <div class="res-mm-confronto">
          <div class="res-mm-time">
            ${flag1}<span class="res-mm-nome res-mm-tbd-nome">${nome1}</span>
          </div>
          <div class="res-mm-vs">VS</div>
          <div class="res-mm-time res-mm-time-right">
            <span class="res-mm-nome res-mm-tbd-nome">${nome2}</span>${flag2}
          </div>
        </div>
      </div>`;
  }

  // ── Modo entrada ──────────────────────────────────────────────────────────
  const v1    = res?.confirmado ? res.gols_time1 : '';
  const v2    = res?.confirmado ? res.gols_time2 : '';
  const prorrg = res?.prorrogacao || false;
  const pen   = res?.penaltis    || false;
  const p1v   = pen && res?.pen_time1 != null ? res.pen_time1 : '';
  const p2v   = pen && res?.pen_time2 != null ? res.pen_time2 : '';

  return `
    <div class="res-mm-card" data-chave="${chave}">
      <div class="res-mm-meta">${meta}</div>
      <div class="res-mm-confronto">
        <div class="res-mm-time">${flag1}<span class="res-mm-nome">${nome1}</span></div>
        <div class="res-mm-inputs">
          <input type="number" min="0" max="99" class="res-input res-mm-g1" value="${v1}" placeholder="–">
          <span class="res-input-sep">–</span>
          <input type="number" min="0" max="99" class="res-input res-mm-g2" value="${v2}" placeholder="–">
        </div>
        <div class="res-mm-time res-mm-time-right">
          <span class="res-mm-nome">${nome2}</span>${flag2}
        </div>
      </div>
      <div class="res-mm-extras">
        <label class="res-mm-check-label">
          <input type="checkbox" class="res-mm-prorr"
            onchange="this.closest('.res-mm-card').querySelector('.res-mm-pen-wrap').style.display=this.checked?'flex':'none'"
            ${prorrg ? 'checked' : ''}>
          Prorrogação
        </label>
        <div class="res-mm-pen-wrap" style="display:${prorrg ? 'flex' : 'none'}">
          <label class="res-mm-check-label">
            <input type="checkbox" class="res-mm-pen"
              onchange="this.closest('.res-mm-card').querySelector('.res-mm-pen-inputs').style.display=this.checked?'flex':'none'"
              ${pen ? 'checked' : ''}>
            Pênaltis
          </label>
          <div class="res-mm-pen-inputs" style="display:${pen ? 'flex' : 'none'}">
            <input type="number" min="0" max="99" class="res-input res-mm-p1" value="${p1v}"
              placeholder="–" style="width:44px">
            <span class="res-input-sep">–</span>
            <input type="number" min="0" max="99" class="res-input res-mm-p2" value="${p2v}"
              placeholder="–" style="width:44px">
          </div>
        </div>
      </div>
      <div class="res-btn-wrap">
        <button class="res-mm-btn-confirmar">Confirmar</button>
        ${res?.confirmado ? `<button class="res-btn-cancelar" data-chave="${chave}">Cancelar</button>` : ''}
        <span class="res-aviso"></span>
      </div>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Renderiza quando a aba Resultados é ativada
document.querySelectorAll('[data-tab="resultados"]').forEach(btn =>
  btn.addEventListener('click', renderResultados)
);

// Carrega localStorage após DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _resCarregarLS);
} else {
  _resCarregarLS();
}
