'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { str, int, bad } = require('../lib/util');

module.exports = function register(R) {
  R('POST', '/api/restock', ['admin'], c => {
    const p = state.db.products.find(x => x.id === int(c.body.pid, 1, 1e9) && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    if (state.db.restock.some(r => r.pid === p.id && !r.done)) bad('Barang ini sudah dilaporkan dan belum selesai.', 409);
    const r = { id: Date.now(), pid: p.id, kode: p.kode, nama: p.nama, catatan: str(c.body.catatan || '', 100) || '', user: c.user.username, date: new Date().toISOString(), done: false };
    state.db.restock.push(r);
    while (state.db.restock.length > 500) { const i = state.db.restock.findIndex(x => x.done); if (i < 0) break; state.db.restock.splice(i, 1); }
    save(); audit(c.req, c.user.username, 'lapor_habis', p.kode); return r;
  });
  R('POST', '/api/restock/:id/done', ['gudang'], c => {
    const r = state.db.restock.find(x => x.id === +c.params.id); if (!r || r.done) bad('Laporan tidak ditemukan.', 404);
    r.done = true; r.doneBy = c.user.username; r.doneDate = new Date().toISOString(); save(); audit(c.req, c.user.username, 'restock_selesai', r.kode); return { ok: true };
  });
};
