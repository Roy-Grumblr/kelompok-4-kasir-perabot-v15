'use strict';

const fs = require('fs');
const path = require('path');
const state = require('../state');
const { UPL, UNCAT, FOTO_RE } = require('../config');
const { save, migrate } = require('../lib/db');
const { audit, readAudit } = require('../lib/audit');
const { int, str, bad } = require('../lib/util');

module.exports = function register(R) {
  R('GET', '/api/backup', ['owner'], c => { audit(c.req, c.user.username, 'backup'); const { users, resets, ...rest } = state.db; return rest; });
  R('POST', '/api/restore', ['owner'], c => {
    const d = c.body; if (!Array.isArray(d.products) || !Array.isArray(d.tx)) bad('File backup tidak valid.');
    const m = migrate({ ...d, users: [] });
    const prods = m.products.map(p => ({ id: int(p.id, 1, 1e12), kode: str(String(p.kode || ''), 20, 1), nama: str(String(p.nama || ''), 60, 1), kat: str(String(p.kat || UNCAT), 40, 1) || UNCAT,
      hpp: int(p.hpp, 0, 1e9), harga: int(p.harga, 0, 1e9), stok: int(p.stok, 0, 1e6), del: !!p.del,
      foto: FOTO_RE.test(String(p.foto || '')) && fs.existsSync(path.join(UPL, String(p.foto))) ? String(p.foto) : '' }));
    if (prods.some(p => Object.values(p).includes(null))) bad('Ada data produk yang tidak valid di file backup.');
    m.products = prods; m.users = state.db.users; m.resets = state.db.resets; state.setDb(m); save();
    audit(c.req, c.user.username, 'restore', `${prods.length} produk, ${m.tx.length} transaksi`); return { ok: true };
  }, { max: 25e6 });
  R('GET', '/api/audit', ['owner'], () => readAudit(60));
};
