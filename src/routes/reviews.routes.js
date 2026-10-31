'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { str, bad } = require('../lib/util');

const revOf = c => {
  const r = state.db.reviews.find(x => x.id === +c.params.id);
  if (!r) bad('Ulasan tidak ditemukan.', 404);
  return r;
};

module.exports = function register(R) {
  R('GET', '/api/reviews', ['owner', 'admin'], () => state.db.reviews.slice().reverse());
  R('POST', '/api/reviews/:id/status', ['owner', 'admin'], c => {
    const r = revOf(c); if (!['tampil', 'sembunyi'].includes(c.body.status)) bad('Status tidak valid.');
    r.status = c.body.status; save(); audit(c.req, c.user.username, 'ulasan_' + r.status, String(r.id)); return { ok: true };
  });
  R('POST', '/api/reviews/:id/reply', ['owner', 'admin'], c => {
    const r = revOf(c), t = str(c.body.balasan || '', 300); if (t === null) bad('Balasan maksimal 300 karakter.');
    r.balasan = t; r.balasOleh = c.user.username; r.balasDate = new Date().toISOString(); save(); audit(c.req, c.user.username, 'ulasan_balas', String(r.id)); return { ok: true };
  });
  R('DELETE', '/api/reviews/:id', ['owner', 'admin'], c => {
    const r = revOf(c); state.db.reviews.splice(state.db.reviews.indexOf(r), 1); save(); audit(c.req, c.user.username, 'ulasan_hapus', String(r.id)); return { ok: true };
  });
};
