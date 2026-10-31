'use strict';

const fs = require('fs');
const { AUD } = require('../config');
const { ipOf } = require('./util');

function audit(req, user, a, d = '') {
  try {
    if (fs.existsSync(AUD) && fs.statSync(AUD).size > 2e6) fs.renameSync(AUD, AUD + '.old');
    fs.appendFileSync(AUD, JSON.stringify({ t: new Date().toISOString(), ip: ipOf(req), u: user || '-', a, d: String(d).slice(0, 200) }) + '\n');
  } catch (e) {}
}
function readAudit(n) {
  try {
    return fs.readFileSync(AUD, 'utf8').trim().split('\n').slice(-n).reverse().map(l => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

module.exports = { audit, readAudit, AUD };
