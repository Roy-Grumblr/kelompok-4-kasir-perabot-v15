'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { hashPw, verifyPw, killSessions } = require('../lib/auth');
const { str, pwError, bad } = require('../lib/util');
const { saveImage, dropImage } = require('../lib/image');
const { CATS, UNCAT } = require('../config');

const ANY = 'any';
const meOut = u => ({ username: u.username, role: u.role, nama: u.nama || '', telp: u.telp || '', foto: u.foto || '', created: u.created, lastLogin: u.lastLogin });
const closeResets = un => {
  state.db.resets.forEach(r => { if (r.username === un && !r.done) { r.done = true; r.doneDate = new Date().toISOString(); } });
};

module.exports = function register(R) {
  R('GET', '/api/me', ANY, c => ({ me: { ...meOut(c.user), rem: !!c.sess.rem }, set: state.db.set, cats: CATS, uncat: UNCAT }));
  R('POST', '/api/password', ANY, async c => {
    const u = c.user;
    if (!await verifyPw(u, String(c.body.old || '').slice(0, 200))) bad('Kata sandi lama salah.', 403);
    const pe = pwError(c.body.password, u.username); if (pe) bad(pe);
    Object.assign(u, await hashPw(c.body.password)); closeResets(u.username); save(); killSessions(u.username, c.sess.k); audit(c.req, u.username, 'ganti_sandi');
    return { ok: true };
  });
  R('PUT', '/api/profile', ANY, c => {
    const nama = str(c.body.nama, 40, 2); if (!nama) bad('Nama lengkap wajib diisi (2-40 karakter).');
    c.user.nama = nama; c.user.telp = str(c.body.telp || '', 25) || ''; save(); audit(c.req, c.user.username, 'profil_ubah');
    return meOut(c.user);
  });
  R('POST', '/api/profile/photo', ANY, c => {
    const n = saveImage(c.body.img, 'u'); dropImage(c.user.foto); c.user.foto = n; save(); audit(c.req, c.user.username, 'profil_foto');
    return meOut(c.user);
  }, { max: 3e6 });
  R('DELETE', '/api/profile/photo', ANY, c => { dropImage(c.user.foto); c.user.foto = ''; save(); return meOut(c.user); });
};
