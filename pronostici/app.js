/* ============================================================
   Pronostici — value betting tool (vanilla JS, offline-first)
   Tutta la logica è qui. Dati salvati in localStorage.
   ============================================================ */

'use strict';

/* ---------- Stato & persistenza ---------- */
const STORE_KEY = 'pronostici_state_v1';

const DEFAULT_STATE = {
  settings: {
    bankroll: 100,        // bankroll iniziale (€)
    kelly: 0.25,          // frazione di Kelly
    apiKey: '',           // The Odds API
  },
  bets: [],               // {id,date,sport,event,selection,odds,stake,result,note,createdAt}
  sports: [],             // cache lista sport attivi da the-odds-api
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // merge difensivo
    return {
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      bets: Array.isArray(parsed.bets) ? parsed.bets : [],
      sports: Array.isArray(parsed.sports) ? parsed.sports : [],
    };
  } catch (e) {
    console.warn('Stato corrotto, riparto pulito', e);
    return structuredClone(DEFAULT_STATE);
  }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* ---------- Utility ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const eur = (n) => (n >= 0 ? '€' : '-€') + Math.abs(n).toFixed(2);
const pct = (n) => (n * 100).toFixed(1) + '%';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============================================================
   MATEMATICA DEL BETTING
   ============================================================ */

// Probabilità implicita da quota decimale
const impliedProb = (odds) => 1 / odds;

// Rimuove il margine da un set di quote -> probabilità "vere" (somma = 1)
function noVig(oddsArray) {
  const inv = oddsArray.map(o => 1 / o);
  const overround = inv.reduce((a, b) => a + b, 0); // > 1
  const margin = overround - 1;
  const probs = inv.map(x => x / overround);
  return { probs, margin, fairOdds: probs.map(p => 1 / p) };
}

// Value: dato p (0..1) e quota O -> edge (ROI atteso) e frazione di Kelly
function valueOf(prob, odds) {
  const edge = prob * odds - 1;             // EV netto per 1€ puntato
  const kelly = (prob * odds - 1) / (odds - 1); // frazione ottimale
  return { edge, kelly: Math.max(0, kelly) };
}

// Stake consigliato in €
function stakeFor(kellyFraction, prob, odds) {
  const { kelly } = valueOf(prob, odds);
  const bankroll = currentBankroll();
  return Math.max(0, kelly * kellyFraction * bankroll);
}

/* ============================================================
   STATISTICHE REGISTRO
   ============================================================ */

// profitto netto di una singola giocata (solo se conclusa)
function betProfit(b) {
  switch (b.result) {
    case 'win':  return b.stake * (b.odds - 1);
    case 'loss': return -b.stake;
    case 'void': return 0;
    default:     return 0; // pending
  }
}

function computeStats() {
  const settled = state.bets.filter(b => b.result === 'win' || b.result === 'loss');
  const wins = settled.filter(b => b.result === 'win').length;
  const losses = settled.filter(b => b.result === 'loss').length;
  const turnover = settled.reduce((s, b) => s + b.stake, 0);
  const profit = state.bets.reduce((s, b) => s + betProfit(b), 0);
  const roi = turnover > 0 ? profit / turnover : 0;
  const winRate = (wins + losses) > 0 ? wins / (wins + losses) : 0;
  const open = state.bets.filter(b => b.result === 'pending');
  const exposure = open.reduce((s, b) => s + b.stake, 0);
  return { settledCount: settled.length, wins, losses, turnover, profit, roi, winRate, open, exposure };
}

function currentBankroll() {
  return state.settings.bankroll + computeStats().profit;
}

/* ============================================================
   RENDER — CRUSCOTTO
   ============================================================ */
function renderDash() {
  const s = computeStats();
  const bankroll = currentBankroll();
  $('#hdrBankroll').textContent = eur(bankroll);

  const cls = (n) => n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  $('#dashStats').innerHTML = `
    <div class="stat"><div class="label">Bankroll</div><div class="value">${eur(bankroll)}</div></div>
    <div class="stat"><div class="label">Profitto</div><div class="value ${cls(s.profit)}">${eur(s.profit)}</div></div>
    <div class="stat"><div class="label">ROI / Yield</div><div class="value ${cls(s.roi)}">${(s.roi*100).toFixed(1)}%</div></div>
    <div class="stat"><div class="label">% vincenti</div><div class="value">${(s.winRate*100).toFixed(0)}%</div></div>
    <div class="stat"><div class="label">Giocate</div><div class="value">${state.bets.length}</div></div>
    <div class="stat"><div class="label">Concluse</div><div class="value">${s.settledCount}</div></div>
    <div class="stat"><div class="label">Aperte</div><div class="value">${s.open.length}</div></div>
    <div class="stat"><div class="label">Esposto</div><div class="value">${eur(s.exposure)}</div></div>
  `;

  drawChart();

  const open = s.open;
  $('#openBets').innerHTML = open.length
    ? open.map(betCard).join('')
    : `<div class="empty">Nessuna giocata aperta.</div>`;
  bindBetActions($('#openBets'));
}

function drawChart() {
  const cv = $('#bankrollChart');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  // serie: bankroll cumulativo nel tempo (giocate concluse in ordine di data)
  const settled = state.bets
    .filter(b => b.result === 'win' || b.result === 'loss' || b.result === 'void')
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt);

  const start = state.settings.bankroll;
  const pts = [start];
  let run = start;
  for (const b of settled) { run += betProfit(b); pts.push(run); }

  if (pts.length < 2) {
    $('#chartHint').textContent = 'Concludi qualche giocata per vedere la curva del bankroll.';
    // baseline
    ctx.strokeStyle = '#27343f'; ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
    return;
  }
  $('#chartHint').textContent = `${settled.length} giocate concluse · da ${eur(start)} a ${eur(run)}.`;

  const min = Math.min(...pts), max = Math.max(...pts);
  const pad = (max - min) * 0.12 || 10;
  const lo = min - pad, hi = max + pad;
  const x = (i) => (i / (pts.length - 1)) * (W - 8) + 4;
  const y = (v) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);

  // linea dello zero/start
  ctx.strokeStyle = '#27343f'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, y(start)); ctx.lineTo(W, y(start)); ctx.stroke();
  ctx.setLineDash([]);

  // area + linea
  const up = run >= start;
  const col = up ? '#1fb877' : '#e25767';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, up ? 'rgba(31,184,119,.35)' : 'rgba(226,87,103,.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(pts.length - 1), H); ctx.lineTo(x(0), H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
}

/* ============================================================
   RENDER — CALCOLATORE
   ============================================================ */
function runValueCalc() {
  const odds = parseFloat($('#vQuota').value);
  const probPct = parseFloat($('#vProb').value);
  const box = $('#valueResult');
  if (!(odds > 1) || !(probPct >= 0 && probPct <= 100)) {
    box.innerHTML = `<div class="result-box novalue">Inserisci una quota valida (&gt;1) e una probabilità tra 0 e 100.</div>`;
    return;
  }
  const prob = probPct / 100;
  const { edge, kelly } = valueOf(prob, odds);
  const impl = impliedProb(odds);
  const stake = stakeFor(state.settings.kelly, prob, odds);
  const isValue = edge > 0;

  box.innerHTML = `
    <div class="result-box ${isValue ? 'value' : 'novalue'}">
      <div class="verdict ${isValue ? 'value' : 'novalue'}">
        ${isValue ? '✅ VALUE' : '❌ Nessun value'}
      </div>
      <div class="kv"><span>Prob. implicita nella quota</span><b>${pct(impl)}</b></div>
      <div class="kv"><span>La tua probabilità</span><b>${pct(prob)}</b></div>
      <div class="kv"><span>Edge (ROI atteso)</span><b style="color:${isValue?'var(--green)':'var(--red)'}">${(edge*100).toFixed(1)}%</b></div>
      <div class="kv"><span>Kelly pieno</span><b>${pct(kelly)} del bankroll</b></div>
      <div class="kv"><span>Stake consigliato (${state.settings.kelly}× Kelly)</span><b>${eur(stake)}</b></div>
      ${isValue ? `<button class="btn small" style="margin-top:12px;width:auto" id="btnPrefill">Aggiungi al registro con stake ${eur(stake)}</button>` : ''}
    </div>`;

  if (isValue) {
    $('#btnPrefill').addEventListener('click', () => {
      switchView('bets');
      $('#bOdds').value = odds.toFixed(2);
      $('#bStake').value = stake.toFixed(2);
      $('#bEvent').focus();
      toast('Compila evento e selezione, poi aggiungi.');
    });
  }
}

function runNoVig() {
  const vals = ['#nv1', '#nv2', '#nv3'].map(s => parseFloat($(s).value)).filter(v => v > 1);
  const box = $('#noVigResult');
  if (vals.length < 2) {
    box.innerHTML = `<div class="result-box novalue">Servono almeno 2 quote valide.</div>`;
    return;
  }
  const { probs, margin, fairOdds } = noVig(vals);
  const labels = vals.length === 2 ? ['Esito 1', 'Esito 2'] : ['1 (casa)', 'X (pari)', '2 (trasf.)'];
  box.innerHTML = `
    <div class="result-box">
      <div class="verdict" style="color:var(--gold)">Probabilità vere (senza margine)</div>
      ${probs.map((p, i) => `
        <div class="kv"><span>${labels[i]} — quota ${vals[i].toFixed(2)}</span>
          <b>${pct(p)} <span style="color:var(--muted)">(quota equa ${fairOdds[i].toFixed(2)})</span></b></div>`).join('')}
      <div class="kv"><span>Margine del bookmaker</span><b style="color:var(--red)">${(margin*100).toFixed(2)}%</b></div>
    </div>`;
}

/* ============================================================
   REGISTRO
   ============================================================ */
function addBet() {
  const bet = {
    id: uid(),
    date: $('#bDate').value || new Date().toISOString().slice(0, 10),
    sport: $('#bSport').value,
    event: $('#bEvent').value.trim(),
    selection: $('#bSelection').value.trim(),
    odds: parseFloat($('#bOdds').value),
    stake: parseFloat($('#bStake').value),
    result: 'pending',
    note: '',
    createdAt: Date.now(),
  };
  if (!bet.event || !(bet.odds > 1) || !(bet.stake > 0)) {
    toast('Compila evento, quota (>1) e stake (>0).');
    return;
  }
  state.bets.unshift(bet);
  save();
  ['#bEvent', '#bSelection', '#bOdds', '#bStake'].forEach(s => $(s).value = '');
  renderBets(); renderDash();
  toast('Giocata aggiunta ✅');
}

function betCard(b) {
  const profit = betProfit(b);
  const pillTxt = { pending: 'aperta', win: 'vinta', loss: 'persa', void: 'void' }[b.result];
  const potential = b.stake * (b.odds - 1);
  return `
  <div class="bet" data-id="${b.id}">
    <div class="top">
      <div class="ev-event">${esc(b.event || '—')}</div>
      <span class="pill ${b.result}">${pillTxt}</span>
    </div>
    <div class="meta">${esc(b.date)} · ${esc(b.sport)} · ${esc(b.selection || '—')} ·
      quota <b>${b.odds.toFixed(2)}</b> · stake ${eur(b.stake)}
      ${b.result === 'pending'
        ? ` · possibile vincita <b style="color:var(--gold)">${eur(potential)}</b>`
        : ` · risultato <b style="color:${profit>0?'var(--green)':profit<0?'var(--red)':'var(--muted)'}">${eur(profit)}</b>`}
    </div>
    <div class="actions">
      ${b.result === 'pending' ? `
        <button class="set-btn win" data-act="win">Vinta</button>
        <button class="set-btn loss" data-act="loss">Persa</button>
        <button class="set-btn" data-act="void">Void</button>
      ` : `<button class="set-btn" data-act="reopen">Riapri</button>`}
      <button class="set-btn" data-act="del" style="margin-left:auto">Elimina</button>
    </div>
  </div>`;
}

function bindBetActions(root) {
  $$('.bet .set-btn', root).forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.bet').dataset.id;
      const bet = state.bets.find(b => b.id === id);
      if (!bet) return;
      const act = btn.dataset.act;
      if (act === 'del') {
        if (!confirm('Eliminare questa giocata?')) return;
        state.bets = state.bets.filter(b => b.id !== id);
      } else if (act === 'reopen') {
        bet.result = 'pending';
      } else {
        bet.result = act; // win | loss | void
      }
      save(); renderBets(); renderDash();
    });
  });
}

function renderBets() {
  const fs = $('#filterSport').value;
  const fr = $('#filterResult').value;
  let list = state.bets.slice();
  if (fs) list = list.filter(b => b.sport === fs);
  if (fr) list = list.filter(b => b.result === fr);

  $('#betList').innerHTML = list.length
    ? list.map(betCard).join('')
    : `<div class="empty">Nessuna giocata${(fs||fr)?' con questi filtri':''}.</div>`;
  bindBetActions($('#betList'));
}

/* ---------- Export / Import ---------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pronostici-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Backup esportato.');
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('formato');
      state = {
        settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
        bets: Array.isArray(data.bets) ? data.bets : [],
        sports: Array.isArray(data.sports) ? data.sports : [],
      };
      save(); hydrateSettings(); renderAll();
      toast('Backup importato ✅');
    } catch (e) {
      toast('File non valido.');
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   DATI LIVE — The Odds API
   ============================================================ */
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

// quali sport ci interessano: calcio italiano/UEFA + tennis
function isInterestingSport(s) {
  const k = s.key || '';
  const grp = (s.group || '').toLowerCase();
  if (grp === 'tennis' || k.startsWith('tennis_')) return true;
  if (k.startsWith('soccer_italy')) return true;
  if (k.startsWith('soccer_uefa')) return true;
  return false;
}

// Scarica le competizioni attive (silenzioso: lo usa il flusso "un tocco")
async function loadSports() {
  const key = state.settings.apiKey.trim();
  if (!key) return false;
  const res = await fetch(`${ODDS_BASE}/sports/?apiKey=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(await res.text());
  const all = await res.json();
  state.sports = all.filter(s => s.active && isInterestingSport(s));
  save();
  showQuota(res);
  return true;
}

// IL flusso semplice: un solo bottone fa tutto (carica + analizza)
async function findOpportunities() {
  const key = state.settings.apiKey.trim();
  if (!key) { $('#liveNoKey').hidden = false; return; }
  $('#liveNoKey').hidden = true;

  const btn = $('#btnFind');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Cerco le occasioni…';
  $('#liveResults').innerHTML = '';
  try {
    await loadSports();          // aggiorna sempre la lista del giorno
    await scanValue();           // analizza e mostra
  } catch (e) {
    console.error(e);
    $('#liveResults').innerHTML = `<div class="note-warn">Non riesco a leggere le quote. Controlla la connessione o la chiave (in Imposta).</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function showQuota(res) {
  const rem = res.headers.get('x-requests-remaining');
  const used = res.headers.get('x-requests-used');
  if (rem !== null) {
    $('#liveQuota').textContent = `Richieste API rimaste questo mese: ${rem}${used ? ` (usate ${used})` : ''}.`;
  }
}

async function scanValue() {
  const key = state.settings.apiKey.trim();
  if (!key) { $('#liveNoKey').hidden = false; return; }
  const minEdge = 0.02; // soglia di valore: 2% (dietro le quinte)

  // analizza tutte le competizioni attive (max 8 per non bruciare richieste)
  const targets = state.sports.slice(0, 8);
  if (!targets.length) { renderValueList([]); return; }

  const out = $('#liveResults');
  out.innerHTML = `<div class="empty"><span class="spinner"></span> Analizzo ${targets.length} competizioni…</div>`;

  const found = [];
  let lastRes = null;
  try {
    for (const sport of targets) {
      const url = `${ODDS_BASE}/sports/${sport.key}/odds/?apiKey=${encodeURIComponent(key)}&regions=eu&markets=h2h&oddsFormat=decimal`;
      const res = await fetch(url);
      lastRes = res;
      if (!res.ok) { console.warn('skip', sport.key, res.status); continue; }
      const events = await res.json();
      for (const ev of events) {
        found.push(...findValueInEvent(ev, sport, minEdge));
      }
    }
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div class="note-warn">Errore di rete o chiave non valida.</div>`;
    return;
  }

  if (lastRes) showQuota(lastRes);
  found.sort((a, b) => b.edge - a.edge);
  renderValueList(found);
}

// Per un evento: consenso no-vig su tutti i book, poi cerca book che pagano di più
function findValueInEvent(ev, sport, minEdge) {
  const books = (ev.bookmakers || []).map(bk => {
    const m = (bk.markets || []).find(x => x.key === 'h2h');
    return m ? { key: bk.key, title: bk.title, outcomes: m.outcomes } : null;
  }).filter(Boolean);
  if (books.length < 3) return []; // troppo pochi per un consenso affidabile

  // raccogli i nomi degli esiti
  const names = books[0].outcomes.map(o => o.name);
  // consenso: media delle prob no-vig di ogni book
  const sumProb = {}; names.forEach(n => sumProb[n] = 0);
  let counted = 0;
  for (const bk of books) {
    if (bk.outcomes.length !== names.length) continue;
    const odds = names.map(n => (bk.outcomes.find(o => o.name === n) || {}).price);
    if (odds.some(o => !(o > 1))) continue;
    const { probs } = noVig(odds);
    names.forEach((n, i) => sumProb[n] += probs[i]);
    counted++;
  }
  if (counted < 3) return [];
  const consensus = {}; names.forEach(n => consensus[n] = sumProb[n] / counted);

  // cerca, per ogni book e ogni esito, dove la quota offerta batte la quota equa
  const results = [];
  for (const bk of books) {
    for (const o of bk.outcomes) {
      const p = consensus[o.name];
      if (!(p > 0) || !(o.price > 1)) continue;
      const edge = p * o.price - 1;
      if (edge >= minEdge) {
        results.push({
          sportTitle: sport.title,
          event: `${ev.home_team} - ${ev.away_team}`,
          commence: ev.commence_time,
          selection: o.name,
          book: bk.title,
          odds: o.price,
          fairOdds: 1 / p,
          prob: p,
          edge,
          stake: stakeFor(state.settings.kelly, p, o.price),
        });
      }
    }
  }
  // tieni solo il book migliore per ciascun esito di questo evento
  const best = {};
  for (const r of results) {
    const k = r.event + '|' + r.selection;
    if (!best[k] || r.edge > best[k].edge) best[k] = r;
  }
  return Object.values(best);
}

function renderValueList(found) {
  const out = $('#liveResults');
  if (!found.length) {
    out.innerHTML = `<div class="empty">Oggi nessuna occasione di valore. 🤷<br/>
      Le quote cambiano di continuo: riprova tra qualche ora.<br/>
      <small style="color:var(--muted)">(Il calcio riapre con la nuova stagione; ora c'è soprattutto tennis.)</small></div>`;
    return;
  }
  const strength = (e) => e >= 0.08 ? 'forte' : e >= 0.04 ? 'buona' : 'leggera';
  out.innerHTML =
    `<p class="hint">Ecco dove il banco paga <b>più del giusto</b>. La cifra in verde è <b>quanto puntare</b>. È un vantaggio nel tempo, non una certezza sulla singola giocata.</p>` +
    found.map((r, i) => {
      const when = new Date(r.commence).toLocaleString('it-IT', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `
    <div class="value-item" data-idx="${i}">
      <div class="top">
        <div>
          <div class="teams">Punta su <b>${esc(r.selection)}</b></div>
          <div class="meta">${esc(r.event)} · ${esc(r.sportTitle)} · ${esc(when)}</div>
        </div>
        <div class="ev">${eur(r.stake)}</div>
      </div>
      <div class="line">su <span class="book">${esc(r.book)}</span> a quota <b>${r.odds.toFixed(2)}</b>
        <span class="badge">occasione ${strength(r.edge)}</span>
      </div>
      <details class="why">
        <summary>Perché?</summary>
        <div class="kv"><span>Vantaggio stimato</span><b style="color:var(--green)">+${(r.edge*100).toFixed(1)}%</b></div>
        <div class="kv"><span>Quota giusta (consenso dei book)</span><b>${r.fairOdds.toFixed(2)}</b></div>
        <div class="kv"><span>Quota di ${esc(r.book)}</span><b>${r.odds.toFixed(2)} → paga più del giusto</b></div>
        <div class="kv"><span>Quanto puntare (¼ Kelly)</span><b>${eur(r.stake)}</b></div>
      </details>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn small" data-add="${i}">Ho scommesso → salva nel registro</button>
      </div>
    </div>`;
    }).join('');

  $$('#liveResults [data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = found[parseInt(btn.dataset.add, 10)];
      state.bets.unshift({
        id: uid(),
        date: (r.commence || new Date().toISOString()).slice(0, 10),
        sport: r.sportTitle.toLowerCase().includes('tennis') ? 'Tennis' : 'Calcio',
        event: r.event,
        selection: r.selection,
        odds: r.odds,
        stake: Math.round(r.stake * 100) / 100,
        result: 'pending',
        note: `value +${(r.edge*100).toFixed(1)}% @ ${r.book}`,
        createdAt: Date.now(),
      });
      save(); renderBets(); renderDash();
      toast('Aggiunta al registro ✅');
    });
  });
}

/* ============================================================
   IMPOSTAZIONI
   ============================================================ */
function hydrateSettings() {
  $('#setBankroll').value = state.settings.bankroll;
  $('#setKelly').value = String(state.settings.kelly);
  $('#setApiKey').value = state.settings.apiKey;
}
function saveSettings() {
  state.settings.bankroll = Math.max(0, parseFloat($('#setBankroll').value) || 0);
  state.settings.kelly = parseFloat($('#setKelly').value) || 0.25;
  state.settings.apiKey = $('#setApiKey').value.trim();
  save();
  renderDash();
  $('#liveNoKey').hidden = !!state.settings.apiKey;
  toast('Impostazioni salvate ✅');
}

/* ============================================================
   NAVIGAZIONE
   ============================================================ */
function switchView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('nav.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0 });
}

function renderAll() { renderDash(); renderBets(); }

// "Link magico": se l'URL contiene #key=... o ?key=... salva la chiave e pulisce l'indirizzo.
// Così la chiave non finisce mai nel codice pubblico, solo nel link personale.
function applyKeyFromUrl() {
  const src = (location.hash || '') + '&' + (location.search || '');
  const m = src.match(/[#?&]key=([A-Za-z0-9]{8,})/);
  if (m && m[1]) {
    state.settings.apiKey = m[1];
    save();
    history.replaceState(null, '', location.pathname); // rimuove la chiave dall'URL
    return true;
  }
  return false;
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  // default data oggi nel form registro
  $('#bDate').value = new Date().toISOString().slice(0, 10);

  const keyJustSet = applyKeyFromUrl();
  hydrateSettings();
  renderAll();
  $('#liveNoKey').hidden = !!state.settings.apiKey;
  if (keyJustSet) { switchView('live'); setTimeout(() => toast('Chiave API inserita ✅'), 300); }

  // navigazione
  $$('nav.tabbar button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  // calcolatore
  $('#btnValue').addEventListener('click', runValueCalc);
  $('#btnNoVig').addEventListener('click', runNoVig);

  // registro
  $('#btnAddBet').addEventListener('click', addBet);
  $('#filterSport').addEventListener('change', renderBets);
  $('#filterResult').addEventListener('change', renderBets);
  $('#btnExport').addEventListener('click', exportJSON);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); });

  // live — un solo bottone fa tutto
  $('#btnFind').addEventListener('click', findOpportunities);

  // impostazioni
  $('#btnSaveSettings').addEventListener('click', saveSettings);
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Azzerare TUTTO (registro + impostazioni)? Operazione irreversibile.')) return;
    state = structuredClone(DEFAULT_STATE);
    save(); hydrateSettings(); renderAll();
    toast('Tutto azzerato.');
  });

  // redraw del grafico al resize
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawChart, 150); });

  // service worker (PWA offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
