'use strict';

const { json, readBody, csrfOk } = require('./http');
const { rate } = require('./lib/ratelimit');
const { getSession } = require('./lib/auth');
const { ipOf, HttpErr } = require('./lib/util');
const { audit } = require('./lib/audit');

const ROUTES = [];
const PUBLIC = 'public', ANY = 'any';
function R(m, p, role, fn, o = {}) {
  ROUTES.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), role, fn, max: o.max || 1e6, cache: o.cache });
}
let registered = false;
function registerRoutes() {
  if (registered) return;
  registered = true;
  require('./routes') (R);
}
async function api(req, res, u) {
  if (!rate('api:' + ipOf(req), 300, 60e3)) return json(res, 429, { error: 'Terlalu banyak permintaan.' });
  let route = null, mm = null;
  for (const r of ROUTES) {
    if (r.m !== req.method) continue;
    const x = r.re.exec(u.pathname);
    if (x) { route = r; mm = x; break; }
  }
  if (!route) return json(res, 404, { error: 'Tidak ditemukan.' });
  const sess = getSession(req), user = sess ? sess.user : null;
  if (route.role !== PUBLIC) {
    if (!user) return json(res, 401, { error: 'Silakan masuk terlebih dahulu.' });
    if (Array.isArray(route.role) && !route.role.includes(user.role)) {
      audit(req, user.username, 'akses_ditolak', req.method + ' ' + u.pathname);
      return json(res, 403, { error: 'Anda tidak memiliki akses untuk tindakan ini.' });
    }
  }
  if (req.method !== 'GET' && !csrfOk(req)) return json(res, 403, { error: 'Permintaan ditolak.' });
  const body = req.method === 'GET' ? {} : await readBody(req, route.max);
  const out = await route.fn({ req, res, user, sess, body, params: Object.fromEntries(Object.entries(mm.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)])), q: u.searchParams });
  if (!res.writableEnded) json(res, 200, out === undefined ? { ok: true } : out, route.cache);
}

module.exports = { R, ROUTES, registerRoutes, api, PUBLIC, ANY, readBody, csrfOk, json, HttpErr };
