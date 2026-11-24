/* Amar Hisab: person-wise running-balance ledger (pure logic, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ledger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // opening / add increase the outstanding balance; partial / full reduce it;
  // adjustment carries its own sign.
  function delta(e, prev) {
    switch (e.type) {
      case 'opening':
      case 'add': return Number(e.amount);
      case 'partial': return -Number(e.amount);
      case 'full': return -prev;           // full payment always clears what is outstanding at that moment
      case 'adjustment': return Number(e.amount);
      default: return 0;
    }
  }

  function sort(list) {
    return list.slice().sort((a, b) =>
      a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : (a.seq || 0) - (b.seq || 0));
  }

  // Returns a new chronological list with prev (previous balance) and bal (updated balance) filled in.
  function recalc(list) {
    let bal = 0;
    return sort(list).map(e => {
      const prev = bal;
      const x = Object.assign({}, e, { prev });
      if (x.type === 'full') x.amount = r2(prev);
      bal = r2(bal + delta(x, prev));
      x.bal = bal;
      return x;
    });
  }

  function balance(list) {
    const r = recalc(list);
    return r.length ? r[r.length - 1].bal : 0;
  }

  // ok:false when a payment would take the balance below zero (adjustments may go negative on purpose).
  function validate(list) {
    for (const e of recalc(list)) {
      if (!isFinite(e.amount)) return { ok: false, code: 'amount', entry: e };
      if (e.type !== 'adjustment' && e.type !== 'full' && !(Number(e.amount) > 0)) return { ok: false, code: 'amount', entry: e };
      if (e.type === 'full' && e.prev <= 0) return { ok: false, code: 'nothing', entry: e };
      if ((e.type === 'partial' || e.type === 'full') && e.bal < 0) return { ok: false, code: 'negative', entry: e };
    }
    return { ok: true };
  }

  return { r2, delta, sort, recalc, balance, validate };
});
