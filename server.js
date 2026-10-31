'use strict';

const { createApp } = require('./src/app');
const { PORT, HOST } = require('./src/config');
const { setupKey, recoveryKey } = require('./src/lib/db');
const state = require('./src/state');

const server = createApp();
server.requestTimeout = 30e3;
server.headersTimeout = 15e3;
server.keepAliveTimeout = 5e3;
server.listen(PORT, HOST, () => {
  console.log(`Kasir Perabot v15 berjalan di http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Kode pemulihan sandi (rahasia, hanya untuk pemilik server): ${recoveryKey(false)}  -> data/recovery-key.txt`);
  if (!state.db.users.length) console.log(`\n=== PENGATURAN AWAL ===\nKode setup untuk membuat akun Owner: ${setupKey()}\n(tersimpan juga di data/setup-key.txt, dihapus otomatis setelah akun Owner dibuat)\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
