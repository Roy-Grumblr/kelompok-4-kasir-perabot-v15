'use strict';

const state = require('../state');
const { dayKey } = require('./time');
const { live, lowLim, okTx } = require('./util');

function movement(days) {
  const since = Date.now() - days * 864e5, q = {}, rev = {}, cat = {};
  const kat = Object.fromEntries(state.db.products.map(p => [p.id, p.kat]));
  okTx().forEach(t => {
    if (Date.parse(t.date) < since) return;
    t.items.forEach(i => { q[i.id] = (q[i.id] || 0) + i.qty; rev[i.id] = (rev[i.id] || 0) + i.qty * i.harga; const k = kat[i.id] || 'Lainnya'; cat[k] = (cat[k] || 0) + i.qty * i.harga; });
  });
  const lim = lowLim();
  const L = live().map(p => ({ id: p.id, kode: p.kode, nama: p.nama, stok: p.stok, qty: q[p.id] || 0, omzet: rev[p.id] || 0 }));
  const fast = L.filter(x => x.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 10).map(x => ({ ...x, hint: x.stok <= lim ? 'Segera restock' : x.stok <= lim * 3 ? 'Pantau stok' : 'Pacu terus', lv: x.stok <= lim ? 'bad' : x.stok <= lim * 3 ? 'warn' : 'ok' }));
  const slow = L.filter(x => x.stok > 0).sort((a, b) => a.qty - b.qty || b.stok - a.stok).slice(0, 10).map(x => ({ ...x, hint: x.qty === 0 ? 'Belum laku, tahan restock' : x.stok > lim ? 'Tahan restock' : 'Stok tipis, lambat laku', lv: x.qty === 0 ? 'bad' : x.stok > lim ? 'warn' : 'ok' }));
  return { fast, slow, cat: Object.entries(cat).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v) };
}
function dashboard(role, per = 30) {
  const lim = lowLim(), L = live(), now = Date.now(), today = dayKey(now);
  const days = [...Array(7)].map((_, i) => dayKey(now - (6 - i) * 864e5));
  const d7 = Object.fromEntries(days.map(d => [d, { d, omzet: 0, laba: 0, trx: 0 }]));
  let tOm = 0, tLaba = 0, tTrx = 0, allOm = 0;
  okTx().forEach(t => {
    const k = dayKey(Date.parse(t.date)); allOm += t.total;
    if (d7[k]) { d7[k].omzet += t.total; d7[k].laba += t.profit; d7[k].trx++; }
    if (k === today) { tOm += t.total; tLaba += t.profit; tTrx++; }
  });
  const mv = movement(per), strip = a => role === 'gudang' ? a.map(({ omzet, ...r }) => r) : a;
  const out = { role, lim, days: per,
    low: L.filter(p => p.stok <= lim).sort((a, b) => a.stok - b.stok).slice(0, 10).map(p => ({ id: p.id, kode: p.kode, nama: p.nama, stok: p.stok })),
    lowCount: L.filter(p => p.stok <= lim).length,
    restock: state.db.restock.filter(r => !r.done).slice(-20).reverse(),
    fast: strip(mv.fast), slow: strip(mv.slow) };
  if (role !== 'gudang') {
    out.stat = { omzet: tOm, trx: tTrx, produk: L.length };
    out.pesanan = { baru: state.db.orders.filter(o => o.status === 'baru').length, proses: state.db.orders.filter(o => o.status === 'diproses').length };
    out.daily = days.map(d => ({ d, omzet: d7[d].omzet, trx: d7[d].trx, ...(role === 'owner' ? { laba: d7[d].laba } : {}) }));
    out.cat = mv.cat;
    if (role === 'owner') { out.stat.laba = tLaba; out.stat.totalOmzet = allOm; out.todo = { pending: state.db.users.filter(u => u.status === 'pending').length, resets: state.db.resets.filter(r => !r.done).length }; }
  } else {
    const kc = {}; L.forEach(p => { kc[p.kat] = (kc[p.kat] || 0) + p.stok; });
    const m7 = Object.fromEntries(days.map(d => [d, { d, masuk: 0, jual: 0 }])); let masukHari = 0;
    state.db.stockLog.forEach(l => {
      const k = dayKey(Date.parse(l.date));
      if (l.tipe === 'masuk') { if (m7[k]) m7[k].masuk += l.qty; if (k === today) masukHari += l.qty; }
      else if (l.tipe === 'jual' && m7[k]) m7[k].jual += Math.abs(l.qty);
    });
    out.stat = { jenis: L.length, unit: L.reduce((s, p) => s + p.stok, 0), nilai: L.reduce((s, p) => s + p.stok * p.hpp, 0), masukHari };
    out.stokKat = Object.entries(kc).map(([l, v]) => ({ l, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    out.mutasi = days.map(d => m7[d]);
  }
  return out;
}

module.exports = { movement, dashboard };
