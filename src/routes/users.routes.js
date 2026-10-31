'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { hashPw, killSessions } = require('../lib/auth');
const { ROLES } = require('../config');
const { str, unOk, pwError, bad } = require('../lib/util');

const closeResets = un => {
  state.db.resets.forEach(r => { if (r.username === un && !r.done) { r.done = true; r.doneDate = new Date().toISOString(); } });
};

module.exports = function register(R) {
  R('GET', '/api/resets', ['owner'], () => state.db.resets.filter(r => !r.done).slice().reverse());
  R('POST', '/api/resets/:id/done', ['owner'], c => {
    const r = state.db.resets.find(x => x.id === +c.params.id); if (!r) bad('Permintaan tidak ditemukan.', 404);
    r.done = true; r.doneDate = new Date().toISOString(); save(); return { ok: true };
  });
  R('GET', '/api/users', ['owner'], () => state.db.users.map(u => ({ username: u.username, role: u.role, nama: u.nama || '', telp: u.telp || '', status: u.status || 'aktif', created: u.created, lastLogin: u.lastLogin })));
  R('POST', '/api/users', ['owner'], async c => {
    const un = unOk(c.body.username); if (!un) bad('Username 3-30 karakter: huruf kecil, angka, titik, garis bawah.');
    const role = c.body.role; if (!ROLES.includes(role)) bad('Peran tidak valid.');
    if (state.db.users.some(u => u.username === un)) bad('Username sudah ada.', 409);
    const pe = pwError(c.body.password, un); if (pe) bad(pe);
    state.db.users.push({ username: un, role, status: 'aktif', nama: str(c.body.nama || '', 40) || '', ...await hashPw(c.body.password), created: new Date().toISOString() });
    save(); audit(c.req, c.user.username, 'user_tambah', `${un} (${role})`); return { ok: true };
  });
  R('POST', '/api/users/:u/approve', ['owner'], c => {
    const u = state.db.users.find(x => x.username === c.params.u); if (!u) bad('Pengguna tidak ditemukan.', 404);
    if (u.status !== 'pending') bad('Akun ini sudah aktif.', 409);
    u.status = 'aktif'; save(); audit(c.req, c.user.username, 'user_setuju', u.username); return { ok: true };
  });
  R('DELETE', '/api/users/:u', ['owner'], c => {
    const un = c.params.u; if (un === c.user.username) bad('Tidak bisa menghapus akun sendiri.');
    const i = state.db.users.findIndex(u => u.username === un); if (i < 0) bad('Pengguna tidak ditemukan.', 404);
    if (state.db.users[i].role === 'owner' && state.db.users.filter(u => u.role === 'owner').length < 2) bad('Owner terakhir tidak boleh dihapus.');
    state.db.users.splice(i, 1); killSessions(un); save(); audit(c.req, c.user.username, 'user_hapus', un); return { ok: true };
  });
  R('POST', '/api/users/:u/password', ['owner'], async c => {
    const u = state.db.users.find(x => x.username === c.params.u); if (!u) bad('Pengguna tidak ditemukan.', 404);
    const pe = pwError(c.body.password, u.username); if (pe) bad(pe);
    Object.assign(u, await hashPw(c.body.password)); closeResets(u.username); killSessions(u.username, u.username === c.user.username ? c.sess.k : undefined);
    save(); audit(c.req, c.user.username, 'user_reset_sandi', u.username); return { ok: true };
  });
};
