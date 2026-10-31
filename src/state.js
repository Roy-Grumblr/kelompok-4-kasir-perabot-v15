'use strict';

module.exports = {
  db: null,
  _rm: null,
  sessions: new Map(),
  buckets: new Map(),
  fails: new Map(),
  gz: new Map(),
  setDb(v) { this.db = v; this._rm = null; },
  getDb() { return this.db; },
  resetReserved() { this._rm = null; },
  getReserved() { return this._rm; }
};
