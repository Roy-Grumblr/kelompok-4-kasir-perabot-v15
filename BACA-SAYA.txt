KASIR PERABOT v15 - CARA PAKAI
================================
1. Buka folder ini di VS Code, lalu buka terminal (Ctrl + `).
2. Jalankan:   node server.js     (Node.js 18 ke atas, tanpa npm install)
3. Buka di browser:  http://localhost:3000
   Jangan pakai Live Server atau membuka index.html langsung.

PERTAMA KALI
- Klik "Buat Akun Owner". Kode setup ada di terminal dan di data/setup-key.txt.

FITUR BARU v15
- Logo toko: Owner > Pengaturan toko > Logo toko (unggah gambar, atur ukuran & bentuk).
- Etalase pelanggan: barang bisa dimasukkan ke keranjang, lalu "Kirim pesanan ke admin".
  Stok yang dipesan ditahan 24 jam dan tidak bisa dijual ke kasir sampai pesanan selesai,
  dibatalkan, atau kedaluwarsa.
- Pesanan online (menu Pesanan): Proses > Bayar & cetak struk. Pelanggan melihat status
  pesanannya langsung dan bisa mengirim struk ke WhatsApp.
- Chatbot pelanggan: cek stok, tanya harga, lokasi, dan diteruskan ke WhatsApp admin.
- Nomor WA admin & lokasi peta: Owner > Pengaturan toko.
- Ulasan & rating (menu Ulasan): Owner dan Admin menyetujui, menyembunyikan, membalas,
  atau menghapus ulasan. Ulasan baru tidak tampil sebelum disetujui.
- Dashboard: periode Fast & Slow Moving bisa dipilih 7, 30, atau 90 hari.
- Produk: tombol "Per kategori" untuk mengelompokkan daftar barang.

CATATAN
- Chatbot memakai aturan sederhana (tanpa AI eksternal); pertanyaan di luar topik diarahkan ke WhatsApp admin.
- Tombol "Kirim" di WhatsApp membuka WhatsApp pelanggan/admin sendiri. Pesan tidak dikirim otomatis dari server.
- Folder data/ JANGAN dihapus. Di dalamnya ada database (db.json) dan foto.
- Setelah upload ke hosting, sw.js sudah dinaikkan ke v15.0.0.

STRUKTUR KODE
-------------
- server.js adalah bootstrap untuk memulai aplikasi.
- src/app.js membuat server HTTP dan mengatur middleware serta penanganan error.
- src/config.js dan src/state.js menyimpan konfigurasi dan state aplikasi bersama.
- src/lib/ berisi utilitas, database, autentikasi, audit, rate limit, gambar, stok, waktu, dan dashboard.
- src/orders.js menangani reservasi dan status pesanan; src/router.js mengatur dispatcher route.
- src/http.js menangani response JSON, header, parsing body, dan file statis.
- src/routes/ memisahkan route berdasarkan fitur: public, profil, produk, penjualan, pesanan, ulasan,
  restock, pengaturan, pengguna, serta backup dan audit.
