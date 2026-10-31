'use strict';

const state = require('../state');
const { IDLE_MS, ABS_MS, REM_IDLE, REM_ABS } = require('../config');

function rate(key, max, win) {
  const now = Date.now();
  let b = state.buckets.get(key);
  if (!b || b.r < now) { b = { n: 0, r: now + win }; state.buckets.set(key, b); }
  return ++b.n <= max;
}
function sweep() {
  const now = Date.now();
  for (const [k, b] of state.buckets) if (b.r < now) state.buckets.delete(k);
  for (const [k, s] of state.sessions) {
    const [li, la] = s.rem ? [REM_IDLE, REM_ABS] : [IDLE_MS, ABS_MS];
    if (now - s.last > li || now - s.born > la) state.sessions.delete(k);
  }
  for (const [k, f] of state.fails) if (f.until < now && f.t < now - 15 * 60e3) state.fails.delete(k);
}

module.exports = { rate, sweep, buckets: state.buckets, fails: state.fails };
