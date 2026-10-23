/* Painel de Portabilidade ATN — interface, dados compartilhados (Supabase) e exportações. */
(function () {
  'use strict';
  const CFG = window.PP_CONFIG;
  const sb = window.supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true } });
  window.__sb = sb;

  /* ================= utilidades ================= */
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } kids.flat().forEach(c => c != null && c !== false && e.append(c instanceof Node ? c : document.createTextNode(String(c)))); return e; };
  const pct = (a, b) => b ? a / b : null;
  const fP = v => v == null || isNaN(v) ? '–' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const fI = v => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const fD = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '–';
  const fDT = d => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
  const dn = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const nd = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hmLocal = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesNome = ym => MESES[+ym.slice(5, 7) - 1] + '/' + ym.slice(0, 4);
  const EMPS = ['ATN', 'DAHA'];
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const colEmp = e => css(e === 'ATN' ? '--atn' : e === 'DAHA' ? '--daha' : '--tot');
  const count = (arr, f) => { let n = 0; for (const r of arr) if (f(r)) n++; return n; };
  const groupBy = (arr, f) => { const m = new Map(); for (const r of arr) { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
  const LS = { get(k, d) { try { const v = localStorage.getItem('pp_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('pp_' + k, JSON.stringify(v)); } catch (e) {} } };
  function toast(t) { const d = el('div', { class: 'toast', text: t }); document.body.append(d); setTimeout(() => d.remove(), 5000); }
  function baixar(nome, blob) { const a = el('a', { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  /* ================= estado ================= */
  let ME = null, PAPEL = null, RAW = { V: null, E: null, C: null }, CARGAS = {}, REF_E = null, HOJE = null;
  const F = { mes: '', emp: '', eq: '', uf: '', ini: '', fim: '' };
  let TAB = (location.hash || '').slice(1) || 'geral';
  const charts = [];
  const podeEditar = () => PAPEL === 'admin' || PAPEL === 'editor';

  /* ================= cache local (IndexedDB) ================= */
  const IDB = {
    db: null,
    open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('pp_cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
    async get(k) { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('c').objectStore('c').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); await new Promise(res => { const t = db.transaction('c', 'readwrite'); t.objectStore('c').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) {} }
  };
  async function gzip(str) { const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')); return await new Response(s).blob(); }
  async function gunzipText(blob) { const s = blob.stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(s).text(); }

  /* ================= login ================= */
  async function boot() {
    const { data } = await sb.auth.getSession();
    if (data.session) return entrar(data.session.user);
    mostrarLogin();
  }
  async function mostrarLogin() {
    $('#vApp').hidden = true; $('#vLogin').hidden = false;
    try { const { data } = await sb.rpc('pp_tem_admin'); $('#fBoot').hidden = !!data; $('#fLogin').hidden = !data; } catch (e) { $('#fBoot').hidden = true; }
  }
  $('#fLogin').addEventListener('submit', async e => {
    e.preventDefault(); const m = $('#lMsg'); m.className = 'msg'; m.textContent = 'Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value });
    if (error) { m.className = 'msg err'; m.textContent = 'E-mail ou senha incorretos.'; return; }
    m.textContent = ''; entrar(data.user);
  });
  $('#fBoot').addEventListener('submit', async e => {
    e.preventDefault(); const m = $('#bMsg'); m.className = 'msg'; m.textContent = 'Criando…';
    const email = $('#bEmail').value.trim(), senha = $('#bSenha').value;
    const { data, error } = await sb.functions.invoke('pp-usuarios', { body: { acao: 'bootstrap', email, senha, nome: $('#bNome').value.trim() } });
    const erro = error ? await lerErro(error) : data && data.erro;
    if (erro) { m.className = 'msg err'; m.textContent = erro; return; }
    const r = await sb.auth.signInWithPassword({ email, password: senha });
    if (r.error) { m.className = 'msg err'; m.textContent = 'Administrador criado. Entre com o e-mail e a senha.'; mostrarLogin(); return; }
    entrar(r.data.user);
  });
  async function lerErro(error) { try { const j = await error.context.json(); return j.erro || error.message; } catch (e) { return error.message || 'Erro inesperado.'; } }
  $('#btnSair').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  $('#btnSenha').addEventListener('click', () => {
    const inp = el('input', { type: 'password', minlength: '8', autocomplete: 'new-password' }), msg = el('span', { class: 'msg' });
    const box = modal('Trocar minha senha', el('div', { class: 'form-row' }, el('label', null, 'Nova senha (mínimo 8 caracteres)', inp),
      el('button', { class: 'btn primary', onclick: async () => { if (inp.value.length < 8) { msg.className = 'msg err'; msg.textContent = 'Use ao menos 8 caracteres.'; return; } const { error } = await sb.auth.updateUser({ password: inp.value }); msg.className = 'msg ' + (error ? 'err' : 'ok'); msg.textContent = error ? error.message : 'Senha alterada.'; } }, 'Salvar'), msg));
    inp.focus(); return box;
  });

  async function entrar(user) {
    ME = user;
    const { data, error } = await sb.from('pp_usuarios').select('papel, ativo, nome').eq('user_id', user.id).maybeSingle();
    if (error || !data || !data.ativo) {
      $('#vLogin').hidden = false; $('#vApp').hidden = true; $('#fBoot').hidden = true; $('#fLogin').hidden = false;
      $('#lMsg').className = 'msg err'; $('#lMsg').textContent = 'Seu usuário não tem acesso a este painel. Fale com a administradora.';
      await sb.auth.signOut(); return;
    }
    PAPEL = data.papel;
    $('#vLogin').hidden = true; $('#vApp').hidden = false;
    $('#btnUpd').hidden = !podeEditar(); $('#btnUsers').hidden = PAPEL !== 'admin';
    [...document.querySelectorAll('.tab')].forEach(x => x.setAttribute('aria-selected', String(x.dataset.t === TAB)));
    await carregar();
    sb.channel('pp_cargas').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pp_cargas' }, p => {
      clearTimeout(window.__rl); window.__rl = setTimeout(async () => { await carregar(); toast(`Base de ${p.new.tipo} atualizada às ${hmLocal(new Date(p.new.enviado_em))}.`); }, 1500);
    }).subscribe();
    setInterval(() => carregar(true), 10 * 60 * 1000);
  }

  /* ================= carga dos dados ================= */
  async function carregar(silencioso) {
    const { data, error } = await sb.from('pp_cargas').select('id,tipo,path,arquivo,linhas,enviado_em').order('id', { ascending: false }).limit(60);
    if (error) { if (!silencioso) $('#content').replaceChildren(el('div', { class: 'empty' }, el('strong', { text: 'Não foi possível abrir a base' }), el('span', { text: error.message }))); return; }
    const ult = {}; for (const c of data) if (!ult[c.tipo]) ult[c.tipo] = c;
    let mudou = false;
    for (const tipo of ['vendas', 'entregas', 'conectadas']) {
      const c = ult[tipo]; if (!c) continue;
      if (CARGAS[tipo] && CARGAS[tipo].id === c.id && RAW[tipo[0].toUpperCase()]) continue;
      let base = null; const cache = await IDB.get(tipo);
      if (cache && cache.id === c.id) base = cache.base;
      else {
        const dl = await sb.storage.from(CFG.bucket).download(c.path);
        if (dl.error) { console.error(dl.error); continue; }
        base = JSON.parse(await gunzipText(dl.data));
        IDB.set(tipo, { id: c.id, base });
      }
      CARGAS[tipo] = c; RAW[tipo[0].toUpperCase()] = PROC.decode(base.t); mudou = true;
    }
    if (!mudou && silencioso) return;
    prepare(); setStatus();
    if (RAW.V || RAW.E || RAW.C) fillFilters();
    render();
  }
  function prepare() {
    const vmap = new Map(); (RAW.V || []).forEach(r => r.p && vmap.set(r.p, r));
    HOJE = dn(isoLocal(new Date()));
    if (RAW.E) { let mx = 0; for (const r of RAW.E) { mx = Math.max(mx, dn(r.de)); const v = vmap.get(r.p); r.uf = v ? v.uf : null; } REF_E = mx + 1; for (const r of RAW.E) { r.obs = REF_E - dn(r.de); r.lag = r.pd ? dn(r.pd) - dn(r.de) : null; } }
    if (RAW.C) for (const r of RAW.C) { const v = vmap.get(r.p); r.uf = v ? v.uf : null; r.dAt = r.dv ? dn(r.da) - dn(r.dv) : null; }
    if (RAW.V) for (const r of RAW.V) { r.dEnt = r.bg === 'Entregue' && r.dbs ? dn(r.dbs) - dn(r.dv) : null; r.rep = /reprocessado/i.test(r.fl || ''); }
  }
  function setStatus() {
    const s = $('#status'); s.replaceChildren();
    const parts = [['vendas', 'Vendas'], ['entregas', 'Entregas'], ['conectadas', 'Conectadas']].filter(([t]) => CARGAS[t]);
    if (!parts.length) { s.textContent = 'Nenhuma base carregada'; return; }
    parts.forEach(([t, n], i) => { if (i) s.append(' · '); s.append(n + ': ', el('b', { text: fDT(CARGAS[t].enviado_em) })); });
  }
  const baseHora = () => CARGAS.vendas ? new Date(CARGAS.vendas.enviado_em) : new Date();

  /* ================= filtros ================= */
  function filt(rows, dateKey, opts) {
    opts = opts || {};
    return (rows || []).filter(r => {
      if (!opts.semData) { const d = r[dateKey]; if (F.mes && (!d || d.slice(0, 7) !== F.mes)) return false; if (F.ini && (!d || d < F.ini)) return false; if (F.fim && (!d || d.slice(0, 10) > F.fim)) return false; }
      if (F.emp && r.emp !== F.emp) return false;
      if (F.eq && r.eq !== F.eq) return false;
      if (F.uf && r.uf !== F.uf) return false;
      return true;
    });
  }
  const empsShown = () => F.emp ? [F.emp] : EMPS;
  const byEmp = rows => { const o = {}; for (const e of empsShown()) o[e] = rows.filter(r => r.emp === e); return o; };
  function fillFilters() {
    const meses = new Set(); (RAW.V || []).forEach(r => r.dv && meses.add(r.dv.slice(0, 7))); (RAW.E || []).forEach(r => meses.add(r.de.slice(0, 7))); (RAW.C || []).forEach(r => meses.add(r.da.slice(0, 7)));
    const sel = $('#fMes'); sel.replaceChildren(el('option', { value: '', text: 'Todos' }), ...[...meses].sort().reverse().map(m => el('option', { value: m, text: mesNome(m) }))); sel.value = F.mes;
    fillEq();
    const ufs = [...new Set((RAW.V || []).map(r => r.uf).filter(Boolean))].sort();
    const su = $('#fUf'); su.replaceChildren(el('option', { value: '', text: 'Todas' }), ...ufs.map(u => el('option', { value: u, text: u }))); su.value = F.uf;
  }
  function fillEq() {
    const src = RAW.V || RAW.E || [];
    const eqs = [...new Set(src.filter(r => !F.emp || r.emp === F.emp).map(r => r.eq).filter(Boolean))].sort();
    const s = $('#fEq'); s.replaceChildren(el('option', { value: '', text: 'Todas' }), ...eqs.map(q => el('option', { value: q, text: q })));
    if (!eqs.includes(F.eq)) F.eq = ''; s.value = F.eq;
  }
  $('#fMes').addEventListener('change', e => { F.mes = e.target.value; render(); });
  $('#fEq').addEventListener('change', e => { F.eq = e.target.value; render(); });
  $('#fUf').addEventListener('change', e => { F.uf = e.target.value; render(); });
  $('#fIni').addEventListener('change', e => { F.ini = e.target.value; render(); });
  $('#fFim').addEventListener('change', e => { F.fim = e.target.value; render(); });
  $('#fEmp').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; F.emp = b.dataset.v; [...$('#fEmp').children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); fillEq(); render(); });
  $('#btnLimpar').addEventListener('click', () => { Object.assign(F, { mes: '', emp: '', eq: '', uf: '', ini: '', fim: '' }); ['#fMes', '#fUf', '#fIni', '#fFim'].forEach(s => $(s).value = ''); [...$('#fEmp').children].forEach((x, i) => x.setAttribute('aria-pressed', String(i === 0))); fillEq(); render(); });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; TAB = b.dataset.t; [...document.querySelectorAll('.tab')].forEach(x => x.setAttribute('aria-selected', String(x === b))); try { history.replaceState(null, '', '#' + TAB); } catch (er) {} render(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render()); } catch (e) {}

  /* ================= componentes ================= */
  function destroyCharts() { while (charts.length) { try { charts.pop().destroy(); } catch (e) {} } }
  function chart(canvas, cfg) {
    if (!window.Chart) { canvas.replaceWith(el('p', { class: 'note', text: 'Gráfico indisponível.' })); return; }
    Chart.defaults.font.family = 'IBM Plex Sans, Segoe UI, sans-serif'; Chart.defaults.color = css('--muted');
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10 } } } }, cfg.options || {});
    const sc = cfg.options.scales || {}; for (const k of Object.keys(sc)) { sc[k].grid = Object.assign({ color: css('--line') }, sc[k].grid || {}); sc[k].border = { color: css('--line') }; }
    charts.push(new Chart(canvas, cfg));
  }
  const pctAxis = max => ({ beginAtZero: true, max, ticks: { callback: v => Math.round(v * 100) + '%' } });
  const pctTip = { callbacks: { label: c => `${c.dataset.label}: ${fP(c.parsed.y ?? c.parsed.x)}` } };
  function box(tall) { const b = el('div', { class: 'chartbox' + (tall ? ' tall' : '') }); const c = el('canvas'); b.append(c); return [b, c]; }
  function hbars(items, series, fmt) {
    const max = Math.max(1e-9, ...items.flatMap(i => series.map(s => i.values[s] || 0)));
    const g = el('div', { class: 'hbar' });
    for (const it of items) {
      g.append(el('div', { class: 'lbl', text: it.label }));
      const bs = el('div', { class: 'bars' });
      for (const s of series) { const v = it.values[s] || 0; const f = el('span', { class: 'f' }); f.style.width = `calc(${(v / max) * 100}% * .78)`; f.style.background = colEmp(s); bs.append(el('div', { class: 'b' }, f, el('span', { class: 't', text: (it.texts && it.texts[s]) || fmt(v) }))); }
      g.append(bs);
    }
    return g;
  }
  const swatch = c => { const i = el('i'); i.style.background = c; return i; };
  const legendEl = () => el('div', { class: 'legend' }, empsShown().map(e => el('span', null, swatch(colEmp(e)), e)));
  function table(cols, rows, opts) {
    opts = opts || {};
    const wrap = el('div', { class: 'tbl-wrap' }); if (opts.maxh) wrap.style.maxHeight = opts.maxh;
    const t = el('table'), thead = el('thead');
    if (opts.groups) thead.append(el('tr', { class: 'grp' }, opts.groups.map(g => el('th', { colspan: g.span, text: g.t }))));
    const th = el('tr'); let sortKey = opts.sortKey || null, sortDir = opts.sortDir || -1;
    cols.forEach(c => { const h = el('th', { class: (c.l ? 'l ' : '') + (opts.sortable ? 'sort' : ''), text: c.t, scope: 'col' }); if (opts.sortable) h.addEventListener('click', () => { sortDir = sortKey === c.k ? -sortDir : -1; sortKey = c.k; draw(); }); th.append(h); });
    thead.append(th); const tb = el('tbody'); t.append(thead, tb); wrap.append(t);
    function cell(c, v, r, total) {
      const td = el('td', { class: [c.l ? 'l' : '', c.cls ? (c.cls(v, r) || '') : ''].join(' ').trim() || null });
      if (c.style) { const s = c.style(v, r); if (s) td.style.cssText = s; }
      if (!total && c.render) { const x = c.render(v, r); x instanceof Node ? td.append(x) : td.textContent = x; }
      else td.textContent = v == null ? (total ? '' : '–') : (c.f && typeof v !== 'string' ? c.f(v, r) : v);
      if (!total && c.click && v) { td.classList.add('clk'); td.addEventListener('click', () => { wrap.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel')); td.classList.add('sel'); c.click(r, td); }); }
      return td;
    }
    function draw() {
      tb.replaceChildren();
      let rs = rows.slice();
      if (sortKey) rs.sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
      for (const r of rs) tb.append(el('tr', r._cls ? { class: r._cls } : null, cols.map(c => cell(c, r[c.k], r))));
      if (opts.total) tb.append(el('tr', { class: 'total' }, cols.map(c => cell(c, opts.total[c.k], opts.total, true))));
    }
    draw(); return wrap;
  }
  const empPill = e => el('span', { class: 'pill ' + (e === 'DAHA' ? 'daha' : 'atn'), text: e });
  const card = (title, note, ...kids) => el('div', { class: 'card' }, title ? el('h2', { text: title }) : null, note ? el('p', { class: 'note', text: note }) : null, ...kids);
  function topItems(rows, keyf, n) {
    const tot = {}; empsShown().forEach(e => tot[e] = count(rows, r => r.emp === e));
    return [...groupBy(rows, keyf).entries()].sort((a, b) => b[1].length - a[1].length).slice(0, n).map(([k, a]) => { const values = {}, texts = {}; empsShown().forEach(e => { const c = count(a, r => r.emp === e); values[e] = pct(c, tot[e]) || 0; texts[e] = `${fP(values[e])} · ${fI(c)}`; }); return { label: k, values, texts }; });
  }
  // Card com um bloco por empresa: número grande + linha de apoio
  function tileEmp(k, fn, hl) {
    return el('div', { class: 'tile' + (hl ? ' hl' : '') }, el('span', { class: 'k', text: k }),
      el('div', { class: 'pair' }, empsShown().map(e => { const o = fn(e); return el('div', { class: 'emp' }, el('span', { class: 'v c-' + e.toLowerCase() }, o.v, el('small', { text: e })), o.sub ? el('span', { class: 'sub', html: null }, ...[].concat(o.sub)) : null); })));
  }
  function modal(titulo, ...kids) {
    const fechar = () => m.remove();
    const m = el('div', { class: 'modal', onclick: e => { if (e.target === m) fechar(); } }, el('div', { class: 'card' }, el('div', { class: 'row1' }, el('h2', { text: titulo }), el('button', { class: 'btn', onclick: fechar }, 'Fechar')), ...kids));
    document.body.append(m); return m;
  }
  function semBase(tipo, root) { root.append(el('div', { class: 'empty' }, el('strong', { text: `Ainda não há base de ${tipo}` }), el('span', { text: podeEditar() ? 'Clique em Atualizar dados e envie o relatório.' : 'Assim que um editor enviar o relatório, os números aparecem aqui.' }))); }

  /* ================= Visão geral ================= */
  function rGeral(root) {
    if (!RAW.V) return semBase('vendas', root);
    const V = filt(RAW.V, 'dv');
    root.append(el('p', { class: 'lead', text: 'Base: relatório de vendas, pela data da venda. Aprovada = venda aceita. Conectada = cliente com o chip em mãos. Cada card mostra a quantidade e, embaixo, sobre o que o % é calculado.' }));
    const m = {};
    for (const e of [...empsShown(), 'Total']) {
      const r = e === 'Total' ? V : V.filter(x => x.emp === e);
      const ap = r.filter(x => x.sv === 'APROVADA'), env = r.filter(x => x.bg !== 'Não enviado'), cn = ap.filter(x => x.con);
      const ent = count(env, x => x.bg === 'Entregue'), ins = count(env, x => x.bg === 'Insucesso');
      const pc = count(ap, x => x.pt === 'C'), pcc = count(cn, x => x.pt === 'C');
      m[e] = { vendas: r.length, aprov: ap.length, rej: count(r, x => x.sv === 'REJEITADA'), canc: count(r, x => x.sv === 'CANCELADA'), env: env.length, ent, ins, con: cn.length, pc, pcc,
        pp: count(ap, x => x.pt === 'P'), pn: count(ap, x => x.pt === 'N') };
    }
    const tl = el('div', { class: 'tiles' });
    tl.append(tileEmp('Vendas', e => ({ v: fI(m[e].vendas) })));
    tl.append(tileEmp('Aprovadas (venda aceita)', e => ({ v: fI(m[e].aprov), sub: [el('b', { text: fP(pct(m[e].aprov, m[e].vendas)) }), ' das vendas'] })));
    tl.append(tileEmp('Entregues', e => ({ v: fI(m[e].ent), sub: [el('b', { text: fP(pct(m[e].ent, m[e].env)) }), ' das enviadas'] })));
    tl.append(tileEmp('Insucesso de entrega', e => ({ v: fI(m[e].ins), sub: [el('b', { text: fP(pct(m[e].ins, m[e].env)) }), ' das enviadas'] })));
    tl.append(tileEmp('Conectadas (chip em mãos)', e => ({ v: fI(m[e].con), sub: [el('b', { text: fP(pct(m[e].con, m[e].aprov)) }), ' das aprovadas'] })));
    tl.append(tileEmp('Portabilidade concluída', e => ({ v: fI(m[e].pc), sub: [el('b', { text: fP(pct(m[e].pcc, m[e].con)) }), ' das conectadas · ', fP(pct(m[e].pc, m[e].aprov)), ' das aprovadas'] }), true));
    root.append(tl);
    const keys = [...empsShown(), ...(empsShown().length > 1 ? ['Total'] : [])];
    const rowsDef = [['Vendas', 'vendas'], ['Aprovadas', 'aprov', 'vendas', '% das vendas'], ['Rejeitadas', 'rej', 'vendas', '% das vendas'], ['Canceladas', 'canc', 'vendas', '% das vendas'],
      ['Enviadas para entrega', 'env', 'aprov', '% das aprovadas'], ['Entregues', 'ent', 'env', '% das enviadas'], ['Insucesso de entrega', 'ins', 'env', '% das enviadas'],
      ['Conectadas (chip em mãos)', 'con', 'aprov', '% das aprovadas'], ['Portabilidade concluída (entre as conectadas)', 'pcc', 'con', '% das conectadas'], ['Portabilidade concluída (entre as aprovadas)', 'pc', 'aprov', '% das aprovadas'],
      ['Portabilidade pendente', 'pp', 'aprov', '% das aprovadas'], ['Portabilidade não concluída', 'pn', 'aprov', '% das aprovadas']];
    const cols = [{ t: 'Etapa', k: 'et', l: true }, ...keys.flatMap(e => [{ t: e, k: e + 'n', f: fI }, { t: '%', k: e + 'p', f: fP }]), { t: 'Base do %', k: 'base', l: true }];
    const rows = rowsDef.map(([lab, n, b, base]) => { const o = { et: lab, base: base || '' }; keys.forEach(e => { o[e + 'n'] = m[e][n]; o[e + 'p'] = b ? pct(m[e][n], m[e][b]) : null; }); return o; });
    const [b1, c1] = box();
    root.append(el('div', { class: 'grid' }, card('Funil por empresa', 'Quantidade de cada etapa e % sobre a etapa indicada na última coluna.', table(cols, rows, { maxh: 'none' })), card('Funil em % das vendas', 'Quanto de cada 100 vendas chega a cada etapa.', b1)));
    const stages = [['Aprovadas', 'aprov'], ['Enviadas', 'env'], ['Entregues', 'ent'], ['Conectadas', 'con'], ['Port. concluída', 'pc']];
    chart(c1, { type: 'bar', data: { labels: stages.map(s => s[0]), datasets: empsShown().map(e => ({ label: e, data: stages.map(s => pct(m[e][s[1]], m[e].vendas)), backgroundColor: colEmp(e), borderRadius: 4, maxBarThickness: 32 })) }, options: { scales: { y: pctAxis(1), x: {} }, plugins: { tooltip: pctTip } } });
    const days = [...new Set(V.map(r => r.dv))].sort(); const [b2, c2] = box();
    root.append(card('Vendas por dia', null, b2));
    chart(c2, { type: 'line', data: { labels: days.map(fD), datasets: empsShown().map(e => { const g = groupBy(V.filter(r => r.emp === e), r => r.dv); return { label: e, data: days.map(d => (g.get(d) || []).length), borderColor: colEmp(e), backgroundColor: colEmp(e), pointRadius: 0, borderWidth: 2 }; }) }, options: { scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 0, autoSkip: true } } } } });
  }

  /* ================= Controle de tratativa ================= */
  const clsContato = v => v == null ? '' : v >= .6 ? 'good' : v >= .5 ? 'warn' : v < .4 ? 'bad' : '';
  const clsConc = v => v == null ? '' : v >= .6 ? 'good' : v >= .5 ? 'warn' : v < .45 ? 'bad' : '';
  function corteAtual() { const auto = nd(REF_E - 4); const c = LS.get('corte', null); return { auto, val: c || auto, manual: !!c }; }
  function rTratativa(root) {
    if (!RAW.E) return semBase('entregas', root);
    const E = filt(RAW.E, 'de');
    const corte = corteAtual();
    root.append(el('p', { class: 'lead', text: 'Base: relatório de entregas, pela data de entrega do chip. Contato efetivo = pedido com pós-venda registrado. SMS respondido = pedido com aceite de voz registrado.' }));
    const be = byEmp(E);
    const tl = el('div', { class: 'tiles' });
    tl.append(tileEmp('Contato efetivo', e => ({ v: fP(pct(count(be[e], r => r.pos), be[e].length)), sub: [el('b', { text: fI(count(be[e], r => r.pos)) }), ` de ${fI(be[e].length)} entregas`] }), true));
    tl.append(tileEmp('Aceite de voz (SMS respondido)', e => ({ v: fP(pct(count(be[e], r => r.ace), be[e].length)), sub: [el('b', { text: fI(count(be[e], r => r.ace)) }), ` de ${fI(be[e].length)} entregas`] }), true));
    tl.append(tileEmp('Portin concluída sobre a entrega', e => { const c = be[e].filter(r => r.de <= corte.val); return { v: fP(pct(count(be[e], r => r.pt === 'C'), be[e].length)), sub: [el('b', { text: fI(count(be[e], r => r.pt === 'C')) }), ' concluídas · ', el('b', { text: fP(pct(count(c, r => r.pt === 'C'), c.length)) }), ` nas entregas até ${fD(corte.val)}`] }; }, true));
    root.append(tl);

    const sp = el('div', { class: 'grid', style: 'grid-template-columns:1fr' });
    for (const e of empsShown()) {
      const r = be[e];
      const g = groupBy(r, x => x.de);
      const linha = (d, a) => { const n = a.length, c = count(a, x => x.pos), s = count(a, x => x.ace), k = count(a, x => x.pt === 'C'), p = count(a, x => x.pt === 'P'); return { d, n, c, pc: pct(c, n), s, ps: pct(s, n), pk: pct(k, n), pp: pct(p, n), k }; };
      const rows = [...g.keys()].sort().map(d => linha(fD(d), g.get(d)));
      const cut = r.filter(x => x.de <= corte.val), ck = count(cut, x => x.pt === 'C');
      const inp = el('input', { type: 'date', value: corte.val, title: 'Data de corte', onchange: ev => { LS.set('corte', ev.target.value || null); render(); } });
      const auto = corte.manual ? el('button', { class: 'btn small', onclick: () => { LS.set('corte', null); render(); } }, 'Voltar ao automático') : el('span', { class: 'note', text: '(automático)' });
      const cols = [{ t: 'Data', k: 'd', l: true }, { t: 'Entregues', k: 'n', f: fI }, { t: 'Contato efetivo', k: 'c', f: fI }, { t: '% contato', k: 'pc', f: fP, cls: clsContato },
        { t: 'SMS respondido', k: 's', f: fI }, { t: '% respondido', k: 'ps', f: fP }, { t: '% concluída x entrega', k: 'pk', f: fP, cls: clsConc }, { t: '% pendente', k: 'pp', f: fP }, { t: 'Concluída', k: 'k', f: fI }];
      sp.append(el('div', { class: 'card' }, el('h2', null, 'Controle de tratativa ', empPill(e)),
        el('div', { class: 'sumbox' }, el('span', null, 'Até ', inp), auto, el('span', null, 'Entregas ', el('b', { text: fI(cut.length) })), el('span', null, 'Concluído ', el('b', { text: fI(ck) })), el('span', null, '% concluído ', el('b', { text: fP(pct(ck, cut.length)) }))),
        table(cols, rows, { total: linha('Total', r), maxh: '620px' })));
    }
    root.append(sp);
    for (const e of empsShown()) {
      const r = be[e]; const days = [...new Set(r.map(x => x.de))].sort(); const g = groupBy(r, x => x.de);
      const [b1, c1] = box(); const [b2, c2] = box();
      root.append(el('div', { class: 'grid' },
        el('div', { class: 'card' }, el('h2', null, 'Entregues x contato efetivo ', empPill(e)), el('p', { class: 'note', text: 'Quantidade por dia de entrega. A distância entre as linhas são os clientes sem contato.' }), b1),
        el('div', { class: 'card' }, el('h2', null, 'Entregues x concluídas ', empPill(e)), el('p', { class: 'note', text: 'Quantidade por dia de entrega. Os últimos dias ainda estão dentro do prazo de conclusão.' }), b2)));
      const n = d => (g.get(d) || []).length, k = (d, f) => count(g.get(d) || [], f);
      chart(c1, { type: 'line', data: { labels: days.map(fD), datasets: [
        { label: 'Entregues', data: days.map(n), borderColor: css('--s-ent'), backgroundColor: css('--s-ent'), borderWidth: 2, pointRadius: 2 },
        { label: 'Contato efetivo', data: days.map(d => k(d, x => x.pos)), borderColor: css('--s-cont'), backgroundColor: css('--s-cont'), borderWidth: 2, pointRadius: 2 }] },
        options: { scales: { y: { beginAtZero: true }, x: {} }, plugins: { tooltip: { callbacks: { afterBody: it => { const d = days[it[0].dataIndex]; return '% contato: ' + fP(pct(k(d, x => x.pos), n(d))); } } } } } });
      chart(c2, { type: 'bar', data: { labels: days.map(fD), datasets: [
        { label: 'Entregues', data: days.map(n), backgroundColor: css('--s-ent'), borderRadius: 3, maxBarThickness: 22 },
        { label: 'Concluídas', data: days.map(d => k(d, x => x.pt === 'C')), backgroundColor: css('--s-conc'), borderRadius: 3, maxBarThickness: 22 }] },
        options: { scales: { y: { beginAtZero: true }, x: {} }, plugins: { tooltip: { callbacks: { afterBody: it => { const d = days[it[0].dataIndex]; return '% concluída: ' + fP(pct(k(d, x => x.pt === 'C'), n(d))); } } } } } });
    }
  }

  /* ================= Portabilidade ================= */
  function curva(rows, N) { const b = rows.filter(r => r.obs >= N); return pct(count(b, r => r.pt === 'C' && r.lag != null && r.lag <= N), b.length); }
  function chance(rows, N) { const b = rows.filter(r => r.obs >= N + 7); const open = b.filter(r => !(r.pt === 'C' && r.lag != null && r.lag <= N)); return pct(count(open, r => r.pt === 'C' && r.lag > N), open.length); }
  function rPort(root) {
    if (RAW.E) {
      const E = filt(RAW.E, 'de'), be = byEmp(E);
      root.append(el('p', { class: 'lead', text: 'Curvas: relatório de entregas, dias da entrega até o portin. Para cada prazo só entram entregas que já tiveram aquele número de dias. Fila de retargeting e mailings: relatório de vendas, atualizado de hora em hora.' }));
      const tl = el('div', { class: 'tiles' });
      const TT = (k, fn) => tl.append(tileEmp(k, e => ({ v: fP(fn(be[e])) })));
      TT('Concluem até D+3', r => curva(r, 3)); TT('Concluem até D+6', r => curva(r, 6)); TT('Concluem até D+10', r => curva(r, 10));
      TT('Conclusão final (entregas com 11+ dias)', r => { const b = r.filter(x => x.obs >= 11); return pct(count(b, x => x.pt === 'C'), b.length); });
      TT('Chance de concluir se aberto em D+6', r => chance(r, 6));
      root.append(tl);
      const Ns = [...Array(16).keys()]; const [b1, c1] = box(true); const [b2, c2] = box(true);
      root.append(el('div', { class: 'grid' }, card('% acumulado de conclusão por dia após a entrega', null, b1), card('Chance de um pedido ainda aberto concluir depois', 'De cada 100 pedidos sem conclusão até o dia indicado, quantos concluem depois.', b2)));
      chart(c1, { type: 'line', data: { labels: Ns.map(n => n ? 'D+' + n : 'D0'), datasets: empsShown().map(e => ({ label: e, data: Ns.map(n => curva(be[e], n)), borderColor: colEmp(e), backgroundColor: colEmp(e), pointRadius: 2, borderWidth: 2 })) }, options: { scales: { y: pctAxis(1), x: {} }, plugins: { tooltip: pctTip } } });
      chart(c2, { type: 'bar', data: { labels: Ns.slice(0, 11).map(n => n ? 'D+' + n : 'D0'), datasets: empsShown().map(e => ({ label: e, data: Ns.slice(0, 11).map(n => chance(be[e], n)), backgroundColor: colEmp(e), borderRadius: 4, maxBarThickness: 24 })) }, options: { scales: { y: pctAxis(), x: {} }, plugins: { tooltip: pctTip } } });
      root.append(el('div', { class: 'grid' }, card('Motivos de não conclusão', '% das não concluídas de cada empresa.', legendEl(), hbars(topItems(E.filter(r => r.pt === 'N'), r => r.pm || 'Sem motivo informado', 12), empsShown(), fP)),
        card('Status da ordem dos pedidos não concluídos ou pendentes', null, legendEl(), hbars(topItems(E.filter(r => r.pt !== 'C'), r => r.so || 'Sem status de ordem', 10), empsShown(), fP))));
    }
    if (RAW.V) filaRetargeting(root); else semBase('vendas', root);
    historicoMailings(root);
  }

  /* --- Fila de retargeting (vendas) --- */
  const FR_PADRAO = { so: [], soModo: 'todos', fl: [], flModo: 'excluir', mot: [], dataRef: 'dbs', ini: '', fim: '', diasMin: '' };
  function filaRetargeting(root) {
    const st = Object.assign({}, FR_PADRAO, LS.get('fila', {}));
    const salvar = () => LS.set('fila', st);
    const baseAll = RAW.V.filter(r => r.bg === 'Entregue' && r.pt === 'N' && (!F.emp || r.emp === F.emp) && (!F.eq || r.eq === F.eq) && (!F.uf || r.uf === F.uf));
    const card0 = el('div', { class: 'card', id: 'fila' });
    root.append(card0);
    const opcoes = (key, f) => [...groupBy(baseAll, r => f(r) || '(vazio)').entries()].sort((a, b) => b[1].length - a[1].length).map(([k, a]) => [k, a.length]);
    function checks(titulo, key, f, extra) {
      const fs = el('fieldset', null, el('legend', { text: titulo }));
      if (extra) fs.append(extra);
      const box = el('div', { class: 'opts' });
      for (const [k, n] of opcoes(key, f)) {
        const cb = el('input', { type: 'checkbox', checked: st[key].includes(k) });
        cb.addEventListener('change', () => { st[key] = cb.checked ? [...st[key], k] : st[key].filter(x => x !== k); salvar(); draw(); });
        box.append(el('label', null, cb, k, el('span', { class: 'c', text: fI(n) })));
      }
      fs.append(box); return fs;
    }
    const modoFl = el('select', null, el('option', { value: 'excluir', text: 'Excluir as marcadas' }), el('option', { value: 'incluir', text: 'Incluir só as marcadas' }));
    modoFl.value = st.flModo; modoFl.addEventListener('change', () => { st.flModo = modoFl.value; salvar(); draw(); });
    const dataRef = el('select', null, el('option', { value: 'dbs', text: 'Data da entrega' }), el('option', { value: 'dv', text: 'Data da venda' }), el('option', { value: 'pd', text: 'Data do último status da portabilidade' }));
    dataRef.value = st.dataRef; dataRef.addEventListener('change', () => { st.dataRef = dataRef.value; salvar(); draw(); });
    const ini = el('input', { type: 'date', value: st.ini }), fim = el('input', { type: 'date', value: st.fim }), dmin = el('input', { type: 'number', min: '0', value: st.diasMin, style: 'width:5rem' });
    ini.addEventListener('change', () => { st.ini = ini.value; salvar(); draw(); }); fim.addEventListener('change', () => { st.fim = fim.value; salvar(); draw(); }); dmin.addEventListener('change', () => { st.diasMin = dmin.value; salvar(); draw(); });
    const fbox = el('div', { class: 'fbox' },
      checks('Status da ordem (nenhum marcado = todos)', 'so', r => r.so),
      checks('Flags', 'fl', r => r.fl, el('div', null, modoFl)),
      checks('Motivo da não conclusão (nenhum marcado = todos)', 'mot', r => r.pm),
      el('fieldset', null, el('legend', { text: 'Período e prazo' }), el('label', { class: 'f' }, 'Data a considerar', dataRef), el('div', { class: 'form-row' }, el('label', { class: 'f' }, 'De', ini), el('label', { class: 'f' }, 'Até', fim)), el('label', { class: 'f' }, 'Dias mínimos desde a entrega', dmin),
        el('button', { class: 'btn small', onclick: () => { LS.set('fila', {}); render(); } }, 'Limpar filtros da fila')));
    const contador = el('div', { class: 'count-line' }), holder = el('div');
    const bCsv = el('button', { class: 'btn' }, 'Baixar lista (CSV)'), bMail = el('button', { class: 'btn primary', hidden: !podeEditar() }, 'Gerar mailing para o discador');
    const msg = el('span', { class: 'msg' });
    card0.append(el('h2', { text: 'Fila de retargeting' }), el('p', { class: 'note', text: 'Pedidos entregues com portabilidade não concluída, pelo relatório de vendas mais recente. Ignora os filtros de mês e período do topo; usa empresa, equipe e UF. Os filtros abaixo ficam guardados no seu navegador.' }),
      fbox, el('div', { class: 'toolbar' }, contador, bCsv, bMail, msg), holder);
    let lista = [];
    function aplica() {
      return baseAll.filter(r => {
        if (st.so.length && !st.so.includes(r.so || '(vazio)')) return false;
        const fl = r.fl || '(vazio)';
        if (st.fl.length && (st.flModo === 'excluir' ? st.fl.includes(fl) : !st.fl.includes(fl))) return false;
        if (st.mot.length && !st.mot.includes(r.pm || '(vazio)')) return false;
        const d = r[st.dataRef]; if (st.ini && (!d || d < st.ini)) return false; if (st.fim && (!d || d.slice(0, 10) > st.fim)) return false;
        if (st.diasMin !== '' && (!r.dbs || HOJE - dn(r.dbs) < +st.diasMin)) return false;
        return true;
      });
    }
    function draw() {
      lista = aplica().map(r => ({ p: r.p, emp: r.emp, eq: r.eq, dbs: r.dbs, dias: r.dbs ? HOJE - dn(r.dbs) : null, mot: r.pm || '', fl: r.fl || '', so: r.so || '', pos: r.pos ? 'Sim' : 'Não', ace: r.aceOp ? 'Sim' : 'Não' }));
      contador.replaceChildren(el('b', { text: fI(lista.length) }), ' pedidos · ', EMPS.map(e => `${e}: ${fI(count(lista, r => r.emp === e))}`).join(' · '));
      holder.replaceChildren(table([{ t: 'Proposta', k: 'p', l: true }, { t: 'Empresa', k: 'emp', l: true, render: v => empPill(v) }, { t: 'Equipe', k: 'eq', l: true }, { t: 'Entrega', k: 'dbs', f: fD }, { t: 'Dias', k: 'dias', f: fI },
        { t: 'Motivo', k: 'mot', l: true }, { t: 'Flag', k: 'fl', l: true }, { t: 'Status da ordem', k: 'so', l: true }, { t: 'Pós-venda', k: 'pos' }, { t: 'Aceite voz', k: 'ace' }], lista, { sortable: true, sortKey: 'dias', sortDir: -1, maxh: '460px' }));
    }
    bCsv.addEventListener('click', () => {
      const head = ['Proposta', 'Empresa', 'Equipe', 'Data entrega', 'Dias desde a entrega', 'Motivo', 'Flag', 'Status da ordem', 'Pos-venda', 'Aceite de voz'];
      const esc = v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
      const csv = '﻿' + [head, ...lista.map(r => [r.p, r.emp, r.eq, fD(r.dbs), r.dias, r.mot, r.fl, r.so, r.pos, r.ace])].map(l => l.map(esc).join(';')).join('\r\n');
      baixar(`fila_retargeting_${isoLocal(new Date())}.csv`, new Blob([csv], { type: 'text/csv' }));
    });
    bMail.addEventListener('click', async () => {
      if (!lista.length) { msg.className = 'msg err'; msg.textContent = 'A fila está vazia.'; return; }
      const props = lista.map(r => r.p);
      await gerarMailing('retargeting', props, { filtros: Object.assign({ empresa: F.emp || 'ATN + DAHA' }, st), msg });
    });
    draw();
  }

  /* ================= leitura do relatório local (para arquivos com dados de cliente) ================= */
  function escolherArquivo() {
    return new Promise(res => { const i = $('#pickIn'); i.value = ''; i.onchange = () => res(i.files[0] || null); i.click(); });
  }
  async function lerPlanilha(file, cellDates) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true, cellDates: !!cellDates });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const head = (aoa[0] || []).map(h => h == null ? '' : String(h));
    return { head, rows: aoa.slice(1).filter(r => r.some(v => v != null && v !== '')) };
  }
  const idx = (head, ...names) => { const n = head.map(h => PROC.norm(h)); for (const nm of names) { const i = n.indexOf(PROC.norm(nm)); if (i >= 0) return i; } return -1; };
  const soDig = v => v == null ? '' : String(typeof v === 'number' ? Math.round(v) : v).replace(/\D/g, '');
  const nomeMailing = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function linhasDiscador(head, rows) {
    const iP = idx(head, 'Proposta iSize', 'PROPOSTA'), iT = idx(head, 'Telefone Portabilidade', 'TELEFONE_PORTADO'), iN = idx(head, 'Cliente', 'NOME'), iL = idx(head, 'Numero linha', 'NUMERO_LINHA');
    return rows.map(r => { const tp = soDig(r[iT]); const nl = soDig(r[iL]); return [soDig(r[iP]), tp, nomeMailing(r[iN]), nl || tp].join(';'); });
  }
  async function pedirVendas(msg) {
    msg.className = 'msg'; msg.textContent = 'Escolha o relatório de vendas do dia…';
    const f = await escolherArquivo(); if (!f) { msg.textContent = ''; return null; }
    msg.textContent = 'Lendo ' + f.name + '…';
    const t = await lerPlanilha(f);
    const tipo = PROC.detect(Object.fromEntries(t.head.map(h => [h, 1])) && [Object.fromEntries(t.head.map(h => [h, 1]))]);
    if (tipo !== 'vendas') { msg.className = 'msg err'; msg.textContent = `"${f.name}" não é o relatório de vendas.`; return null; }
    return { f, ...t };
  }
  async function gerarMailing(tipo, props, opts) {
    const msg = opts.msg; const r = await pedirVendas(msg); if (!r) return;
    const iP = idx(r.head, 'Proposta iSize', 'PROPOSTA'); const set = new Set(props.map(String));
    const sel = r.rows.filter(x => set.has(soDig(x[iP])));
    const linhas = linhasDiscador(r.head, sel);
    const agora = new Date(); const nome = `BKO_TIM_POS_VENDA_${tipo}_${pad(agora.getDate())}-${pad(agora.getMonth() + 1)}${tipo === 'aceite' ? '-' + pad(agora.getHours()) + 'h' : ''}.csv`;
    baixar(nome, new Blob([linhas.join('\r\n') + '\r\n'], { type: 'text/csv' }));
    const faltam = props.length - sel.length;
    msg.className = 'msg ok'; msg.textContent = `${nome}: ${fI(linhas.length)} linhas.` + (faltam > 0 ? ` ${fI(faltam)} propostas não estavam no arquivo escolhido.` : '');
    const vmap = new Map((RAW.V || []).map(x => [x.p, x.emp]));
    const ps = sel.map(x => soDig(x[iP]));
    await sb.from('pp_mailings').insert({ tipo, arquivo: nome, filtros: opts.filtros || null, qtd: ps.length, qtd_atn: count(ps, p => (vmap.get(p) || opts.empOf?.(p)) === 'ATN'), qtd_daha: count(ps, p => (vmap.get(p) || opts.empOf?.(p)) === 'DAHA'), propostas: ps, gerado_por: ME.id });
  }
  async function historicoMailings(root) {
    const holder = el('div', null, el('p', { class: 'note', text: 'Carregando…' }));
    root.append(card('Histórico de mailings', 'Os últimos 30 mailings gerados no painel. O arquivo em si não fica guardado, porque tem dados de cliente: use "Gerar de novo" com o relatório de vendas para refazer.', holder));
    const { data, error } = await sb.from('pp_mailings').select('id,tipo,arquivo,gerado_em,qtd,qtd_atn,qtd_daha,propostas').order('id', { ascending: false }).limit(30);
    if (error) { holder.replaceChildren(el('p', { class: 'msg err', text: error.message })); return; }
    if (!data.length) { holder.replaceChildren(el('p', { class: 'note', text: 'Nenhum mailing gerado ainda.' })); return; }
    const msg = el('span', { class: 'msg' });
    holder.replaceChildren(msg, table([{ t: 'Gerado em', k: 'gerado_em', l: true, f: v => fDT(v) }, { t: 'Tipo', k: 'tipo', l: true }, { t: 'Arquivo', k: 'arquivo', l: true }, { t: 'Pedidos', k: 'qtd', f: fI }, { t: 'ATN', k: 'qtd_atn', f: fI }, { t: 'DAHA', k: 'qtd_daha', f: fI },
      { t: '', k: 'id', render: (v, r) => podeEditar() ? el('button', { class: 'btn small', onclick: () => gerarMailing(r.tipo, r.propostas || [], { msg, filtros: { refeito_de: r.id } }) }, 'Gerar de novo') : '' }], data, { maxh: '320px' }));
  }

  /* ================= Entrega e insucesso ================= */
  function rEntrega(root) {
    if (!RAW.V) return semBase('vendas', root);
    emRota(root);
    const V = filt(RAW.V, 'dv'); const env = V.filter(r => r.bg !== 'Não enviado'); const be = byEmp(env);
    root.append(el('h2', { class: 'sec-title', text: 'Entregas no período' }), el('p', { class: 'lead', text: 'Pedidos enviados à logística, pela data da venda. Insucesso = entrega cancelada, extravio ou devolução.' }));
    const tl = el('div', { class: 'tiles' });
    const T = (k, fn) => tl.append(tileEmp(k, e => fn(be[e])));
    T('Enviados', r => ({ v: fI(r.length) })); T('Entregues', r => ({ v: fP(pct(count(r, x => x.bg === 'Entregue'), r.length)) })); T('Insucesso', r => ({ v: fP(pct(count(r, x => x.bg === 'Insucesso'), r.length)) }));
    T('Finalizado com atraso', r => { const f = r.filter(x => /^Finalizado/.test(x.sep || '')); return { v: fP(pct(count(f, x => /atraso/i.test(x.sep)), f.length)) }; });
    T('Mediana venda → entrega (dias)', r => ({ v: fI(median(r.filter(x => x.dEnt != null).map(x => x.dEnt))) }));
    root.append(tl);
    const ins = env.filter(r => r.bg === 'Insucesso');
    root.append(el('div', { class: 'grid' }, card('Motivos de insucesso de entrega', '% dos insucessos de cada empresa.', legendEl(), hbars(topItems(ins, r => r.bm || 'Sem motivo', 12), empsShown(), fP)),
      card('Insucesso por forma de entrega', null, (() => { const rows = [...groupBy(env, r => r.forma || '(sem CD)').entries()].map(([k, a]) => ({ k, n: a.length, ent: pct(count(a, x => x.bg === 'Entregue'), a.length), ins: pct(count(a, x => x.bg === 'Insucesso'), a.length), med: median(a.filter(x => x.dEnt != null).map(x => x.dEnt)) }));
        return table([{ t: 'Forma de entrega', k: 'k', l: true }, { t: 'Enviados', k: 'n', f: fI }, { t: '% entregue', k: 'ent', f: fP }, { t: '% insucesso', k: 'ins', f: fP, cls: v => v >= .15 ? 'bad' : v >= .1 ? 'warn' : '' }, { t: 'Mediana dias', k: 'med', f: fI }], rows, { sortable: true, sortKey: 'n', maxh: '360px' }); })())));
    const dimTable = (key, label, min) => { const rows = [...groupBy(env, r => r[key] || '(não informado)').entries()].filter(([, a]) => a.length >= min).map(([k, a]) => { const fin = a.filter(x => /^Finalizado/.test(x.sep || '')); return { k, n: a.length, ent: pct(count(a, x => x.bg === 'Entregue'), a.length), ins: pct(count(a, x => x.bg === 'Insucesso'), a.length), atr: pct(count(fin, x => /atraso/i.test(x.sep)), fin.length), med: median(a.filter(x => x.dEnt != null).map(x => x.dEnt)) }; });
      return table([{ t: label, k: 'k', l: true }, { t: 'Enviados', k: 'n', f: fI }, { t: '% entregue', k: 'ent', f: fP }, { t: '% insucesso', k: 'ins', f: fP, cls: v => v >= .15 ? 'bad' : v >= .1 ? 'warn' : '' }, { t: '% com atraso', k: 'atr', f: fP, cls: v => v >= .5 ? 'bad' : v >= .35 ? 'warn' : '' }, { t: 'Mediana dias', k: 'med', f: fI }], rows, { sortable: true, sortKey: 'ins', maxh: '420px' }); };
    root.append(el('div', { class: 'grid' }, card('Insucesso por centro de distribuição', 'CDs com 30 envios ou mais.', dimTable('cd', 'CD', 30)), card('Insucesso por UF', 'UFs com 30 envios ou mais.', dimTable('uf', 'UF', 30))));
  }
  function emRota(root) {
    const base = RAW.V.filter(r => r.sv === 'APROVADA' && !r.con && PROC.emRotaStatus(r.bs) && (!F.emp || r.emp === F.emp) && (!F.eq || r.eq === F.eq) && (!F.uf || r.uf === F.uf));
    base.forEach(r => { r._trat = PROC.tratativa(r.bs); r._atr = r.sep === 'Com atraso' ? 'Com atraso' : 'Em dia'; r._dias = r.dmax ? HOJE - dn(r.dmax) : null; });
    const fin = RAW.V.filter(r => r.sv === 'APROVADA' && !r.con && PROC.entregaCancelada(r.bs) && (!F.emp || r.emp === F.emp));
    const hold = el('div');
    const bExp = el('button', { class: 'btn primary', hidden: !podeEditar() }, 'Exportar planilha Rota'); const msg = el('span', { class: 'msg' });
    const nomeRota = () => `Rota ${F.emp || 'Total'} ${pad(new Date().getDate())}-${pad(new Date().getMonth() + 1)}.xlsx`;
    root.append(el('h2', { class: 'sec-title', text: 'Em rota hoje' }),
      el('p', { class: 'lead', text: `Vendas aprovadas, ainda não conectadas, com status de rota na Bluechip: ${fI(base.length)} pedidos (${EMPS.map(e => e + ' ' + fI(count(base, r => r.emp === e))).join(' · ')}). Clique em um número para ver os pedidos. A exportação traz as abas Tratativa ATN, Cobrar atraso e Finalizadas (${fI(fin.length)} com entrega cancelada).` }),
      el('div', { class: 'toolbar' }, bExp, msg));
    function mostra(titulo, rows) {
      hold.replaceChildren(card(`${titulo}: ${fI(rows.length)} pedidos`, null, table([{ t: 'Proposta', k: 'p', l: true }, { t: 'Empresa', k: 'emp', l: true, render: v => empPill(v) }, { t: 'Equipe', k: 'eq', l: true }, { t: 'Status Bluechip', k: 'bs', l: true }, { t: 'Tratativa', k: '_trat', l: true },
        { t: 'Forma de entrega', k: 'forma', l: true }, { t: 'Data máxima', k: 'dmax', f: fD }, { t: 'Dias em atraso', k: '_dias', f: fI }], rows, { sortable: true, sortKey: '_dias', maxh: '380px' })));
      hold.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // 1) status x prazo
    const st = [...groupBy(base, r => r.bs).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => ({ k, a, atr: count(a, r => r._atr === 'Com atraso'), dia: count(a, r => r._atr === 'Em dia'), tot: a.length }));
    const clk = (lab, f) => (r) => mostra(lab(r), f(r));
    const t1 = table([{ t: 'Em rota', k: 'k', l: true }, { t: 'Com atraso', k: 'atr', f: fI, click: clk(r => r.k + ' · com atraso', r => r.a.filter(x => x._atr === 'Com atraso')) }, { t: 'Em dia', k: 'dia', f: fI, click: clk(r => r.k + ' · em dia', r => r.a.filter(x => x._atr === 'Em dia')) }, { t: 'Total', k: 'tot', f: fI, click: clk(r => r.k, r => r.a) }],
      st, { total: { k: 'Total geral', atr: count(base, r => r._atr === 'Com atraso'), dia: count(base, r => r._atr === 'Em dia'), tot: base.length }, maxh: 'none' });
    // 2) prazo x tratativa e status x tratativa
    const pz = ['Com atraso', 'Em dia'].map(k => { const a = base.filter(r => r._atr === k); return { k, a, sem: count(a, r => r._trat === 'Sem tratativa'), atn: count(a, r => r._trat === 'Tratativa ATN'), tot: a.length }; });
    const colsT = [{ t: 'Em rota', k: 'k', l: true }, { t: 'Sem tratativa', k: 'sem', f: fI, click: clk(r => r.k + ' · sem tratativa', r => r.a.filter(x => x._trat === 'Sem tratativa')) }, { t: 'Tratativa ATN', k: 'atn', f: fI, click: clk(r => r.k + ' · Tratativa ATN', r => r.a.filter(x => x._trat === 'Tratativa ATN')) }, { t: 'Total', k: 'tot', f: fI, click: clk(r => r.k, r => r.a) }];
    const totT = { k: 'Total geral', sem: count(base, r => r._trat === 'Sem tratativa'), atn: count(base, r => r._trat === 'Tratativa ATN'), tot: base.length };
    const t2 = table(colsT, pz, { total: totT, maxh: 'none' });
    const t3 = table(colsT, st.map(s => ({ k: s.k, a: s.a, sem: count(s.a, r => r._trat === 'Sem tratativa'), atn: count(s.a, r => r._trat === 'Tratativa ATN'), tot: s.tot })), { total: totT, maxh: 'none' });
    // 3) data máxima x forma de entrega (atraso | em dia), mapa de calor
    const formas = ['Bluechip Correios', 'Bluechip LOGGI', 'Carteiro Amigo', 'Eu Entrego', 'Motoboy', 'TEX Courier', 'Wareclouds', 'Outros', '(sem CD)'].filter(f => base.some(r => r.forma === f));
    const datas = [...new Set(base.map(r => r.dmax || '(sem data)'))].sort().reverse();
    const cols3 = [{ t: 'Data máxima', k: 'd', l: true }]; const groups = [{ t: '', span: 1 }];
    let maxA = 1, maxD = 1;
    const rows3 = datas.map(d => { const a = base.filter(r => (r.dmax || '(sem data)') === d); const o = { d: d === '(sem data)' ? d : fD(d) + '/' + d.slice(0, 4), a };
      for (const p of ['Com atraso', 'Em dia']) { let s = 0; for (const f of formas) { const n = count(a, r => r._atr === p && r.forma === f); o[p + f] = n || null; s += n; if (p === 'Com atraso') maxA = Math.max(maxA, n); else maxD = Math.max(maxD, n); } o[p + 'T'] = s || null; } o.tot = a.length; return o; });
    for (const p of ['Com atraso', 'Em dia']) {
      groups.push({ t: p, span: formas.length + 1 });
      for (const f of formas) cols3.push({ t: f, k: p + f, f: fI, style: v => v ? `background: color-mix(in srgb, ${p === 'Com atraso' ? 'var(--bad)' : 'var(--good)'} ${Math.round(10 + 55 * v / (p === 'Com atraso' ? maxA : maxD))}%, transparent)` : '', click: clk(r => `${r.d} · ${p} · ${f}`, r => r.a.filter(x => x._atr === p && x.forma === f)) });
      cols3.push({ t: p + ' total', k: p + 'T', f: fI, click: clk(r => `${r.d} · ${p}`, r => r.a.filter(x => x._atr === p)) });
    }
    cols3.push({ t: 'Total geral', k: 'tot', f: fI, click: clk(r => r.d, r => r.a) }); groups.push({ t: '', span: 1 });
    const tot3 = { d: 'Total geral', tot: base.length }; for (const p of ['Com atraso', 'Em dia']) { for (const f of formas) tot3[p + f] = count(base, r => r._atr === p && r.forma === f); tot3[p + 'T'] = count(base, r => r._atr === p); }
    const t4 = table(cols3, rows3, { total: tot3, groups, maxh: '520px' });
    root.append(el('div', { class: 'grid' }, card('Status Bluechip × prazo', null, t1), el('div', { class: 'card' }, el('h2', { text: 'Prazo e status × tratativa' }), t2, t3)),
      card('Data máxima prevista × forma de entrega', 'Vermelho: com atraso. Verde: em dia. Quanto mais forte a cor, mais pedidos.', t4), hold);
    bExp.addEventListener('click', () => exportarRota(msg, nomeRota()));
  }
  // Lê a planilha mantendo cada célula como no original (datas com o mesmo formato)
  async function lerCelulas(file) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true, cellNF: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = []; const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = 0; R <= rng.e.r; R++) { const row = ws[R] || []; const out = []; for (let C = 0; C <= rng.e.c; C++) { const c = row[C]; out.push(c && c.v != null && c.v !== '' ? { t: c.t, v: c.v, z: c.z } : null); } linhas.push(out); }
    const head = (linhas[0] || []).map(c => c ? String(c.v) : '');
    return { head, rows: linhas.slice(1).filter(r => r.some(Boolean)) };
  }
  async function exportarRota(msg, nome) {
    msg.className = 'msg'; msg.textContent = 'Escolha o relatório de vendas do dia…';
    const f = await escolherArquivo(); if (!f) { msg.textContent = ''; return; }
    msg.textContent = 'Montando a planilha…';
    const { head, rows } = await lerCelulas(f);
    const I = n => idx(head, n);
    const iBS = I('Bluechip Status'), iSV = I('Status venda'), iCon = I('Conectada'), iPl = I('Plataforma'), iEq = I('Nome Equipe'), iCD = I('CD Bluechip'), iDM = idx(head, 'Data Maxima Prevista Entrega', 'Data Maxima'), iSEP = I('Status Entrega Prevista');
    if (iBS < 0 || iSV < 0) { msg.className = 'msg err'; msg.textContent = `"${f.name}" não é o relatório de vendas.`; return; }
    const v = (r, i) => i < 0 || !r[i] ? null : r[i].v;
    const hoje = dn(isoLocal(new Date()));
    const emp = r => { const p = String(v(r, iPl) || '').trim().toUpperCase(); return p === 'ATN' || p === 'DAHA' ? p : /^DAHA/i.test(String(v(r, iEq) || '')) ? 'DAHA' : 'ATN'; };
    const okEmp = r => !F.emp || emp(r) === F.emp;
    const aprovNaoCon = r => String(v(r, iSV) || '').trim().toUpperCase() === 'APROVADA' && PROC.norm(v(r, iCon) || '') !== 'CONECTADA';
    const head2 = []; head.forEach((h, i) => { if (i === iDM) { head2.push('Data Maxima', 'Dias em atraso'); return; } head2.push(h); if (i === iBS) head2.push('Tratativa'); if (i === iCD) head2.push('Forma de Entrega'); });
    const S = x => ({ t: 's', v: x });
    const linha = r => { const out = []; const dm = PROC.toDay(v(r, iDM)); head.forEach((h, i) => { if (i === iDM) { out.push(dm ? { t: 'n', v: dn(dm) + 25569, z: 'dd/mm/yyyy' } : null, dm ? { t: 'n', v: hoje - dn(dm) } : null); return; } out.push(r[i]); if (i === iBS) out.push(S(PROC.tratativa(v(r, iBS)))); if (i === iCD) out.push(S(PROC.formaEntrega(v(r, iCD)))); }); return out; };
    const rota = rows.filter(r => okEmp(r) && aprovNaoCon(r) && PROC.emRotaStatus(v(r, iBS)));
    const trat = rota.filter(r => PROC.tratativa(v(r, iBS)) === 'Tratativa ATN').map(linha);
    const iForma = head2.indexOf('Forma de Entrega'), iDias = head2.indexOf('Dias em atraso');
    const cv = c => c ? c.v : null;
    const cobrar = rota.filter(r => PROC.tratativa(v(r, iBS)) === 'Sem tratativa' && String(v(r, iSEP) || '').trim() === 'Com atraso').map(linha).sort((a, b) => String(cv(a[iForma])).localeCompare(String(cv(b[iForma]))) || (cv(b[iDias]) || 0) - (cv(a[iDias]) || 0));
    const finalizadas = rows.filter(r => okEmp(r) && aprovNaoCon(r) && PROC.entregaCancelada(v(r, iBS)));
    const wb = XLSX.utils.book_new();
    const add = (nm, h, data) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h.map(S), ...data]), nm);
    add('Tratativa ATN', head2, trat); add('Cobrar atraso', head2, cobrar); add('Finalizadas', head, finalizadas);
    XLSX.writeFile(wb, nome);
    msg.className = 'msg ok'; msg.textContent = `${nome}: Tratativa ATN ${fI(trat.length)} · Cobrar atraso ${fI(cobrar.length)} · Finalizadas ${fI(finalizadas.length)}.`;
  }

  /* ================= Vendas e backoffice ================= */
  function rVendas(root) {
    if (!RAW.V) return semBase('vendas', root);
    rankingAceite(root);
    mailingAceite(root);
    const V = filt(RAW.V, 'dv');
    root.append(el('h2', { class: 'sec-title', text: 'Vendas no período' }));
    const sv = ['APROVADA', 'REJEITADA', 'CANCELADA', 'PENDENTE/NOVA'].map(k => { const values = {}, texts = {}; empsShown().forEach(e => { const a = V.filter(r => r.emp === e); const n = count(a, r => r.sv === k); values[e] = pct(n, a.length) || 0; texts[e] = `${fP(values[e])} · ${fI(n)}`; }); return { label: k.charAt(0) + k.slice(1).toLowerCase(), values, texts }; });
    root.append(el('div', { class: 'grid' }, card('Status da venda', '% das vendas.', legendEl(), hbars(sv, empsShown(), fP)), card('Motivos de rejeição e cancelamento', '% das vendas rejeitadas ou canceladas.', legendEl(), hbars(topItems(V.filter(r => r.sv === 'REJEITADA' || r.sv === 'CANCELADA'), r => r.mr || 'Sem motivo', 14), empsShown(), fP))));
    root.append(card('Flags de backoffice', '% das vendas com flag.', legendEl(), hbars(topItems(V.filter(r => r.fl), r => r.fl, 14), empsShown(), fP)));
    const eqRows = [...groupBy(V, r => r.eq || '(sem equipe)').entries()].map(([k, a]) => equipeRow(k, a)).filter(r => r.n >= 10);
    root.append(card('Ranking por equipe', 'Portabilidade concluída medida sobre as conectadas (chip em mãos) e sobre as aprovadas.', table(equipeCols(), eqRows, { sortable: true, sortKey: 'pcc', maxh: '460px' })));
    const vdRows = [...groupBy(V, r => r.vend || '(sem vendedor)').entries()].map(([k, a]) => equipeRow(k, a)).filter(r => r.n >= 20);
    root.append(card('Ranking por vendedor', 'Vendedores com 20 vendas ou mais no filtro.', table(equipeCols('Vendedor'), vdRows, { sortable: true, sortKey: 'pcc', maxh: '520px' })));
  }
  function equipeRow(k, a) {
    const ap = a.filter(r => r.sv === 'APROVADA'), env = a.filter(r => r.bg !== 'Não enviado'), cn = ap.filter(r => r.con);
    return { k, emp: count(a, r => r.emp === 'DAHA') > a.length / 2 ? 'DAHA' : 'ATN', n: a.length, pap: pct(ap.length, a.length), pent: pct(count(env, r => r.bg === 'Entregue'), env.length), pins: pct(count(env, r => r.bg === 'Insucesso'), env.length),
      pcon: pct(cn.length, ap.length), pcc: pct(count(cn, r => r.pt === 'C'), cn.length), ppc: pct(count(ap, r => r.pt === 'C'), ap.length), ppos: pct(count(ap, r => r.pos), ap.length), pace: pct(count(ap, r => r.aceOp), ap.length) };
  }
  const equipeCols = lbl => [{ t: lbl || 'Equipe', k: 'k', l: true }, { t: 'Empresa', k: 'emp', l: true, render: v => empPill(v) }, { t: 'Vendas', k: 'n', f: fI }, { t: '% aprov.', k: 'pap', f: fP }, { t: '% entregue', k: 'pent', f: fP },
    { t: '% insucesso', k: 'pins', f: fP, cls: v => v >= .15 ? 'bad' : v >= .1 ? 'warn' : '' }, { t: '% conectada', k: 'pcon', f: fP }, { t: '% port. / conectadas', k: 'pcc', f: fP, cls: clsConc }, { t: '% port. / aprovadas', k: 'ppc', f: fP }, { t: '% pós-venda', k: 'ppos', f: fP }, { t: '% aceite voz', k: 'pace', f: fP }];

  function rankingAceite(root) {
    const base = RAW.V.filter(r => r.aceOp && r.dacet && (!F.emp || r.emp === F.emp));
    const bh = baseHora(); const hoje = isoLocal(bh), ontem = nd(dn(hoje) - 1), hm = hmLocal(bh);
    const mes = F.mes || hoje.slice(0, 7);
    const dia = r => r.dacet.slice(0, 10), hora = r => r.dacet.slice(11, 16);
    const hojeAte = base.filter(r => dia(r) === hoje && hora(r) <= hm), ontemAte = base.filter(r => dia(r) === ontem && hora(r) <= hm), ontemTot = base.filter(r => dia(r) === ontem);
    const ems = [...empsShown(), ...(empsShown().length > 1 ? ['Total'] : [])];
    const ce = (a, e) => e === 'Total' ? a.length : count(a, r => r.emp === e);
    const tl = el('div', { class: 'tiles' });
    const tileX = (k, a, sub) => el('div', { class: 'tile hl' }, el('span', { class: 'k', text: k }), el('div', { class: 'pair' }, ems.map(e => el('div', { class: 'emp' }, el('span', { class: 'v c-' + e.toLowerCase() }, fI(ce(a, e)), el('small', { text: e })), sub ? el('span', { class: 'sub' }, sub(e)) : null))));
    tl.append(tileX(`Hoje (${fD(hoje)}) até ${hm}`, hojeAte, e => { const o = ce(ontemAte, e), h = ce(hojeAte, e); const d = h - o; return [`ontem até ${hm}: `, el('b', { text: fI(o) }), ` (${d >= 0 ? '+' : ''}${fI(d)})`]; }));
    tl.append(tileX(`Ontem (${fD(ontem)}), dia fechado`, ontemTot));
    const doMes = base.filter(r => dia(r).slice(0, 7) === mes);
    const diasEquipe = new Set(doMes.map(dia)).size || 1;
    tl.append(tileX(`Acumulado de ${mesNome(mes)}`, doMes, e => ['média por dia: ', el('b', { text: fI(ce(doMes, e) / diasEquipe) })]));
    const ops = [...new Set(base.filter(r => dia(r).slice(0, 7) === mes || dia(r) === hoje || dia(r) === ontem).map(r => r.aceOp))];
    const dias = [...new Set(doMes.map(dia))].sort();
    let diaADia = LS.get('diaADia', false);
    const rows = ops.map(op => { const a = base.filter(r => r.aceOp === op); const am = a.filter(r => dia(r).slice(0, 7) === mes); const o = { op, hoje: count(a, r => dia(r) === hoje), ontem: count(a, r => dia(r) === ontem), tot: am.length, med: am.length / diasEquipe, pc: pct(count(am, r => r.pt === 'C'), am.length) }; dias.forEach(d => o['d' + d] = count(am, r => dia(r) === d) || null); return o; });
    const maxD = Math.max(1, ...rows.flatMap(r => dias.map(d => r['d' + d] || 0)));
    const holder = el('div');
    const draw = () => {
      const cols = [{ t: 'Operador', k: 'op', l: true }, { t: 'Hoje', k: 'hoje', f: fI }, { t: 'Ontem', k: 'ontem', f: fI }, { t: 'Total do mês', k: 'tot', f: fI }, { t: 'Média/dia', k: 'med', f: fI }, { t: '% port. concluída', k: 'pc', f: fP, cls: clsConc }];
      if (diaADia) dias.forEach(d => cols.push({ t: fD(d), k: 'd' + d, f: fI, style: v => v ? `background: color-mix(in srgb, var(--s-conc) ${Math.round(8 + 50 * v / maxD)}%, transparent)` : '' }));
      const tot = { op: 'Total', hoje: hojeAte.length ? count(base, r => dia(r) === hoje) : 0, ontem: ontemTot.length, tot: doMes.length, med: doMes.length / diasEquipe, pc: pct(count(doMes, r => r.pt === 'C'), doMes.length) }; dias.forEach(d => tot['d' + d] = count(doMes, r => dia(r) === d));
      holder.replaceChildren(table(cols, rows, { sortable: true, sortKey: 'hoje', total: tot, maxh: 'none' }));
    };
    const bDia = el('button', { class: 'btn small', onclick: () => { diaADia = !diaADia; LS.set('diaADia', diaADia); bDia.textContent = diaADia ? 'Esconder dia a dia' : 'Ver dia a dia'; draw(); } }, diaADia ? 'Esconder dia a dia' : 'Ver dia a dia');
    draw();
    root.append(el('h2', { class: 'sec-title', text: 'Ranking de aceite de voz' }),
      el('p', { class: 'lead', text: `Marcações de aceite de voz por operador, pela data da marcação. Base de vendas de ${fDT(bh)}. "Hoje" conta as marcações até ${hm}.` }), tl,
      el('div', { class: 'card' }, el('div', { class: 'row1' }, el('h2', { text: 'Marcações por operador' }), bDia), holder));
  }
  function mailingAceite(root) {
    const bh = baseHora(); const limite = new Date(bh.getTime() - 24 * 3600 * 1000);
    const lim = `${isoLocal(limite)} ${hmLocal(limite)}`;
    const prev = RAW.V.filter(r => r.dvt && r.dvt >= lim && r.os1 && r.sms !== 'SIM' && !r.aceOp && (!F.emp || r.emp === F.emp));
    const msg = el('span', { class: 'msg' });
    const b = el('button', { class: 'btn primary', hidden: !podeEditar() }, 'Gerar mailing de aceite');
    b.addEventListener('click', async () => {
      const r = await pedirVendas(msg); if (!r) return;
      const I = n => idx(r.head, n);
      const iDV = I('Data venda'), iOS = I('Numero OS'), iSMS = I('SMS Previo'), iAce = I('Aceite de Voz'), iPl = I('Plataforma'), iEq = I('Nome Equipe'), iP = idx(r.head, 'Proposta iSize');
      const corte = Date.now() - 24 * 3600 * 1000;
      const emp = x => { const p = String(x[iPl] || '').trim().toUpperCase(); return p === 'ATN' || p === 'DAHA' ? p : /^DAHA/i.test(String(x[iEq] || '')) ? 'DAHA' : 'ATN'; };
      const sel = r.rows.filter(x => { const t = PROC.toDT(x[iDV]); if (!t) return false; const ms = new Date(t.replace(' ', 'T') + ':00').getTime(); return ms >= corte && /^1-/.test(String(x[iOS] || '').trim()) && String(x[iSMS] || '').trim().toUpperCase() !== 'SIM' && !PROC.txt(x[iAce]) && (!F.emp || emp(x) === F.emp); });
      const linhas = linhasDiscador(r.head, sel);
      const agora = new Date(); const nome = `BKO_TIM_POS_VENDA_aceite_${pad(agora.getDate())}-${pad(agora.getMonth() + 1)}-${pad(agora.getHours())}h.csv`;
      baixar(nome, new Blob([linhas.join('\r\n') + (linhas.length ? '\r\n' : '')], { type: 'text/csv' }));
      msg.className = 'msg ok'; msg.textContent = `${nome}: ${fI(linhas.length)} linhas.`;
      const ps = sel.map(x => soDig(x[iP])); const em = new Map(sel.map(x => [soDig(x[iP]), emp(x)]));
      await sb.from('pp_mailings').insert({ tipo: 'aceite', arquivo: nome, filtros: { empresa: F.emp || 'ATN + DAHA', regra: '24h, OS 1-, sem SMS prévio, sem aceite de voz' }, qtd: ps.length, qtd_atn: count(ps, p => em.get(p) === 'ATN'), qtd_daha: count(ps, p => em.get(p) === 'DAHA'), propostas: ps, gerado_por: ME.id });
    });
    root.append(card('Mailing de aceite de voz', 'Vendas das últimas 24 horas com número de OS (1-…), sem SMS prévio e sem aceite de voz. O arquivo sai sempre com a lista completa: apague o mailing anterior no discador e suba este.',
      el('div', { class: 'count-line' }, 'Na base de vendas de ', fDT(bh), ': ', el('b', { text: fI(prev.length) }), ' vendas (', EMPS.map(e => `${e} ${fI(count(prev, r => r.emp === e))}`).join(' · '), '). Ao gerar, o painel usa o arquivo escolhido e as 24 horas até agora.'),
      el('div', { class: 'toolbar' }, b, msg)));
  }

  /* ================= Conectadas ================= */
  function rConect(root) {
    if (!RAW.C) return semBase('conectadas', root);
    const C = filt(RAW.C, 'da'), be = byEmp(C);
    root.append(el('p', { class: 'lead', text: 'Base: relatório de conectadas, pela data da última ativação. Na ATN, a flag "reprocessado" indica reativação após a entrega.' }));
    const tl = el('div', { class: 'tiles' }); const T = (k, fn) => tl.append(tileEmp(k, e => fn(be[e])));
    T('Linhas conectadas', r => ({ v: fI(r.length) })); T('Portabilidade concluída', r => ({ v: fP(pct(count(r, x => x.pt === 'C'), r.length)) })); T('Reativadas (reprocessado)', r => ({ v: fI(count(r, x => /reprocessado/i.test(x.fl || ''))), sub: [el('b', { text: fP(pct(count(r, x => /reprocessado/i.test(x.fl || '')), r.length)) }), ' das conectadas'] }));
    T('Mediana venda → ativação (dias)', r => ({ v: fI(median(r.filter(x => x.dAt != null).map(x => x.dAt))) }));
    root.append(tl);
    const days = [...new Set(C.map(r => r.da))].sort(); const [b1, c1] = box();
    root.append(card('Ativações por dia', 'Primeira ativação e reativação (reprocessado) separadas.', b1));
    const ds = []; empsShown().forEach(e => { const a = be[e]; const g1 = groupBy(a.filter(x => !/reprocessado/i.test(x.fl || '')), x => x.da), g2 = groupBy(a.filter(x => /reprocessado/i.test(x.fl || '')), x => x.da);
      ds.push({ label: e + ' · primeira ativação', data: days.map(d => (g1.get(d) || []).length), backgroundColor: colEmp(e), stack: e, borderRadius: 3, maxBarThickness: 18 });
      ds.push({ label: e + ' · reativação', data: days.map(d => (g2.get(d) || []).length), backgroundColor: `color-mix(in srgb, ${colEmp(e)} 45%, transparent)`, stack: e, borderRadius: 3, maxBarThickness: 18 }); });
    chart(c1, { type: 'bar', data: { labels: days.map(fD), datasets: ds }, options: { scales: { y: { beginAtZero: true, stacked: true }, x: { stacked: true } } } });
    root.append(card('Motivos de não conclusão entre as conectadas', null, legendEl(), hbars(topItems(C.filter(r => r.pt === 'N'), r => r.pm || 'Sem motivo', 12), empsShown(), fP)));
  }

  /* ================= Pontos de melhoria ================= */
  function rMelhoria(root) {
    const out = [];
    const perEmp = fn => empsShown().map(e => `${e} ${fn(e)}`).join(' · ');
    if (RAW.V) {
      const V = filt(RAW.V, 'dv');
      const rt = RAW.V.filter(r => r.bg === 'Entregue' && r.pt === 'N' && (!F.emp || r.emp === F.emp));
      out.push({ sev: 'bad', t: 'Fila de retargeting', big: fI(rt.length) + ' pedidos', p: `Entregues com portabilidade não concluída (${perEmp(e => fI(count(rt, r => r.emp === e)))}).`, a: 'Filtrar na aba Portabilidade e gerar o mailing BKO_TIM_POS_VENDA_retargeting.' });
      const env = V.filter(r => r.bg !== 'Não enviado'), ins = env.filter(r => r.bg === 'Insucesso');
      out.push({ sev: pct(ins.length, env.length) > .1 ? 'bad' : 'warn', t: 'Insucesso de entrega', big: fP(pct(ins.length, env.length)) + ' dos envios', p: `Principais motivos: ${topItems(ins, r => r.bm || 'Sem motivo', 2).map(t => t.label).join(' e ')}.`, a: 'Validar endereço na venda e tratar os casos de Tratativa ATN da aba Entrega.' });
      const rota = RAW.V.filter(r => r.sv === 'APROVADA' && !r.con && PROC.emRotaStatus(r.bs) && (!F.emp || r.emp === F.emp));
      out.push({ sev: 'warn', t: 'Em rota com atraso', big: fI(count(rota, r => r.sep === 'Com atraso')) + ' pedidos', p: `${fI(count(rota, r => PROC.tratativa(r.bs) === 'Tratativa ATN'))} pedidos em rota dependem de tratativa da ATN.`, a: 'Exportar a planilha Rota e cobrar as transportadoras.' });
      const ap = V.filter(r => r.sv === 'APROVADA'), cn = ap.filter(r => r.con); const media = pct(count(cn, r => r.pt === 'C'), cn.length);
      const abaixo = [...groupBy(cn, r => r.eq).entries()].filter(([, a]) => a.length >= 50).map(([k, a]) => ({ k, v: pct(count(a, r => r.pt === 'C'), a.length) })).filter(x => x.v < media - .05).sort((a, b) => a.v - b.v);
      out.push({ sev: abaixo.length ? 'warn' : 'good', t: 'Equipes abaixo da média', big: abaixo.length + (abaixo.length === 1 ? ' equipe' : ' equipes'), p: abaixo.length ? `Portabilidade concluída entre as conectadas: média ${fP(media)}. Abaixo: ${abaixo.map(x => `${x.k} (${fP(x.v)})`).join(', ')}.` : `Nenhuma equipe 5 pontos abaixo da média (${fP(media)}).`, a: 'Comparar contato pós-venda e aceite de voz dessas equipes no ranking.' });
      const rej = V.filter(r => ['Já Possui Os', 'Nao Retirado Nos Correios', 'Endereco Errado'].includes(r.mr));
      out.push({ sev: 'warn', t: 'Rejeições evitáveis', big: fI(rej.length) + ' vendas', p: `"Já possui OS", "Não retirado nos Correios" ou "Endereço errado": ${fP(pct(rej.length, V.length))} das vendas.`, a: 'Checar OS existente e endereço completo antes de finalizar a venda.' });
    }
    if (RAW.E) {
      const E = filt(RAW.E, 'de'), M = E.filter(r => r.obs >= 11);
      const cmp = f => { const a = M.filter(f), b = M.filter(r => !f(r)); return [pct(count(a, r => r.pt === 'C'), a.length), pct(count(b, r => r.pt === 'C'), b.length)]; };
      const [p1, p2] = cmp(r => r.pos); out.push({ sev: 'warn', t: 'Contato pós-venda', big: fP(pct(count(E, r => !r.pos), E.length)) + ' sem contato', p: `Com contato efetivo a conclusão é ${fP(p1)}; sem contato, ${fP(p2)}.`, a: 'Priorizar o contato até D+1 da entrega.' });
      const [a1, a2] = cmp(r => r.ace); out.push({ sev: 'warn', t: 'Aceite de voz', big: fP(pct(count(E, r => r.ace), E.length)) + ' com aceite', p: `Quem tem aceite conclui ${fP(a1)}; sem aceite, ${fP(a2)}.`, a: 'Subir o mailing de aceite de hora em hora.' });
      const nn = E.filter(r => r.pt === 'N'), sr = count(nn, r => r.pm === 'Sem resposta do SMS');
      out.push({ sev: 'bad', t: 'Principal motivo de não conclusão', big: fP(pct(sr, nn.length)), p: `"Sem resposta do SMS" em ${fI(sr)} de ${fI(nn.length)} não concluídas.`, a: 'Reforçar a orientação do SMS no pós-venda.' });
    }
    if (!out.length) return semBase('vendas', root);
    root.append(el('p', { class: 'lead', text: 'Pontos calculados com os filtros atuais.' }), el('div', { class: 'insights' }, out.map(o => el('div', { class: 'card ins ' + o.sev }, el('h3', { text: o.t }), el('div', { class: 'big', text: o.big }), el('p', { text: o.p }), el('p', { class: 'acao' }, el('b', { text: 'Ação: ' }), o.a)))));
  }

  const RENDER = { geral: rGeral, tratativa: rTratativa, port: rPort, entrega: rEntrega, vendas: rVendas, conect: rConect, melhoria: rMelhoria };
  function render() {
    destroyCharts();
    const root = $('#content'); root.replaceChildren();
    const sec = el('div', { style: 'display:flex;flex-direction:column;gap:18px' }); root.append(sec);
    if (!RENDER[TAB]) TAB = 'geral';
    try { RENDER[TAB](sec); } catch (e) { console.error(e); sec.append(el('p', { class: 'msg err', text: 'Não foi possível montar esta aba: ' + e.message })); }
  }

  /* ================= upload ================= */
  const PEND = {};
  const NOMES = { vendas: 'Vendas', entregas: 'Entregas de chip', conectadas: 'Conectadas', gross: 'Gross TIM' };
  function slots() { $('#slots').replaceChildren(...['vendas', 'entregas', 'conectadas'].map(k => el('div', { class: 'slot' + (PEND[k] ? ' ok' : '') }, el('b', { text: NOMES[k] }), el('div', { class: 'nm', text: PEND[k] ? `${PEND[k].nome} · ${fI(PEND[k].raw.length)} linhas` : (CARGAS[k] ? `atual: ${fDT(CARGAS[k].enviado_em)}` : 'sem base') })))); }
  $('#btnUpd').addEventListener('click', () => { $('#upPanel').hidden = false; slots(); $('#upPanel').scrollIntoView({ block: 'start' }); });
  $('#btnFechar').addEventListener('click', () => { $('#upPanel').hidden = true; });
  $('#btnEscolher').addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', e => handleFiles(e.target.files));
  const up = $('#upPanel');
  ['dragenter', 'dragover'].forEach(t => up.addEventListener(t, e => { e.preventDefault(); up.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => up.addEventListener(t, e => { e.preventDefault(); up.classList.remove('drag'); }));
  up.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  const upMsg = (t, cls) => { const m = $('#upMsg'); m.textContent = t; m.className = 'msg' + (cls ? ' ' + cls : ''); };
  async function handleFiles(list) {
    for (const f of list) {
      upMsg('Lendo ' + f.name + '…');
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', dense: true });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: null });
        const tipo = PROC.detect(raw);
        if (tipo === 'gross') { upMsg(`"${f.name}" é a base de gross da TIM. Ela entra na próxima etapa do painel.`, 'err'); continue; }
        if (!tipo) { upMsg(`Não reconheci "${f.name}". Confira se é o relatório de vendas, entregas ou conectadas.`, 'err'); continue; }
        PEND[tipo] = { raw, nome: f.name };
      } catch (e) { upMsg(`Não consegui ler "${f.name}": ${e.message}`, 'err'); }
    }
    slots();
    const n = Object.keys(PEND).length; $('#btnPublicar').disabled = !n;
    if (n) upMsg(`${n} relatório(s) pronto(s). Clique em Publicar.`);
  }
  $('#btnPublicar').addEventListener('click', async () => {
    const b = $('#btnPublicar'); b.disabled = true;
    try {
      for (const tipo of Object.keys(PEND)) {
        upMsg(`Processando ${NOMES[tipo]}…`); await new Promise(r => setTimeout(r, 20));
        const base = PROC.build(tipo, PEND[tipo].raw);
        const blob = await gzip(JSON.stringify(base));
        const path = `cargas/${tipo}/${Date.now()}.json.gz`;
        upMsg(`Enviando ${NOMES[tipo]}…`);
        const upr = await sb.storage.from(CFG.bucket).upload(path, blob, { contentType: 'application/gzip', upsert: false });
        if (upr.error) throw upr.error;
        const ins = await sb.from('pp_cargas').insert({ tipo, path, arquivo: PEND[tipo].nome, linhas: base.t.n, bytes: blob.size, enviado_por: ME.id });
        if (ins.error) throw ins.error;
        try { const ls = await sb.storage.from(CFG.bucket).list(`cargas/${tipo}`, { limit: 100, sortBy: { column: 'name', order: 'desc' } }); const velhos = (ls.data || []).map(o => `cargas/${tipo}/${o.name}`).filter(p => p !== path).slice(1); if (velhos.length) await sb.storage.from(CFG.bucket).remove(velhos); } catch (e) {}
        delete PEND[tipo];
      }
      upMsg('Publicado. Todos que abrirem o painel já veem os números novos.', 'ok');
      $('#fileIn').value = ''; slots(); await carregar();
    } catch (e) { upMsg('Não foi possível publicar: ' + (e.message || e), 'err'); b.disabled = false; }
  });

  /* ================= usuários (admin) ================= */
  async function fn(body) { const { data, error } = await sb.functions.invoke('pp-usuarios', { body }); if (error) throw new Error(await lerErro(error)); if (data && data.erro) throw new Error(data.erro); return data; }
  $('#btnUsers').addEventListener('click', async () => {
    const msg = el('span', { class: 'msg' }), lista = el('div', null, el('p', { class: 'note', text: 'Carregando…' }));
    const em = el('input', { type: 'email', placeholder: 'email@atncontactcenter.com.br' }), nm = el('input', { type: 'text', placeholder: 'Nome' }), pp = el('select', null, el('option', { value: 'leitor', text: 'Leitor (só consulta)' }), el('option', { value: 'editor', text: 'Editor (sobe relatórios e gera mailings)' }), el('option', { value: 'admin', text: 'Administrador' })), sn = el('input', { type: 'text', placeholder: 'mínimo 8 caracteres' });
    const recarregar = async () => { try { const { usuarios } = await fn({ acao: 'listar' }); lista.replaceChildren(table([{ t: 'Nome', k: 'nome', l: true }, { t: 'E-mail', k: 'email', l: true },
      { t: 'Perfil', k: 'papel', l: true, render: (v, r) => { const s = el('select', null, ['leitor', 'editor', 'admin'].map(p => el('option', { value: p, text: p }))); s.value = v; s.addEventListener('change', async () => { try { await fn({ acao: 'atualizar', user_id: r.user_id, papel: s.value }); msg.className = 'msg ok'; msg.textContent = 'Perfil alterado.'; } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; s.value = v; } }); return s; } },
      { t: 'Ativo', k: 'ativo', render: (v, r) => el('button', { class: 'btn small', onclick: async () => { try { await fn({ acao: 'atualizar', user_id: r.user_id, ativo: !v }); recarregar(); } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; } } }, v ? 'Ativo · desativar' : 'Inativo · ativar') },
      { t: '', k: 'user_id', render: (v, r) => el('span', { class: 'toolbar' }, el('button', { class: 'btn small', onclick: async () => { const s = window.prompt ? null : null; const nova = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 8).toUpperCase(); try { await fn({ acao: 'senha', user_id: v, senha: nova }); msg.className = 'msg ok'; msg.textContent = `Nova senha de ${r.email}: ${nova}`; } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; } } }, 'Gerar nova senha'),
        el('button', { class: 'btn small danger', onclick: async ev => { if (ev.currentTarget.dataset.c !== '1') { ev.currentTarget.dataset.c = '1'; ev.currentTarget.textContent = 'Confirmar exclusão'; return; } try { await fn({ acao: 'excluir', user_id: v }); recarregar(); } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; } } }, 'Excluir')) }], usuarios, { maxh: '420px' })); } catch (e) { lista.replaceChildren(el('p', { class: 'msg err', text: e.message })); } };
    modal('Usuários do painel',
      el('p', { class: 'note', text: 'Cadastre cada pessoa com uma senha provisória e envie para ela. Depois do primeiro acesso, ela pode trocar a senha em "Trocar senha".' }),
      el('div', { class: 'form-row' }, el('label', null, 'E-mail', em), el('label', null, 'Nome', nm), el('label', null, 'Perfil', pp), el('label', null, 'Senha provisória', sn),
        el('button', { class: 'btn primary', onclick: async () => { try { await fn({ acao: 'criar', email: em.value, nome: nm.value, papel: pp.value, senha: sn.value }); msg.className = 'msg ok'; msg.textContent = `Usuário ${em.value} criado.`; em.value = nm.value = sn.value = ''; recarregar(); } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; } } }, 'Cadastrar')),
      msg, lista);
    recarregar();
  });

  boot();
})();
