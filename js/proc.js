/* Leitura dos relatórios → base desidentificada (sem nome, CPF, telefone, endereço).
   Usado no navegador (upload) e nos testes em Node. */
(function (root) {
  'use strict';
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

  function pick(row, keys) {
    for (const k of keys) { const v = row[k]; if (v !== undefined && v !== null && v !== '') return v; }
    return null;
  }
  function normRows(rows) {
    return rows.map(r => { const o = {}; for (const k in r) { const nk = norm(k); if (!(nk in o) || o[nk] === null || o[nk] === '') o[nk] = r[k]; } return o; });
  }

  const pad = n => String(n).padStart(2, '0');
  function serialParts(n) {
    const ms = Math.round((n - 25569) * 86400000);
    const d = new Date(ms);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
  }
  // Data → 'AAAA-MM-DD'
  function toDay(v, defYear) {
    const t = toDT(v, defYear);
    return t ? t.slice(0, 10) : null;
  }
  // Data e hora → 'AAAA-MM-DD HH:MM'
  function toDT(v, defYear) {
    if (v === null || v === undefined || v === '' || v === '-' || v === false) return null;
    if (typeof v === 'number') {
      if (!(v > 20000 && v < 80000)) return null;
      const [y, m, d, h, mi] = serialParts(v);
      return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(mi)}`;
    }
    if (v instanceof Date) return isNaN(v) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}`;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) { let y = m[3] ? +m[3] : (defYear || new Date().getFullYear()); if (y < 100) y += 2000; return `${y}-${pad(m[2])}-${pad(m[1])} ${pad(m[4] || 0)}:${pad(m[5] || 0)}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}`;
    return null;
  }
  const txt = v => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === '' || s === '-' ? null : s.replace(/\s+/g, ' '); };
  const yes = v => { const t = txt(v); return t ? /^(SIM|S)$/i.test(t) : null; };

  function empresa(plat, equipe) {
    const p = (txt(plat) || '').toUpperCase();
    if (p === 'ATN' || p === 'DAHA') return p;
    return /^DAHA/i.test(txt(equipe) || '') ? 'DAHA' : 'ATN';
  }
  function portab(v) {
    const t = norm(v || '');
    if (!t) return 'S';
    if (t.includes('NAO CONCLUIDA')) return 'N';
    if (t.includes('CONCLUIDA')) return 'C';
    if (t.includes('PENDENTE')) return 'P';
    return 'S';
  }
  const MOTIVO_FIX = [[/^portado$/i, 'Portado'], [/^falha parcial$/i, 'Falha Parcial'], [/^portabill?idade de n[uú]mero vago$/i, 'Número vago'],
    [/^sem resposta do sms do cliente$/i, 'Sem resposta do SMS'], [/^rejei[cç][aã]o do cliente via sms$/i, 'Cliente rejeitou via SMS'],
    [/^cancelamento pelo cliente$/i, 'Cancelamento pelo cliente'], [/^cancelamento autom[aá]tico pela bdr$/i, 'Cancelamento automático BDR'],
    [/^portabilidade suspensa$/i, 'Portabilidade suspensa'], [/^portabilidade cancelada$/i, 'Portabilidade cancelada'], [/^portabilidade pendente$/i, 'Pendente'],
    [/^cpf inv[aá]lido$/i, 'CPF inválido'], [/^tipo de cliente inv[aá]lido$/i, 'Tipo de cliente inválido'], [/^conflito$/i, 'Conflito']];
  function complemento(v, defYear) {
    const s = txt(v); if (!s) return [null, null];
    const m = s.match(/^(.*?)[\s\-–]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*$/);
    let mot = (m ? m[1] : s).replace(/[\s\-–]+$/, '').trim();
    for (const [re, rep] of MOTIVO_FIX) if (re.test(mot)) { mot = rep; break; }
    return [mot || null, m ? toDay(m[2], defYear) : null];
  }
  function bluechip(st) {
    const s = txt(st); if (!s) return ['Não enviado', null];
    const n = norm(s);
    if (n === 'PEDIDO ENTREGUE' || n === 'ENTREGUE') return ['Entregue', null];
    if (/^ENTREGA CANCELADA/.test(n) || /EXTRAVI|DEVOLU|DEVOLVIDO|RECUSADO|INEFICIENTE/.test(n)) {
      let m = s.replace(/^Entrega Cancelada\s*[-–]?\s*/i, '').trim();
      if (!m || /^Entrega Cancelada$/i.test(s)) m = 'Cancelada (sem motivo)';
      if (/n[aã]o postado/i.test(m)) m = 'Não postado - endereço inválido';
      if (/extravi/i.test(m)) m = 'Extravio';
      if (/^endere[cç]o (inv[aá]lido|incorreto)$/i.test(m) || /problema endere/i.test(m)) m = 'Endereço inválido/incorreto';
      if (/devolu|devolvido|ponto de coleta/i.test(m)) m = 'Devolução';
      if (/desconhec/i.test(m)) m = 'Destinatário desconhece';
      if (/risco/i.test(m)) m = 'Área/situação de risco';
      if (/mudou/i.test(m)) m = 'Cliente mudou-se';
      if (/recus/i.test(m)) m = 'Cliente recusou';
      if (/n[aã]o retirada/i.test(m)) m = 'Não retirado na agência';
      if (/ausente/i.test(m)) m = 'Cliente ausente';
      if (/suspens/i.test(m)) m = 'Suspensão de entrega';
      return ['Insucesso', m];
    }
    return ['Em trânsito', null];
  }

  /* Regras da logística (relatório "em rota") */
  const EM_ROTA = ['Aguardando retirada Correios', 'Cliente Ausente', 'Cliente Mudou-se', 'Coletado', 'Desconsiderar Status Anterior', 'Destinatário Desconhecido',
    'Em rota de entrega', 'Em Trânsito', 'Endereço incorreto', 'Endereço inválido', 'Força Maior - Intempéries Naturais', 'Pedido aceito', 'Pedido Integrado',
    'Recebido na base de transferencia da Transportadora', 'Situação de Risco', 'SLA Atualizado Correios'].map(norm);
  const TRATATIVA_ATN = ['Aguardando retirada Correios', 'Cliente Ausente', 'Cliente Mudou-se', 'Destinatário Desconhecido', 'Endereço incorreto', 'Endereço inválido', 'Situação de Risco'].map(norm);
  const emRotaStatus = s => !!s && EM_ROTA.includes(norm(s));
  const tratativa = s => (s && TRATATIVA_ATN.includes(norm(s))) ? 'Tratativa ATN' : 'Sem tratativa';
  const entregaCancelada = s => !!s && /^ENTREGA CANCELADA/.test(norm(s));
  function formaEntrega(cd) {
    const c = norm(cd || '');
    if (!c) return '(sem CD)';
    if (/^ROTALOG DESPACHO/.test(c)) return 'Bluechip Correios';
    if (/^ROTALOG/.test(c) || /^50 MAIS/.test(c) || /^CSS/.test(c)) return 'Motoboy';
    if (/^LOGGI/.test(c)) return 'Bluechip LOGGI';
    if (/^CARTEIRO/.test(c)) return 'Carteiro Amigo';
    if (/^EU ENTREGO/.test(c)) return 'Eu Entrego';
    if (/^TEX/.test(c)) return 'TEX Courier';
    if (/^WARECLOUDS/.test(c)) return 'Wareclouds';
    return 'Outros';
  }

  function encode(rows, cols) {
    const out = { n: rows.length, cols: {}, dict: {} };
    for (const c of cols) {
      const map = new Map(), dict = [], arr = new Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        let v = rows[i][c]; if (v === undefined) v = null;
        const key = v === null ? '\u0000' : (typeof v) + ':' + v;
        let ix = map.get(key);
        if (ix === undefined) { ix = dict.length; dict.push(v); map.set(key, ix); }
        arr[i] = ix;
      }
      out.cols[c] = arr; out.dict[c] = dict;
    }
    return out;
  }
  function decode(t) {
    const cols = Object.keys(t.cols), rows = new Array(t.n);
    for (let i = 0; i < t.n; i++) { const o = {}; for (const c of cols) o[c] = t.dict[c][t.cols[c][i]]; rows[i] = o; }
    return rows;
  }

  function procVendas(raw) {
    return normRows(raw).map(r => {
      const eq = txt(pick(r, ['NOME EQUIPE', 'EQUIPE']));
      const [pm, pd] = complemento(pick(r, ['COMPLEMENTO PORTABILIDADE']));
      const bs = txt(pick(r, ['BLUECHIP STATUS']));
      const [bg, bm] = bluechip(bs);
      const os = txt(pick(r, ['NUMERO OS']));
      const cd = txt(pick(r, ['CD BLUECHIP']));
      return {
        p: txt(pick(r, ['PROPOSTA ISIZE', 'PROPOSTA'])),
        dv: toDay(pick(r, ['DATA VENDA'])), dvt: toDT(pick(r, ['DATA VENDA'])),
        emp: empresa(pick(r, ['PLATAFORMA']), eq), eq,
        sup: txt(pick(r, ['NOME SUPERVISOR'])), vend: txt(pick(r, ['NOME VENDEDOR', 'VENDEDOR'])),
        uf: txt(pick(r, ['UF'])),
        sv: txt(pick(r, ['STATUS VENDA'])), mr: txt(pick(r, ['MOTIVO REJEICAO CANCELAMENTO'])),
        fl: txt(pick(r, ['FLAG'])),
        con: norm(pick(r, ['CONECTADA']) || '') === 'CONECTADA', dcon: toDay(pick(r, ['DATA CONECTADA'])),
        bs, bg, bm, dbs: toDay(pick(r, ['BLUECHIP DATA STATUS'])),
        sep: txt(pick(r, ['STATUS ENTREGA PREVISTA'])), cd, forma: bs ? formaEntrega(cd) : null,
        dmax: toDay(pick(r, ['DATA MAXIMA PREVISTA ENTREGA', 'DATA MAXIMA'])),
        qr: Number(pick(r, ['QTD REMESSAS'])) || null,
        pt: portab(pick(r, ['PORTABILIDADE'])), pm, pd,
        pa: yes(pick(r, ['PORTABILIDADE ANTECIPADA', 'PORT ANTECIPADA'])),
        sms: txt(pick(r, ['SMS PREVIO'])),
        aceOp: txt(pick(r, ['ACEITE DE VOZ'])), dacet: toDT(pick(r, ['DATA ACEITE VOZ'])),
        pos: !!txt(pick(r, ['POS VENDA'])),
        so: txt(pick(r, ['STATUS ORDEM', 'STATUS DA ORDEM'])), chip: txt(pick(r, ['TIPO CHIP'])),
        os1: !!os && /^1-/.test(os),
        dg: toDay(pick(r, ['MARCADO GROSS'])),
        nt: txt(pick(r, ['NUMERO TEMPORARIO'])), abr: txt(pick(r, ['STATUS ABR']))
      };
    }).filter(r => r.p || r.dv);
  }
  function procEntregas(raw) {
    return normRows(raw).map(r => {
      const eq = txt(pick(r, ['EQUIPE']));
      const [pm, pd] = complemento(pick(r, ['COMPLEMENTO PORTABILIDADE']));
      return {
        p: txt(pick(r, ['PROPOSTA'])), dv: toDay(pick(r, ['DATA VENDA'])), de: toDay(pick(r, ['DATA ENTREGA'])),
        emp: empresa(pick(r, ['PLATAFORMA CONECTADA', 'PLATAFORMA']), eq), eq,
        ace: !!txt(pick(r, ['ACEITE DE VOZ'])), pos: !!txt(pick(r, ['POS VENDA'])),
        pt: portab(pick(r, ['PORTABILIDADE'])), pm, pd,
        fl: txt(pick(r, ['FLAG'])), sms: txt(pick(r, ['SMS PREVIO'])), so: txt(pick(r, ['STATUS DA ORDEM', 'STATUS ORDEM'])),
        pa: yes(pick(r, ['PORT ANTECIPADA', 'PORTABILIDADE ANTECIPADA'])), chip: txt(pick(r, ['TIPO CHIP']))
      };
    }).filter(r => r.de);
  }
  function procConectadas(raw) {
    return normRows(raw).map(r => {
      const eq = txt(pick(r, ['EQUIPE']));
      const [pm, pd] = complemento(pick(r, ['COMPLEMENTO PORTABILIDADE']));
      const qa = txt(pick(r, ['QUEM ATIVOU']));
      return {
        p: txt(pick(r, ['PROPOSTA'])), dv: toDay(pick(r, ['DATA VENDA'])), da: toDay(pick(r, ['DATA ATIVACAO'])),
        emp: empresa(pick(r, ['PLATAFORMA CONECTADA', 'PLATAFORMA']), eq), eq,
        ace: !!txt(pick(r, ['ACEITE DE VOZ'])), pos: !!txt(pick(r, ['POS VENDA'])),
        pt: portab(pick(r, ['PORTABILIDADE'])), pm, pd,
        fl: txt(pick(r, ['FLAG'])), so: txt(pick(r, ['STATUS DA ORDEM', 'STATUS ORDEM'])),
        chip: txt(pick(r, ['TIPO CHIP'])), nt: txt(pick(r, ['NUMERO TEMPORARIO'])), auto: qa ? /administrador/i.test(qa) : null
      };
    }).filter(r => r.da);
  }

  function detect(raw) {
    const h = Object.keys(raw[0] || {}).map(norm);
    if (h.includes('DS DIMENSAO INDICADOR') || h.includes('NR ACESSO')) return 'gross';
    if (h.includes('BLUECHIP STATUS') || h.includes('STATUS VENDA')) return 'vendas';
    if (h.includes('DATA ATIVACAO')) return 'conectadas';
    if (h.includes('DATA ENTREGA')) return 'entregas';
    return null;
  }

  const COLS = {
    vendas: ['p', 'dv', 'dvt', 'emp', 'eq', 'sup', 'vend', 'uf', 'sv', 'mr', 'fl', 'con', 'dcon', 'bs', 'bg', 'bm', 'dbs', 'sep', 'cd', 'forma', 'dmax', 'qr', 'pt', 'pm', 'pd', 'pa', 'sms', 'aceOp', 'dacet', 'pos', 'so', 'chip', 'os1', 'dg', 'nt', 'abr'],
    entregas: ['p', 'dv', 'de', 'emp', 'eq', 'ace', 'pos', 'pt', 'pm', 'pd', 'fl', 'sms', 'so', 'pa', 'chip'],
    conectadas: ['p', 'dv', 'da', 'emp', 'eq', 'ace', 'pos', 'pt', 'pm', 'pd', 'fl', 'so', 'chip', 'nt', 'auto']
  };
  const PROC_FN = { vendas: procVendas, entregas: procEntregas, conectadas: procConectadas };
  function build(tipo, raw) { return { versao: 2, tipo, t: encode(PROC_FN[tipo](raw), COLS[tipo]) }; }

  root.PROC = { norm, txt, toDay, toDT, complemento, bluechip, procVendas, procEntregas, procConectadas, detect, encode, decode, build,
    emRotaStatus, tratativa, entregaCancelada, formaEntrega, normRows, pick };
})(typeof window !== 'undefined' ? window : globalThis);
