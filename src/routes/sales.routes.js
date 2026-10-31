'use strict';

const state = require('../state');
const { OFF } = require('../config');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { int, dayKey, bad } = require('../lib/util');
const { availOf, resOf } = require('../orders');
const { slog } = require('../lib/stock');

function txOut(t, role) {
  const o = { no: t.no, date: t.date, kasir: t.kasir, total: t.total, bayar: t.bayar, kembali: t.kembali, void: !!t.void,
    items: t.items.map(i => ({ id: i.id, kode: i.kode, nama: i.nama, qty: i.qty, harga: i.harga })) };
  if (role === 'owner') o.profit = t.profit;
  return o;
}

module.exports = function register(R) {
  R('POST', '/api/checkout', ['owner', 'admin'], c => {
    const list = c.body.items; if (!Array.isArray(list) || !list.length || list.length > 100) bad('Keranjang kosong atau terlalu besar.');
    const m = new Map();
    for (const it of list) { const id = int(it && it.id, 1, 1e9), q = int(it && it.qty, 1, 9999); if (id === null || q === null) bad('Data keranjang tidak valid.'); m.set(id, (m.get(id) || 0) + q); }
    const items = []; let total = 0, profit = 0;
    for (const [id, q] of m) {
      const p = state.db.products.find(x => x.id === id && !x.del); if (!p) bad('Ada barang yang sudah tidak tersedia.', 409);
      const av = availOf(p);
      if (q > av) bad(`Stok "${p.nama}" tidak cukup (sisa ${av}${resOf(p.id) ? ', ' + resOf(p.id) + ' sedang dipesan online' : ''}).`, 409);
      items.push({ p, q }); total += q * p.harga; profit += q * (p.harga - p.hpp);
    }
    const bayar = int(c.body.bayar, 0, 1e11); if (bayar === null || bayar < total) bad('Uang yang diterima kurang.');
    const now = Date.now(), day = dayKey(now).replace(/-/g, ''); state.db.seq[day] = (state.db.seq[day] || 0) + 1;
    const no = `INV-${day}-${String(state.db.seq[day]).padStart(4, '0')}`;
    const t = { no, date: new Date(now).toISOString(), kasir: c.user.username, total, profit, bayar, kembali: bayar - total, void: false,
      items: items.map(({ p, q }) => { p.stok -= q; slog(p, 'jual', -q, no, c.user.username); return { id: p.id, kode: p.kode, nama: p.nama, qty: q, harga: p.harga, hpp: p.hpp }; }) };
    state.db.tx.push(t); save(); audit(c.req, c.user.username, 'transaksi', `${no} Rp${total}`); return txOut(t, c.user.role);
  });
  R('GET', '/api/tx', ['owner', 'admin'], c => {
    const date = c.q.get('date') || ''; if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Format tanggal tidak valid.');
    const lim = Math.min(Math.max(parseInt(c.q.get('limit'), 10) || 200, 1), 5000);
    const a = [];
    for (let i = state.db.tx.length - 1; i >= 0 && a.length < lim; i--) { const t = state.db.tx[i]; if (!date || dayKey(Date.parse(t.date)) === date) a.push(txOut(t, c.user.role)); }
    return a;
  });
  R('POST', '/api/tx/:no/void', ['owner', 'admin'], c => {
    const t = state.db.tx.find(x => x.no === c.params.no); if (!t) bad('Transaksi tidak ditemukan.', 404); if (t.void) bad('Transaksi sudah dibatalkan.', 409);
    t.void = true; t.voidBy = c.user.username; t.voidDate = new Date().toISOString();
    t.items.forEach(i => { const p = state.db.products.find(x => x.id === i.id); if (p) { p.stok += i.qty; slog(p, 'batal', i.qty, t.no, c.user.username); } });
    save(); audit(c.req, c.user.username, 'transaksi_batal', t.no); return txOut(t, c.user.role);
  });
  R('GET', '/api/report', ['owner', 'admin'], c => {
    const own = c.user.role === 'owner', now = Date.now(), today = dayKey(now);
    const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
    let from = c.q.get('from') || '', to = c.q.get('to') || '';
    const days = parseInt(c.q.get('days'), 10);
    if (c.q.get('month') === '1') { from = today.slice(0, 8) + '01'; to = today; }
    else if (days >= 1 && days <= 366) { to = today; from = dayKey(now - (days - 1) * 864e5); }
    if (!ok(from) || !ok(to)) { to = today; from = dayKey(now - 6 * 864e5); }
    if (from > to) [from, to] = [to, from];
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1; if (span > 366) bad('Rentang maksimal 366 hari.');
    const dk = {};
    for (let i = 0; i < span; i++) { const d = new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10); dk[d] = { d, omzet: 0, laba: 0, trx: 0 }; }
    const kat = Object.fromEntries(state.db.products.map(p => [p.id, p.kat])), cat = {}, prod = {}, ksr = {}, hr = Array.from({ length: 24 }, (_, h) => ({ h, trx: 0 }));
    let omzet = 0, laba = 0, trx = 0, item = 0, batal = 0, batalNilai = 0;
    state.db.tx.forEach(t => {
      const ts = Date.parse(t.date), k = dayKey(ts); if (k < from || k > to) return;
      if (t.void) { batal++; batalNilai += t.total; return; }
      omzet += t.total; laba += t.profit; trx++; dk[k].omzet += t.total; dk[k].laba += t.profit; dk[k].trx++;
      hr[new Date(ts + OFF).getUTCHours()].trx++;
      const kr = ksr[t.kasir] || (ksr[t.kasir] = { l: t.kasir, v: 0, trx: 0 }); kr.v += t.total; kr.trx++;
      t.items.forEach(i => {
        item += i.qty; const kk = kat[i.id] || 'Lainnya'; cat[kk] = (cat[kk] || 0) + i.qty * i.harga;
        const x = prod[i.id] || (prod[i.id] = { nama: i.nama, qty: 0, omzet: 0, laba: 0 });
        x.qty += i.qty; x.omzet += i.qty * i.harga; x.laba += i.qty * (i.harga - (i.hpp || 0));
      });
    });
    const top = Object.values(prod).sort((a, b) => b.qty - a.qty).slice(0, 10).map(x => own ? x : { nama: x.nama, qty: x.qty, omzet: x.omzet });
    const daily = Object.values(dk).map(x => own ? x : { d: x.d, omzet: x.omzet, trx: x.trx });
    const best = daily.slice().sort((a, b) => b.omzet - a.omzet)[0];
    const sum = { omzet, trx, item, rata: trx ? Math.round(omzet / trx) : 0, batal, batalNilai, hari: span, terbaik: best && best.omzet > 0 ? { d: best.d, omzet: best.omzet } : null };
    if (own) { sum.laba = laba; sum.margin = omzet ? Math.round(laba / omzet * 1000) / 10 : 0; }
    return { from, to, own, sum, daily, cat: Object.entries(cat).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v), top,
      kasir: Object.values(ksr).sort((a, b) => b.v - a.v), jam: hr };
  });
};
