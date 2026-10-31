'use strict';

const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TZ_H = process.env.TZ_OFFSET !== undefined && process.env.TZ_OFFSET !== '' && !isNaN(+process.env.TZ_OFFSET) ? +process.env.TZ_OFFSET : 7;
const OFF = TZ_H * 3600e3;
const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PUB = fs.existsSync(path.join(ROOT, 'public', 'index.html')) ? path.join(ROOT, 'public') : ROOT;
const UPL = path.join(DATA, 'uploads');
fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });
fs.mkdirSync(UPL, { recursive: true });

const IDLE_MS = 30 * 60e3;
const ABS_MS = 12 * 3600e3;
const REM_IDLE = 7 * 864e5;
const REM_ABS = 30 * 864e5;
const ORD_TTL = 24 * 3600e3;
const OPEN = ['baru', 'diproses'];
const CATS = ['Dapur', 'Kebersihan', 'Furnitur', 'Ember & Plastik', 'Kamar Mandi', 'Lampu', 'Dekorasi', 'Kamar Tidur', 'Elektronik'];
const UNCAT = 'Belum dikategorikan';
const ROLES = ['owner', 'admin', 'gudang'];
const DEF_SET = { nama: 'TOKO PERABOTAN RUMAH', alamat: 'Jl. Raya Utama No. 123', telp: '0812-3456-7890', footer: 'Barang yang sudah dibeli tidak dapat ditukar', jam: '07.00 - 21.00', kertas: '80', stokMin: 3, wa: '', maps: '', logo: '', logoUkuran: 40, logoBentuk: 'kotak' };
const PRIVATE = new Set(['server.js', 'package.json', 'package-lock.json', 'data', 'node_modules', 'src']);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const FOTO_RE = /^[a-z0-9]{1,12}-[a-f0-9]{16}\.(jpg|png|webp)$/;
const AUD = path.join(DATA, 'audit.log');

module.exports = { PORT, HOST, TRUST_PROXY, TZ_H, OFF, ROOT, DATA, PUB, UPL, IDLE_MS, ABS_MS, REM_IDLE, REM_ABS, ORD_TTL, OPEN, CATS, UNCAT, ROLES, DEF_SET, PRIVATE, MIME, FOTO_RE, AUD };
