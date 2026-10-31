'use strict';

const state = require('../state');
const { CATS, UNCAT } = require('../config');
const { save } = require('../lib/db');
const { audit } = require('../lib/audit');
const { str, int, live, prodOut, bad } = require('../lib/util');
const { saveImage, dropImage } = require('../lib/image');
const { slog } = require('../lib/stock');

const ANY = 'any';
const katOk = (k, cur) => CATS.includes(k) || k === UNCAT || (cur !== undefined && k === cur);
function readProduct(b, cur) {
  const kode = str(b.kode, 20, 1), nama = str(b.nama, 60, 1), kat = str(b.kat, 40, 1), hpp = int(b.hpp, 0, 1e9), harga = int(b.harga, 0, 1e9);
  if (!kode) bad('Kode produk wajib diisi (maks 20 karakter).');
  if (!nama) bad('Nama barang wajib diisi (maks 60 karakter).');
  if (!kat || !katOk(kat, cur)) bad('Kategori tidak valid.');
  if (hpp === null) bad('HPP harus angka bulat 0 atau lebih.');
  if (harga === null) bad('Harga jual harus angka bulat 0 atau lebih.');
  return { kode, nama, kat, hpp, harga };
}
const dupKode = (kode, id) => state.db.products.some(x => !x.del && x.id !== id && x.kode.toLowerCase() === kode.toLowerCase());

module.exports = function register(R) {
  R('GET', '/api/products', ANY, c => {
    const trash = c.q.get('trash') === '1'; if (trash && c.user.role !== 'owner') bad('Tidak ada akses.', 403);
    return (trash ? state.db.products.filter(p => p.del) : live()).map(p => prodOut(p, c.user.role));
  });
  R('POST', '/api/products', ['owner', 'gudang'], c => {
    const o = readProduct(c.body), stok = int(c.body.stok, 0, 1e6); if (stok === null) bad('Stok awal harus angka bulat 0 atau lebih.');
    if (dupKode(o.kode, 0)) bad('Kode produk sudah dipakai.', 409);
    const p = { id: Math.max(0, ...state.db.products.map(x => x.id)) + 1, del: false, ...o, stok };
    state.db.products.push(p); if (stok > 0) slog(p, 'masuk', stok, 'Stok awal', c.user.username);
    save(); audit(c.req, c.user.username, 'produk_tambah', p.kode); return prodOut(p, c.user.role);
  });
  R('PUT', '/api/products/:id', ['owner', 'gudang'], c => {
    const p = state.db.products.find(x => x.id === +c.params.id && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    const o = readProduct(c.body, p.kat); if (dupKode(o.kode, p.id)) bad('Kode produk sudah dipakai.', 409);
    const old = `${p.harga}/${p.hpp}`; Object.assign(p, o); save(); audit(c.req, c.user.username, 'produk_ubah', `${p.kode} ${old}->${p.harga}/${p.hpp}`);
    return prodOut(p, c.user.role);
  });
  R('DELETE', '/api/products/:id', ['owner'], c => {
    const p = state.db.products.find(x => x.id === +c.params.id && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    p.del = true; save(); audit(c.req, c.user.username, 'produk_hapus', p.kode); return { ok: true };
  });
  R('POST', '/api/products/:id/photo', ['owner', 'gudang'], c => {
    const p = state.db.products.find(x => x.id === +c.params.id && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    const n = saveImage(c.body.img, 'p'); dropImage(p.foto); p.foto = n; save(); audit(c.req, c.user.username, 'produk_foto', p.kode);
    return prodOut(p, c.user.role);
  }, { max: 3e6 });
  R('DELETE', '/api/products/:id/photo', ['owner', 'gudang'], c => {
    const p = state.db.products.find(x => x.id === +c.params.id && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    dropImage(p.foto); p.foto = ''; save(); audit(c.req, c.user.username, 'produk_foto_hapus', p.kode); return prodOut(p, c.user.role);
  });
  R('POST', '/api/products/import', ['owner', 'gudang'], c => {
    const rows = c.body.rows; if (!Array.isArray(rows) || !rows.length) bad('Tidak ada baris data untuk diimpor.');
    if (rows.length > 5000) bad('Maksimal 5.000 baris per impor.');
    const upStok = c.body.updateStok === true, catMap = Object.fromEntries([...CATS, UNCAT].map(k => [k.toLowerCase(), k]));
    const out = { tambah: 0, ubah: 0, gagal: [] }; const seen = new Set(); let id = Math.max(0, ...state.db.products.map(x => x.id));
    rows.forEach((r, i) => {
      const ln = i + 2, err = m => out.gagal.push({ baris: ln, pesan: m });
      if (!r || typeof r !== 'object') return err('Format baris tidak valid.');
      const kode = str(String(r.kode ?? ''), 20, 1), nama = str(String(r.nama ?? ''), 60, 1);
      if (!kode) return err('Kode kosong atau lebih dari 20 karakter.');
      if (!nama) return err('Nama kosong atau lebih dari 60 karakter.');
      if (seen.has(kode.toLowerCase())) return err(`Kode ${kode} muncul dua kali di file.`); seen.add(kode.toLowerCase());
      const hasH = r.harga !== null && r.harga !== undefined && r.harga !== '', harga = hasH ? int(r.harga, 0, 1e9) : null;
      if (hasH && harga === null) return err('Harga jual tidak valid.');
      const hasP = r.hpp !== null && r.hpp !== undefined && r.hpp !== '', hpp = hasP ? int(r.hpp, 0, 1e9) : null;
      if (hasP && hpp === null) return err('HPP tidak valid.');
      const hasS = r.stok !== null && r.stok !== undefined && r.stok !== '', stok = hasS ? int(r.stok, 0, 1e6) : null;
      if (hasS && stok === null) return err('Stok tidak valid.');
      const katIn = str(String(r.kat ?? ''), 40), kat = katIn ? catMap[katIn.toLowerCase()] || UNCAT : null;
      const ex = state.db.products.find(x => !x.del && x.kode.toLowerCase() === kode.toLowerCase());
      if (ex) {
        ex.nama = nama; if (kat) ex.kat = kat; if (hasH) ex.harga = harga; if (hasP) ex.hpp = hpp;
        if (upStok && hasS && stok !== ex.stok) { const d = stok - ex.stok; ex.stok = stok; slog(ex, 'koreksi', d, 'Impor CSV', c.user.username); }
        out.ubah++;
      } else {
        if (!hasH) return err('Produk baru wajib punya harga jual.');
        const p = { id: ++id, del: false, kode, nama, kat: kat || UNCAT, hpp: hasP ? hpp : harga, harga, stok: stok || 0, foto: '' };
        state.db.products.push(p); if (p.stok > 0) slog(p, 'masuk', p.stok, 'Impor CSV', c.user.username); out.tambah++;
      }
    });
    if (out.tambah || out.ubah) save();
    audit(c.req, c.user.username, 'impor_csv', `+${out.tambah} ~${out.ubah} x${out.gagal.length}`);
    out.gagal = out.gagal.slice(0, 50); return out;
  }, { max: 5e6 });
  R('POST', '/api/products/:id/restore', ['owner'], c => {
    const p = state.db.products.find(x => x.id === +c.params.id && x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    if (dupKode(p.kode, p.id)) bad('Kode produk sudah dipakai produk lain.', 409);
    p.del = false; save(); audit(c.req, c.user.username, 'produk_pulih', p.kode); return { ok: true };
  });
  R('POST', '/api/stock', ['owner', 'gudang'], c => {
    const b = c.body, p = state.db.products.find(x => x.id === int(b.pid, 1, 1e9) && !x.del); if (!p) bad('Produk tidak ditemukan.', 404);
    const ket = str(b.ket || '', 60) || '';
    if (b.tipe === 'masuk') {
      const n = int(b.qty, 1, 1e6); if (n === null) bad('Jumlah masuk minimal 1 (angka bulat).');
      p.stok += n; if (b.hpp !== undefined && b.hpp !== null && b.hpp !== '') { const h = int(b.hpp, 0, 1e9); if (h === null) bad('HPP tidak valid.'); p.hpp = h; }
      slog(p, 'masuk', n, ket || 'Barang masuk', c.user.username);
    } else if (b.tipe === 'koreksi') {
      const n = int(b.qty, 0, 1e6); if (n === null) bad('Stok fisik harus angka bulat 0 atau lebih.');
      const alasan = str(b.alasan || '', 30) || 'Koreksi', d = n - p.stok; if (d === 0) bad('Stok sama, tidak ada perubahan.');
      p.stok = n; slog(p, 'koreksi', d, alasan + (ket ? ' - ' + ket : ''), c.user.username);
    } else bad('Jenis mutasi tidak valid.');
    save(); audit(c.req, c.user.username, 'stok_' + b.tipe, `${p.kode} sisa ${p.stok}`); return prodOut(p, c.user.role);
  });
  R('GET', '/api/stocklog', ['owner', 'gudang'], c => {
    const t = c.q.get('tipe') || '';
    return state.db.stockLog.filter(l => !t || l.tipe === t).slice(-150).reverse();
  });
};
