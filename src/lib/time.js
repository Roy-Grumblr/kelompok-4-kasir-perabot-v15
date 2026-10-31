'use strict';

const { OFF } = require('../config');

const dayKey = ts => new Date(ts + OFF).toISOString().slice(0, 10);
const now = () => Date.now();

module.exports = { OFF, dayKey, now };
