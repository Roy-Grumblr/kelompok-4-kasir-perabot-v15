'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { CATS, UPL } = require('../config');
const state = require('../state');
const { save, KEYF, setupKey, recoveryKey } = require('../lib/db');
const { rate } = require('../lib/ratelimit');
const { audit } = require('../lib/audit');
const { hashPw, verifyPw, getSession, startSession, endCookie, killSessions } = require('../lib/auth');
const { ipOf, safeEq, unOk, pwError, str, int, normWa, live, lowLim, okTx, bad } = require('../lib/util');
const { saveImage, dropImage } = require('../lib/image');
const { OPEN, sweepOrders, availOf, orderPub, ordOf, ordTokOk } = require('../orders');
const { slog } = require('../lib/stock');
const { dayKey } = require('../lib/time');

const PUBLIC = 'public';
const closeResets = un => {
  state.db.resets.forEach(r => { if (r.username === un && !r.done) { r.done = true; r.doneDate = new Date().toISOString(); } });
};

module.exports = function register(R) {
  R('GET', '/api/health', PUBLIC, () => ({ ok: true }));

  R('GET', '/api/public', PUBLIC, () => {
    const L = live(), lim = lowLim(), s = state.db.set, since = Date.now() - 90 * 864e5, q = {};
    okTx().forEach(t => { if (Date.parse(t.date) >= since) t.items.forEach(i => q[i.id] = (q[i.id] || 0) + i.qty); });
    sweepOrders();
    const rv = state.db.reviews.filter(r => r.status === 'tampil'), avg = rv.length ? Math.round(rv.reduce((a, r) => a + r.rating, 0) / rv.length * 10) / 10 : 0;
    return { store: { nama: s.nama, alamat: s.alamat, telp: s.telp, jam: s.jam, wa: s.wa || '', maps: s.maps || '', logo: s.logo || '', logoUkuran: s.logoUkuran, logoBentuk: s.logoBentuk, footer: s.footer || '' }, cats: CATS, setup: state.db.users.length === 0,
      reviews: { avg, count: rv.length, list: rv.slice(-12).reverse().map(r => ({ nama: r.nama, rating: r.rating, komentar: r.komentar, balasan: r.balasan || '', date: r.date })) },
      best: L.filter(p => q[p.id]).sort((a, b) => q[b.id] - q[a.id]).slice(0, 5).map(p => p.id),
      products: L.map(p => { const a = availOf(p); return { id: p.id, kode: p.kode, nama: p.nama, kat: p.kat, harga: p.harga, f: p.foto || '', a: Math.min(a, 99), s: a <= 0 ? 'x' : a <= lim ? 'w' : 'ok' }; }) };
  }, { cache: 'no-store' });

  R('GET', '/api/session', PUBLIC, c => ({ user: c.user ? { username: c.user.username, role: c.user.role } : null, setup: state.db.users.length === 0 }));
  R('POST', '/api/setup', PUBLIC, async c => {
    const ip = ipOf(c.req);
    if (state.db.users.length) bad('Pengaturan awal sudah dilakukan.', 403);
    if (!rate('setup:' + ip, 10, 15 * 60e3)) bad('Terlalu banyak percobaan.', 429);
    const key = typeof c.body.key === 'string' ? c.body.key.trim() : '';
    if (!key || !safeEq(key, setupKey())) { audit(c.req, '-', 'setup_kode_salah'); bad('Kode setup salah. Lihat file data/setup-key.txt di server.', 403); }
    const un = unOk(c.body.username); if (!un) bad('Username 3-30 karakter: huruf kecil, angka, titik, garis bawah.');
    const pe = pwError(c.body.password, un); if (pe) bad(pe);
    const h = await hashPw(c.body.password);
    state.db.users.push({ username: un, role: 'owner', status: 'aktif', nama: str(c.body.nama || '', 40) || '', ...h, created: new Date().toISOString() }); save();
    try { fs.unlinkSync(KEYF); } catch (e) {}
    audit(c.req, un, 'setup_owner'); startSession(c.req, c.res, state.db.users[0], false);
    return { user: { username: un, role: 'owner' } };
  });

  R('POST', '/api/login', PUBLIC, async c => {
    const ip = ipOf(c.req);
    if (!rate('login:' + ip, 40, 15 * 60e3)) bad('Terlalu banyak permintaan. Coba lagi nanti.', 429);
    const un = typeof c.body.username === 'string' ? c.body.username.trim().toLowerCase().slice(0, 30) : '';
    const pw = typeof c.body.password === 'string' && c.body.password.length <= 200 ? c.body.password : '';
    if (!un || !pw) bad('Username dan kata sandi wajib diisi.');
    const key = ip + '|' + un, f = state.fails.get(key);
    if (f && f.until > Date.now()) bad(`Terlalu banyak percobaan gagal. Coba lagi ${Math.ceil((f.until - Date.now()) / 60000)} menit lagi.`, 429);
    const u = state.db.users.find(x => x.username === un);
    if (!await verifyPw(u, pw)) { const n = ((f && f.n) || 0) + 1; state.fails.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 5 * 60e3 : 0, t: Date.now() }); audit(c.req, un, 'login_gagal'); bad('Username atau kata sandi salah.', 401); }
    if (u.status === 'pending') { audit(c.req, un, 'login_ditolak_pending'); bad('Akun Anda masih menunggu persetujuan Owner.', 403); }
    state.fails.delete(key); u.lastLogin = new Date().toISOString(); save();
    const rem = c.body.remember === true; startSession(c.req, c.res, u, rem); audit(c.req, un, 'login' + (rem ? ' (ingat saya)' : ''));
    return { user: { username: u.username, role: u.role } };
  });

  R('POST', '/api/logout', PUBLIC, c => {
    const s = getSession(c.req); if (s) { state.sessions.delete(s.k); audit(c.req, s.user.username, 'logout'); }
    endCookie(c.req, c.res); return { ok: true };
  });

  R('POST', '/api/register', PUBLIC, async c => {
    const ip = ipOf(c.req);
    if (!state.db.users.length) bad('Belum ada akun Owner. Buat akun Owner terlebih dahulu.', 403);
    if (!rate('reg:' + ip, 5, 15 * 60e3)) bad('Terlalu banyak percobaan. Coba lagi nanti.', 429);
    if (state.db.users.filter(u => u.status === 'pending').length >= 50) bad('Antrean pendaftaran penuh. Hubungi Owner.', 429);
    const un = unOk(c.body.username); if (!un) bad('Username 3-30 karakter: huruf kecil, angka, titik, garis bawah.');
    const role = c.body.role; if (role !== 'admin' && role !== 'gudang') bad('Pilih peran Admin atau Gudang.');
    const nama = str(c.body.nama, 40, 2); if (!nama) bad('Nama lengkap wajib diisi (2-40 karakter).');
    const pe = pwError(c.body.password, un); if (pe) bad(pe);
    if (state.db.users.some(u => u.username === un)) bad('Username sudah dipakai.', 409);
    state.db.users.push({ username: un, role, status: 'pending', nama, telp: str(c.body.telp || '', 25) || '', ...await hashPw(c.body.password), created: new Date().toISOString() });
    save(); audit(c.req, un, 'daftar', role);
    return { ok: true, msg: 'Pendaftaran terkirim. Akun aktif setelah disetujui Owner.' };
  });

  R('POST', '/api/forgot', PUBLIC, c => {
    const ip = ipOf(c.req); if (!rate('forgot:' + ip, 5, 15 * 60e3)) bad('Terlalu banyak percobaan. Coba lagi nanti.', 429);
    const un = typeof c.body.username === 'string' ? c.body.username.trim().toLowerCase().slice(0, 30) : '';
    const u = state.db.users.find(x => x.username === un && x.status !== 'pending');
    if (u && !state.db.resets.some(r => r.username === un && !r.done)) {
      state.db.resets.push({ id: Date.now(), username: un, date: new Date().toISOString(), done: false });
      while (state.db.resets.length > 200) state.db.resets.shift(); save(); audit(c.req, un, 'minta_reset_sandi');
    }
    return { ok: true, msg: 'Jika username terdaftar, permintaan sudah dikirim ke Owner. Hubungi Owner untuk mendapat kata sandi baru.' };
  });
  R('POST', '/api/recover', PUBLIC, async c => {
    const ip = ipOf(c.req); if (!rate('recover:' + ip, 5, 15 * 60e3)) bad('Terlalu banyak percobaan. Coba lagi 15 menit lagi.', 429);
    const un = typeof c.body.username === 'string' ? c.body.username.trim().toLowerCase().slice(0, 30) : '';
    const key = typeof c.body.key === 'string' ? c.body.key.trim() : '';
    const u = state.db.users.find(x => x.username === un);
    if (!u || !key || !safeEq(key, recoveryKey(false))) { audit(c.req, un || '-', 'pemulihan_gagal'); bad('Username atau kode pemulihan salah.', 403); }
    const pe = pwError(c.body.password, un); if (pe) bad(pe);
    Object.assign(u, await hashPw(c.body.password)); u.status = 'aktif'; closeResets(un); killSessions(un);
    save(); recoveryKey(true); audit(c.req, un, 'pemulihan_sandi');
    return { ok: true, msg: 'Kata sandi diganti. Silakan masuk.' };
  });

  R('POST', '/api/orders', PUBLIC, c => {
    const ip = ipOf(c.req); if (!rate('ord:' + ip, 8, 60 * 60e3)) bad('Terlalu banyak pesanan dari perangkat ini. Coba lagi nanti.', 429);
    if (c.body.website) bad('Permintaan ditolak.');
    const nama = str(c.body.nama, 40, 2); if (!nama) bad('Nama wajib diisi (2-40 karakter).');
    const wa = normWa(c.body.wa); if (!wa) bad('Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxx');
    const list = c.body.items; if (!Array.isArray(list) || !list.length || list.length > 30) bad('Keranjang kosong atau terlalu besar.');
    sweepOrders();
    if (state.db.orders.filter(o => o.wa === wa && OPEN.includes(o.status)).length >= 3) bad('Anda masih punya 3 pesanan yang belum selesai. Selesaikan atau batalkan dulu.', 429);
    if (state.db.orders.filter(o => OPEN.includes(o.status)).length >= 300) bad('Antrean pesanan penuh. Silakan hubungi toko lewat WhatsApp.', 429);
    const m = new Map();
    for (const it of list) { const id = int(it && it.id, 1, 1e9), q = int(it && it.qty, 1, 999); if (id === null || q === null) bad('Data keranjang tidak valid.'); m.set(id, (m.get(id) || 0) + q); }
    const items = []; let total = 0;
    for (const [id, q] of m) {
      const p = state.db.products.find(x => x.id === id && !x.del); if (!p) bad('Ada barang yang sudah tidak tersedia. Muat ulang halaman.', 409);
      const a = availOf(p); if (q > a) bad(a > 0 ? `Stok "${p.nama}" tersisa ${a}.` : `"${p.nama}" sedang habis.`, 409);
      items.push({ id: p.id, kode: p.kode, nama: p.nama, qty: q, harga: p.harga }); total += q * p.harga;
    }
    const day = dayKey(Date.now()).replace(/-/g, ''), k = 'o' + day; state.db.seq[k] = (state.db.seq[k] || 0) + 1;
    const o = { no: `ORD-${day}-${String(state.db.seq[k]).padStart(4, '0')}`, token: crypto.randomBytes(8).toString('hex'), date: new Date().toISOString(), nama, wa, catatan: str(c.body.catatan || '', 120) || '', items, total, status: 'baru' };
    state.db.orders.push(o);
    while (state.db.orders.length > 2000) { const i = state.db.orders.findIndex(x => !OPEN.includes(x.status)); if (i < 0) break; state.db.orders.splice(i, 1); }
    save(); audit(c.req, '-', 'pesanan_baru', `${o.no} Rp${total}`);
    return { ...orderPub(o), token: o.token };
  });
  R('GET', '/api/order/:no', PUBLIC, c => {
    sweepOrders(); const o = ordOf(c.params.no); if (!ordTokOk(o, c.q.get('t'))) bad('Pesanan tidak ditemukan.', 404); return orderPub(o);
  });
  R('POST', '/api/order/:no/cancel', PUBLIC, c => {
    const o = ordOf(c.params.no); if (!ordTokOk(o, c.body.t)) bad('Pesanan tidak ditemukan.', 404);
    if (o.status !== 'baru') bad(o.status === 'diproses' ? 'Pesanan sedang diproses toko. Hubungi admin lewat WhatsApp untuk membatalkan.' : 'Pesanan ini sudah selesai atau ditutup.', 409);
    o.status = 'batal'; o.alasan = 'Dibatalkan pelanggan'; o.endDate = new Date().toISOString(); save(); audit(c.req, '-', 'pesanan_batal_pelanggan', o.no); return orderPub(o);
  });
  R('POST', '/api/reviews', PUBLIC, c => {
    const ip = ipOf(c.req); if (!rate('rev:' + ip, 3, 60 * 60e3)) bad('Terlalu banyak ulasan dari perangkat ini. Coba lagi nanti.', 429);
    if (c.body.website) bad('Permintaan ditolak.');
    const nama = str(c.body.nama, 40, 2); if (!nama) bad('Nama wajib diisi (2-40 karakter).');
    const rating = int(c.body.rating, 1, 5); if (rating === null) bad('Pilih rating 1 sampai 5 bintang.');
    const komentar = str(c.body.komentar || '', 300) || ''; if (c.body.komentar && str(c.body.komentar, 300) === null) bad('Komentar maksimal 300 karakter.');
    if (state.db.reviews.filter(r => r.status === 'pending').length >= 200) bad('Antrean ulasan penuh. Coba lagi nanti.', 429);
    state.db.reviews.push({ id: Date.now() * 1000 + Math.floor(Math.random() * 1000), date: new Date().toISOString(), nama, rating, komentar, status: 'pending', balasan: '' });
    while (state.db.reviews.length > 1000) { const i = state.db.reviews.findIndex(r => r.status !== 'tampil'); state.db.reviews.splice(i < 0 ? 0 : i, 1); }
    save(); audit(c.req, '-', 'ulasan_baru', `${rating} bintang`);
    return { ok: true, msg: 'Terima kasih! Ulasan Anda akan tampil setelah disetujui admin.' };
  });
  R('GET', '/api/restock', 'any', () => ({ open: state.db.restock.filter(r => !r.done).slice().reverse(), recent: state.db.restock.slice(-30).reverse() }));
};
