'use strict';

const state = require('../state');

function slog(p, tipe, qty, ket, user) {
  state.db.stockLog.push({ date: new Date().toISOString(), pid: p.id, kode: p.kode, nama: p.nama, tipe, qty, sisa: p.stok, ket: ket || '', user });
  if (state.db.stockLog.length > 5000) state.db.stockLog.splice(0, state.db.stockLog.length - 5000);
}

module.exports = { slog };
