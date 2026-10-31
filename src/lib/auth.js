'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { IDLE_MS, ABS_MS, REM_IDLE, REM_ABS, TRUST_PROXY } = require('../config');
const { sha, isHttps } = require('./util');
const state = require('../state');

const scryptA = promisify(crypto.scrypt);
async function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: (await scryptA(pw, salt, 64)).toString('hex') };
}
async function verifyPw(u, pw) {
  if (!u) { await scryptA(pw, '0000000000000000', 64); return false; }
  const h = await scryptA(pw, u.salt, 64), s = Buffer.from(u.hash, 'hex');
  return s.length === h.length && crypto.timingSafeEqual(h, s);
}
const limits = s => s.rem ? [REM_IDLE, REM_ABS] : [IDLE_MS, ABS_MS];
function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}
function getSession(req) {
  const t = cookies(req).sid;
  if (!t || t.length > 100) return null;
  const k = sha(t), s = state.sessions.get(k);
  if (!s) return null;
  const now = Date.now(), [li, la] = limits(s);
  if (now - s.last > li || now - s.born > la) { state.sessions.delete(k); return null; }
  const user = state.db.users.find(u => u.username === s.u);
  if (!user || user.status === 'pending') { state.sessions.delete(k); return null; }
  if (req.headers['x-poll'] !== '1') s.last = now;
  return { k, user, rem: !!s.rem };
}
function startSession(req, res, user, rem) {
  const t = crypto.randomBytes(32).toString('base64url');
  state.sessions.set(sha(t), { u: user.username, born: Date.now(), last: Date.now(), rem: !!rem });
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/${rem ? '; Max-Age=' + REM_ABS / 1000 : ''}${isHttps(req) ? '; Secure' : ''}`);
}
function endCookie(req, res) {
  res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
}
function killSessions(username, exceptKey) {
  for (const [k, s] of state.sessions) if (s.u === username && k !== exceptKey) state.sessions.delete(k);
}
function csrfOk(req) {
  if (req.headers['x-requested-with'] !== 'pos') return false;
  const sf = req.headers['sec-fetch-site'];
  if (sf && sf !== 'same-origin' && sf !== 'none') return false;
  const o = req.headers.origin;
  if (o) {
    const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
    try { if (new URL(o).host !== host) return false; } catch (e) { return false; }
  }
  return true;
}

module.exports = { hashPw, verifyPw, getSession, startSession, endCookie, killSessions, cookies, csrfOk };
