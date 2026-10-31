'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPL, FOTO_RE } = require('../config');
const { bad } = require('./util');

function saveImage(dataUrl, prefix) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m) bad('Format gambar harus JPG, PNG, atau WebP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > 1.5e6) bad('Ukuran gambar terlalu besar (maks 1,5 MB setelah dikecilkan).');
  const ok = m[1] === 'jpeg' ? buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF
    : m[1] === 'png' ? buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))
      : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!ok) bad('Isi file bukan gambar yang valid.');
  const name = prefix + '-' + crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPL, name), buf);
  return name;
}
function dropImage(name) {
  if (name && FOTO_RE.test(name)) { try { fs.unlinkSync(path.join(UPL, name)); } catch (e) {} }
}

module.exports = { saveImage, dropImage };
