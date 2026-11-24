/* Amar Hisab (আমার হিসাব) - offline personal finance. All data stays on the phone (IndexedDB). */
(() => {
'use strict';
const L = window.Ledger;
const $ = s => document.querySelector(s);

/* ---------- state & storage ---------- */
const CATS = () => [
  ['food','Food','খাবার','expense'],['transport','Transport','যাতায়াত','expense'],['shopping','Shopping','কেনাকাটা','expense'],
  ['bills','Bills','বিল','expense'],['education','Education','শিক্ষা','expense'],['medical','Medical','চিকিৎসা','expense'],
  ['family','Family','পরিবার','expense'],['personal','Personal','ব্যক্তিগত','expense'],['entertainment','Entertainment','বিনোদন','expense'],
  ['other_e','Other','অন্যান্য','expense'],['salary','Salary','বেতন','income'],['freelance','Freelance','ফ্রিল্যান্স','income'],
  ['business','Business Income','ব্যবসার আয়','income'],['other_i','Other','অন্যান্য','income']
].map(c => ({ id: c[0], name: c[1], bn: c[2], type: c[3], custom: false }));
const fresh = () => ({ v: 1, seq: 1, settings: { theme: 'auto', lang: 'bn', pin: null, lowBal: 500 },
  cats: CATS(), tx: [], people: [], led: [], budgets: { month: 0, cats: {} }, goals: [], rem: [] });
let S = fresh();
const UI = { route: 'home', from: 'home', txPeriod: 'month', txType: 'all', q: '', cat: '', from_: '', to_: '',
  repKind: 'month', repDate: new Date(), ledTab: 'receivable' };

function idb() { return new Promise((res, rej) => { const r = indexedDB.open('amar-hisab', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k);
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite');
  t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
let chain = Promise.resolve();
const save = () => { const json = JSON.stringify(S); chain = chain.then(() => idbSet('state', json)).catch(() => toast(b('Could not save data', 'ডেটা সেভ হয়নি'))); return chain; };

/* ---------- helpers ---------- */
const b = (en, bn) => (S.settings.lang === 'bn' ? bn : en);
const bnd = s => String(s).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const nz = s => (S.settings.lang === 'bn' ? bnd(s) : String(s));
const fmt = n => '৳' + nz(Number(L.r2(n)).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const loc = () => (S.settings.lang === 'bn' ? 'bn-BD' : 'en-GB');
const fd = (dt, time = true) => { const d = new Date(dt); let s = d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' });
  if (time) s += ', ' + d.toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' }); return s; };
const nid = () => S.seq++;
const sum = l => L.r2(l.reduce((a, t) => a + Number(t.amount), 0));
const cat = id => S.cats.find(c => c.id === id) || { id, name: 'Other', bn: 'অন্যান্য' };
const cn = c => (S.settings.lang === 'bn' && c.bn ? c.bn : c.name);
function calc(s) {
  s = String(s).replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim();
  if (!s || !/^[0-9+\-*/().\s]+$/.test(s)) return NaN;
  try { const v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? L.r2(v) : NaN; } catch (e) { return NaN; }
}
function rangeOf(kind, d) {
  const s = new Date(d); s.setHours(0, 0, 0, 0); let e;
  if (kind === 'day') { e = new Date(s); e.setDate(e.getDate() + 1); }
  else if (kind === 'week') { s.setDate(s.getDate() - ((s.getDay() + 1) % 7)); e = new Date(s); e.setDate(e.getDate() + 7); }
  else if (kind === 'month') { s.setDate(1); e = new Date(s); e.setMonth(e.getMonth() + 1); }
  else { s.setMonth(0, 1); e = new Date(s); e.setFullYear(e.getFullYear() + 1); }
  return [s, e];
}
const inR = (t, r) => { const d = new Date(t.dt); return d >= r[0] && d < r[1]; };
const pbal = id => L.balance(S.led.filter(e => e.pid === id));
const people = kind => S.people.filter(p => p.kind === kind).map(p => ({ p, bal: pbal(p.id) }));
const totalOf = kind => L.r2(people(kind).reduce((a, x) => a + x.bal, 0));
const monthExpense = () => S.tx.filter(t => t.type === 'expense' && inR(t, rangeOf('month', new Date())));
function toast(msg) { document.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
function sheet(html) { closeSheet(); const o = document.createElement('div'); o.className = 'ov';
  o.innerHTML = `<div class="sh">${html}</div>`; o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
  document.body.appendChild(o); return o.firstChild; }
function closeSheet() { document.querySelectorAll('.ov').forEach(x => x.remove()); }
function confirmBox(msg, ok, label) {
  const sh = sheet(`<h2>${b('Please confirm', 'নিশ্চিত করুন')}</h2><p class="mut" style="margin:6px 0 16px">${msg}</p>
    <div class="btns"><button class="btn sec" id="cx">${b('Cancel', 'বাতিল')}</button><button class="btn danger" id="ok">${label || b('Delete', 'মুছুন')}</button></div>`);
  sh.querySelector('#cx').onclick = closeSheet; sh.querySelector('#ok').onclick = () => { closeSheet(); ok(); };
}
const prog = (p, cls) => `<div class="prog ${cls || (p >= 100 ? 'over' : p >= 80 ? 'warn' : '')}"><i style="width:${Math.min(100, Math.max(0, p))}%"></i></div>`;
const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  tx: '<path d="M7 4v14m0 0l-3-3m3 3l3-3M17 20V6m0 0l-3 3m3-3l3 3"/>',
  ledger: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  reports: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2"/>'
};

/* ---------- reusable pieces ---------- */
function hdr(title, back, right) { return `<div class="top">${back ? '<button class="back" data-act="back" aria-label="back">‹</button>' : ''}<h1>${title}</h1>${right || ''}</div>`; }
function txRow(t) { const c = cat(t.cat); const inc = t.type === 'income';
  return `<div class="row" data-act="editTx" data-id="${t.id}"><div class="ic ${t.type}">${esc(cn(c).slice(0, 1))}</div>
  <div class="rb"><b>${esc(cn(c))}</b><small>${esc(t.note ? t.note + ', ' : '')}${fd(t.dt)}</small></div>
  <b class="${inc ? 'pos' : 'neg'}">${inc ? '+' : '−'}${fmt(t.amount)}</b></div>`; }
function bars(items) { const mx = Math.max(1, ...items.flatMap(i => [i.inc, i.exp]));
  return `<div class="bars">${items.map(i => `<div class="bc"><div class="bp"><i class="bi" style="height:${i.inc / mx * 100}%"></i><i class="be" style="height:${i.exp / mx * 100}%"></i></div><span>${i.l}</span></div>`).join('')}</div>
  <div class="legend"><span><i style="background:var(--pos)"></i>${b('Income', 'আয়')}</span><span><i style="background:var(--neg)"></i>${b('Expense', 'ব্যয়')}</span></div>`; }
function hbars(rows) { const tot = rows.reduce((a, r) => a + r.v, 0) || 1;
  return rows.map(r => `<div class="hb"><div class="h"><span>${esc(r.l)}</span><b>${fmt(r.v)} <small class="mut">${nz(Math.round(r.v / tot * 100))}%</small></b></div>${prog(r.v / tot * 100, 'x')}</div>`).join(''); }
const etype = (kind, t) => ({ opening: b('Opening balance', 'শুরুর ব্যালেন্স'),
  add: kind === 'payable' ? b('New amount borrowed', 'নতুন ধার নেওয়া') : b('New credit given', 'নতুন বাকি দেওয়া'),
  partial: kind === 'payable' ? b('Payment made', 'পরিশোধ করেছি') : b('Money received', 'টাকা পেয়েছি'),
  full: b('Full payment', 'পূর্ণ পরিশোধ'), adjustment: b('Adjustment', 'সমন্বয়') }[t]);
function amtField(val, label) { return `<label class="f">${label || b('Amount (৳)', 'পরিমাণ (৳)')}<input id="amt" inputmode="decimal" autocomplete="off" value="${val == null ? '' : val}" placeholder="0"></label>
  <div class="ops"><button type="button" data-op="+">+</button><button type="button" data-op="−">−</button><button type="button" data-op="×">×</button><button type="button" data-op="÷">÷</button><button type="button" data-op="DEL">⌫</button></div>
  <div class="prev" id="calcv"></div>`; }
function wireAmt(sh, onChange) { const a = sh.querySelector('#amt'); if (!a) return;
  const upd = () => { const v = calc(a.value); const hasOp = /[+\-*/×÷−]/.test(a.value.replace(/^-/, ''));
    sh.querySelector('#calcv').textContent = hasOp && !isNaN(v) ? '= ' + fmt(v) : ''; onChange && onChange(); };
  a.addEventListener('input', upd);
  sh.querySelectorAll('[data-op]').forEach(x => x.onclick = () => { if (x.dataset.op === 'DEL') a.value = a.value.slice(0, -1); else a.value += x.dataset.op; a.focus(); upd(); });
  upd(); }

/* ---------- screens ---------- */
function Home() {
  const inc = sum(S.tx.filter(t => t.type === 'income')), exp = sum(S.tx.filter(t => t.type === 'expense')), bal = L.r2(inc - exp);
  const rec = totalOf('receivable'), pay = totalOf('payable');
  const spent = sum(monthExpense()), mb = S.budgets.month || 0;
  const gt = sum(S.goals.map(g => ({ amount: g.target }))), gs = sum(S.goals.map(g => ({ amount: g.saved })));
  const today = nowLocal().slice(0, 10); const due = S.rem.filter(r => !r.done && r.due <= today);
  const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const r = rangeOf('day', d); const l = S.tx.filter(t => inR(t, r));
    days.push({ l: nz(d.getDate()), inc: sum(l.filter(t => t.type === 'income')), exp: sum(l.filter(t => t.type === 'expense')) }); }
  return `${hdr('আমার হিসাব', false, `<small>${fd(new Date(), false)}</small>`)}
  ${S.tx.length && bal < S.settings.lowBal ? `<div class="note over">${b('Low balance: below ' + fmt(S.settings.lowBal), 'ব্যালেন্স কম: ' + fmt(S.settings.lowBal) + ' এর নিচে')}</div>` : ''}
  ${due.length ? `<div class="note warn tap" data-act="go" data-to="rems">${b(due.length + ' reminder(s) due', nz(due.length) + 'টি রিমাইন্ডার বাকি')}</div>` : ''}
  <div class="card hero"><div class="lbl">${b('Current balance', 'বর্তমান ব্যালেন্স')}</div><div class="big">${fmt(bal)}</div>
    <div class="split"><div><div class="lbl">${b('Total income', 'মোট আয়')}</div><b class="in">${fmt(inc)}</b></div><div><div class="lbl">${b('Total expenses', 'মোট ব্যয়')}</div><b class="out">${fmt(exp)}</b></div></div></div>
  <div class="grid2"><div class="card tap" data-act="ledTab" data-t="receivable"><div class="lbl">${b('Others owe me', 'পাওনা')}</div><div class="mid pos">${fmt(rec)}</div></div>
    <div class="card tap" data-act="ledTab" data-t="payable"><div class="lbl">${b('I owe others', 'দেনা')}</div><div class="mid neg">${fmt(pay)}</div></div></div>
  <div class="card tap" data-act="go" data-to="budget" style="margin-top:12px"><h3>${b('Spending this month', 'এই মাসের খরচ')}</h3><div class="mid">${fmt(spent)}</div>
    ${mb ? prog(spent / mb * 100) + `<div class="lbl">${b('of', 'বাজেট')} ${fmt(mb)} ${b('budget,', ',')} ${spent > mb ? b('over by ', 'ছাড়িয়েছে ') + fmt(spent - mb) : b('left ', 'বাকি ') + fmt(mb - spent)}</div>` : `<div class="lbl">${b('Tap to set a monthly budget', 'মাসিক বাজেট সেট করতে ট্যাপ করুন')}</div>`}</div>
  <div class="card tap" data-act="go" data-to="goals"><h3>${b('Savings progress', 'সঞ্চয়ের অগ্রগতি')}</h3>
    ${S.goals.length ? `<div class="mid pos">${fmt(gs)} <small class="mut">/ ${fmt(gt)}</small></div>${prog(gt ? gs / gt * 100 : 0, 'x')}<div class="lbl">${nz(gt ? Math.round(gs / gt * 100) : 0)}%</div>` : `<div class="lbl">${b('Create a savings goal', 'সঞ্চয় লক্ষ্য তৈরি করুন')}</div>`}</div>
  <div class="card"><h3>${b('Last 7 days', 'গত ৭ দিন')}</h3>${bars(days)}</div>
  <div class="card"><h3>${b('Recent transactions', 'সাম্প্রতিক লেনদেন')}</h3>${S.tx.length ? S.tx.slice().sort((a, c) => c.dt.localeCompare(a.dt)).slice(0, 5).map(txRow).join('') : `<div class="empty">${b('No transactions yet. Tap + to add one.', 'কোনো লেনদেন নেই। + চাপুন।')}</div>`}</div>`;
}

function filteredTx() {
  const now = new Date(); let r = null;
  if (UI.txPeriod === 'today') r = rangeOf('day', now); else if (['week', 'month', 'year'].includes(UI.txPeriod)) r = rangeOf(UI.txPeriod, now);
  else if (UI.txPeriod === 'range') { r = [UI.from_ ? new Date(UI.from_ + 'T00:00') : new Date(0), UI.to_ ? new Date(UI.to_ + 'T23:59:59') : new Date(8.64e15)]; }
  const q = UI.q.trim().toLowerCase();
  return S.tx.filter(t => (!r || inR(t, r)) && (UI.txType === 'all' || t.type === UI.txType) && (!UI.cat || t.cat === UI.cat)
    && (!q || (t.note || '').toLowerCase().includes(q) || cn(cat(t.cat)).toLowerCase().includes(q) || String(t.amount).includes(q)))
    .sort((a, c) => c.dt.localeCompare(a.dt));
}
function txListHtml() { const l = filteredTx();
  return `<div class="sum"><span class="pos">+${fmt(sum(l.filter(t => t.type === 'income')))}</span><span class="neg">−${fmt(sum(l.filter(t => t.type === 'expense')))}</span><span class="mut">${nz(l.length)} ${b('items', 'টি')}</span></div>`
    + (l.length ? l.map(txRow).join('') : `<div class="empty">${b('Nothing found', 'কিছু পাওয়া যায়নি')}</div>`); }
function Tx() {
  const P = [['today', 'Today', 'আজ'], ['week', 'Week', 'সপ্তাহ'], ['month', 'Month', 'মাস'], ['year', 'Year', 'বছর'], ['all', 'All', 'সব'], ['range', 'Range', 'রেঞ্জ']];
  return `${hdr(b('Transactions', 'লেনদেন'))}
  <div class="seg sm">${P.map(p => `<button class="${UI.txPeriod === p[0] ? 'on' : ''}" data-act="txP" data-v="${p[0]}">${b(p[1], p[2])}</button>`).join('')}</div>
  ${UI.txPeriod === 'range' ? `<div class="grid2" style="margin-bottom:10px"><input type="date" id="fromD" value="${UI.from_}"><input type="date" id="toD" value="${UI.to_}"></div>` : ''}
  <div class="seg sm">${[['all', 'All', 'সব'], ['income', 'Income', 'আয়'], ['expense', 'Expense', 'ব্যয়']].map(p => `<button class="${UI.txType === p[0] ? 'on' : ''}" data-act="txT" data-v="${p[0]}">${b(p[1], p[2])}</button>`).join('')}</div>
  <div class="grid2" style="margin-bottom:12px"><input id="q" placeholder="${b('Search', 'খুঁজুন')}" value="${esc(UI.q)}">
    <select id="catF"><option value="">${b('All categories', 'সব ক্যাটেগরি')}</option>${S.cats.map(c => `<option value="${c.id}" ${UI.cat === c.id ? 'selected' : ''}>${esc(cn(c))}</option>`).join('')}</select></div>
  <div class="card" id="txlist">${txListHtml()}</div>`;
}

function Ledger() {
  const k = UI.ledTab, list = people(k).sort((a, c) => c.bal - a.bal), tot = totalOf(k);
  return `${hdr(b('Ledger', 'খাতা'), false, '<button class="btn sm" data-act="addPerson">+ ' + b('Person', 'ব্যক্তি') + '</button>')}
  <div class="seg"><button class="${k === 'receivable' ? 'on' : ''}" data-act="ledTab" data-t="receivable">${b('Others owe me', 'পাওনা')}</button><button class="${k === 'payable' ? 'on' : ''}" data-act="ledTab" data-t="payable">${b('I owe others', 'দেনা')}</button></div>
  <div class="card"><div class="lbl">${k === 'receivable' ? b('Total to receive', 'মোট পাওনা') : b('Total to pay', 'মোট দেনা')}</div><div class="big ${k === 'receivable' ? 'pos' : 'neg'}">${fmt(tot)}</div></div>
  <div class="card">${list.length ? list.map(x => { const last = S.led.filter(e => e.pid === x.p.id).sort((a, c) => c.dt.localeCompare(a.dt))[0];
    return `<div class="row" data-act="go" data-to="person:${x.p.id}"><div class="ic ${k}">${esc(x.p.name.slice(0, 1).toUpperCase())}</div>
    <div class="rb"><b>${esc(x.p.name)}</b><small>${last ? fd(last.dt) : ''}</small></div><b class="${k === 'receivable' ? 'pos' : 'neg'}">${fmt(x.bal)}</b></div>`; }).join('')
    : `<div class="empty">${b('No one here yet. Add a person to start a ledger.', 'কেউ নেই। ব্যক্তি যোগ করে খাতা শুরু করুন।')}</div>`}</div>`;
}

function Person(id) {
  const p = S.people.find(x => x.id === id); if (!p) { UI.route = 'ledger'; return Ledger(); }
  const ent = L.recalc(S.led.filter(e => e.pid === id)), bal = ent.length ? ent[ent.length - 1].bal : 0, c = p.kind === 'receivable' ? 'pos' : 'neg';
  return `${hdr(esc(p.name), true, '<button class="btn sec sm" data-act="personMenu" data-id="' + id + '">⋯</button>')}
  <div class="card"><div class="lbl">${p.kind === 'receivable' ? b('They owe me', 'আমার পাওনা') : b('I owe them', 'আমার দেনা')}</div>
    <div class="big ${c}">${fmt(bal)}</div>${bal === 0 ? `<div class="lbl">${b('All settled', 'সব মিটে গেছে')}</div>` : ''}</div>
  <div class="btns" style="margin-bottom:12px"><button class="btn" data-act="entry" data-pid="${id}" data-t="add">+ ${b('Add amount', 'টাকা যোগ')}</button>
    <button class="btn sec" data-act="entry" data-pid="${id}" data-t="partial">${p.kind === 'receivable' ? b('Received', 'পেয়েছি') : b('Paid', 'দিয়েছি')}</button>
    <button class="btn sec" data-act="entry" data-pid="${id}" data-t="full">${b('Full payment', 'পূর্ণ পরিশোধ')}</button>
    <button class="btn sec" data-act="entry" data-pid="${id}" data-t="adjustment">${b('Adjust', 'সমন্বয়')}</button></div>
  <div class="card khata"><h3>${b('History', 'লেনদেনের ইতিহাস')}</h3>${ent.length ? ent.slice().reverse().map(e => { const d = e.bal - e.prev;
    return `<div class="e" data-act="editEntry" data-id="${e.id}"><div><b>${etype(p.kind, e.type)}</b></div><div class="a ${d >= 0 ? c : 'mut'}">${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))}</div>
    <small>${esc(e.note ? e.note + ', ' : '')}${fd(e.dt)}</small><div class="b"><small>${fmt(e.prev)} → <b>${fmt(e.bal)}</b></small></div></div>`; }).join('')
    : `<div class="empty">${b('No entries yet', 'কোনো এন্ট্রি নেই')}</div>`}</div>`;
}

function Reports() {
  const k = UI.repKind, r = rangeOf(k, UI.repDate), l = S.tx.filter(t => inR(t, r));
  const inc = sum(l.filter(t => t.type === 'income')), exp = sum(l.filter(t => t.type === 'expense'));
  let items = []; const n = k === 'day' ? 1 : k === 'week' ? 7 : k === 'month' ? Math.round((r[1] - r[0]) / 864e5) : 12;
  for (let i = 0; i < n; i++) { let s = new Date(r[0]), e; if (k === 'year') { s.setMonth(i); e = new Date(s); e.setMonth(i + 1); } else { s.setDate(s.getDate() + i); e = new Date(s); e.setDate(e.getDate() + 1); }
    const bl = l.filter(t => inR(t, [s, e]));
    items.push({ l: k === 'year' ? s.toLocaleDateString(loc(), { month: 'short' }) : k === 'week' ? s.toLocaleDateString(loc(), { weekday: 'short' }) : k === 'day' ? b('Today', 'দিন') : ((i % 5 === 0) ? nz(i + 1) : ''),
      inc: sum(bl.filter(t => t.type === 'income')), exp: sum(bl.filter(t => t.type === 'expense')) }); }
  const byCat = {}; l.filter(t => t.type === 'expense').forEach(t => byCat[t.cat] = (byCat[t.cat] || 0) + Number(t.amount));
  const rows = Object.keys(byCat).map(id => ({ l: cn(cat(id)), v: L.r2(byCat[id]) })).sort((a, c) => c.v - a.v);
  const title = k === 'year' ? nz(r[0].getFullYear()) : k === 'month' ? r[0].toLocaleDateString(loc(), { month: 'long', year: 'numeric' }) : k === 'day' ? fd(r[0], false) : fd(r[0], false) + ' – ' + fd(new Date(r[1] - 1), false);
  const gt = sum(S.goals.map(g => ({ amount: g.target }))), gs = sum(S.goals.map(g => ({ amount: g.saved })));
  return `${hdr(b('Reports', 'রিপোর্ট'))}
  <div class="seg sm">${[['day', 'Daily', 'দৈনিক'], ['week', 'Weekly', 'সাপ্তাহিক'], ['month', 'Monthly', 'মাসিক'], ['year', 'Yearly', 'বার্ষিক']].map(p => `<button class="${k === p[0] ? 'on' : ''}" data-act="repK" data-v="${p[0]}">${b(p[1], p[2])}</button>`).join('')}</div>
  <div class="top" style="margin:0 0 10px"><button class="back" data-act="repNav" data-v="-1">‹</button><h1 style="font-size:16px;text-align:center">${title}</h1><button class="back" data-act="repNav" data-v="1">›</button></div>
  <div class="grid2"><div class="card"><div class="lbl">${b('Income', 'আয়')}</div><div class="mid pos">${fmt(inc)}</div></div><div class="card"><div class="lbl">${b('Expense', 'ব্যয়')}</div><div class="mid neg">${fmt(exp)}</div></div></div>
  <div class="card" style="margin-top:12px"><div class="lbl">${b('Net', 'নেট')}</div><div class="mid ${inc - exp >= 0 ? 'pos' : 'neg'}">${fmt(inc - exp)}</div></div>
  <div class="card"><h3>${b('Income vs expense', 'আয় বনাম ব্যয়')}</h3>${bars(items)}</div>
  <div class="card"><h3>${b('Spending by category', 'ক্যাটেগরি অনুযায়ী খরচ')}</h3>${rows.length ? hbars(rows) : `<div class="empty">${b('No expenses in this period', 'এই সময়ে কোনো খরচ নেই')}</div>`}</div>
  <div class="card"><h3>${b('Debt and receivable summary', 'পাওনা ও দেনার সারসংক্ষেপ')}</h3>
    <div class="row" data-act="ledTab" data-t="receivable"><div class="rb"><b>${b('Others owe me', 'পাওনা')}</b><small>${nz(people('receivable').filter(x => x.bal > 0).length)} ${b('people', 'জন')}</small></div><b class="pos">${fmt(totalOf('receivable'))}</b></div>
    <div class="row" data-act="ledTab" data-t="payable"><div class="rb"><b>${b('I owe others', 'দেনা')}</b><small>${nz(people('payable').filter(x => x.bal > 0).length)} ${b('people', 'জন')}</small></div><b class="neg">${fmt(totalOf('payable'))}</b></div></div>
  <div class="card"><h3>${b('Savings progress', 'সঞ্চয়ের অগ্রগতি')}</h3>${S.goals.length ? `<div class="mid pos">${fmt(gs)} <small class="mut">/ ${fmt(gt)}</small></div>${prog(gt ? gs / gt * 100 : 0, 'x')}` : `<div class="lbl">${b('No goals yet', 'কোনো লক্ষ্য নেই')}</div>`}</div>
  <div class="card"><h3>${b('Transaction history', 'লেনদেনের তালিকা')}</h3>${l.length ? l.slice().sort((a, c) => c.dt.localeCompare(a.dt)).map(txRow).join('') : `<div class="empty">${b('No transactions', 'কোনো লেনদেন নেই')}</div>`}</div>`;
}

function Budget() {
  const ex = monthExpense(), spent = sum(ex), mb = S.budgets.month || 0;
  const row = (label, bud, sp) => `<div class="hb"><div class="h"><span>${esc(label)}</span><b>${fmt(sp)}${bud ? ' / ' + fmt(bud) : ''}</b></div>${bud ? prog(sp / bud * 100) + `<div class="lbl">${nz(Math.round(sp / bud * 100))}% ${b('used,', 'ব্যবহৃত,')} ${sp > bud ? b('over by ', 'ছাড়িয়েছে ') + fmt(sp - bud) : b('remaining ', 'বাকি ') + fmt(bud - sp)}</div>` : ''}</div>`;
  return `${hdr(b('Budget', 'বাজেট'), true)}
  <div class="card"><h3>${b('Monthly budget', 'মাসিক বাজেট')}</h3><input data-bud="month" inputmode="decimal" value="${mb || ''}" placeholder="0">${row(b('This month', 'এই মাস'), mb, spent).replace('<div class="hb">', '<div class="hb" style="margin-top:12px">')}</div>
  <div class="card"><h3>${b('Category budgets', 'ক্যাটেগরি বাজেট')}</h3>${S.cats.filter(c => c.type === 'expense').map(c => { const sp = sum(ex.filter(t => t.cat === c.id)), bud = S.budgets.cats[c.id] || 0;
    return `<div style="margin-bottom:14px"><label class="f" style="margin:0">${esc(cn(c))}<input data-bud="${c.id}" inputmode="decimal" value="${bud || ''}" placeholder="0"></label>${row('', bud, sp)}</div>`; }).join('')}</div>
  <p class="lbl" style="text-align:center">${b('You will be warned at 80% and 100%.', '৮০% এবং ১০০% এ সতর্কতা পাবেন।')}</p>`;
}

function Goals() {
  return `${hdr(b('Savings goals', 'সঞ্চয় লক্ষ্য'), true, '<button class="btn sm" data-act="goalNew">+ ' + b('Goal', 'লক্ষ্য') + '</button>')}
  ${S.goals.length ? S.goals.map(g => { const p = g.target ? g.saved / g.target * 100 : 0;
    return `<div class="card"><div class="h" style="display:flex;justify-content:space-between"><h3>${esc(g.name)}</h3><span class="tag tap" data-act="goalDel" data-id="${g.id}">${b('Delete', 'মুছুন')}</span></div>
    <div class="mid pos">${fmt(g.saved)} <small class="mut">/ ${fmt(g.target)}</small></div>${prog(p, 'x')}
    <div class="lbl">${nz(Math.round(p))}% ${b('done,', 'সম্পন্ন,')} ${b('remaining ', 'বাকি ')}${fmt(Math.max(0, g.target - g.saved))}</div>
    <div class="btns" style="margin-top:10px"><button class="btn sm" data-act="goalMoney" data-id="${g.id}" data-m="add">+ ${b('Add money', 'জমা')}</button><button class="btn sec sm" data-act="goalMoney" data-id="${g.id}" data-m="wd">− ${b('Withdraw', 'তুলুন')}</button></div></div>`; }).join('')
    : `<div class="card empty">${b('No goals yet. Create one to start saving.', 'কোনো লক্ষ্য নেই। নতুন লক্ষ্য তৈরি করুন।')}</div>`}`;
}

function Rems() {
  const l = S.rem.slice().sort((a, c) => (a.done - c.done) || (a.due + (a.time || '')).localeCompare(c.due + (c.time || '')));
  return `${hdr(b('Notes and reminders', 'নোট ও রিমাইন্ডার'), true, '<button class="btn sm" data-act="remNew">+ ' + b('New', 'নতুন') + '</button>')}
  <div class="card">${l.length ? l.map(r => `<div class="row" data-act="remEdit" data-id="${r.id}"><div class="ic ${r.done ? '' : 'income'}">${r.done ? '✓' : '!'}</div>
    <div class="rb"><b style="${r.done ? 'text-decoration:line-through;color:var(--mut)' : ''}">${esc(r.title)}</b><small>${r.due ? fd(r.due + 'T' + (r.time || '09:00')) : ''} ${esc(r.note || '')}</small></div></div>`).join('')
    : `<div class="empty">${b('Nothing here. Add a note or a due-date reminder.', 'কিছু নেই। নোট বা রিমাইন্ডার যোগ করুন।')}</div>`}</div>`;
}

function Cats() {
  const g = t => S.cats.filter(c => c.type === t).map(c => `<div class="row" ${c.custom ? `data-act="catDel" data-id="${c.id}"` : ''}><div class="rb"><b>${esc(cn(c))}</b></div>${c.custom ? `<span class="tag">${b('custom, tap to delete', 'নিজের, মুছতে ট্যাপ')}</span>` : ''}</div>`).join('');
  return `${hdr(b('Categories', 'ক্যাটেগরি'), true, '<button class="btn sm" data-act="catNew">+ ' + b('New', 'নতুন') + '</button>')}
  <div class="card"><h3>${b('Expense', 'ব্যয়')}</h3>${g('expense')}</div><div class="card"><h3>${b('Income', 'আয়')}</h3>${g('income')}</div>`;
}

function Settings() {
  const s = S.settings;
  const row = (act, t, sub, extra) => `<div class="row" data-act="${act}"><div class="rb"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div>${extra || '<span class="mut">›</span>'}</div>`;
  return `${hdr(b('Settings', 'সেটিংস'))}
  <div class="card set">${row('lang', b('Language', 'ভাষা'), '', `<span class="tag">${s.lang === 'bn' ? 'বাংলা' : 'English'}</span>`)}
    ${row('theme', b('Theme', 'থিম'), '', `<span class="tag">${{ auto: b('Auto', 'অটো'), light: b('Light', 'লাইট'), dark: b('Dark', 'ডার্ক') }[s.theme]}</span>`)}
    ${row('pin', b('App lock (PIN)', 'অ্যাপ লক (পিন)'), s.pin ? b('On. Tap to change or remove', 'চালু। বদলাতে বা বন্ধ করতে ট্যাপ করুন') : b('Off', 'বন্ধ'))}
    ${row('lowBal', b('Low-balance warning', 'কম ব্যালেন্স সতর্কতা'), b('Warn below ', 'এর নিচে সতর্ক: ') + fmt(s.lowBal))}</div>
  <div class="card set">${row('go', b('Budgets', 'বাজেট'), '').replace('data-act="go"', 'data-act="go" data-to="budget"')}
    ${row('go', b('Savings goals', 'সঞ্চয় লক্ষ্য'), '').replace('data-act="go"', 'data-act="go" data-to="goals"')}
    ${row('go', b('Notes and reminders', 'নোট ও রিমাইন্ডার'), '').replace('data-act="go"', 'data-act="go" data-to="rems"')}
    ${row('go', b('Categories', 'ক্যাটেগরি'), '').replace('data-act="go"', 'data-act="go" data-to="cats"')}</div>
  <div class="card set">${row('backup', b('Export backup (JSON)', 'ব্যাকআপ এক্সপোর্ট (JSON)'), b('Save or share a copy of all your data', 'সব ডেটার কপি সেভ বা শেয়ার করুন'))}
    ${row('restore', b('Restore from backup', 'ব্যাকআপ থেকে রিস্টোর'), b('Replaces everything on this phone', 'এই ফোনের সব ডেটা বদলে যাবে'))}
    ${row('wipe', '<span class="neg">' + b('Erase all data', 'সব ডেটা মুছুন') + '</span>', '')}</div>
  <p class="lbl" style="text-align:center">${b('Amar Hisab 1.0. Works fully offline. Your data never leaves this phone.', 'আমার হিসাব ১.০। সম্পূর্ণ অফলাইন। আপনার ডেটা এই ফোনেই থাকে।')}</p>`;
}

/* ---------- sheets ---------- */
const val = (sh, id) => sh.querySelector(id).value;
function askText(title, label, v, cb, mode) {
  const sh = sheet(`<h2>${title}</h2><label class="f">${label}<input id="tv" ${mode ? `inputmode="${mode}"` : ''} value="${esc(v || '')}"></label>
  <div class="btns" style="margin-top:14px"><button class="btn sec" id="cx">${b('Cancel', 'বাতিল')}</button><button class="btn" id="ok">${b('Save', 'সংরক্ষণ')}</button></div>`);
  sh.querySelector('#cx').onclick = closeSheet; sh.querySelector('#ok').onclick = () => { const x = val(sh, '#tv').trim(); if (cb(x) !== false) closeSheet(); };
  sh.querySelector('#tv').focus();
}
function budgetState() { const ex = monthExpense(), c = {}; ex.forEach(t => c[t.cat] = (c[t.cat] || 0) + Number(t.amount)); return { m: sum(ex), c }; }
function warnBudget(before) {
  const a = budgetState(), msgs = [];
  const chk = (label, bud, bf, af) => { if (!bud) return; const pb = bf / bud * 100, pa = af / bud * 100;
    if (pa >= 100 && pb < 100) msgs.push('⚠ ' + label + ': ' + b('100% of budget used', 'বাজেটের ১০০% শেষ'));
    else if (pa >= 80 && pb < 80) msgs.push('⚠ ' + label + ': ' + b('80% of budget used', 'বাজেটের ৮০% শেষ')); };
  chk(b('Monthly budget', 'মাসিক বাজেট'), S.budgets.month, before.m, a.m);
  Object.keys(S.budgets.cats).forEach(id => chk(cn(cat(id)), S.budgets.cats[id], before.c[id] || 0, a.c[id] || 0));
  if (msgs.length) setTimeout(() => toast(msgs.join('\n')), 350);
}

function txSheet(id) {
  const t = id ? S.tx.find(x => x.id === id) : null; let type = t ? t.type : 'expense'; let c0 = t ? t.cat : null;
  const sh = sheet(`<h2>${t ? b('Edit transaction', 'লেনদেন এডিট') : b('Add transaction', 'নতুন লেনদেন')}</h2>
  <div class="seg" id="tt"><button data-v="expense">${b('Expense', 'ব্যয়')}</button><button data-v="income">${b('Income', 'আয়')}</button></div>
  ${amtField(t ? t.amount : '')}
  <div class="lbl" style="margin-top:12px">${b('Category', 'ক্যাটেগরি')}</div><div class="chips" id="chips"></div>
  <label class="f">${b('Description', 'বিবরণ')}<input id="note" value="${esc(t ? t.note : '')}"></label>
  <label class="f">${b('Date and time', 'তারিখ ও সময়')}<input type="datetime-local" id="dt" value="${t ? t.dt : nowLocal()}"></label>
  <div class="btns" style="margin-top:16px">${t ? `<button class="btn sec" id="del" style="color:var(--neg)">${b('Delete', 'মুছুন')}</button>` : ''}<button class="btn" id="ok">${b('Save', 'সংরক্ষণ')}</button></div>`);
  const draw = () => { sh.querySelectorAll('#tt button').forEach(x => x.classList.toggle('on', x.dataset.v === type));
    const l = S.cats.filter(c => c.type === type); if (!l.find(c => c.id === c0)) c0 = l[0].id;
    sh.querySelector('#chips').innerHTML = l.map(c => `<label><input type="radio" name="cat" value="${c.id}" ${c.id === c0 ? 'checked' : ''}><span>${esc(cn(c))}</span></label>`).join('');
    sh.querySelectorAll('[name=cat]').forEach(r => r.onchange = () => c0 = r.value); };
  sh.querySelectorAll('#tt button').forEach(x => x.onclick = () => { type = x.dataset.v; c0 = null; draw(); });
  draw(); wireAmt(sh); if (!t) sh.querySelector('#amt').focus();
  sh.querySelector('#ok').onclick = () => {
    const amount = calc(val(sh, '#amt')); if (!(amount > 0)) return toast(b('Enter a valid amount', 'সঠিক পরিমাণ লিখুন'));
    const row = { type, cat: c0, amount, note: val(sh, '#note').trim(), dt: val(sh, '#dt') || nowLocal() }; const before = budgetState();
    if (t) Object.assign(t, row); else S.tx.push(Object.assign({ id: nid() }, row));
    save(); closeSheet(); render(); if (type === 'expense') warnBudget(before); };
  if (t) sh.querySelector('#del').onclick = () => confirmBox(b('Delete this transaction?', 'এই লেনদেন মুছে ফেলবেন?'), () => { S.tx = S.tx.filter(x => x.id !== id); save(); closeSheet(); render(); });
}

function addPerson() {
  let kind = UI.ledTab;
  const sh = sheet(`<h2>${b('Add person', 'ব্যক্তি যোগ করুন')}</h2>
  <div class="seg" id="kk"><button data-v="receivable">${b('Others owe me', 'পাওনা')}</button><button data-v="payable">${b('I owe others', 'দেনা')}</button></div>
  <label class="f">${b('Name', 'নাম')}<input id="nm" autocomplete="off"></label>${amtField('', b('Opening balance (optional)', 'শুরুর ব্যালেন্স (ঐচ্ছিক)'))}
  <label class="f">${b('Date and time', 'তারিখ ও সময়')}<input type="datetime-local" id="dt" value="${nowLocal()}"></label>
  <label class="f">${b('Note', 'নোট')}<input id="note"></label>
  <div class="btns" style="margin-top:16px"><button class="btn" id="ok">${b('Create ledger', 'খাতা খুলুন')}</button></div>`);
  const draw = () => sh.querySelectorAll('#kk button').forEach(x => x.classList.toggle('on', x.dataset.v === kind));
  sh.querySelectorAll('#kk button').forEach(x => x.onclick = () => { kind = x.dataset.v; draw(); }); draw(); wireAmt(sh);
  sh.querySelector('#ok').onclick = () => {
    const name = val(sh, '#nm').trim(); if (!name) return toast(b('Enter a name', 'নাম লিখুন'));
    if (S.people.some(p => p.kind === kind && p.name.toLowerCase() === name.toLowerCase())) return toast(b('This person already exists here', 'এই নামে আগেই খাতা আছে'));
    const raw = val(sh, '#amt').trim(), amt = raw ? calc(raw) : 0; if (isNaN(amt) || amt < 0) return toast(b('Enter a valid amount', 'সঠিক পরিমাণ লিখুন'));
    const p = { id: nid(), name, kind }; S.people.push(p);
    if (amt > 0) { const id = nid(); S.led.push({ id, seq: id, pid: p.id, type: 'opening', amount: amt, dt: val(sh, '#dt') || nowLocal(), note: val(sh, '#note').trim() }); applyLed(p.id, S.led.filter(e => e.pid === p.id)); }
    UI.ledTab = kind; save(); closeSheet(); UI.route = 'person:' + p.id; render(); };
}
function applyLed(pid, list) { S.led = S.led.filter(e => e.pid !== pid).concat(L.recalc(list)); }

function entrySheet(pid, type, id) {
  const p = S.people.find(x => x.id === pid), e = id ? S.led.find(x => x.id === id) : null; type = e ? e.type : type;
  const types = ['opening', 'add', 'partial', 'full', 'adjustment'];
  const sh = sheet(`<h2>${e ? b('Edit entry', 'এন্ট্রি এডিট') : esc(p.name)}</h2>
  <label class="f">${b('Type', 'ধরন')}<select id="et">${types.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${etype(p.kind, t)}</option>`).join('')}</select></label>
  <div id="amtbox">${amtField(e && e.type !== 'full' ? Math.abs(e.amount) : '')}</div>
  <label class="f" id="sgbox">${b('Direction', 'দিক')}<select id="sg"><option value="+">${b('Increase balance (+)', 'ব্যালেন্স বাড়াবে (+)')}</option><option value="-" ${e && e.type === 'adjustment' && e.amount < 0 ? 'selected' : ''}>${b('Decrease balance (−)', 'ব্যালেন্স কমাবে (−)')}</option></select></label>
  <div class="prev" id="fullmsg">${b('Pays the whole outstanding balance at that time.', 'সেই সময়ের পুরো বকেয়া পরিশোধ হবে।')}</div>
  <label class="f">${b('Date and time', 'তারিখ ও সময়')}<input type="datetime-local" id="dt" value="${e ? e.dt : nowLocal()}"></label>
  <label class="f">${b('Note', 'নোট')}<input id="note" value="${esc(e ? e.note : '')}"></label>
  <div class="prev" id="pv" style="font-size:14px;margin-top:10px"></div>
  <div class="btns" style="margin-top:12px">${e ? `<button class="btn sec" id="del" style="color:var(--neg)">${b('Delete', 'মুছুন')}</button>` : ''}<button class="btn" id="ok">${b('Save', 'সংরক্ষণ')}</button></div>`);
  const build = () => { const t = val(sh, '#et'); let amt = calc(val(sh, '#amt'));
    if (t === 'adjustment' && !isNaN(amt)) amt = (amt === 0 ? NaN : Math.abs(amt) * (val(sh, '#sg') === '-' ? -1 : 1));
    const entry = { id: e ? e.id : 0, seq: e ? e.seq : S.seq, pid, type: t, amount: t === 'full' ? 0 : amt, dt: val(sh, '#dt') || nowLocal(), note: val(sh, '#note').trim() };
    return { entry, list: S.led.filter(x => x.pid === pid && (!e || x.id !== e.id)).concat([entry]) }; };
  const msg = v => v.code === 'negative' ? b('Payment is more than the outstanding balance (', 'পরিশোধ বকেয়ার চেয়ে বেশি (') + fmt(v.entry.prev) + b(' at that time)', ' ঐ সময়ে)')
    : v.code === 'nothing' ? b('Nothing is outstanding to pay at that time', 'ঐ সময়ে পরিশোধের মতো বকেয়া নেই') : b('Enter a valid amount', 'সঠিক পরিমাণ লিখুন');
  const refresh = () => { const t = val(sh, '#et'); sh.querySelector('#amtbox').style.display = t === 'full' ? 'none' : ''; sh.querySelector('#sgbox').style.display = t === 'adjustment' ? '' : 'none';
    sh.querySelector('#fullmsg').style.display = t === 'full' ? '' : 'none';
    const { list } = build(), v = L.validate(list), pv = sh.querySelector('#pv');
    pv.innerHTML = v.ok ? `${b('New balance: ', 'নতুন ব্যালেন্স: ')}<b>${fmt(L.balance(list))}</b>` : `<span class="neg">${msg(v)}</span>`; };
  wireAmt(sh, refresh); ['#et', '#sg', '#dt'].forEach(s => sh.querySelector(s).addEventListener('change', refresh)); refresh();
  sh.querySelector('#ok').onclick = () => { const { entry, list } = build(), v = L.validate(list); if (!v.ok) return toast(msg(v));
    if (!e) { entry.id = nid(); entry.seq = entry.id; } applyLed(pid, list.map(x => x === entry ? entry : x)); save(); closeSheet(); render(); };
  if (e) sh.querySelector('#del').onclick = () => confirmBox(b('Delete this entry? The balance will be recalculated.', 'এই এন্ট্রি মুছবেন? ব্যালেন্স নতুন করে হিসাব হবে।'), () => {
    const list = S.led.filter(x => x.pid === pid && x.id !== e.id), v = L.validate(list);
    if (!v.ok) return toast(b('Cannot delete: a later payment would exceed the balance', 'মোছা যাবে না: পরের কোনো পরিশোধ বকেয়ার চেয়ে বেশি হয়ে যাবে'));
    applyLed(pid, list); save(); closeSheet(); render(); });
}

function goalSheet() {
  const sh = sheet(`<h2>${b('New savings goal', 'নতুন সঞ্চয় লক্ষ্য')}</h2><label class="f">${b('Goal name', 'লক্ষ্যের নাম')}<input id="nm"></label>${amtField('', b('Target amount (৳)', 'লক্ষ্য পরিমাণ (৳)'))}
  <div class="btns" style="margin-top:16px"><button class="btn" id="ok">${b('Create', 'তৈরি করুন')}</button></div>`); wireAmt(sh);
  sh.querySelector('#ok').onclick = () => { const name = val(sh, '#nm').trim(), t = calc(val(sh, '#amt')); if (!name || !(t > 0)) return toast(b('Enter a name and target', 'নাম ও লক্ষ্য লিখুন'));
    S.goals.push({ id: nid(), name, target: t, saved: 0, hist: [] }); save(); closeSheet(); render(); };
}
function goalMoney(id, mode) {
  const g = S.goals.find(x => x.id === id);
  const sh = sheet(`<h2>${esc(g.name)}</h2><div class="lbl">${b('Saved so far: ', 'এখন জমা: ')}${fmt(g.saved)}</div>${amtField('', mode === 'add' ? b('Amount to add (৳)', 'জমার পরিমাণ (৳)') : b('Amount to withdraw (৳)', 'তোলার পরিমাণ (৳)'))}
  <div class="btns" style="margin-top:16px"><button class="btn" id="ok">${mode === 'add' ? b('Add money', 'জমা করুন') : b('Withdraw', 'তুলুন')}</button></div>`); wireAmt(sh);
  sh.querySelector('#ok').onclick = () => { const a = calc(val(sh, '#amt')); if (!(a > 0)) return toast(b('Enter a valid amount', 'সঠিক পরিমাণ লিখুন'));
    if (mode === 'wd' && a > g.saved) return toast(b('You only have ' + fmt(g.saved) + ' saved', 'জমা আছে মাত্র ' + fmt(g.saved)));
    g.saved = L.r2(g.saved + (mode === 'add' ? a : -a)); g.hist.push({ dt: nowLocal(), amount: mode === 'add' ? a : -a }); save(); closeSheet(); render(); };
}

function remSheet(id, pre) {
  const r = id ? S.rem.find(x => x.id === id) : null;
  const sh = sheet(`<h2>${r ? b('Edit', 'এডিট') : b('New note or reminder', 'নতুন নোট বা রিমাইন্ডার')}</h2>
  <label class="f">${b('Title', 'শিরোনাম')}<input id="tt" value="${esc(r ? r.title : pre ? pre.title : '')}"></label>
  <label class="f">${b('Note', 'নোট')}<textarea id="note" rows="2">${esc(r ? r.note : '')}</textarea></label>
  <div class="grid2"><label class="f">${b('Due date (optional)', 'তারিখ (ঐচ্ছিক)')}<input type="date" id="due" value="${r ? r.due : ''}"></label><label class="f">${b('Time', 'সময়')}<input type="time" id="tm" value="${r ? r.time || '09:00' : '09:00'}"></label></div>
  ${r ? `<label class="f"><span><input type="checkbox" id="dn" style="width:auto;margin-right:8px" ${r.done ? 'checked' : ''}>${b('Done', 'সম্পন্ন')}</span></label>` : ''}
  <div class="btns" style="margin-top:16px">${r ? `<button class="btn sec" id="del" style="color:var(--neg)">${b('Delete', 'মুছুন')}</button>` : ''}<button class="btn" id="ok">${b('Save', 'সংরক্ষণ')}</button></div>`);
  sh.querySelector('#ok').onclick = () => { const title = val(sh, '#tt').trim(); if (!title) return toast(b('Enter a title', 'শিরোনাম লিখুন'));
    const row = { title, note: val(sh, '#note').trim(), due: val(sh, '#due'), time: val(sh, '#tm') || '09:00', done: r ? sh.querySelector('#dn').checked : false };
    let x = r; if (r) Object.assign(r, row); else { x = Object.assign({ id: nid() }, row); S.rem.push(x); }
    cancelNotif(x.id); if (!x.done && x.due) schedNotif(x); save(); closeSheet(); render(); };
  if (r) sh.querySelector('#del').onclick = () => confirmBox(b('Delete this reminder?', 'রিমাইন্ডার মুছবেন?'), () => { cancelNotif(r.id); S.rem = S.rem.filter(x => x.id !== id); save(); closeSheet(); render(); });
}
const LN = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
async function schedNotif(r) { const n = LN(); if (!n) return; try { await n.requestPermissions(); const at = new Date(r.due + 'T' + (r.time || '09:00') + ':00');
  if (at > new Date()) await n.schedule({ notifications: [{ id: r.id, title: 'আমার হিসাব', body: r.title, schedule: { at } }] }); } catch (e) { /* in-app banner still works */ } }
async function cancelNotif(id) { const n = LN(); if (!n) return; try { await n.cancel({ notifications: [{ id }] }); } catch (e) { } }

function catSheet() {
  let type = 'expense';
  const sh = sheet(`<h2>${b('New category', 'নতুন ক্যাটেগরি')}</h2><div class="seg" id="kk"><button data-v="expense">${b('Expense', 'ব্যয়')}</button><button data-v="income">${b('Income', 'আয়')}</button></div>
  <label class="f">${b('Name', 'নাম')}<input id="nm"></label><div class="btns" style="margin-top:16px"><button class="btn" id="ok">${b('Add', 'যোগ করুন')}</button></div>`);
  const draw = () => sh.querySelectorAll('#kk button').forEach(x => x.classList.toggle('on', x.dataset.v === type));
  sh.querySelectorAll('#kk button').forEach(x => x.onclick = () => { type = x.dataset.v; draw(); }); draw();
  sh.querySelector('#ok').onclick = () => { const n = val(sh, '#nm').trim(); if (!n) return toast(b('Enter a name', 'নাম লিখুন'));
    S.cats.push({ id: 'c' + nid(), name: n, bn: n, type, custom: true }); save(); closeSheet(); render(); };
}

/* ---------- PIN lock ---------- */
async function hash(s) { try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ah:' + s)); return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let h = 5381; for (const c of 'ah:' + s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + h; } }
function pinPad(title, cb, cancelable) {
  const ov = document.createElement('div'); ov.className = 'lock'; let v = '';
  const draw = m => { ov.innerHTML = `<div class="lk"><h2>${title}</h2><p>${m || ''}</p><div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>
    ${cancelable ? `<button class="ghost" data-k="x" style="margin-top:14px">${b('Cancel', 'বাতিল')}</button>` : ''}</div>`; };
  ov.onclick = async e => { const k = e.target.dataset && e.target.dataset.k; if (k == null) return; if (k === 'x') { ov.remove(); return; }
    if (k === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += k; draw();
    if (v.length === 4) { const r = await cb(v); if (r === false) { v = ''; draw(b('Wrong PIN, try again', 'ভুল পিন, আবার চেষ্টা করুন')); } else ov.remove(); } };
  draw(); document.body.appendChild(ov);
}
function showLock() { if (!S.settings.pin || document.querySelector('.lock')) return; pinPad(b('Enter PIN', 'পিন দিন'), async v => (await hash(v)) === S.settings.pin); }
function setPin() { pinPad(b('Set a 4-digit PIN', '৪ সংখ্যার পিন দিন'), async p1 => { setTimeout(() => pinPad(b('Confirm PIN', 'পিন আবার দিন'), async p2 => {
  if (p2 !== p1) return false; S.settings.pin = await hash(p2); save(); toast(b('PIN set', 'পিন সেট হয়েছে')); render(); }, true), 60); }, true); }

/* ---------- backup & restore ---------- */
function backupObj() { const d = JSON.parse(JSON.stringify(S)); delete d.settings.pin; return { app: 'amar-hisab', version: 1, exported: new Date().toISOString(), data: d }; }
async function exportBackup() {
  const json = JSON.stringify(backupObj(), null, 2), name = 'amar-hisab-backup-' + nowLocal().slice(0, 10) + '.json';
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  try { if (P.Filesystem && P.Share) { const r = await P.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
    await P.Share.share({ title: name, url: r.uri, dialogTitle: b('Save backup', 'ব্যাকআপ সেভ করুন') }); return; } }
  catch (e) { if (/cancel/i.test(String(e && e.message || e))) return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  try { await navigator.clipboard.writeText(json); } catch (e) { } toast(b('Backup downloaded', 'ব্যাকআপ ডাউনলোড হয়েছে'));
}
function checkBackup(o) {
  const bad = m => ({ ok: false, msg: m });
  if (!o || o.app !== 'amar-hisab' || !o.data) return bad(b('This is not an Amar Hisab backup file', 'এটি আমার হিসাবের ব্যাকআপ ফাইল নয়'));
  const d = o.data; for (const k of ['tx', 'people', 'led', 'cats', 'goals', 'rem']) if (!Array.isArray(d[k])) return bad(b('Backup is damaged (missing ' + k + ')', 'ব্যাকআপ নষ্ট (' + k + ' নেই)'));
  if (!d.budgets || typeof d.budgets !== 'object') return bad(b('Backup is damaged (budgets)', 'ব্যাকআপ নষ্ট (বাজেট)'));
  const ids = new Set(d.people.map(p => p.id)); if (ids.size !== d.people.length || d.people.some(p => !p.name || !['receivable', 'payable'].includes(p.kind))) return bad(b('Backup has invalid people', 'ব্যাকআপে ব্যক্তির তথ্য ভুল'));
  if (d.tx.some(t => !['income', 'expense'].includes(t.type) || !isFinite(t.amount) || !(t.amount > 0) || typeof t.dt !== 'string')) return bad(b('Backup has invalid transactions', 'ব্যাকআপে লেনদেন ভুল'));
  if (d.led.some(e => !ids.has(e.pid) || !['opening', 'add', 'partial', 'full', 'adjustment'].includes(e.type) || typeof e.dt !== 'string' || (e.type !== 'full' && !isFinite(e.amount)))) return bad(b('Backup has invalid ledger entries', 'ব্যাকআপে খাতার এন্ট্রি ভুল'));
  for (const id of ids) if (!L.validate(d.led.filter(e => e.pid === id)).ok) return bad(b('Ledger balances in the backup do not add up', 'ব্যাকআপের খাতার হিসাব মেলে না'));
  return { ok: true };
}
function restoreFrom(text) {
  let o; try { o = JSON.parse(text); } catch (e) { return toast(b('File is not valid JSON', 'ফাইলটি সঠিক JSON নয়')); }
  const r = checkBackup(o); if (!r.ok) return toast(r.msg); const d = o.data;
  const sh = sheet(`<h2>${b('Restore backup?', 'ব্যাকআপ রিস্টোর করবেন?')}</h2><div class="note over">${b('This replaces ALL data currently on this phone. This cannot be undone.', 'এই ফোনের বর্তমান সব ডেটা মুছে যাবে। আগের অবস্থায় ফেরানো যাবে না।')}</div>
  <p class="mut">${b('Backup from ', 'ব্যাকআপের তারিখ: ')}${fd(o.exported)}<br>${nz(d.tx.length)} ${b('transactions', 'লেনদেন')}, ${nz(d.people.length)} ${b('people', 'ব্যক্তি')}, ${nz(d.led.length)} ${b('ledger entries', 'খাতার এন্ট্রি')}, ${nz(d.goals.length)} ${b('goals', 'লক্ষ্য')}</p>
  <div class="btns" style="margin-top:14px"><button class="btn sec" id="cx">${b('Cancel', 'বাতিল')}</button><button class="btn danger" id="ok">${b('Replace my data', 'ডেটা বদলে দিন')}</button></div>`);
  sh.querySelector('#cx').onclick = closeSheet;
  sh.querySelector('#ok').onclick = () => { const pin = S.settings.pin, n = Object.assign(fresh(), d); n.settings = Object.assign(fresh().settings, d.settings || {}, { pin });
    n.led = []; d.people.forEach(p => n.led.push(...L.recalc(d.led.filter(e => e.pid === p.id))));
    n.seq = Math.max(n.seq || 1, 1 + Math.max(0, ...[].concat(d.tx, d.people, d.led, d.goals, d.rem).map(x => x.id || 0)));
    S = n; save(); closeSheet(); UI.route = 'home'; render(); toast(b('Backup restored', 'ব্যাকআপ রিস্টোর হয়েছে')); };
}
function pickRestore() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json,text/plain';
  i.onchange = async () => { if (i.files[0]) restoreFrom(await i.files[0].text()); }; i.click(); }

/* ---------- actions & render ---------- */
const TABS = ['home', 'tx', 'ledger', 'reports', 'settings'];
const A = {
  go(d) { if (!TABS.includes(d.to)) UI.from = UI.route; UI.route = d.to; render(); scrollTo(0, 0); },
  back() { UI.route = UI.route.startsWith('person') ? 'ledger' : (UI.from || 'home'); if (!TABS.includes(UI.route) && UI.route === UI.from) UI.from = 'home'; render(); },
  ledTab(d) { UI.ledTab = d.t; UI.route = 'ledger'; render(); },
  addTx() { txSheet(); }, editTx(d) { txSheet(+d.id); },
  txP(d) { UI.txPeriod = d.v; render(); }, txT(d) { UI.txType = d.v; render(); },
  repK(d) { UI.repKind = d.v; UI.repDate = new Date(); render(); },
  repNav(d) { const n = +d.v, x = new Date(UI.repDate), k = UI.repKind; if (k === 'day') x.setDate(x.getDate() + n); else if (k === 'week') x.setDate(x.getDate() + 7 * n);
    else if (k === 'month') { x.setDate(1); x.setMonth(x.getMonth() + n); } else { x.setDate(1); x.setFullYear(x.getFullYear() + n); } UI.repDate = x; render(); },
  addPerson, entry(d) { entrySheet(+d.pid, d.t); }, editEntry(d) { const e = S.led.find(x => x.id === +d.id); entrySheet(e.pid, e.type, e.id); },
  personMenu(d) { const id = +d.id, p = S.people.find(x => x.id === id);
    const sh = sheet(`<h2>${esc(p.name)}</h2><div class="btns" style="flex-direction:column"><button class="btn sec" id="rn">${b('Rename', 'নাম বদলান')}</button><button class="btn sec" id="rm">${b('Set a reminder', 'রিমাইন্ডার দিন')}</button><button class="btn sec" id="dl" style="color:var(--neg)">${b('Delete person and history', 'ব্যক্তি ও পুরো ইতিহাস মুছুন')}</button></div>`);
    sh.querySelector('#rn').onclick = () => askText(b('Rename', 'নাম বদলান'), b('Name', 'নাম'), p.name, v => { if (!v) return false; p.name = v; save(); render(); });
    sh.querySelector('#rm').onclick = () => remSheet(null, { title: (p.kind === 'receivable' ? b('Collect from ', 'আদায়: ') : b('Pay ', 'পরিশোধ: ')) + p.name });
    sh.querySelector('#dl').onclick = () => confirmBox(b('Delete ' + p.name + ' and all their entries?', p.name + ' ও সব এন্ট্রি মুছবেন?'), () => { S.people = S.people.filter(x => x.id !== id); S.led = S.led.filter(e => e.pid !== id); save(); UI.route = 'ledger'; render(); }); },
  goalNew: goalSheet, goalMoney(d) { goalMoney(+d.id, d.m); },
  goalDel(d) { confirmBox(b('Delete this goal?', 'এই লক্ষ্য মুছবেন?'), () => { S.goals = S.goals.filter(g => g.id !== +d.id); save(); render(); }); },
  remNew() { remSheet(); }, remEdit(d) { remSheet(+d.id); },
  catNew: catSheet,
  catDel(d) { if (S.tx.some(t => t.cat === d.id)) return toast(b('This category is used by transactions', 'এই ক্যাটেগরিতে লেনদেন আছে'));
    confirmBox(b('Delete this category?', 'ক্যাটেগরি মুছবেন?'), () => { S.cats = S.cats.filter(c => c.id !== d.id); delete S.budgets.cats[d.id]; save(); render(); }); },
  lang() { S.settings.lang = S.settings.lang === 'bn' ? 'en' : 'bn'; save(); render(); },
  theme() { const o = ['auto', 'light', 'dark']; S.settings.theme = o[(o.indexOf(S.settings.theme) + 1) % 3]; save(); render(); },
  pin() { if (!S.settings.pin) return setPin();
    const sh = sheet(`<h2>${b('App lock', 'অ্যাপ লক')}</h2><div class="btns" style="flex-direction:column"><button class="btn sec" id="ch">${b('Change PIN', 'পিন বদলান')}</button><button class="btn sec" id="rm" style="color:var(--neg)">${b('Remove PIN', 'পিন বন্ধ করুন')}</button></div>`);
    const ask = then => { closeSheet(); pinPad(b('Enter current PIN', 'বর্তমান পিন দিন'), async v => { if ((await hash(v)) !== S.settings.pin) return false; setTimeout(then, 60); }, true); };
    sh.querySelector('#ch').onclick = () => ask(setPin);
    sh.querySelector('#rm').onclick = () => ask(() => { S.settings.pin = null; save(); toast(b('PIN removed', 'পিন বন্ধ হয়েছে')); render(); }); },
  lowBal() { askText(b('Low-balance warning', 'কম ব্যালেন্স সতর্কতা'), b('Warn when balance is below (৳)', 'ব্যালেন্স এর নিচে গেলে সতর্ক (৳)'), S.settings.lowBal, v => { const n = calc(v); if (isNaN(n) || n < 0) return false; S.settings.lowBal = n; save(); render(); }, 'decimal'); },
  backup() { exportBackup(); }, restore() { pickRestore(); },
  wipe() { confirmBox(b('Erase ALL data on this phone? Export a backup first if you may need it.', 'এই ফোনের সব ডেটা মুছে ফেলবেন? লাগতে পারে মনে হলে আগে ব্যাকআপ নিন।'), () => {
    S.rem.forEach(r => cancelNotif(r.id)); S = Object.assign(fresh(), { settings: S.settings }); save(); UI.route = 'home'; render(); }, b('Erase everything', 'সব মুছুন')); }
};

function mainHtml() { const r = UI.route;
  if (r.startsWith('person:')) return Person(+r.slice(7));
  return ({ home: Home, tx: Tx, ledger: Ledger, reports: Reports, settings: Settings, budget: Budget, goals: Goals, rems: Rems, cats: Cats }[r] || Home)(); }
const tabOf = r => r.startsWith('person') ? 'ledger' : (r === 'budget' || r === 'goals') ? 'home' : (r === 'rems' || r === 'cats') ? 'settings' : r;
function render() {
  if (S.settings.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.settings.theme);
  document.documentElement.lang = S.settings.lang;
  const tab = tabOf(UI.route), names = { home: b('Home', 'হোম'), tx: b('Transactions', 'লেনদেন'), ledger: b('Ledger', 'খাতা'), reports: b('Reports', 'রিপোর্ট'), settings: b('Settings', 'সেটিংস') };
  $('#app').innerHTML = `<div id="main">${mainHtml()}</div>${(UI.route === 'home' || UI.route === 'tx') ? '<button class="fab" data-act="addTx" aria-label="add">+</button>' : ''}
  <nav class="nav">${TABS.map(t => `<button class="${tab === t ? 'on' : ''}" data-act="go" data-to="${t}"><svg viewBox="0 0 24 24">${ICON[t]}</svg>${names[t]}</button>`).join('')}</nav>`;
}

document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el.dataset, el); });
document.addEventListener('input', e => { if (e.target.id === 'q') { UI.q = e.target.value; $('#txlist').innerHTML = txListHtml(); } });
document.addEventListener('change', e => { const t = e.target;
  if (t.id === 'catF') { UI.cat = t.value; $('#txlist').innerHTML = txListHtml(); }
  else if (t.id === 'fromD') { UI.from_ = t.value; $('#txlist').innerHTML = txListHtml(); }
  else if (t.id === 'toD') { UI.to_ = t.value; $('#txlist').innerHTML = txListHtml(); }
  else if (t.dataset && t.dataset.bud) { const v = t.value.trim() === '' ? 0 : calc(t.value); if (isNaN(v) || v < 0) return toast(b('Enter a valid amount', 'সঠিক পরিমাণ লিখুন'));
    if (t.dataset.bud === 'month') S.budgets.month = v; else if (v) S.budgets.cats[t.dataset.bud] = v; else delete S.budgets.cats[t.dataset.bud]; save(); render(); } });

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (S.settings.pin && Date.now() - hiddenAt > 20000) showLock(); });
const capApp = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
if (capApp && capApp.addListener) capApp.addListener('backButton', () => {
  if (document.querySelector('.ov')) return closeSheet(); if (document.querySelector('.lock')) return;
  if (!TABS.includes(UI.route)) return A.back(); if (UI.route !== 'home') { UI.route = 'home'; return render(); } capApp.exitApp && capApp.exitApp(); });

(async function init() {
  try { const raw = await idbGet('state'); if (raw) { const d = JSON.parse(raw); S = Object.assign(fresh(), d); S.settings = Object.assign(fresh().settings, d.settings || {}); S.budgets = Object.assign({ month: 0, cats: {} }, d.budgets || {}); } }
  catch (e) { S = fresh(); }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
  render(); showLock();
  window.__amar = { S: () => S, UI, A, render };
})();
})();
