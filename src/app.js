'use strict';

const http = require('http');
require('./lib/db');
const state = require('./state');
const { json, secHeaders, serveStatic } = require('./http');
const { api, registerRoutes } = require('./router');
const { ipOf, HttpErr } = require('./lib/util');
const { rate, sweep } = require('./lib/ratelimit');
const { sweepOrders } = require('./orders');

let timersStarted = false;
function createApp() {
  registerRoutes();
  if (!timersStarted) {
    timersStarted = true;
    setInterval(sweepOrders, 5 * 60e3).unref();
    setInterval(sweep, 60e3).unref();
  }
  return http.createServer(async (req, res) => {
    try {
      let u;
      try { u = new URL(req.url, 'http://localhost'); } catch (e) { return json(res, 400, { error: 'URL tidak valid.' }); }
      secHeaders(req, res);
      if (!rate('g:' + ipOf(req), 900, 60e3)) return json(res, 429, { error: 'Terlalu banyak permintaan.' });
      if (u.pathname.startsWith('/api/')) return await api(req, res, u);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
      serveStatic(req, res, u.pathname);
    } catch (e) {
      if (e instanceof HttpErr) { if (!res.headersSent) json(res, e.code, { error: e.message }); else res.end(); return; }
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Terjadi kesalahan pada server.' }); else res.end();
    }
  });
}

module.exports = { createApp };
