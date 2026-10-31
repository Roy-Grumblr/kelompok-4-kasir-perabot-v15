'use strict';

const state = require('./state');
const { OPEN, ORD_TTL } = require('./config');
const { save } = require('./lib/db');
const { bad, safeEq } = require('./lib/util');

function sweepOrders() {
  const now = Date.now(); let ch = false;
  state.db.orders.forEach(o => {
    if (o.status === 'baru' && now - Date.parse(o.date) > ORD_TTL) { o.status = 'kedaluwarsa'; o.endDate = new Date().toISOString(); ch = true; }
  });
  if (ch) save();
}
function reservedMap() {
  const cached = state.getReserved();
  if (cached) return cached;
  const m = {};
  state.db.orders.forEach(o => {
    if (OPEN.includes(o.status) && Array.isArray(o.items)) o.items.forEach(i => { m[i.id] = (m[i.id] || 0) + (+i.qty || 0); });
  });
  state._rm = m;
  return m;
}
const resOf = id => reservedMap()[id] || 0;
const availOf = p => Math.max(0, p.stok - resOf(p.id));
function orderPub(o) {
  const x = { no: o.no, date: o.date, nama: o.nama, wa: o.wa, catatan: o.catatan || '', status: o.status, total: o.total,
    items: o.items.map(i => ({ id: i.id, kode: i.kode, nama: i.nama, qty: i.qty, harga: i.harga })),
    expires: o.status === 'baru' ? new Date(Date.parse(o.date) + ORD_TTL).toISOString() : null, alasan: o.alasan || '' };
  if (o.status === 'selesai') {
    const t = state.db.tx.find(y => y.no === o.txNo);
    if (t) x.struk = { no: t.no, date: t.date, kasir: t.kasir, items: t.items.map(i => ({ nama: i.nama, qty: i.qty, harga: i.harga })), total: t.total, bayar: t.bayar, kembali: t.kembali, void: !!t.void };
  }
  return x;
}
const ordOf = no => {
  const o = state.db.orders.find(x => x.no === no);
  if (!o) bad('Pesanan tidak ditemukan.', 404);
  return o;
};
const ordTokOk = (o, t) => typeof t === 'string' && t.length >= 8 && t.length <= 40 && safeEq(t, o.token);

module.exports = { OPEN, ORD_TTL, sweepOrders, reservedMap, resOf, availOf, orderPub, ordOf, ordTokOk };
