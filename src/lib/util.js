'use strict';

const crypto = require('crypto');
const { TRUST_PROXY } = require('../config');
const state = require('../state');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const ipOf = req => {
  if (TRUST_PROXY) {
    const x = req.headers['x-forwarded-for'];
    if (x) return String(x).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '?';
};
const isHttps = req => !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
const live = () => state.db.products.filter(p => !p.del);
const lowLim = () => {
  const n = parseInt(state.db.set.stokMin, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
};
const hasHpp = r => r === 'owner' || r === 'gudang';
const str = (v, max, min = 0) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
};
const int = (v, min, max) => {
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const num = (v, d) => Number.isFinite(+v) ? +v : d;
const safeEq = (a, b) => {
  const x = Buffer.from(sha(String(a)));
  const y = Buffer.from(sha(String(b)));
  return crypto.timingSafeEqual(x, y);
};
const normWa = v => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,12}$/.test(d) ? d : null;
};
const prodOut = (p, role) => {
  const { resOf } = require('../orders');
  const o = { id: p.id, kode: p.kode, nama: p.nama, kat: p.kat, harga: p.harga, stok: p.stok, res: resOf(p.id), foto: p.foto || '' };
  if (hasHpp(role)) o.hpp = p.hpp;
  return o;
};
const okTx = () => state.db.tx.filter(t => !t.void);
class HttpErr extends Error {
  constructor(c, m) { super(m); this.code = c; }
}
const bad = (m, c = 400) => { throw new HttpErr(c, m); };
const unOk = u => typeof u === 'string' && /^[a-z0-9_.]{3,30}$/.test(u.trim().toLowerCase()) ? u.trim().toLowerCase() : null;
function pwError(pw, un) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 100) return 'Kata sandi minimal 8 karakter.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Kata sandi harus mengandung huruf dan angka.';
  if (un && pw.toLowerCase() === un) return 'Kata sandi tidak boleh sama dengan username.';
  return null;
}

module.exports = { sha, ipOf, isHttps, live, lowLim, hasHpp, str, int, num, dayKey: require('./time').dayKey, safeEq, normWa, prodOut, okTx, HttpErr, bad, unOk, pwError };
