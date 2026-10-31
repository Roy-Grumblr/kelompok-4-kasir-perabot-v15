'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA, DEF_SET, UNCAT } = require('../config');
const { dayKey } = require('./time');
const state = require('../state');

const DBF = path.join(DATA, 'db.json');
const KEYF = path.join(DATA, 'setup-key.txt');
const RECF = path.join(DATA, 'recovery-key.txt');

function migrate(d) {
  d = d && typeof d === 'object' ? d : {};
  const arr = k => Array.isArray(d[k]) ? d[k] : [];
  const o = { users: arr('users'), products: arr('products'), tx: arr('tx'), stockLog: arr('stockLog'), restock: arr('restock'), resets: arr('resets'), reviews: arr('reviews'), orders: arr('orders'), seq: d.seq && typeof d.seq === 'object' ? d.seq : {} };
  o.users.forEach(u => { if (u.role === 'kasir') u.role = 'admin'; if (!u.status) u.status = 'aktif'; });
  o.products.forEach(p => { if (!p.kat) p.kat = UNCAT; });
  const s = d.set && typeof d.set === 'object' ? d.set : {};
  o.set = {};
  for (const k of Object.keys(DEF_SET)) o.set[k] = s[k] !== undefined && s[k] !== null ? s[k] : DEF_SET[k];
  return o;
}
function seed() {
  return migrate({ products: [
    { id: 1, kode: 'PRD-001', nama: 'Kursi Plastik Sandaran', kat: 'Furnitur', hpp: 45000, harga: 65000, stok: 12, del: false },
    { id: 2, kode: 'PRD-002', nama: 'Gayung Plastik Gagang Panjang', kat: 'Kamar Mandi', hpp: 6000, harga: 9000, stok: 30, del: false },
    { id: 3, kode: 'PRD-003', nama: 'Ember Plastik 20L', kat: 'Ember & Plastik', hpp: 16000, harga: 25000, stok: 15, del: false }
  ] });
}
function load() {
  if (fs.existsSync(DBF)) {
    try { state.setDb(migrate(JSON.parse(fs.readFileSync(DBF, 'utf8')))); }
    catch (e) {
      console.error('FATAL: data/db.json rusak. Pulihkan dari data/backups/. ', e.message);
      process.exit(1);
    }
  } else state.setDb(seed());
  save();
  return state.db;
}
function dailyBackup() {
  try {
    const dir = path.join(DATA, 'backups'), f = path.join(dir, 'db-' + dayKey(Date.now()).replace(/-/g, '') + '.json');
    if (!fs.existsSync(f) && fs.existsSync(DBF)) {
      fs.copyFileSync(DBF, f);
      const l = fs.readdirSync(dir).filter(x => x.startsWith('db-')).sort();
      while (l.length > 14) fs.unlinkSync(path.join(dir, l.shift()));
    }
  } catch (e) { console.error('backup gagal', e.message); }
}
function save() {
  state.resetReserved();
  const tmp = DBF + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state.db));
  fs.renameSync(tmp, DBF);
  dailyBackup();
}
function setupKey() {
  if (process.env.SETUP_KEY) return process.env.SETUP_KEY;
  if (!fs.existsSync(KEYF)) fs.writeFileSync(KEYF, crypto.randomBytes(9).toString('base64url'), { mode: 0o600 });
  return fs.readFileSync(KEYF, 'utf8').trim();
}
function recoveryKey(renew) {
  if (renew || !fs.existsSync(RECF)) fs.writeFileSync(RECF, crypto.randomBytes(9).toString('base64url'), { mode: 0o600 });
  return fs.readFileSync(RECF, 'utf8').trim();
}

load();
recoveryKey(false);

module.exports = { DBF, KEYF, RECF, migrate, seed, load, save, dailyBackup, setupKey, recoveryKey };
