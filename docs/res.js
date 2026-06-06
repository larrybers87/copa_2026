'use strict';

// ── Persistência ──────────────────────────────────────────────────────────────

const _LS_KEY = 'copa2026_resultados_v1';
const _resEdit = new Set();
let _resFiltroG = '';

function _resChave(jogo) {
  return `${jogo.Grupo}|${jogo.Time1}|${jogo.Time2}`;
}

function _resCarregarLS() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (raw) Object.assign(RESULTADOS_REAIS, JSON.parse(raw));
  } catch (_) {}
}

function _resSalvarLS() {
  try {
    localStorage.setItem(_LS_KEY, JSON.stringify(RESULTADOS_REAIS));
  } catch (_) {}
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

function _htmlResTab() {
  const grupos = [...new Set((DADOS.jogos_grupos || []).map(j => j.Grupo))].sort();
  const totalConf = Object.values(RESULTADOS_REAIS).filter(r => r.confirmado).length;
  const temComp   = grupos.some(g => _calcTabelaReal(g).jogosConf > 0);
  const temAcert  = grupos.some(g => _calcTabelaReal(g).jogosConf === 6);

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
          <span class="res-section-sub">${totalConf} de 72 confirmados</span>
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
        // Modo confirmado
        return `
          <div class="res-jogo res-jogo-confirmado" data-chave="${chave}">
            <span class="res-jogo-hora">${hora}</span>
            <div class="res-jogo-time res-time-left">${flag1}<span class="res-jogo-nome">${nome1}</span></div>
            <div class="res-placar-wrap">
              <span class="res-placar">${res.gols_time1}&nbsp;–&nbsp;${res.gols_time2}</span>
              <span class="res-check">✓</span>
            </div>
            <div class="res-jogo-time res-time-right"><span class="res-jogo-nome">${nome2}</span>${flag2}</div>
            <div class="res-btn-wrap">
              <button class="res-btn-editar" data-chave="${chave}">Editar</button>
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
    <div class="res-acertos-lista">${linhas}</div>`;
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
  }
});

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
