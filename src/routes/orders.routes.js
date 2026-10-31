'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { int, str, bad } = require('../lib/util');
const { OPEN, sweepOrders, orderPub, ordOf } = require('../orders');
const { slog } = require('../lib/stock');

function txOut(t, role) {
  const o = { no: t.no, date: t.date, kasir: t.kasir, total: t.total, bayar: t.bayar, kembali: t.kembali, void: !!t.void,
    items: t.items.map(i => ({ id: i.id, kode: i.kode, nama: i.nama, qty: i.qty, harga: i.harga })) };
  if (role === 'owner') o.profit = t.profit;
  return o;
}

module.exports = function register(R) {
  R('GET', '/api/orders', ['owner', 'admin'], c => {
    sweepOrders(); const f = c.q.get('s') || 'open';
    const pick = o => f === 'all' ? true : f === 'open' ? OPEN.includes(o.status) : f === 'selesai' ? o.status === 'selesai' : ['batal', 'kedaluwarsa'].includes(o.status);
    const list = state.db.orders.filter(pick).slice(-200).reverse().map(o => ({ ...orderPub(o),
      items: o.items.map(i => { const p = state.db.products.find(x => x.id === i.id && !x.del); return { id: i.id, kode: i.kode, nama: i.nama, qty: i.qty, harga: i.harga, stokFisik: p ? p.stok : 0, ada: !!p }; }),
      by: o.by || '', txNo: o.txNo || '' }));
    return { list, counts: { baru: state.db.orders.filter(o => o.status === 'baru').length, proses: state.db.orders.filter(o => o.status === 'diproses').length } };
  });
  R('POST', '/api/orders/:no/proses', ['owner', 'admin'], c => {
    const o = ordOf(c.params.no); if (o.status !== 'baru') bad('Hanya pesanan baru yang bisa diproses.', 409);
    o.status = 'diproses'; o.by = c.user.username; o.procDate = new Date().toISOString(); save(); audit(c.req, c.user.username, 'pesanan_proses', o.no); return orderPub(o);
  });
  R('POST', '/api/orders/:no/batal', ['owner', 'admin'], c => {
    const o = ordOf(c.params.no); if (!OPEN.includes(o.status)) bad('Pesanan ini sudah ditutup.', 409);
    o.status = 'batal'; o.alasan = str(c.body.alasan || '', 80) || 'Dibatalkan toko'; o.endDate = new Date().toISOString(); o.by = o.by || c.user.username;
    save(); audit(c.req, c.user.username, 'pesanan_batal', o.no); return orderPub(o);
  });
  R('POST', '/api/orders/:no/bayar', ['owner', 'admin'], c => {
    const o = ordOf(c.params.no); if (!OPEN.includes(o.status)) bad('Pesanan ini sudah ditutup.', 409);
    const rows = []; let total = 0, profit = 0;
    for (const i of o.items) {
      const p = state.db.products.find(x => x.id === i.id && !x.del);
      if (!p) bad(`"${i.nama}" sudah tidak ada di produk. Batalkan pesanan atau hubungi pelanggan.`, 409);
      if (i.qty > p.stok) bad(`Stok fisik "${p.nama}" kurang (sisa ${p.stok}, dipesan ${i.qty}). Perbarui stok di Gudang atau hubungi pelanggan.`, 409);
      rows.push({ p, q: i.qty, harga: i.harga }); total += i.qty * i.harga; profit += i.qty * (i.harga - p.hpp);
    }
    const bayar = int(c.body.bayar, 0, 1e11); if (bayar === null || bayar < total) bad('Uang yang diterima kurang.');
    const now = Date.now(), day = require('../lib/time').dayKey(now).replace(/-/g, ''); state.db.seq[day] = (state.db.seq[day] || 0) + 1;
    const no = `INV-${day}-${String(state.db.seq[day]).padStart(4, '0')}`;
    const t = { no, date: new Date(now).toISOString(), kasir: c.user.username, total, profit, bayar, kembali: bayar - total, void: false, order: o.no,
      items: rows.map(({ p, q, harga }) => { p.stok -= q; slog(p, 'jual', -q, no + ' (' + o.no + ')', c.user.username); return { id: p.id, kode: p.kode, nama: p.nama, qty: q, harga, hpp: p.hpp }; }) };
    state.db.tx.push(t); o.status = 'selesai'; o.txNo = no; o.paidBy = c.user.username; o.paidDate = t.date;
    save(); audit(c.req, c.user.username, 'pesanan_bayar', `${o.no} -> ${no} Rp${total}`);
    return { order: orderPub(o), tx: txOut(t, c.user.role) };
  });
  R('GET', '/api/badges', ['owner', 'admin'], () => {
    sweepOrders(); const last = state.db.orders.filter(o => o.status === 'baru').slice(-1)[0];
    return { pesanan: state.db.orders.filter(o => o.status === 'baru').length, proses: state.db.orders.filter(o => o.status === 'diproses').length, ulasan: state.db.reviews.filter(r => r.status === 'pending').length,
      last: last ? { no: last.no, nama: last.nama } : null };
  });
};
