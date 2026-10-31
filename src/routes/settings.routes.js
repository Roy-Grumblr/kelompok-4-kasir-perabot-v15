'use strict';

const state = require('../state');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { dashboard } = require('../lib/dashboard');
const { saveImage, dropImage } = require('../lib/image');
const { str, int, normWa, bad } = require('../lib/util');

module.exports = function register(R) {
  R('POST', '/api/settings/logo', ['owner'], c => {
    const n = saveImage(c.body.img, 'l'); dropImage(state.db.set.logo); state.db.set.logo = n; save(); audit(c.req, c.user.username, 'logo_ganti'); return state.db.set;
  }, { max: 3e6 });
  R('DELETE', '/api/settings/logo', ['owner'], c => { dropImage(state.db.set.logo); state.db.set.logo = ''; save(); audit(c.req, c.user.username, 'logo_hapus'); return state.db.set; });
  R('GET', '/api/dashboard', 'any', c => { const d = parseInt(c.q.get('days'), 10); return dashboard(c.user.role, [7, 30, 90].includes(d) ? d : 30); });
  R('PUT', '/api/settings', ['owner'], c => {
    const b = c.body, nama = str(b.nama, 40, 1); if (!nama) bad('Nama toko wajib diisi.');
    const kertas = b.kertas === '58' ? '58' : '80', stokMin = int(b.stokMin, 0, 9999); if (stokMin === null) bad('Batas stok menipis harus angka 0-9999.');
    const waIn = str(b.wa || '', 25) || ''; if (waIn && !normWa(waIn)) bad('Nomor WhatsApp admin tidak valid. Contoh: 0812xxxxxxx');
    const maps = str(b.maps || '', 120); if (maps === null) bad('Lokasi peta maksimal 120 karakter.');
    const lu = b.logoUkuran === undefined ? state.db.set.logoUkuran : int(b.logoUkuran, 24, 96); if (lu === null) bad('Ukuran logo 24-96 piksel.');
    const lb = b.logoBentuk === undefined ? state.db.set.logoBentuk : b.logoBentuk; if (!['kotak', 'bulat', 'polos'].includes(lb)) bad('Bentuk logo tidak valid.');
    state.db.set = { nama, alamat: str(b.alamat || '', 80) || '', telp: str(b.telp || '', 25) || '', jam: str(b.jam || '', 30) || '', footer: str(b.footer || '', 80) || '', kertas, stokMin, wa: waIn, maps, logo: state.db.set.logo || '', logoUkuran: lu, logoBentuk: lb };
    save(); audit(c.req, c.user.username, 'pengaturan'); return state.db.set;
  });
};
