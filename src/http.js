'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TRUST_PROXY, PUB, ROOT, UPL, FOTO_RE, MIME, PRIVATE } = require('./config');
const { HttpErr } = require('./lib/util');
const { csrfOk } = require('./lib/auth');
const state = require('./state');

const json = (res, code, obj, cache) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b), 'Cache-Control': cache || 'no-store' });
  res.end(b);
};
const csp = https => ["default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "style-src-attr 'unsafe-inline'", "font-src https://fonts.gstatic.com", "frame-src https://www.google.com", "img-src 'self' data:", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'"].concat(https ? ['upgrade-insecure-requests'] : []).join('; ');
function secHeaders(req, res) {
  const https = require('./lib/util').isHttps(req);
  res.setHeader('Content-Security-Policy', csp(https));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noarchive');
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function readBody(req, max) {
  return new Promise((ok, no) => {
    const ct = String(req.headers['content-type'] || '');
    let n = 0;
    const ch = [];
    req.on('data', d => {
      n += d.length;
      if (n > max) { no(new HttpErr(413, 'Data terlalu besar.')); req.destroy(); return; }
      ch.push(d);
    });
    req.on('end', () => {
      if (!n) return ok({});
      if (!ct.includes('application/json')) return no(new HttpErr(415, 'Content-Type harus application/json.'));
      try {
        const o = JSON.parse(Buffer.concat(ch).toString('utf8'));
        if (!o || typeof o !== 'object' || Array.isArray(o)) return no(new HttpErr(400, 'Format data tidak valid.'));
        ok(o);
      } catch (e) { no(new HttpErr(400, 'JSON tidak valid.')); }
    });
    req.on('error', () => no(new HttpErr(400, 'Permintaan gagal.')));
  });
}
function serveStatic(req, res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return json(res, 400, { error: 'URL tidak valid.' }); }
  if (p === '/') p = '/index.html';
  const segs = p.split('/').filter(Boolean);
  if (segs.some(s => s.startsWith('.'))) return json(res, 404, { error: 'Tidak ditemukan.' });
  let base = PUB;
  if (segs[0] === 'uploads') {
    if (segs.length !== 2 || !FOTO_RE.test(segs[1])) return json(res, 404, { error: 'Tidak ditemukan.' });
    base = UPL;
    p = '/' + segs[1];
  } else if (PUB === ROOT && (PRIVATE.has(segs[0]) || !MIME[path.extname(p).toLowerCase()] && !/manifest\.json$/.test(p))) {
    return json(res, 404, { error: 'Tidak ditemukan.' });
  } else if (PRIVATE.has(segs[segs.length - 1]) && PUB === ROOT) return json(res, 404, { error: 'Tidak ditemukan.' });
  const f = path.normalize(path.join(base, p));
  if (!f.startsWith(base + path.sep)) return json(res, 404, { error: 'Tidak ditemukan.' });
  let st;
  try { st = fs.statSync(f); if (!st.isFile()) throw 0; } catch (e) { return json(res, 404, { error: 'Halaman tidak ditemukan.' }); }
  const ext = path.extname(f).toLowerCase(), etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const type = f.endsWith('manifest.json') ? 'application/manifest+json' : (MIME[ext] || 'application/octet-stream');
  const h = { 'Content-Type': type, ETag: etag, 'Cache-Control': base === UPL ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
  let buf = null;
  if (/\.(html|css|js|json)$/.test(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const k = etag + f;
    if (!state.gz.has(k)) { if (state.gz.size > 50) state.gz.clear(); state.gz.set(k, zlib.gzipSync(fs.readFileSync(f))); }
    buf = state.gz.get(k);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  if (!buf) buf = fs.readFileSync(f);
  h['Content-Length'] = buf.length;
  res.writeHead(200, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

module.exports = { json, csp, secHeaders, csrfOk, readBody, serveStatic, PRIVATE, MIME };
