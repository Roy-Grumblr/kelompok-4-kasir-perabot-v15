'use strict';
/* ============================================================
   KASIR PERABOT v15 - FRONT-END
   Semua data & hak akses ada di SERVER (server.js).
   File ini hanya menampilkan data dan mengirim permintaan ke /api/*.
   Tidak ada onclick= di HTML (aman untuk Content-Security-Policy).
   ============================================================ */
const $=i=>document.getElementById(i);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
const fmtT=d=>new Date(d).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'});

/* ---------- penghubung klik/input/submit (pengganti onclick) ---------- */
const H={};
const A=(fn,...a)=>`data-do="${fn}"${a.length?` data-a="${esc(JSON.stringify(a))}"`:''}`;   // atribut klik
const F=(fn,...a)=>`data-sub="${fn}"${a.length?` data-a="${esc(JSON.stringify(a))}"`:''}`;  // atribut submit form
const args=el=>{try{return el.dataset.a?JSON.parse(el.dataset.a):[]}catch(e){return[]}};
document.addEventListener('click',e=>{const el=e.target.closest('[data-do]');if(!el)return;const f=H[el.dataset.do];if(f){if(el.tagName==='A')e.preventDefault();f(...args(el),el,e)}});
document.addEventListener('input',e=>{const el=e.target.closest('[data-in]');if(el&&H[el.dataset.in])H[el.dataset.in](el.value,el,e)});
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(el&&H[el.dataset.ch])H[el.dataset.ch](el.value,el,e)});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-sub]');if(!f)return;e.preventDefault();if(H[f.dataset.sub])H[f.dataset.sub](...args(f),f,e)});

/* ---------- state ---------- */
const S={me:null,set:{nama:'TOKO PERABOTAN RUMAH',alamat:'',telp:'',jam:'',footer:'',kertas:'80',stokMin:3},cats:[],uncat:'Belum dikategorikan',pub:null,prods:[]};
const ROLE={owner:'Owner',admin:'Admin',gudang:'Gudang'};
/* menu yang tampil (server tetap memeriksa hak akses di setiap permintaan) */
const ACCESS={
 owner:['dash','kasir','pesanan','produk','gudang','laporan','riwayat','ulasan','owner','profil'],
 admin:['dash','kasir','pesanan','produk','riwayat','laporan','ulasan','lapor','profil'],
 gudang:['dash','produk','gudang','profil']};
const NAV={dash:'Dashboard',kasir:'Kasir',produk:'Produk',gudang:'Gudang',riwayat:'Riwayat',laporan:'Laporan',lapor:'Lapor Habis',owner:'Owner',profil:'Profil',pesanan:'Pesanan',ulasan:'Ulasan'};
const TTL={dash:'Dashboard',kasir:'Kasir',produk:'Data Produk',gudang:'Gudang & Stok',riwayat:'Riwayat Transaksi',laporan:'Laporan Penjualan',lapor:'Lapor Barang Habis',owner:'Panel Owner',profil:'Profil Saya',pesanan:'Pesanan Online',ulasan:'Rating & Ulasan'};
const isOwner=()=>S.me&&S.me.role==='owner';
const canHpp=()=>S.me&&(S.me.role==='owner'||S.me.role==='gudang');
const canVoid=()=>S.me&&(S.me.role==='owner'||S.me.role==='admin');
const lowLim=()=>{const n=parseInt(S.set.stokMin,10);return Number.isFinite(n)&&n>=0?n:3};

/* ---------- API ---------- */
async function api(method,url,body,opt={}){
 let r;
 try{r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'pos',...(opt.poll?{'X-Poll':'1'}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
 catch(e){const er=new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');er.net=true;throw er}
 let j=null;try{j=await r.json()}catch(e){}
 if(r.status===401&&S.me&&url!=='/api/login'){sessionEnded();const er=new Error('Sesi berakhir');er.handled=true;throw er}
 if(!r.ok){const er=new Error((j&&j.error)||`Terjadi kesalahan (${r.status})`);er.status=r.status;throw er}
 return j;
}
const run=async fn=>{try{return await fn()}catch(e){if(!e.handled)toast(e.message);return undefined}};
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),3000)}

/* ---------- konfirmasi (dipakai Keluar, Hapus, Batalkan, dll) ---------- */
let ASK=null;
function ask(msg,o={}){
 const{title='Konfirmasi',ok='Ya',cancel='Batal',danger=false,icon='❓'}=o;
 if(ASK)ASK(false);
 return new Promise(res=>{ASK=res;
  $('croot').innerHTML=`<div class="cmask" ${A('askBg')}><div class="cbox" role="alertdialog" aria-modal="true"><div class="ci">${icon}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p>
  <div class="cb"><button class="btn" ${A('askNo')}>${esc(cancel)}</button><button class="btn ${danger?'rd':'p'}" id="askOk" ${A('askYes')}>${esc(ok)}</button></div></div></div>`;
  setTimeout(()=>{const b=$('askOk');if(b)b.focus()},30)});
}
function askClose(v){$('croot').innerHTML='';const f=ASK;ASK=null;if(f)f(v)}
H.askYes=()=>askClose(true);H.askNo=()=>askClose(false);H.askBg=(el,e)=>{if(e.target===el)askClose(false)};

/* ---------- modal ---------- */
function modal(h){$('mroot').innerHTML=`<div class="mask" ${A('mBg')}><div class="mbox">${h}</div></div>`}
const closeM=()=>{$('mroot').innerHTML=''};
H.mBg=(el,e)=>{if(e.target===el)closeM()};H.closeM=closeM;
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(ASK)askClose(false);else if($('mroot').innerHTML)closeM();else closeAuth()});

/* ---------- sesi di sisi tampilan ---------- */
let lastAct=Date.now(),dashT=null;
['click','keydown','touchstart'].forEach(e=>document.addEventListener(e,()=>lastAct=Date.now(),{passive:true}));
setInterval(()=>{
 if(!S.me)return;
 $('clock').textContent=new Date().toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
 if(!S.me.rem&&Date.now()-lastAct>30*60*1000){api('POST','/api/logout',{}).catch(()=>{});sessionEnded('Sesi berakhir karena tidak aktif.')}
},5000);
function resetUI(){
 S.me=null;cart=[];closeM();askClose(false);clearInterval(dashT);dashT=null;clearInterval(badgeT);badgeT=null;
 $('app').classList.add('hide');$('auth').classList.remove('hide');window.scrollTo(0,0);loadPublic();
}
function sessionEnded(msg){if(!S.me)return;resetUI();toast(msg||'Sesi berakhir, silakan masuk lagi.')}
H.askLogout=async()=>{
 const extra=cart.length?' Keranjang yang belum dibayar akan dikosongkan.':'';
 if(await ask('Anda akan keluar dari akun ini. Semua data toko tetap tersimpan aman.'+extra,{title:'Keluar dari akun?',ok:'Ya, keluar',cancel:'Tidak, tetap di sini',icon:'🚪'})){
  try{await api('POST','/api/logout',{})}catch(e){}
  resetUI();toast('Anda sudah keluar.');
 }
};

/* ============================================================
   LOGIN / BUAT AKUN
   ============================================================ */
const pwHint='Minimal 8 karakter, kombinasi huruf dan angka.';
function authBtns(){
 const su=!!(S.pub&&S.pub.setup);
 $('hLogin').textContent=su?'Buat Akun Owner':'Masuk';$('hLogin').classList.toggle('pulse',su);
 $('hCta').textContent=su?'Buat Akun Owner →':'Masuk ke Kasir →';
}
let AM='login',FG='req';
const txt=(id,label,o={})=>`<label for="${id}">${label}</label><input id="${id}"${o.type?` type="${o.type}"`:''}${o.opt?'':' required'}${o.max?` maxlength="${o.max}"`:''}${o.min?` minlength="${o.min}"`:''}${o.ac?` autocomplete="${o.ac}"`:''}${o.ph?` placeholder="${esc(o.ph)}"`:''}${o.un?' pattern="[A-Za-z0-9_.]{3,30}" title="3-30 karakter: huruf, angka, titik, garis bawah" autocapitalize="none" spellcheck="false"':''}>`;
const unF=ac=>txt('lu','Username',{max:30,ac,un:1});
const pw2F=()=>txt('lp','Kata sandi',{type:'password',min:8,max:100,ac:'new-password'})+txt('lp2','Ulangi kata sandi',{type:'password',min:8,max:100,ac:'new-password'})+`<div class="mut" style="margin-top:6px">${pwHint}</div>`;
const errB=lbl=>`<button class="btn p" id="lbtn">${lbl}</button><p class="mut" id="lerr" role="alert" style="color:var(--red);margin-top:10px"></p>`;
function authView(){
 const setup=!!(S.pub&&S.pub.setup);if(setup)AM='setup';else if(AM==='setup')AM='login';
 const T={setup:['PENGATURAN AWAL','Buat akun Owner','Akun ini memegang akses penuh. Gunakan kata sandi yang kuat.'],
  login:['SELAMAT DATANG KEMBALI','Masuk ke sistem','Gunakan akun Anda. Belum punya? Daftar dulu.'],
  register:['AKUN BARU','Daftar akun staf','Pilih peran Anda. Akun aktif setelah disetujui Owner.'],
  forgot:['LUPA KATA SANDI','Atur ulang kata sandi','Pilih salah satu cara di bawah ini.']}[AM];
 let body;
 if(AM==='setup')body=`<form class="afrm" ${F('doSetup')} autocomplete="on"><label for="lk">Kode setup</label><input id="lk" required maxlength="60" autocomplete="off" placeholder="Lihat file data/setup-key.txt atau layar terminal server">
  ${txt('ln','Nama lengkap',{max:40,min:2,ac:'name'})}${unF('username')}${pw2F()}${errB('Buat akun & masuk')}</form>`;
 else if(AM==='register')body=`<form class="afrm" ${F('doRegister')} autocomplete="on">${txt('ln','Nama lengkap',{max:40,min:2,ac:'name'})}${unF('username')}${txt('lt','Telepon / WhatsApp (opsional)',{max:25,opt:1,ac:'tel'})}
  <label for="lrole">Peran</label><select id="lrole"><option value="admin">Admin (kasir, riwayat, laporan)</option><option value="gudang">Gudang (produk &amp; stok)</option></select>
  <div class="mut" style="margin-top:4px">Akun Owner hanya dibuat oleh Owner.</div>${pw2F()}${errB('Kirim pendaftaran')}
  <div class="alinks"><button type="button" class="lnk" ${A('authMode','login')}>← Sudah punya akun? Masuk</button></div></form>`;
 else if(AM==='forgot')body=`<div class="atabs"><button type="button" class="${FG==='req'?'on':''}" ${A('fgTab','req')}>Minta ke Owner</button><button type="button" class="${FG==='key'?'on':''}" ${A('fgTab','key')}>Kode pemulihan server</button></div>
  <form class="afrm" ${F('doForgot')} autocomplete="off">${FG==='req'
   ?`<p class="ainfo">Masukkan username Anda. Owner akan melihat permintaan ini di Panel Owner lalu memberi kata sandi baru.</p>${unF('username')}${errB('Kirim permintaan')}`
   :`<p class="ainfo">Untuk pemilik server. Kode ada di file <b>data/recovery-key.txt</b> (juga tampil di terminal saat server dijalankan). Kode berganti setiap kali dipakai.</p>${unF('username')}<label for="lk">Kode pemulihan</label><input id="lk" required maxlength="60" autocomplete="off">${pw2F().replace('Kata sandi<','Kata sandi baru<')}${errB('Atur kata sandi baru')}`}
  <div class="alinks"><button type="button" class="lnk" ${A('authMode','login')}>← Kembali ke Masuk</button></div></form>`;
 else body=`<form class="afrm" ${F('doLogin')} autocomplete="on">${unF('username')}${txt('lp','Kata sandi',{type:'password',max:100,ac:'current-password'})}
  <label class="chk"><input type="checkbox" id="lr"> Ingat saya di perangkat ini (30 hari)</label>${errB('Masuk sekarang')}
  <div class="alinks"><button type="button" class="lnk" ${A('authMode','forgot')}>Lupa kata sandi?</button><button type="button" class="lnk" ${A('authMode','register')}>Daftar akun baru</button></div></form>`;
 $('abox').innerHTML=`<button class="aclose" type="button" ${A('closeAuth')} aria-label="Tutup">✕</button>
 <div class="ahead"><span class="fl f1">🪑</span><span class="fl f3">🪴</span><span class="pill">${T[0]}</span><h2>${T[1]}</h2><p>${T[2]}</p></div>${body}`;
 authBtns();
}
H.openAuth=()=>{if(!(S.pub&&S.pub.setup))AM='login';authView();$('amask').classList.remove('hide');document.body.classList.add('noscroll');setTimeout(()=>{const u=$('lk')||$('ln')||$('lu');if(u)u.focus()},60)};
H.authMode=m=>{AM=m;authView();setTimeout(()=>{const u=$('ln')||$('lu');if(u)u.focus()},30)};
H.fgTab=t=>{FG=t;authView()};
function closeAuth(){$('amask').classList.add('hide');document.body.classList.remove('noscroll')}
H.closeAuth=closeAuth;H.authBg=(el,e)=>{if(e.target===el)closeAuth()};
function authMsg(t,ok){const er=$('lerr');if(!er)return;er.style.color=ok?'var(--g)':'var(--red)';er.textContent=t}
async function authPost(path,body,done){
 const b=$('lbtn');authMsg('');if(b)b.disabled=true;
 try{const r=await api('POST',path,body);await done(r)}
 catch(e){authMsg(e.message)}finally{const b2=$('lbtn');if(b2)b2.disabled=false}
}
const samePw=()=>{if($('lp').value!==$('lp2').value){authMsg('Kata sandi tidak sama.');return false}return true};
H.doLogin=()=>authPost('/api/login',{username:$('lu').value.trim(),password:$('lp').value,remember:$('lr').checked},async r=>{closeAuth();await enterApp(r.user)});
H.doSetup=()=>{if(!samePw())return;authPost('/api/setup',{key:$('lk').value.trim(),nama:$('ln').value.trim(),username:$('lu').value.trim(),password:$('lp').value},async r=>{if(S.pub)S.pub.setup=false;closeAuth();await enterApp(r.user)})};
H.doRegister=()=>{if(!samePw())return;authPost('/api/register',{nama:$('ln').value.trim(),username:$('lu').value.trim(),telp:$('lt').value.trim(),role:$('lrole').value,password:$('lp').value},r=>{AM='login';authView();authMsg(r.msg,true)})};
H.doForgot=()=>{
 if(FG==='req')return authPost('/api/forgot',{username:$('lu').value.trim()},r=>authMsg(r.msg,true));
 if(!samePw())return;
 authPost('/api/recover',{username:$('lu').value.trim(),key:$('lk').value.trim(),password:$('lp').value},r=>{AM='login';FG='req';authView();authMsg(r.msg,true)});
};
H.pwForm=()=>modal(`<h3>Ganti kata sandi</h3><form ${F('pwSave')}><label>Kata sandi lama</label><input id="po" type="password" required autocomplete="current-password" maxlength="100">
 <label>Kata sandi baru</label><input id="pn" type="password" required minlength="8" maxlength="100" autocomplete="new-password"><label>Ulangi kata sandi baru</label><input id="pn2" type="password" required minlength="8" maxlength="100" autocomplete="new-password">
 <div class="mut" style="margin-top:6px">${pwHint} Perangkat lain akan otomatis keluar.</div>
 <div class="tabs" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Simpan</button></div></form>`);
H.pwSave=()=>run(async()=>{
 if($('pn').value!==$('pn2').value)return toast('Kata sandi baru tidak sama.');
 await api('POST','/api/password',{old:$('po').value,password:$('pn').value});closeM();toast('Kata sandi diganti.');
});

/* ============================================================
   MASUK KE APLIKASI
   ============================================================ */
const ini=n=>String(n||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'TP';
const fmtD=d=>d?new Date(d).toLocaleDateString('id-ID',{dateStyle:'medium'}):'-';
const avatarHTML=u=>u.foto?`<img src="/uploads/${esc(u.foto)}" alt="">`:esc(ini(u.nama||u.username));
function paintMe(){$('uinfo').textContent=`${S.me.nama||S.me.username} · ${ROLE[S.me.role]}`;$('uavatar').innerHTML=avatarHTML(S.me)}
function brandApp(){$('storeName').textContent=S.set.nama.slice(0,22);paintLogo(S.set,[document.querySelector('#app .logo i')],56)}
async function enterApp(user){
 S.me=user;lastAct=Date.now();
 const m=await api('GET','/api/me');S.me=m.me;S.set=m.set;S.cats=m.cats;S.uncat=m.uncat;
 $('auth').classList.add('hide');$('app').classList.remove('hide');
 paintMe();brandApp();
 $('nav').innerHTML=ACCESS[S.me.role].map(k=>`<button ${A('go',k)} data-k="${k}">${NAV[k]}</button>`).join('');
 window.scrollTo(0,0);go('dash');startBadges();
}

/* ---------- router ---------- */
let cur='dash';
const VIEWS={};
function go(v){
 if(!S.me)return;if(!ACCESS[S.me.role].includes(v))v=ACCESS[S.me.role][0];
 cur=v;clearInterval(dashT);dashT=null;
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.k===v));
 $('title').textContent=TTL[v];window.scrollTo(0,0);
 return run(()=>VIEWS[v]());
}
H.go=go;
const loading=()=>{$('view').innerHTML='<div class="empty">Memuat…</div>'};
const loadProds=async()=>{S.prods=await api('GET','/api/products')};
const kat=p=>p.kat;

/* ============================================================
   GRAFIK (SVG/HTML murni, tanpa library luar)
   ============================================================ */
const PAL=['#2b6b57','#b45a32','#d9b66b','#4a7a9b','#7d6a9c','#b8402f','#3c9a92','#9aa59f'];
const nm=n=>n>=1e9?(n/1e9).toFixed(1).replace('.0','')+' M':n>=1e6?(n/1e6).toFixed(1).replace('.0','')+' jt':n>=1e3?Math.round(n/1e3)+' rb':String(Math.round(n));
const niceMax=m=>{if(m<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(m))),n=m/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p};
const dLabel=d=>{const t=new Date(d+'T00:00:00');return['Min','Sen','Sel','Rab','Kam','Jum','Sab'][t.getDay()]+' '+d.slice(8)};
function barChart(rows,series,tip=String,axis=nm){
 const W=520,Hh=210,L=42,B=26,T=10,R=6,iw=W-L-R,ih=Hh-T-B;
 const mx=niceMax(Math.max(1,...rows.flatMap(r=>r.v))),gw=iw/rows.length,bw=Math.min(28,gw*.72/series.length);
 let g='',b='';
 for(let i=0;i<=4;i++){const y=T+ih-ih*i/4;g+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+3.5}" text-anchor="end">${esc(axis(mx*i/4))}</text>`}
 rows.forEach((r,i)=>{const cx=L+gw*i+gw/2;
  r.v.forEach((v,j)=>{const h=Math.max(v>0?2:0,ih*v/mx),x=cx-bw*series.length/2+bw*j+1;
   b+=`<rect class="bar" style="--d:${i*50+j*25}ms" x="${x.toFixed(1)}" y="${(T+ih-h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${series[j].c}"><title>${esc(r.l)} · ${esc(series[j].n)}: ${esc(tip(v))}</title></rect>`});
  b+=`<text x="${cx}" y="${Hh-8}" text-anchor="middle">${esc(r.l)}</text>`});
 return`<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Grafik batang">${g}${b}</svg>${series.length>1?`<div class="leg">${series.map(s=>`<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`:''}`;
}
function donut(items,center,sub,fmtv=String){
 const tot=items.reduce((s,x)=>s+x.v,0);if(!tot)return'<div class="empty">Belum ada data.</div>';
 let off=25,seg='';
 items.forEach((x,i)=>{const p=x.v/tot*100,d=Math.max(p-.6,.1);
  seg+=`<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${PAL[i%PAL.length]}" stroke-width="6" stroke-dasharray="${d.toFixed(2)} ${(100-d).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"><title>${esc(x.l)}: ${esc(fmtv(x.v))} (${p.toFixed(0)}%)</title></circle>`;off-=p});
 return`<div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="Grafik donat">${seg}<text class="dn" x="21" y="22">${esc(center)}</text><text class="ds" x="21" y="26.5">${esc(sub)}</text></svg>
 <div class="dleg">${items.map((x,i)=>`<div><span><i style="background:${PAL[i%PAL.length]}"></i><b>${esc(x.l)}</b></span><b>${Math.round(x.v/tot*100)}%</b></div>`).join('')}</div></div>`;
}
function hbars(a,o={}){
 const{max,color='var(--g)',fmtv=String,empty='Belum ada data.'}=o;
 if(!a.length)return`<div class="empty">${esc(empty)}</div>`;
 const m=max||Math.max(1,...a.map(x=>x.v));
 return a.map((x,i)=>`<div class="hb"><div class="hl"><em>${i+1}</em><span>${esc(x.n)}</span>${x.hint?`<span class="hint ${x.lv==='ok'?'':esc(x.lv||'')}">${esc(x.hint)}</span>`:''}</div><div class="hv">${esc(fmtv(x.v))}</div>
 <div class="ht"><i style="--w:${Math.max(2,x.v/m*100).toFixed(1)}%;--d:${i*60}ms;--c:${x.c||color}"></i></div>${x.sub?`<div class="sub">${esc(x.sub)}</div>`:''}</div>`).join('');
}

/* ============================================================
   DASHBOARD (Owner / Admin / Gudang)
   ============================================================ */
const statCard=([l,v,c])=>`<div class="card stat"><span class="mut">${esc(l)}</span><b${c?' style="color:var(--g)"':''}>${esc(v)}</b></div>`;
function restockCard(d,canDone){
 const a=d.restock;
 return`<div class="card"><h3>Perlu restock${a.length?` <small>${a.length} laporan</small>`:''}</h3>${a.length?a.map(r=>`<div class="row"><div><b>${esc(r.nama)}</b> <span class="tag">${esc(r.kode)}</span>${r.catatan?`<div style="font-size:13px">${esc(r.catatan)}</div>`:''}<div class="mut">Dilapor ${esc(r.user)} · ${fmtT(r.date)}</div></div>${canDone?`<button class="btn s p" ${A('rsDone',r.id)}>Selesai</button>`:''}</div>`).join(''):'<div class="empty">Tidak ada laporan barang habis.</div>'}</div>`;
}
function lowCard(d,canAdd){
 const items=d.low.map(x=>({n:x.nama,v:x.stok,sub:`Batas menipis ${d.lim}`,c:x.stok<=0?'var(--red)':'#c18a2b'}));
 return`<div class="card"><h3>Stok menipis <small>${d.lowCount} barang</small></h3>${hbars(items,{max:Math.max(d.lim,1)*2,empty:'Semua stok aman.'})}${canAdd&&d.low.length?`<div class="tabs" style="margin:12px 0 0"><button class="btn s p" ${A('go','gudang')}>Buka menu Gudang</button></div>`:''}</div>`;
}
function moveCards(d,money){
 const f=d.fast.map(x=>({n:x.nama,v:x.qty,sub:`Stok ${x.stok}${money?' · '+rp(x.omzet):''}`,hint:x.hint,lv:x.lv}));
 const s=d.slow.map(x=>({n:x.nama,v:x.qty,sub:`Stok ${x.stok}${money?' · '+rp(x.omzet):''}`,hint:x.hint,lv:x.lv,c:'var(--or)'}));
 return periodBar(d)+`<div class="card"><h3>10 Fast Moving <small>terjual ${d.days} hari terakhir</small></h3><p class="mut" style="margin:4px 0 6px">Barang paling laku. Jaga stoknya dan pacu penjualannya.</p>${hbars(f,{fmtv:v=>v+' pcs',empty:'Belum ada penjualan.'})}</div>
 <div class="card"><h3>10 Slow Moving <small>terjual ${d.days} hari terakhir</small></h3><p class="mut" style="margin:4px 0 6px">Barang berstok tapi lambat laku. Tahan restock sampai terjual.</p>${hbars(s,{fmtv:v=>v+' pcs',color:'var(--or)',empty:'Belum ada barang berstok.'})}</div>`;
}
function todoCard(d){
 const t=d.todo;if(!t||(!t.pending&&!t.resets))return'';
 const a=[];if(t.pending)a.push(`${t.pending} pendaftaran akun menunggu persetujuan`);if(t.resets)a.push(`${t.resets} permintaan reset kata sandi`);
 return`<div class="card todo"><div><b>Perlu tindakan Anda</b><span class="mut">${a.join(' · ')}</span></div><button class="btn s p" ${A('go','owner')}>Buka Panel Owner</button></div>`;
}
function dashHTML(d){
 const role=S.me.role,go_=role!=='gudang'?`<button class="btn p" ${A('go','kasir')}>Buka Kasir</button>`:`<button class="btn p" ${A('go','gudang')}>Buka Gudang</button>`;
 const head=`<div class="dtop"><div><h3>Halo, ${esc(S.me.nama||S.me.username)} 👋</h3><div class="mut">Ringkasan toko · diperbarui ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div></div><div class="tabs" style="margin:0"><button class="btn" ${A('dashRefresh')}>Perbarui</button>${go_}</div></div>`;
 if(role==='gudang'){
  const st=d.stat;
  return head+`<div class="grid g4">${[['Jenis produk',st.jenis],['Total unit stok',st.unit.toLocaleString('id-ID')],['Nilai stok (HPP)',rp(st.nilai)],['Barang masuk hari ini',st.masukHari],['Stok menipis',d.lowCount]].map(statCard).join('')}</div>
  <div class="dgrid">${lowCard(d,true)}${restockCard(d,true)}
  <div class="card"><h3>Stok per kategori <small>unit</small></h3>${donut(d.stokKat,st.unit.toLocaleString('id-ID'),'unit stok')}</div>
  <div class="card"><h3>Barang masuk vs terjual <small>7 hari</small></h3>${barChart(d.mutasi.map(m=>({l:dLabel(m.d),v:[m.masuk,m.jual]})),[{n:'Masuk',c:PAL[0]},{n:'Terjual',c:PAL[1]}],v=>v+' pcs',v=>String(Math.round(v)))}</div>
  ${moveCards(d,false)}</div>`;
 }
 const st=d.stat,own=role==='owner';
 const cards=own?[['Omzet hari ini',rp(st.omzet)],['Transaksi hari ini',st.trx],['Laba hari ini',rp(st.laba),1],['Total omzet',rp(st.totalOmzet)]]:[['Omzet hari ini',rp(st.omzet)],['Transaksi hari ini',st.trx],['Produk aktif',st.produk],['Stok menipis',d.lowCount]];
 const series=own?[{n:'Omzet',c:PAL[0]},{n:'Laba',c:PAL[1]}]:[{n:'Omzet',c:PAL[0]}];
 const catTotal=d.cat.reduce((s,x)=>s+x.v,0);
 return head+todoCard(d)+pesananCard(d)+`<div class="grid g4">${cards.map(statCard).join('')}</div>
 <div class="dgrid"><div class="card"><h3>${own?'Omzet & laba':'Omzet'} <small>7 hari terakhir</small></h3>${barChart(d.daily.map(x=>({l:dLabel(x.d),v:own?[x.omzet,x.laba]:[x.omzet]})),series,rp)}</div>
 <div class="card"><h3>Penjualan per kategori <small>${d.days} hari</small></h3>${donut(d.cat,nm(catTotal),'omzet',rp)}</div>
 ${moveCards(d,true)}${lowCard(d,false)}${restockCard(d,false)}</div>`;
}
VIEWS.dash=async()=>{
 loading();await renderDash(false);
 dashT=setInterval(()=>{if(cur==='dash'&&!document.hidden)run(()=>renderDash(true))},60000);
};
async function renderDash(poll){
 const d=await api('GET','/api/dashboard?days='+dashDays,undefined,{poll});if(cur!=='dash')return;
 $('view').classList.toggle('still',!!poll);$('view').innerHTML=dashHTML(d);
}
H.dashRefresh=()=>run(()=>{$('view').classList.remove('still');return renderDash(false)});

/* ---------- lapor barang habis / restock ---------- */
H.rsDone=id=>run(async()=>{await api('POST',`/api/restock/${id}/done`);toast('Laporan ditandai selesai');return go(cur)});
VIEWS.lapor=async()=>{
 loading();const[L,r]=await Promise.all([api('GET','/api/products'),api('GET','/api/restock')]);
 L.sort((a,b)=>a.nama.localeCompare(b.nama));
 $('view').innerHTML=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
 <div class="card"><h3>Laporkan barang habis</h3><p class="mut" style="margin:6px 0 4px">Laporan tidak mengubah stok. Gudang akan menindaklanjuti.</p>
 ${L.length?`<form ${F('rsAdd')}><label>Barang</label><select id="rp">${L.map(p=>`<option value="${p.id}">${esc(p.kode)} - ${esc(p.nama)}</option>`).join('')}</select>
 <label>Catatan singkat</label><input id="rn" maxlength="100" placeholder="mis. warna hitam habis, pelanggan menanyakan"><button class="btn p" style="width:100%;margin-top:12px">Kirim laporan</button></form>`:'<p class="mut">Belum ada produk.</p>'}</div>
 <div class="card"><h3>Laporan terbaru</h3>${r.recent.length?r.recent.map(x=>`<div class="row"><div><b>${esc(x.nama)}</b>${x.catatan?`<div style="font-size:13px">${esc(x.catatan)}</div>`:''}<div class="mut">${esc(x.user)} · ${fmtT(x.date)}</div></div><span class="tag ${x.done?'ok':''}">${x.done?'Selesai':'Perlu restock'}</span></div>`).join(''):'<div class="empty">Belum ada laporan.</div>'}</div></div>`;
};
H.rsAdd=()=>run(async()=>{await api('POST','/api/restock',{pid:+$('rp').value,catatan:$('rn').value});toast('Laporan terkirim');return go('lapor')});

/* ============================================================
   KASIR
   ============================================================ */
let cart=[],kq='',kc='Semua',busy=false;
const prodOf=id=>S.prods.find(p=>p.id===id);
VIEWS.kasir=async()=>{loading();await loadProds();drawKasir()};
function drawKasir(){
 $('view').innerHTML=`<div class="pos"><div><input id="ks" placeholder="Cari nama atau kode barang" value="${esc(kq)}" data-in="kqSet" maxlength="60" autocomplete="off">
 <div class="tabs" style="margin-top:10px">${['Semua',...S.cats].map(c=>`<button class="btn s ${c===kc?'p':''}" ${A('kcSet',c)}>${esc(c)}</button>`).join('')}</div><div class="plist" id="pl"></div></div>
 <div class="card cart" id="cartbox"></div></div>`;plist();cartV();
}
H.kqSet=v=>{kq=v;plist()};H.kcSet=c=>{kc=c;drawKasir()};
function plist(){
 const q=kq.toLowerCase(),a=S.prods.filter(p=>(kc==='Semua'||p.kat===kc)&&(p.nama.toLowerCase().includes(q)||p.kode.toLowerCase().includes(q)));
 $('pl').innerHTML=a.length?a.map(p=>`<button class="prod" ${avl(p)<=0?'disabled':''} ${A('add',p.id)}>${p.foto?`<img class="pth" src="/uploads/${esc(p.foto)}" alt="" loading="lazy">`:''}<span class="tag">${esc(p.kode)}</span><b>${esc(p.nama)}</b><div>${rp(p.harga)}</div><div class="mut">${avl(p)>0?'Stok '+avl(p)+(p.res?' (dipesan '+p.res+')':''):'Habis'}</div></button>`).join(''):'<p class="mut">Barang tidak ditemukan.</p>';
}
H.add=id=>{const p=prodOf(id),c=cart.find(x=>x.id===id);if(!p)return;if(c){if(c.qty>=avl(p))return toast('Stok tidak cukup');c.qty++}else cart.push({id,qty:1});cartV()};
H.chg=(id,d)=>{const c=cart.find(x=>x.id===id),p=prodOf(id);if(!c||!p)return;c.qty+=d;if(c.qty>avl(p)){c.qty=avl(p);toast('Stok tidak cukup')}if(c.qty<=0)cart=cart.filter(x=>x.id!==id);cartV()};
const cTotal=()=>cart.reduce((s,c)=>s+c.qty*(prodOf(c.id)?prodOf(c.id).harga:0),0);
function cartV(){
 $('cartbox').innerHTML=`<h3>Keranjang</h3>${cart.length?cart.map(c=>{const p=prodOf(c.id);return p?`<div class="row"><div><b style="font-size:13px">${esc(p.nama)}</b><div class="mut">${rp(p.harga)}</div></div><div class="qty"><button ${A('chg',c.id,-1)} aria-label="Kurangi">−</button>${c.qty}<button ${A('chg',c.id,1)} aria-label="Tambah">+</button></div></div>`:''}).join(''):'<p class="mut" style="margin:10px 0">Pilih barang untuk memulai transaksi.</p>'}
 <div style="margin-top:12px" class="mut">Total</div><div class="total">${rp(cTotal())}</div>
 <label>Uang diterima (Rp)</label><input id="pay" type="number" min="0" step="1" inputmode="numeric" data-in="chgAmt">
 <div class="tabs" style="margin-top:8px">${[10000,20000,50000,100000].map(n=>`<button class="btn s" ${A('payFix',n)}>${n/1000}rb</button>`).join('')}<button class="btn s" ${A('payFix',-1)}>Pas</button></div>
 <div class="mut">Kembalian: <b id="cg" style="color:var(--g)">Rp 0</b></div>
 <button class="btn p" style="width:100%;margin-top:12px;padding:14px" ${A('checkout')} ${cart.length?'':'disabled'}>Bayar & cetak struk</button>`;
}
H.chgAmt=()=>{const d=(+$('pay').value||0)-cTotal();$('cg').textContent=d<0?'Uang kurang':rp(d);$('cg').style.color=d<0?'var(--red)':'var(--g)'};
H.payFix=n=>{$('pay').value=n<0?cTotal():n;H.chgAmt()};
H.checkout=async()=>{
 if(busy||!cart.length)return;const bayar=Math.round(+$('pay').value||0),total=cTotal();
 if(bayar<total)return toast('Uang yang diterima kurang');
 busy=true;
 try{const t=await api('POST','/api/checkout',{items:cart.map(c=>({id:c.id,qty:c.qty})),bayar});cart=[];await loadProds();drawKasir();printR(t)}
 catch(e){if(!e.handled)toast(e.message);if(e.status===409){await run(loadProds);cart=cart.filter(c=>{const p=prodOf(c.id);if(!p)return false;c.qty=Math.min(c.qty,avl(p));return c.qty>0});drawKasir()}}
 finally{busy=false}
};

/* ============================================================
   STRUK
   ============================================================ */
function rcHTML(t){
 const s=Object.assign({},S.pub&&S.pub.store,S.set),d=new Date(t.date),n=x=>Math.round(x).toLocaleString('id-ID'),k58=s.kertas==='58',qty=t.items.reduce((a,i)=>a+i.qty,0);
 return`<div class="rc${k58?' k58':''}" style="--rw:${k58?'48mm':'72mm'}">
 <div class="c"><div class="lg">${esc(ini(s.nama))}</div><div class="nm">${esc(s.nama)}</div>
 <div class="al">${esc(s.alamat)}</div><div class="al">Telp. ${esc(s.telp)}</div><div class="bg">STRUK PENJUALAN</div></div>
 <hr class="db">
 <div class="r"><span>No</span><b>${esc(t.no)}</b></div>
 <div class="r"><span>Tanggal</span><span>${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span></div>
 <div class="r"><span>Kasir</span><span>${esc(t.kasir)}</span></div>
 <hr class="ds">
 <div class="r hd"><span>BARANG</span><span>SUBTOTAL</span></div>
 ${t.items.map(i=>`<div class="it"><div class="in">${esc(i.nama)}</div><div class="r"><span>${i.qty} x ${n(i.harga)}</span><span>${n(i.qty*i.harga)}</span></div></div>`).join('')}
 <hr class="ds">
 <div class="r"><span>Jumlah item</span><span>${qty}</span></div>
 <hr class="db">
 <div class="r tt"><span>TOTAL</span><span>Rp ${n(t.total)}</span></div>
 <div class="r"><span>Tunai</span><span>Rp ${n(t.bayar)}</span></div>
 <div class="r"><span>Kembali</span><span>Rp ${n(t.kembali)}</span></div>
 ${t.void?'<div class="vd">** TRANSAKSI DIBATALKAN **</div>':''}
 <hr class="ds">
 <div class="c"><div class="th">TERIMA KASIH</div><div>Selamat berbelanja kembali</div>
 ${s.footer?`<div class="fn">${esc(s.footer)}</div>`:''}
 <div class="sm">Dicetak ${new Date().toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'})}</div></div></div>`;
}
function printR(t){$('rcpt').innerHTML=rcHTML(t);setTimeout(()=>window.print(),200)}
let PV=null;
H.previewR=async()=>{
 await run(loadProds);const L=S.prods.slice(0,3),src=L.length?L:[{id:0,kode:'X',nama:'Contoh Barang',harga:10000}];
 const items=src.map((p,i)=>({id:p.id,kode:p.kode,nama:p.nama,qty:i+1,harga:p.harga})),total=items.reduce((s,i)=>s+i.qty*i.harga,0),bayar=Math.ceil(total/50000)*50000;
 PV={no:'INV-CONTOH-0001',date:new Date().toISOString(),kasir:S.me.username,items,total,bayar,kembali:bayar-total,void:false};
 modal(`<h3>Pratinjau struk</h3><p class="mut">Tampilan ini mengikuti data pada Info toko & struk.</p><div class="paper">${rcHTML(PV)}</div>
 <div class="tabs" style="justify-content:flex-end"><button class="btn" ${A('closeM')}>Tutup</button><button class="btn p" ${A('printPv')}>Cetak contoh</button></div>`);
};
H.printPv=()=>{closeM();printR(PV)};

/* ============================================================
   PRODUK
   ============================================================ */
let pq='';
const oldCat=p=>!S.cats.includes(p.kat)&&p.kat!==S.uncat;
function katOpts(cur){const o=[...S.cats,S.uncat],old=cur&&!o.includes(cur);
 return(old?`<option value="${esc(cur)}" selected>${esc(cur)} (kategori lama)</option>`:'')+o.map(c=>`<option value="${esc(c)}" ${c===cur?'selected':''}>${esc(c===S.uncat?c+' (sementara)':c)}</option>`).join('')}
VIEWS.produk=async()=>{loading();await loadProds();drawProduk()};
function drawProduk(){
 $('view').innerHTML=`<div class="tabs"><input style="flex:1;min-width:200px" placeholder="Cari nama atau kode" value="${esc(pq)}" data-in="pqSet" maxlength="60">${canHpp()?`<button class="btn p" ${A('pform',0)}>+ Tambah produk</button><button class="btn" ${A('pExport')}>Ekspor CSV</button><label class="btn filebtn">Impor CSV<input type="file" accept=".csv,.txt,text/csv" hidden data-ch="pImport"></label>`:''}${isOwner()?`<button class="btn" ${A('trash')}>Sampah</button>`:''}<button class="btn" ${A('pGrp')}>${pgrp?'Tampilan daftar':'Per kategori'}</button></div><div class="card" id="pr"></div>`;prow();
}
H.pqSet=v=>{pq=v;prow()};
/* ---------- foto produk, impor & ekspor CSV ---------- */
let PH=null;   // null = foto tidak berubah, 'del' = hapus, 'data:...' = foto baru
const photoBlock=p=>`<label>Foto produk (opsional)</label><div class="phrow"><div class="phv" id="phv">${p.foto?`<img src="/uploads/${esc(p.foto)}" alt="">`:'<span>🖼️</span>'}</div>
 <div class="phb"><input type="file" accept="image/*" data-ch="pPhoto"><button type="button" class="btn s d" ${A('pPhotoDel')}>Hapus foto</button><div class="mut">Foto otomatis dikecilkan agar hemat kuota.</div></div></div>`;
function readImg(file,max,q,sq,png){return new Promise((ok,no)=>{
 if(!file||!/^image\//.test(file.type))return no(new Error('Pilih file gambar (JPG, PNG, atau WebP).'));
 if(file.size>15e6)return no(new Error('File terlalu besar (maks 15 MB).'));
 const r=new FileReader();r.onerror=()=>no(new Error('Gagal membaca file.'));
 r.onload=()=>{const im=new Image();im.onerror=()=>no(new Error('Gambar tidak dapat dibuka.'));
  im.onload=()=>{let sx=0,sy=0,sw=im.width,sh=im.height;
   if(sq){const m=Math.min(sw,sh);sx=(sw-m)/2;sy=(sh-m)/2;sw=sh=m}
   const k=Math.min(1,max/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*k)),h=Math.max(1,Math.round(sh*k)),c=document.createElement('canvas');
   c.width=w;c.height=h;const x=c.getContext('2d');if(!png){x.fillStyle='#fff';x.fillRect(0,0,w,h)}x.drawImage(im,sx,sy,sw,sh,0,0,w,h);ok(png?c.toDataURL('image/png'):c.toDataURL('image/jpeg',q))};
  im.src=r.result};
 r.readAsDataURL(file)})}
H.pPhoto=(v,el)=>run(async()=>{PH=await readImg(el.files[0],900,.82);$('phv').innerHTML=`<img src="${PH}" alt="">`});
H.pPhotoDel=()=>{PH='del';$('phv').innerHTML='<span>🖼️</span>'};

const csvQ=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function parseCSV(t){
 t=t.replace(/^\uFEFF/,'');const first=t.split(/\r?\n/,1)[0],d=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],f='',q=false;
 for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
  else if(ch==='"')q=true;
  else if(ch===d){row.push(f);f=''}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(f);f='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[]}
  else f+=ch}
 row.push(f);if(row.some(x=>x.trim()!==''))rows.push(row);return rows;
}
const HDR={kode:/^(kode|sku|code)$/,nama:/^(nama|nama barang|deskripsi|barang|produk)$/,kat:/^(kategori|kat|category)$/,hpp:/^(hpp|modal|harga beli)$/,harga:/^(harga|harga jual|jual|price)$/,stok:/^(stok|stock|qty|jumlah)$/};
const numCell=v=>{const d=String(v??'').replace(/[^\d]/g,'');return d===''?null:parseInt(d,10)};
let IMP=[];
H.pExport=()=>run(async()=>{
 const a=await api('GET','/api/products');
 const rows=[['kode','nama','kategori','hpp','harga','stok'],...a.map(p=>[p.kode,p.nama,p.kat,p.hpp??'',p.harga,p.stok])];
 dl('produk-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8','\uFEFF'+rows.map(r=>r.map(csvQ).join(';')).join('\r\n'));toast('File CSV produk diunduh');
});
H.pImport=(v,el)=>{
 const f=el.files[0];if(!f)return;
 if(f.size>4e6){el.value='';return toast('File terlalu besar (maks 4 MB).')}
 const r=new FileReader();r.onload=()=>{
  el.value='';const rows=parseCSV(String(r.result));
  if(rows.length<2)return toast('File kosong atau tidak ada baris data.');
  const hd=rows[0].map(x=>x.trim().toLowerCase()),ix={};
  for(const k in HDR)ix[k]=hd.findIndex(x=>HDR[k].test(x));
  if(ix.kode<0||ix.nama<0)return toast('Baris judul harus punya kolom "kode" dan "nama" (harga, hpp, kategori, stok opsional).');
  IMP=rows.slice(1).map(c=>({kode:(c[ix.kode]||'').trim(),nama:(c[ix.nama]||'').trim(),kat:ix.kat>=0?(c[ix.kat]||'').trim():'',
   hpp:ix.hpp>=0?numCell(c[ix.hpp]):null,harga:ix.harga>=0?numCell(c[ix.harga]):null,stok:ix.stok>=0?numCell(c[ix.stok]):null}));
  modal(`<h3>Impor CSV produk</h3><p class="mut" style="margin:6px 0 10px"><b>${IMP.length}</b> baris terbaca. Kode yang sudah ada akan <b>diperbarui</b> (nama, kategori, harga). Kode baru akan <b>ditambahkan</b>. HPP kosong untuk produk baru diisi sama dengan harga jual.</p>
  <div style="max-height:200px;overflow:auto;border:1px solid var(--bd);border-radius:12px;padding:4px 10px">${IMP.slice(0,6).map(x=>`<div class="row"><span><span class="tag">${esc(x.kode)}</span> <b>${esc(x.nama)}</b></span><span>${x.harga===null?'-':rp(x.harga)}</span></div>`).join('')}${IMP.length>6?`<div class="mut" style="padding:8px 0">dan ${IMP.length-6} baris lainnya…</div>`:''}</div>
  ${ix.stok>=0?`<label class="chk"><input type="checkbox" id="impS"> Ubah juga stok sesuai file (tercatat sebagai koreksi)</label>`:''}
  <div class="tabs" style="margin-top:16px;justify-content:flex-end"><button class="btn" ${A('closeM')}>Batal</button><button class="btn p" ${A('pImportGo')}>Mulai impor</button></div>`);
 };r.readAsText(f);
};
H.pImportGo=()=>run(async()=>{
 const upd=!!($('impS')&&$('impS').checked),res=await api('POST','/api/products/import',{rows:IMP,updateStok:upd});IMP=[];
 modal(`<h3>Hasil impor</h3><div class="row"><span>Produk baru ditambahkan</span><b>${res.tambah}</b></div><div class="row"><span>Produk diperbarui</span><b>${res.ubah}</b></div><div class="row"><span>Baris gagal</span><b style="color:${res.gagal.length?'var(--red)':'inherit'}">${res.gagal.length}</b></div>
 ${res.gagal.length?`<div style="max-height:180px;overflow:auto;margin-top:8px">${res.gagal.map(g=>`<div class="mut" style="padding:4px 0">Baris ${g.baris}: ${esc(g.pesan)}</div>`).join('')}</div>`:''}
 <button class="btn p" style="width:100%;margin-top:14px" ${A('closeM')}>Selesai</button>`);
 return go('produk');
});

function prow(){
 const q=pq.toLowerCase(),a=S.prods.filter(p=>p.nama.toLowerCase().includes(q)||p.kode.toLowerCase().includes(q)),nOld=S.prods.filter(oldCat).length,lim=lowLim();
 $('pr').innerHTML=(nOld&&canHpp()?`<p class="mut" style="margin:0 0 8px">${nOld} produk masih memakai kategori lama. Klik Ubah lalu pilih kategori baru.</p>`:'')+(a.length?gmap(a,p=>`<div class="row"><div class="pl">${p.foto?`<img class="pth" src="/uploads/${esc(p.foto)}" alt="" loading="lazy">`:'<span class="pth none">📦</span>'}<div><span class="tag">${esc(p.kode)}</span> <b>${esc(p.nama)}</b>${oldCat(p)?' <span class="tag old">Kategori lama</span>':''}<div class="mut">${esc(p.kat)} · Jual ${rp(p.harga)}${canHpp()?' · HPP '+rp(p.hpp):''} · Stok <b style="color:${p.stok<=lim?'var(--red)':'inherit'}">${p.stok}</b>${p.res?` · <span class="tag">dipesan ${p.res}</span>`:''}</div></div></div>
 ${canHpp()?`<div class="tabs" style="margin:0"><button class="btn s" ${A('pform',p.id)}>Ubah</button>${isOwner()?`<button class="btn s d" ${A('pdel',p.id)}>Hapus</button>`:''}</div>`:''}</div>`):'<div class="empty">Belum ada barang. Tambahkan produk pertama Anda.</div>');
}
H.pform=id=>{
 PH=null;const p=id?prodOf(id):{kode:'',nama:'',kat:S.cats[0],hpp:'',harga:'',stok:'',foto:''};if(!p)return;
 modal(`<h3>${id?'Ubah':'Tambah'} produk</h3><form ${F('psave',id)}>${photoBlock(p)}<label>Kode / SKU</label><input id="fk" required maxlength="20" value="${esc(p.kode)}">
 <label>Nama barang</label><input id="fn" required maxlength="60" value="${esc(p.nama)}"><label>Kategori</label><select id="fc">${katOpts(p.kat)}</select>
 <label>Harga beli / HPP</label><input id="fh" type="number" min="0" step="1" required value="${p.hpp}"><label>Harga jual</label><input id="fj" type="number" min="0" step="1" required value="${p.harga}">
 <label>Stok${id?' (untuk mengubah stok, gunakan menu Gudang agar tercatat)':' awal'}</label><input id="fs" type="number" min="0" step="1" required value="${p.stok}" ${id?'readonly':''}>
 <div class="tabs" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Simpan produk</button></div></form>`);
};
H.psave=id=>run(async()=>{
 const o={kode:$('fk').value.trim(),nama:$('fn').value.trim(),kat:$('fc').value,hpp:Math.round(+$('fh').value),harga:Math.round(+$('fj').value)};
 if(o.harga<o.hpp&&!await ask('Harga jual di bawah HPP. Tetap simpan?',{title:'Harga di bawah modal',ok:'Tetap simpan',icon:'⚠️'}))return;
 const rs=id?await api('PUT','/api/products/'+id,o):await api('POST','/api/products',{...o,stok:Math.round(+$('fs').value)});
 let fe='';
 try{if(PH==='del'){if(id)await api('DELETE',`/api/products/${id}/photo`)}else if(PH)await api('POST',`/api/products/${rs.id}/photo`,{img:PH})}catch(e){fe=e.message}
 PH=null;closeM();toast(fe?'Produk tersimpan, tetapi foto gagal: '+fe:'Produk disimpan');return go('produk');
});
H.pdel=async id=>{const p=prodOf(id);if(!p)return;
 if(await ask(`Pindahkan "${p.nama}" ke sampah? Produk bisa dipulihkan kembali.`,{title:'Hapus produk?',ok:'Ya, hapus',danger:true,icon:'🗑️'}))run(async()=>{await api('DELETE','/api/products/'+id);toast('Produk dipindahkan ke sampah');return go('produk')})};
H.trash=()=>run(async()=>{
 const a=await api('GET','/api/products?trash=1');
 modal(`<h3>Sampah produk</h3>${a.length?a.map(p=>`<div class="row"><span>${esc(p.nama)}</span><button class="btn s" ${A('restoreP',p.id)}>Pulihkan</button></div>`).join(''):'<p class="mut" style="margin:10px 0">Sampah kosong.</p>'}<button class="btn" style="width:100%;margin-top:12px" ${A('closeM')}>Tutup</button>`);
});
H.restoreP=id=>run(async()=>{await api('POST',`/api/products/${id}/restore`);closeM();toast('Produk dipulihkan');return go('produk')});

/* ============================================================
   GUDANG: barang masuk, koreksi/opname, mutasi
   ============================================================ */
let gq='',gt='';
const MUT={masuk:['Masuk','ok'],koreksi:['Koreksi',''],jual:['Terjual','no'],batal:['Batal jual','ok']};
VIEWS.gudang=async()=>{
 loading();const[,r]=await Promise.all([loadProds(),api('GET','/api/restock')]);
 const L=S.prods,units=L.reduce((s,p)=>s+p.stok,0),val=L.reduce((s,p)=>s+p.stok*(p.hpp||0),0),lim=lowLim(),low=L.filter(p=>p.stok<=lim).length;
 $('view').innerHTML=`<div class="grid g4">
 <div class="card stat"><span class="mut">Jenis barang</span><b>${L.length}</b></div>
 <div class="card stat"><span class="mut">Total unit stok</span><b>${units.toLocaleString('id-ID')}</b></div>
 <div class="card stat"><span class="mut">Nilai stok (HPP)</span><b>${rp(val)}</b></div>
 <div class="card stat"><span class="mut">Stok menipis (≤${lim})</span><b style="color:${low?'var(--red)':'var(--g)'}">${low}</b></div></div>
 <div style="margin-top:16px">${restockCard({restock:r.open},S.me.role==='gudang')}</div>
 <div class="tabs" style="margin-top:16px"><input style="flex:1;min-width:200px" placeholder="Cari nama atau kode" value="${esc(gq)}" data-in="gqSet" maxlength="60">
 <button class="btn p" ${A('stokForm','masuk',0)}>+ Barang masuk</button><button class="btn" ${A('stokForm','koreksi',0)}>Koreksi / opname</button></div>
 <div class="card" id="gl"></div>
 <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:24px 0 10px;flex-wrap:wrap"><h3>Riwayat mutasi stok</h3>
 <select style="max-width:190px" data-ch="gtSet"><option value="">Semua jenis</option>${Object.entries(MUT).map(([k,v])=>`<option value="${k}" ${gt===k?'selected':''}>${v[0]}</option>`).join('')}</select></div>
 <div class="card" id="gm"></div>`;
 grow();await gmut();
};
H.gqSet=v=>{gq=v;grow()};H.gtSet=v=>{gt=v;run(gmut)};
function grow(){
 const q=gq.toLowerCase(),lim=lowLim(),a=S.prods.filter(p=>p.nama.toLowerCase().includes(q)||p.kode.toLowerCase().includes(q)).sort((x,y)=>x.stok-y.stok);
 $('gl').innerHTML=a.length?a.map(p=>`<div class="row"><div><span class="tag">${esc(p.kode)}</span> <b>${esc(p.nama)}</b><div class="mut">${esc(p.kat)} · HPP ${rp(p.hpp)}</div></div>
 <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><b style="font-size:18px;color:${p.stok<=0?'var(--red)':p.stok<=lim?'#b36b00':'var(--tx)'}">${p.stok}</b>
 <button class="btn s p" ${A('stokForm','masuk',p.id)}>+ Masuk</button><button class="btn s" ${A('stokForm','koreksi',p.id)}>Koreksi</button></div></div>`).join(''):'<div class="empty">Barang tidak ditemukan.</div>';
}
async function gmut(){
 const a=await api('GET','/api/stocklog'+(gt?'?tipe='+encodeURIComponent(gt):''));if(cur!=='gudang')return;
 $('gm').innerHTML=a.length?a.map(l=>{const m=MUT[l.tipe]||[l.tipe,''],cls=l.tipe==='koreksi'?(l.qty>0?'ok':'no'):m[1];
 return`<div class="row"><div><span class="tag ${cls}">${esc(m[0])}</span> <b>${esc(l.nama)}</b><div class="mut">${fmtT(l.date)} · ${esc(l.user)}${l.ket?' · '+esc(l.ket):''}</div></div>
 <div style="text-align:right"><b style="color:${l.qty>0?'#16794a':'var(--red)'}">${l.qty>0?'+':''}${l.qty}</b><div class="mut">sisa ${l.sisa}</div></div></div>`}).join(''):'<div class="empty">Belum ada mutasi stok.</div>';
}
H.stokForm=(tipe,id)=>run(async()=>{
 if(!S.prods.length||cur==='dash')await loadProds();
 const L=S.prods;if(!L.length)return toast('Belum ada produk');
 const p=(id&&L.find(x=>x.id===id))||L[0],ms=tipe==='masuk';
 modal(`<h3>${ms?'Barang masuk':'Koreksi stok / opname'}</h3><form ${F('stokSave',tipe)}>
 <label>Barang</label><select id="gp" data-ch="gsync">${L.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.kode)} - ${esc(x.nama)}</option>`).join('')}</select>
 <div class="mut" id="gcur" style="margin-top:6px"></div>
 ${ms?`<label>Jumlah masuk</label><input id="gq2" type="number" min="1" step="1" required inputmode="numeric">
 <label>HPP baru per unit (kosongkan jika tidak berubah)</label><input id="gh" type="number" min="0" step="1" inputmode="numeric">
 <label>Supplier / keterangan</label><input id="gk" maxlength="60" placeholder="mis. Supplier Maju Jaya">`
 :`<label>Stok fisik sebenarnya</label><input id="gq2" type="number" min="0" step="1" required inputmode="numeric">
 <label>Alasan</label><select id="gr">${['Selisih opname','Rusak','Cacat / retur','Hilang','Lainnya'].map(r=>`<option>${r}</option>`).join('')}</select>
 <label>Catatan (opsional)</label><input id="gk" maxlength="60">`}
 <div class="tabs" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Simpan</button></div></form>`);
 H.gsync();
});
H.gsync=()=>{const p=prodOf(+$('gp').value);if(!p)return;$('gcur').textContent='Stok saat ini: '+p.stok+(p.hpp!==undefined?' · HPP '+rp(p.hpp):'');if($('gr'))$('gq2').value=p.stok};
H.stokSave=tipe=>run(async()=>{
 const b={pid:+$('gp').value,tipe,qty:Math.round(+$('gq2').value),ket:$('gk').value.trim()};
 if(tipe==='masuk'){if($('gh').value!=='')b.hpp=Math.round(+$('gh').value)}else b.alasan=$('gr').value;
 await api('POST','/api/stock',b);closeM();toast('Stok diperbarui');return go(cur);
});

/* ============================================================
   RIWAYAT
   ============================================================ */
let rd='',TXL=[];
VIEWS.riwayat=async()=>{
 $('view').innerHTML=`<div class="tabs"><input type="date" style="max-width:200px" value="${rd}" data-ch="rdSet"><button class="btn" ${A('rdSet','')}>Semua tanggal</button>${isOwner()?`<button class="btn p" ${A('csv')}>Ekspor CSV</button>`:''}</div><div class="card" id="rl"><div class="empty">Memuat…</div></div>`;
 await rlist();
};
H.rdSet=v=>{rd=v;run(()=>VIEWS.riwayat())};
async function rlist(){
 TXL=await api('GET','/api/tx?limit=300'+(rd?'&date='+rd:''));if(cur!=='riwayat')return;
 $('rl').innerHTML=TXL.length?TXL.map(t=>`<div class="row"><div><b>${esc(t.no)}</b> ${t.void?'<span class="tag no">Batal</span>':''}<div class="mut">${new Date(t.date).toLocaleString('id-ID')} · ${esc(t.kasir)} · ${t.items.length} jenis barang</div></div>
 <div style="text-align:right"><b>${rp(t.total)}</b>${isOwner()&&!t.void?`<div class="mut" style="color:var(--g)">Laba ${rp(t.profit)}</div>`:''}<button class="btn s" ${A('detail',t.no)}>Detail</button></div></div>`).join(''):'<div class="empty">Belum ada transaksi pada periode ini.</div>';
}
H.detail=no=>{const t=TXL.find(x=>x.no===no);if(!t)return;
 modal(`<h3>${esc(t.no)}</h3><p class="mut">${new Date(t.date).toLocaleString('id-ID')} · Kasir ${esc(t.kasir)}</p>${t.items.map(i=>`<div class="row"><span>${esc(i.nama)} × ${i.qty}</span><b>${rp(i.qty*i.harga)}</b></div>`).join('')}
 <div class="row"><b>Total</b><b>${rp(t.total)}</b></div><div class="row"><span>Tunai</span><span>${rp(t.bayar)}</span></div><div class="row"><span>Kembali</span><span>${rp(t.kembali)}</span></div>
 <div class="tabs" style="margin-top:14px"><button class="btn p" ${A('reprint',t.no)}>Cetak ulang</button>${canVoid()&&!t.void?`<button class="btn d" ${A('voidTx',t.no)}>Batalkan transaksi</button>`:''}<button class="btn" ${A('closeM')}>Tutup</button></div>`)};
H.reprint=no=>{const t=TXL.find(x=>x.no===no);closeM();if(t)printR(t)};
H.voidTx=async no=>{
 if(!await ask('Transaksi ini akan dibatalkan dan stok barang dikembalikan. Tindakan ini tidak bisa diulang.',{title:'Batalkan transaksi?',ok:'Ya, batalkan',cancel:'Tidak',danger:true,icon:'↩️'}))return;
 run(async()=>{await api('POST',`/api/tx/${encodeURIComponent(no)}/void`);closeM();toast('Transaksi dibatalkan');return go('riwayat')});
};
function dl(name,type,data){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type}));a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
H.csv=()=>run(async()=>{
 const all=await api('GET','/api/tx?limit=5000'),q=v=>'"'+String(v).replace(/"/g,'""').replace(/^[=+\-@]/,"'$&")+'"';
 const rows=[['No','Tanggal','Kasir','Kode','Barang','Qty','Harga','Subtotal','Status']];
 all.forEach(t=>t.items.forEach(i=>rows.push([t.no,t.date,t.kasir,i.kode,i.nama,i.qty,i.harga,i.qty*i.harga,t.void?'Batal':'Sah'])));
 dl('laporan-penjualan.csv','text/csv',rows.map(r=>r.map(q).join(',')).join('\n'));
});

/* ============================================================
   LAPORAN BERGRAFIK
   ============================================================ */
let RQ='days=7',RD=null;
VIEWS.laporan=async()=>{loading();await rLoad()};
async function rLoad(){const d=await api('GET','/api/report?'+RQ);if(cur!=='laporan')return;RD=d;drawLap()}
H.rPreset=q=>{RQ=q;run(rLoad)};
H.rRange=()=>{const f=$('rf').value,t=$('rt').value;if(!f||!t)return toast('Isi tanggal mulai dan tanggal akhir.');RQ=`from=${f}&to=${t}`;run(rLoad)};
function lapRows(d,own){
 const D=d.daily,mk=(l,x)=>({l,v:own?[x.omzet,x.laba]:[x.omzet]});
 if(D.length<=14)return D.map(x=>mk(dLabel(x.d),x));
 if(D.length<=45)return D.map(x=>mk(x.d.slice(8),x));
 const out=[];for(let i=0;i<D.length;i+=7){const g=D.slice(i,i+7),sum=g.reduce((a,x)=>({omzet:a.omzet+x.omzet,laba:a.laba+(x.laba||0)}),{omzet:0,laba:0});out.push(mk(g[0].d.slice(8)+'/'+g[0].d.slice(5,7),sum))}
 return out;
}
function drawLap(){
 const d=RD,s=d.sum,own=d.own,cur_=RQ;
 const pre=[['7 hari','days=7'],['30 hari','days=30'],['90 hari','days=90'],['Bulan ini','month=1']];
 const cards=[['Omzet',rp(s.omzet)],['Transaksi',s.trx],['Barang terjual',s.item+' pcs'],['Rata-rata / transaksi',rp(s.rata)]];
 if(own)cards.push(['Laba',rp(s.laba),1],['Margin laba',s.margin+'%']);
 cards.push(['Hari terbaik',s.terbaik?dLabel(s.terbaik.d)+' · '+nm(s.terbaik.omzet):'-'],['Dibatalkan',s.batal+' transaksi']);
 const catTotal=d.cat.reduce((a,x)=>a+x.v,0);
 const top=d.top.map(x=>({n:x.nama,v:x.qty,sub:rp(x.omzet)+(own?' · laba '+rp(x.laba):'')}));
 const ksr=d.kasir.map(x=>({n:x.l,v:x.v,sub:x.trx+' transaksi'}));
 const jam=d.jam.map(x=>({l:x.h%3===0?String(x.h).padStart(2,'0'):'',v:[x.trx]}));
 $('view').innerHTML=`<div class="lapbar">${pre.map(([l,q])=>`<button class="btn s ${cur_===q?'p':''}" ${A('rPreset',q)}>${l}</button>`).join('')}
  <span class="fld"><label for="rf">Dari</label><input id="rf" type="date" value="${d.from}"></span><span class="fld"><label for="rt">Sampai</label><input id="rt" type="date" value="${d.to}"></span><button class="btn s p" ${A('rRange')}>Tampilkan</button><button class="btn s" ${A('rCsv')}>Ekspor CSV</button></div>
  <p class="lapsum">Periode ${fmtD(d.from)} – ${fmtD(d.to)} (${s.hari} hari). Transaksi yang dibatalkan tidak dihitung.</p>
  <div class="grid g4">${cards.map(statCard).join('')}</div>
  <div class="dgrid"><div class="card"><h3>${own?'Omzet & laba':'Omzet'} <small>${s.hari>45?'per minggu':'per hari'}</small></h3>${barChart(lapRows(d,own),own?[{n:'Omzet',c:PAL[0]},{n:'Laba',c:PAL[1]}]:[{n:'Omzet',c:PAL[0]}],rp)}</div>
  <div class="card"><h3>Penjualan per kategori</h3>${donut(d.cat,nm(catTotal),'omzet',rp)}</div>
  <div class="card"><h3>Produk terlaris <small>10 teratas</small></h3>${hbars(top,{fmtv:v=>v+' pcs',empty:'Belum ada penjualan pada periode ini.'})}</div>
  <div class="card"><h3>Omzet per kasir</h3>${hbars(ksr,{fmtv:rp,color:'var(--or)',empty:'Belum ada penjualan pada periode ini.'})}</div>
  <div class="card"><h3>Jam ramai <small>jumlah transaksi per jam</small></h3>${barChart(jam,[{n:'Transaksi',c:PAL[3]}],v=>v+' transaksi',v=>String(Math.round(v)))}</div></div>`;
}
H.rCsv=()=>{if(!RD)return;const own=RD.own,rows=[['Tanggal','Transaksi','Omzet',...(own?['Laba']:[])],...RD.daily.map(x=>[x.d,x.trx,x.omzet,...(own?[x.laba]:[])])];
 dl(`laporan-${RD.from}_${RD.to}.csv`,'text/csv;charset=utf-8','\uFEFF'+rows.map(r=>r.map(csvQ).join(';')).join('\r\n'))};

/* ============================================================
   PROFIL SAYA
   ============================================================ */
VIEWS.profil=async()=>{
 loading();const m=await api('GET','/api/me');S.me={...S.me,...m.me};paintMe();const u=S.me;
 $('view').innerHTML=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
 <div class="card"><h3>Profil saya</h3><div class="pfhead"><div class="av lg">${avatarHTML(u)}</div><div><b>${esc(u.nama||u.username)}</b><div class="mut">@${esc(u.username)} · <span class="tag">${esc(ROLE[u.role])}</span></div><div class="mut">Bergabung ${fmtD(u.created)}${u.lastLogin?' · terakhir masuk '+fmtT(u.lastLogin):''}</div></div></div>
  <label>Foto profil</label><input type="file" accept="image/*" data-ch="pfPhoto"><div class="tabs" style="margin:8px 0 0"><button class="btn s d" ${A('pfPhotoDel')}>Hapus foto</button></div>
  <form ${F('pfSave')}><label for="pfn">Nama lengkap</label><input id="pfn" required minlength="2" maxlength="40" value="${esc(u.nama)}"><label for="pft">Telepon / WhatsApp</label><input id="pft" maxlength="25" inputmode="tel" value="${esc(u.telp)}">
  <label>Username</label><input value="${esc(u.username)}" readonly><label>Peran</label><input value="${esc(ROLE[u.role])}" readonly><button class="btn p" style="width:100%;margin-top:14px">Simpan profil</button></form></div>
 <div class="card"><h3>Keamanan</h3><p class="mut" style="margin:6px 0 12px">Ganti kata sandi secara berkala. Perangkat lain akan otomatis keluar.</p><button class="btn p" style="width:100%" ${A('pwForm')}>Ganti kata sandi</button>
  <p class="mut" style="margin-top:14px">Sesi saat ini: ${u.rem?'Ingat saya (30 hari)':'keluar otomatis setelah 30 menit tidak aktif'}.</p><button class="btn d" style="width:100%;margin-top:12px" ${A('askLogout')}>Keluar dari akun</button></div></div>`;
};
H.pfSave=()=>run(async()=>{const m=await api('PUT','/api/profile',{nama:$('pfn').value.trim(),telp:$('pft').value.trim()});Object.assign(S.me,m);paintMe();toast('Profil disimpan');return go('profil')});
H.pfPhoto=(v,el)=>run(async()=>{const img=await readImg(el.files[0],320,.85,true);const m=await api('POST','/api/profile/photo',{img});Object.assign(S.me,m);paintMe();toast('Foto profil diperbarui');return go('profil')});
H.pfPhotoDel=()=>run(async()=>{const m=await api('DELETE','/api/profile/photo');Object.assign(S.me,m);paintMe();toast('Foto profil dihapus');return go('profil')});

/* ============================================================
   OWNER: pengguna, pengaturan, backup, log aktivitas
   ============================================================ */
VIEWS.owner=async()=>{
 loading();const[users,logs,rsq]=await Promise.all([api('GET','/api/users'),api('GET','/api/audit'),api('GET','/api/resets')]);
 const s=S.set;
 $('view').innerHTML=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
 ${rsq.length?`<div class="card" style="border-color:#f3c9a8;background:#fff6ee"><h3>Permintaan reset sandi <small>${rsq.length}</small></h3>${rsq.map(r=>`<div class="row"><span><b>${esc(r.username)}</b><div class="mut">${fmtT(r.date)}</div></span><span class="lock"><button class="btn s p" ${A('uReset',r.username)}>Atur sandi baru</button><button class="btn s" ${A('rqDone',r.id)}>Abaikan</button></span></div>`).join('')}</div>`:''}
 <div class="card"><h3>Pengguna</h3>${users.map(u=>`<div class="row"><span><b>${esc(u.nama||u.username)}</b> <span class="mut">@${esc(u.username)}</span> <span class="tag">${esc(ROLE[u.role]||u.role)}</span>${u.status==='pending'?' <span class="tag no">Menunggu persetujuan</span>':''}${u.lastLogin?`<div class="mut">Terakhir masuk ${fmtT(u.lastLogin)}</div>`:''}</span>
 <span class="lock">${u.status==='pending'?`<button class="btn s p" ${A('uApprove',u.username)}>Setujui</button>`:`<button class="btn s" ${A('uReset',u.username)}>Reset sandi</button>`}${u.username!==S.me.username?`<button class="btn s d" ${A('udel',u.username)}>Hapus</button>`:''}</span></div>`).join('')}
 <form ${F('uadd')}><label>Nama lengkap</label><input id="nn" maxlength="40"><label>Username baru</label><input id="nu" required maxlength="30" pattern="[A-Za-z0-9_.]{3,30}" autocapitalize="none" autocomplete="off"><label>Kata sandi</label><input id="np" type="password" minlength="8" maxlength="100" required autocomplete="new-password"><div class="mut" style="margin-top:4px">${pwHint}</div>
 <label>Peran</label><select id="nr"><option value="admin">Admin (kasir, riwayat, lapor barang habis)</option><option value="gudang">Gudang (produk & stok)</option><option value="owner">Owner (akses penuh)</option></select>
 <button class="btn p" style="margin-top:12px;width:100%">Tambah pengguna</button></form></div>
 <div class="card"><h3>Info toko & struk</h3>${logoUpload(s)}<form ${F('sset')}>${logoCtl(s)}<label>Nama toko</label><input id="sn" required value="${esc(s.nama)}" maxlength="40"><label>Alamat</label><input id="sa" value="${esc(s.alamat)}" maxlength="80"><label>Telepon toko</label><input id="st" value="${esc(s.telp)}" maxlength="25">
 <label for="sw">WhatsApp admin (untuk chatbot & pesanan)</label><input id="sw" value="${esc(s.wa||'')}" maxlength="25" inputmode="tel" placeholder="0812xxxxxxx"><div class="mut" style="margin-top:4px">Kosong = memakai nomor telepon toko.</div>
 <label for="sm">Lokasi untuk peta (alamat atau koordinat)</label><input id="sm" value="${esc(s.maps||'')}" maxlength="120" placeholder="mis. Jl. Raya Utama No. 123, Tangerang"><div class="mut" style="margin-top:4px">Kosong = memakai alamat toko. Contoh koordinat: -6.2088,106.8456</div>
 <label>Jam buka</label><input id="sj" value="${esc(s.jam)}" maxlength="30"><label>Catatan kaki struk</label><input id="sf" value="${esc(s.footer)}" maxlength="80">
 <label>Batas stok menipis (unit)</label><input id="sl" type="number" min="0" max="9999" step="1" inputmode="numeric" required value="${lowLim()}"><div class="mut" style="margin-top:4px">Stok sama dengan atau di bawah angka ini dianggap menipis.</div>
 <label>Ukuran kertas struk</label><select id="sk"><option value="80" ${s.kertas!=='58'?'selected':''}>80 mm (umum)</option><option value="58" ${s.kertas==='58'?'selected':''}>58 mm (kecil)</option></select>
 <div class="tabs" style="margin:12px 0 0"><button class="btn p" style="flex:1">Simpan pengaturan</button><button type="button" class="btn" ${A('previewR')}>Pratinjau struk</button></div></form></div>
 <div class="card"><h3>Cadangan data</h3><p class="mut" style="margin:6px 0 12px">Data tersimpan di server dan dicadangkan otomatis setiap hari (14 hari terakhir). Unduh juga cadangan manual secara rutin. File cadangan tidak berisi akun, kata sandi, dan file foto (foto ada di folder data/uploads pada server, ikut salin folder itu).</p><button class="btn p" style="width:100%" ${A('backup')}>Unduh backup</button>
 <label>Pulihkan dari file backup (.json)</label><input type="file" accept=".json,application/json" data-ch="restoreDb"></div>
 <div class="card"><h3>Log aktivitas <small>60 terakhir</small></h3>${logs.length?logs.map(l=>`<div class="logrow"><span><b>${esc(l.u)}</b> · ${esc(l.a)}${l.d?' · '+esc(l.d):''}</span><span>${fmtT(l.t)}</span></div>`).join(''):'<div class="empty">Belum ada aktivitas.</div>'}</div></div>`;
 H.logoPrev();
};
H.uadd=()=>run(async()=>{await api('POST','/api/users',{username:$('nu').value.trim(),password:$('np').value,role:$('nr').value,nama:$('nn').value.trim()});toast('Pengguna ditambahkan');return go('owner')});
H.uApprove=n=>run(async()=>{await api('POST',`/api/users/${encodeURIComponent(n)}/approve`);toast('Akun disetujui. Pengguna sudah bisa masuk.');return go('owner')});
H.rqDone=id=>run(async()=>{await api('POST',`/api/resets/${id}/done`);return go('owner')});
H.udel=async n=>{if(await ask(`Hapus pengguna "${n}"? Akun ini langsung tidak bisa masuk lagi.`,{title:'Hapus pengguna?',ok:'Ya, hapus',danger:true,icon:'👤'}))run(async()=>{await api('DELETE','/api/users/'+encodeURIComponent(n));toast('Pengguna dihapus');return go('owner')})};
H.uReset=n=>modal(`<h3>Reset sandi: ${esc(n)}</h3><form ${F('uResetSave',n)}><label>Kata sandi baru</label><input id="rn1" type="password" required minlength="8" maxlength="100" autocomplete="new-password"><div class="mut" style="margin-top:6px">${pwHint} Pengguna ini akan otomatis keluar dari semua perangkat.</div>
 <div class="tabs" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Simpan</button></div></form>`);
H.uResetSave=n=>run(async()=>{await api('POST',`/api/users/${encodeURIComponent(n)}/password`,{password:$('rn1').value});closeM();toast('Kata sandi direset. Beri tahu pengguna kata sandi barunya.');return go(cur)});
H.sset=()=>run(async()=>{
 S.set=await api('PUT','/api/settings',{nama:$('sn').value,alamat:$('sa').value,telp:$('st').value,jam:$('sj').value,footer:$('sf').value,kertas:$('sk').value,stokMin:Math.round(+$('sl').value),wa:$('sw').value,maps:$('sm').value,logoUkuran:Math.round(+$('sz').value),logoBentuk:$('sb').value});
 brandApp();toast('Pengaturan disimpan');
});
H.backup=()=>run(async()=>{const d=await api('GET','/api/backup');dl('backup-kasir-'+new Date().toISOString().slice(0,10)+'.json','application/json',JSON.stringify(d));toast('Backup diunduh')});
H.restoreDb=(v,el)=>{
 const f=el.files[0];if(!f)return;
 const r=new FileReader();r.onload=async()=>{
  let d;try{d=JSON.parse(r.result)}catch(e){el.value='';return toast('File backup tidak valid')}
  if(!await ask('Data produk, transaksi, dan pengaturan saat ini akan DIGANTI dengan isi file backup. Akun pengguna tidak berubah.',{title:'Pulihkan data?',ok:'Ya, pulihkan',danger:true,icon:'♻️'})){el.value='';return}
  run(async()=>{await api('POST','/api/restore',d);toast('Data dipulihkan');const m=await api('GET','/api/me');S.set=m.set;brandApp();return go('owner')});
 };r.readAsText(f);
};

/* ============================================================
   HALAMAN AWAL (pengunjung, hanya baca)
   ============================================================ */
const EMO={'Dapur':'🍳','Kebersihan':'🧹','Furnitur':'🪑','Ember & Plastik':'🪣','Kamar Mandi':'🚿','Lampu':'💡','Dekorasi':'🪴','Kamar Tidur':'🛏️','Elektronik':'🔌'};
const TINT={'Dapur':'#f0e3d3','Kebersihan':'#dfe8ec','Furnitur':'#ebe0cf','Ember & Plastik':'#dae7e5','Kamar Mandi':'#dfe6ee','Lampu':'#f1e8cb','Dekorasi':'#e0eadf','Kamar Tidur':'#e4dfea','Elektronik':'#dde2e8'};
const KW=[[/televisi|\btv\b/i,'📺'],[/kulkas|show case/i,'🧊'],[/kipas/i,'🌀'],[/mesin cuci/i,'🧺'],[/speaker|bluetooth|microphone/i,'🔊'],[/oven|megic|magic com/i,'🍚'],[/dispenser/i,'🚰'],[/kursi|bangku|stool/i,'🪑'],[/sofa/i,'🛋️'],[/lemari|\brak\b/i,'🗄️'],[/kasur|sprei|seprai|bantal|guling|selimut/i,'🛏️'],[/gayung/i,'🚿'],[/ember|baskom/i,'🪣'],[/lampu|bohlam|\bled\b/i,'💡'],[/panci|wajan|penggorengan/i,'🍲'],[/sapu|pengki/i,'🧹'],[/\bpel\b|spons|sikat/i,'🧽'],[/\bpot\b|vas\b/i,'🪴'],[/piring|mangkuk|gelas|cangkir/i,'🍽️'],[/keranjang/i,'🧺'],[/cermin/i,'🪞'],[/\bjam\b/i,'🕰️'],[/gorden|tirai/i,'🪟']];
const pe=p=>(KW.find(([r])=>r.test(p.nama))||[0,EMO[p.kat]||'📦'])[1];
const waNum=t=>{let d=String(t).replace(/\D/g,'');if(d.startsWith('0'))d='62'+d.slice(1);return d};
let lc='Semua',lqs='',lall=false;
const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12}):null;
const reveal=()=>document.querySelectorAll('.rv:not(.in)').forEach(el=>io?io.observe(el):el.classList.add('in'));
function countUp(){document.querySelectorAll('[data-count]').forEach(el=>{const n=+el.dataset.count,t0=performance.now();
 const step=t=>{const k=Math.min(1,(t-t0)/1500),e=1-Math.pow(1-k,4);el.textContent=Math.round(n*e);if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)})}
const ST={x:['x','Habis'],w:['w','Terbatas'],ok:['ok','Tersedia']};
const pcard=(p,i)=>{
 const lbl=p.a<=0?'Habis':p.a>20?'Tersedia':'Sisa '+p.a,cls=p.a<=0?'x':p.a<=5?'w':'ok';
 return`<div class="pc rv" style="--d:${(i%5)*70}ms"><div class="pimg" style="background:${TINT[p.kat]||'#eee'}">${p.f?`<img src="/uploads/${esc(p.f)}" alt="${esc(p.nama)}" loading="lazy">`:`<span>${pe(p)}</span>`}</div><div class="pn">${esc(p.nama)}</div><div class="pm">${esc(p.kat)}</div><div class="pf"><b>${rp(p.harga)}</b><span class="st ${cls}">${lbl}</span></div>${p.a>0?`<button class="addb" ${A('cAdd',p.id)}>+ Keranjang</button>`:'<button class="addb off" disabled>Stok habis</button>'}</div>`};
const PC=()=>(S.pub&&S.pub.cats)||Object.keys(EMO);
const PP=()=>(S.pub&&S.pub.products)||[];
function lnav(){
 $('lCats').innerHTML=['Semua',...PC()].map(c=>`<button class="lc ${c===lc?'on':''}" ${A('lcat',c)}>${c==='Semua'?'Semua Kategori':esc(c)}</button>`).join('')+`<button class="lc hot" ${A('toBest')}>Terlaris</button><button class="lc" ${A('toLok')}>Lokasi</button>`;
}
H.toBest=()=>$('terlaris').scrollIntoView({behavior:'smooth'});
H.lcat=c=>{lc=c;lqs='';lall=false;$('lq').value='';lnav();katalog();$('katalog').scrollIntoView({behavior:'smooth'})};
H.lFilter=v=>{lqs=v.trim();lc='Semua';lall=false;lnav();katalog()};
H.lSearch=()=>{H.lFilter($('lq').value);$('katalog').scrollIntoView({behavior:'smooth'})};
H.lMore=()=>{lall=!lall;katalog()};
function katalog(){
 const q=lqs.toLowerCase(),all=PP(),flt=all.filter(p=>(lc==='Semua'||p.kat===lc)&&(!q||p.nama.toLowerCase().includes(q)||p.kode.toLowerCase().includes(q)));
 const grouped=lc==='Semua'&&!q&&all.length>0,box=$('lKat');
 $('lKatT').textContent=q?`Hasil pencarian "${lqs}"`:lc==='Semua'?'Katalog per Kategori':lc;
 if(grouped){
  box.className='cgroups';
  const cats=[...PC(),...[...new Set(all.map(p=>p.kat))].filter(k=>!PC().includes(k))];
  box.innerHTML=cats.map(c=>{const a=all.filter(p=>p.kat===c);if(!a.length)return'';
   return`<section class="cg"><div class="cgh"><h3><i>${EMO[c]||'📦'}</i>${esc(c)} <small>${a.length} produk</small></h3>${a.length>5?`<button class="lnk" ${A('lcat',c)}>Lihat semua →</button>`:''}</div><div class="pgrid">${a.slice(0,5).map(pcard).join('')}</div></section>`}).join('');
  $('lMore').classList.add('hide');
 }else{
  box.className='pgrid';const show=lall?flt:flt.slice(0,10);
  box.innerHTML=show.length?show.map(pcard).join(''):`<p class="mut" style="grid-column:1/-1;font-size:14px">${S.pub?'Produk belum tersedia atau tidak ditemukan.':'Katalog belum dapat dimuat. Pastikan server berjalan (node server.js), lalu muat ulang halaman.'}</p>`;
  $('lMore').classList.toggle('hide',flt.length<=10);$('lMore').textContent=lall?'Tampilkan lebih sedikit':`Tampilkan semua (${flt.length})`;
 }
 reveal();
}
function landing(){
 const s=(S.pub&&S.pub.store)||{nama:'TOKO PERABOTAN RUMAH',alamat:'',telp:'',jam:''},L=PP(),cats=PC(),wa='https://wa.me/'+waNum(s.wa||s.telp);
 $('lName').textContent=s.nama;paintLogo(s,[$('lMark')]);document.title=s.nama;
 $('lJam').textContent='🕒 Buka setiap hari '+s.jam;
 const tl=$('lTelp');tl.textContent='📞 WhatsApp '+s.telp;tl.href=wa;$('lWa').href=wa;
 $('lStats').innerHTML=`<div><b data-count="${L.length}">0</b><span>produk tersedia</span></div><div><b data-count="${cats.length}">0</b><span>kategori</span></div><div><b>${esc(s.jam)}</b><span>jam buka setiap hari</span></div>`;
 const tk=['PERABOT RUMAH TANGGA','HARGA JELAS','STOK TERBARUI','GROSIR TERSEDIA','STRUK JELAS'].map(x=>`<span>${x} ✦</span>`).join('');$('lTick').innerHTML=tk+tk+tk+tk;
 $('lFeats').innerHTML=[['🏠','Perabot Lengkap','Dari dapur sampai kamar tidur'],['🏷️','Harga Jelas','Tertera rapi di setiap struk'],['📦','Stok Terbarui','Lihat sisa stok dan pesan langsung'],['🤝','Grosir Tersedia','Tanya lewat WhatsApp']]
  .map((f,i)=>`<div class="ft rv" style="--d:${i*80}ms"><i>${f[0]}</i><div><b>${f[1]}</b><span>${f[2]}</span></div></div>`).join('');
 $('lCT').innerHTML=cats.map((c,i)=>`<button class="ct rv" style="background:${TINT[c]||'#eee'};--d:${i*70}ms" ${A('lcat',c)}><i>${EMO[c]||'📦'}</i>${esc(c)}<small>${L.filter(p=>p.kat===c).length} produk</small></button>`).join('');
 const byId=Object.fromEntries(L.map(p=>[p.id,p])),ids=(S.pub&&S.pub.best)||[];let best=ids.map(i=>byId[i]).filter(Boolean);const fb=!best.length;if(fb)best=L.slice(0,5);
 $('lBestT').textContent=fb?'Produk Pilihan':'Produk Terlaris';
 $('lBest').innerHTML=best.length?best.map(pcard).join(''):'<p class="mut" style="grid-column:1/-1;font-size:14px">Produk akan tampil di sini setelah ditambahkan.</p>';
 lReviews();lMap();
 $('lFoot').innerHTML=`<div class="fg"><div><div class="brand"><i id="fMark"></i><span>${esc(s.nama)}</span></div><p style="max-width:300px">Toko perabotan rumah tangga untuk kebutuhan rumah Anda. Melayani eceran dan grosir dengan ramah.</p><a class="wa" href="${wa}" target="_blank" rel="noopener noreferrer">💬 Chat WhatsApp</a></div>
 <div><h4>Belanja</h4>${['Furnitur','Kamar Tidur','Dapur','Kamar Mandi'].map(c=>`<button class="fa" ${A('lcat',c)}>${esc(c)}</button>`).join('')}</div>
 <div><h4>Bantuan</h4><a href="${wa}" target="_blank" rel="noopener noreferrer">Hubungi kami</a><button class="fa" ${A('openAuth')}>Login staf</button><p class="note">Aplikasi HP: buka situs ini di HP, lalu pilih "Tambahkan ke layar utama" (iPhone: tombol Bagikan).</p></div>
 <div><h4>Lokasi Toko</h4><p>${esc(s.alamat)}</p><p>Buka setiap hari ${esc(s.jam)}</p></div></div>
 <div class="copy"><span>© ${new Date().getFullYear()} ${esc(s.nama)}. Semua hak dilindungi.</span><span>Sistem Kasir v15</span></div>`;
 paintLogo(s,[$('fMark')],48);fabPaint();vWatch();vTick();
 lnav();katalog();authBtns();reveal();countUp();
}
async function loadPublic(){try{const[p,se]=await Promise.all([api('GET','/api/public'),api('GET','/api/session').catch(()=>null)]);if(se)p.setup=!!se.setup;S.pub=p}catch(e){S.pub=null}landing()}   // status setup selalu diambil segar (tanpa cache)
addEventListener('scroll',()=>{const h=$('lHead');if(h)h.classList.toggle('sc',scrollY>8)},{passive:true});

/* gerak halus mengikuti kursor (hanya perangkat dengan mouse, hormati "kurangi gerakan") */
(function parallax(){
 const el=$('hcard');if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches||matchMedia('(pointer: coarse)').matches)return;
 let tx=0,ty=0,cx=0,cy=0,raf=0;
 const tick=()=>{cx+=(tx-cx)*.07;cy+=(ty-cy)*.07;el.style.setProperty('--mx',cx.toFixed(3));el.style.setProperty('--my',cy.toFixed(3));raf=(Math.abs(tx-cx)>.002||Math.abs(ty-cy)>.002)?requestAnimationFrame(tick):0};
 el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();tx=((e.clientX-r.left)/r.width-.5)*2;ty=((e.clientY-r.top)/r.height-.5)*2;if(!raf)raf=requestAnimationFrame(tick)});
 el.addEventListener('pointerleave',()=>{tx=0;ty=0;if(!raf)raf=requestAnimationFrame(tick)});
})();

/* ============================================================
   PWA (aplikasi di HP), status jaringan, pembaruan
   ============================================================ */
let dp=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;$('inst').classList.remove('hide')});
addEventListener('appinstalled',()=>$('inst').classList.add('hide'));
H.installApp=()=>{if(!dp)return;dp.prompt();dp.userChoice.finally(()=>{dp=null;$('inst').classList.add('hide')})};
function netState(){const on=navigator.onLine;$('net').textContent=on?'Online':'Offline - tidak dapat memuat data';$('net').className='net '+(on?'on':'off')}
addEventListener('online',netState);addEventListener('offline',netState);netState();
if('serviceWorker' in navigator){addEventListener('load',()=>{
 navigator.serviceWorker.register('sw.js').then(reg=>{
  const askUpd=w=>{$('upd').classList.remove('hide');$('updbtn').onclick=()=>w.postMessage('SKIP_WAITING')};
  if(reg.waiting&&navigator.serviceWorker.controller)askUpd(reg.waiting);
  reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)askUpd(w)})});
  setInterval(()=>reg.update(),3600000);
 }).catch(()=>{});
 let r=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(r)return;r=true;location.reload()});
})}

/* ============================================================
   v15: LOGO, ETALASE (KERANJANG/BOOKING), CHATBOT WA, ULASAN, PETA,
        MENU PESANAN & ULASAN UNTUK ADMIN
   ============================================================ */
const SHOPSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.5 0 2.8 2.8 0 0 0 6 0 2.8 2.8 0 0 0 5.5 0"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4.5h4V20"/></svg>';
function paintLogo(s,els,cap){
 s=s||{};const size=Math.min(+s.logoUkuran||40,cap||96),shape=s.logoBentuk||'kotak';
 els.forEach(el=>{if(!el)return;el.className='lg-'+shape;el.style.setProperty('--ls',size+'px');
  el.innerHTML=s.logo?`<img src="/uploads/${esc(s.logo)}" alt="Logo ${esc(s.nama||'toko')}">`:SHOPSVG});
}
const lsGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v===null||v===undefined?d:v}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const SSTO=()=>Object.assign({},S.pub&&S.pub.store,S.set);
const waAdmin=()=>{const s=SSTO();return waNum(s.wa||s.telp)};
const waUrl=(num,text)=>`https://wa.me/${num}?text=${encodeURIComponent(text)}`;
const pubOf=id=>PP().find(p=>p.id===id);
const avl=p=>Math.max(0,p.stok-(p.res||0));   // stok tersedia (stok fisik dikurangi yang dipesan online)

/* ---------- pengaturan logo (Owner) ---------- */
const logoUpload=s=>`<label>Logo toko</label><div class="lgrow"><div class="lgprev"><span id="lgPrev"></span></div><div class="phb"><input type="file" accept="image/*" data-ch="logoUp"><button type="button" class="btn s d" ${A('logoDel')}>Hapus logo</button><div class="mut">Disarankan PNG persegi. Tanpa logo, dipakai ikon toko bawaan.</div></div></div>`;
const logoCtl=s=>`<label for="sz">Ukuran logo di header <b id="szv">${+s.logoUkuran||40}</b> px</label><input id="sz" type="range" min="24" max="96" step="2" value="${+s.logoUkuran||40}" data-in="logoPrev">
 <label for="sb">Bentuk logo</label><select id="sb" data-in="logoPrev"><option value="kotak" ${s.logoBentuk==='kotak'?'selected':''}>Kotak (sudut membulat)</option><option value="bulat" ${s.logoBentuk==='bulat'?'selected':''}>Bulat</option><option value="polos" ${s.logoBentuk==='polos'?'selected':''}>Polos (tanpa bingkai)</option></select>`;
H.logoPrev=()=>{const z=$('sz');if(!z)return;$('szv').textContent=z.value;paintLogo({...S.set,logoUkuran:+z.value,logoBentuk:$('sb').value},[$('lgPrev')],64)};
H.logoUp=(v,el)=>run(async()=>{const img=await readImg(el.files[0],512,.9,false,true);el.value='';S.set=await api('POST','/api/settings/logo',{img});brandApp();H.logoPrev();toast('Logo diperbarui')});
H.logoDel=()=>run(async()=>{S.set=await api('DELETE','/api/settings/logo');brandApp();H.logoPrev();toast('Logo dihapus, memakai ikon bawaan')});

/* ---------- dashboard: periode & pesanan ---------- */
let dashDays=30;
H.dashDays=n=>{dashDays=n;run(()=>renderDash(false))};
const periodBar=d=>`<div class="pbar" style="grid-column:1/-1"><span class="mut">Periode Fast &amp; Slow Moving</span>${[7,30,90].map(n=>`<button class="btn s ${d.days===n?'p':''}" ${A('dashDays',n)}>${n} hari</button>`).join('')}</div>`;
function pesananCard(d){
 const p=d.pesanan;if(!p||(!p.baru&&!p.proses))return'';
 return`<div class="card todo"><div><b>Pesanan online menunggu</b><span class="mut">${p.baru} baru · ${p.proses} sedang diproses</span></div><button class="btn s p" ${A('go','pesanan')}>Buka Pesanan</button></div>`;
}

/* ---------- produk: tampilan per kategori ---------- */
let pgrp=false;
H.pGrp=()=>{pgrp=!pgrp;drawProduk()};
function gmap(a,fn){
 if(!pgrp)return a.map(fn).join('');
 const order=[...S.cats,S.uncat,...new Set(a.map(p=>p.kat))].filter((k,i,x)=>x.indexOf(k)===i);
 return order.map(k=>{const g=a.filter(p=>p.kat===k);if(!g.length)return'';
  return`<div class="grph"><b>${esc(k)}</b><span class="mut">${g.length} item · stok ${g.reduce((s,p)=>s+p.stok,0)}</span></div>${g.map(fn).join('')}`}).join('');
}

/* ============================================================
   ETALASE PENGUNJUNG: KERANJANG = BOOKING
   ============================================================ */
let VC=(lsGet('kp_cart',[])||[]).filter(c=>c&&Number.isInteger(c.id)&&Number.isInteger(c.qty)&&c.qty>0).slice(0,30);
let VO=(lsGet('kp_orders',[])||[]).filter(o=>o&&typeof o.no==='string'&&typeof o.t==='string').slice(0,10);   // pesanan milik browser ini
let VP=null,VCUR=null,OCACHE={},vPoll=null;
const OST={baru:['Menunggu admin','no'],diproses:['Sedang diproses',''],selesai:['Selesai, sudah dibayar','ok'],batal:['Dibatalkan','old'],kedaluwarsa:['Kedaluwarsa','old']};
const FINAL=['selesai','batal','kedaluwarsa'];
const vcCount=()=>VC.reduce((s,c)=>s+c.qty,0);
const vcTotal=()=>VC.reduce((s,c)=>{const p=pubOf(c.id);return s+(p?p.harga*c.qty:0)},0);
function fabPaint(){const f=$('fabCount');if(!f)return;const n=vcCount();f.textContent=n>99?'99+':n;f.classList.toggle('hide',!n)}
function vcSave(){lsSet('kp_cart',VC);fabPaint()}
function vcFit(){VC=VC.map(c=>{const p=pubOf(c.id);return p?{id:c.id,qty:Math.min(c.qty,p.a)}:null}).filter(c=>c&&c.qty>0);vcSave()}
async function refreshPub(){try{const p=await api('GET','/api/public');p.setup=S.pub?S.pub.setup:p.setup;S.pub=p}catch(e){}}
function vOpen(html,cls){$('vroot').innerHTML=`<div class="vmask" ${A('vBg')}><div class="vpanel ${cls||''}" role="dialog" aria-modal="true">${html}</div></div>`;document.body.classList.add('noscroll')}
H.vBg=(el,e)=>{if(e.target===el)H.vClose()};
H.vClose=()=>{VP=null;$('vroot').innerHTML='';document.body.classList.remove('noscroll')};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&VP&&!$('mroot').innerHTML)H.vClose()});

H.cAdd=id=>{
 const p=pubOf(id);if(!p||p.a<=0)return toast('Stok barang ini sedang habis');
 const c=VC.find(x=>x.id===id);
 if(c){if(c.qty>=p.a)return toast(`Stok tersisa ${p.a}`);c.qty++}else VC.push({id,qty:1});
 vcSave();toast('Ditambahkan ke keranjang');if(VP==='cart')cartView();
};
H.cQty=(id,d)=>{const c=VC.find(x=>x.id===id),p=pubOf(id);if(!c||!p)return;c.qty+=d;if(c.qty>p.a){c.qty=p.a;toast(`Stok tersisa ${p.a}`)}if(c.qty<=0)VC=VC.filter(x=>x!==c);vcSave();cartView()};
H.cartOpen=async()=>{await refreshPub();vcFit();cartView()};

function cartView(){
 VP='cart';
 const rows=VC.map(c=>{const p=pubOf(c.id);if(!p)return'';
  return`<div class="citem"><div class="cin"><b>${esc(p.nama)}</b><span class="mut">${rp(p.harga)} · sisa ${p.a}</span></div><div class="qty"><button ${A('cQty',c.id,-1)} aria-label="Kurangi">−</button><b>${c.qty}</b><button ${A('cQty',c.id,1)} aria-label="Tambah">+</button></div><b class="cl">${rp(p.harga*c.qty)}</b></div>`}).join('');
 const my=VO.length?`<div class="vsec"><h4>Pesanan saya</h4>${VO.map(o=>`<button class="vo" ${A('oView',o.no)}><span><b>${esc(o.no)}</b><small>${esc(o.nama||'')}</small></span><span class="tag ${(OST[o.status]||[])[1]||''}">${esc((OST[o.status]||['Baru'])[0])}</span></button>`).join('')}</div>`:'';
 vOpen(`<div class="vhead"><h3>Keranjang</h3><button class="vx" ${A('vClose')} aria-label="Tutup">✕</button></div>
 <div class="vbody">${VC.length?rows:'<p class="mut">Keranjang masih kosong. Pilih barang di etalase, lalu tekan "+ Keranjang".</p>'}
 ${VC.length?`<div class="vtot"><span>Total</span><b>${rp(vcTotal())}</b></div>
 <form ${F('cSubmit')} class="cform"><label for="vcn">Nama</label><input id="vcn" required minlength="2" maxlength="40" value="${esc(lsGet('kp_nama',''))}" autocomplete="name">
 <label for="vcw">Nomor WhatsApp</label><input id="vcw" required inputmode="tel" maxlength="20" placeholder="0812xxxxxxx" value="${esc(lsGet('kp_wa',''))}" autocomplete="tel">
 <label for="vcc">Catatan (opsional)</label><input id="vcc" maxlength="120" placeholder="mis. diambil sore hari">
 <input class="hp" id="vcweb" tabindex="-1" autocomplete="off" aria-hidden="true">
 <p class="vnote">Barang ditahan atas nama Anda selama 24 jam. Pembayaran diproses admin, di toko atau sesuai arahan admin lewat WhatsApp. Struk muncul di sini dan bisa dikirim ke WhatsApp setelah dibayar.</p>
 <button class="btn p" id="csb">Kirim pesanan ke admin</button></form>`:''}${my}</div>`);
}
H.cSubmit=async()=>{
 const b=$('csb');b.disabled=true;
 try{
  const nama=$('vcn').value.trim(),wa=$('vcw').value.trim();
  const o=await api('POST','/api/orders',{nama,wa,catatan:$('vcc').value.trim(),website:$('vcweb').value,items:VC.map(c=>({id:c.id,qty:c.qty}))});
  lsSet('kp_nama',nama);lsSet('kp_wa',wa);
  VC=[];vcSave();VO.unshift({no:o.no,t:o.token,nama:o.nama,wa:o.wa,status:o.status});VO=VO.slice(0,10);lsSet('kp_orders',VO);
  OCACHE[o.no]=o;await refreshPub();katalog();orderView(o);vWatch();
 }catch(e){if(!e.handled)toast(e.message);if(e.status===409){await refreshPub();vcFit();cartView()}}
 finally{const b2=$('csb');if(b2)b2.disabled=false}
};

/* ---------- teks tagihan / struk untuk WhatsApp ---------- */
const rpn=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
function tagihanText(o){
 const s=SSTO();
 return`Halo admin ${s.nama}, saya ${o.nama}.\nSaya sudah membuat pesanan ${o.no}:\n`+o.items.map(i=>`- ${i.qty}x ${i.nama} (${rpn(i.qty*i.harga)})`).join('\n')+`\nTotal: ${rpn(o.total)}`+(o.catatan?`\nCatatan: ${o.catatan}`:'')+`\n\nMohon diproses ya. Terima kasih.`;
}
function strukText(t,orderNo,nama){
 const s=SSTO(),d=new Date(t.date);
 return`*${s.nama}*\nSTRUK ${t.no}${orderNo?` (Pesanan ${orderNo})`:''}\n${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}\n--------------------\n`+t.items.map(i=>`${i.qty}x ${i.nama}\n   ${rpn(i.qty*i.harga)}`).join('\n')+`\n--------------------\n*Total ${rpn(t.total)}*\nTunai ${rpn(t.bayar)}\nKembali ${rpn(t.kembali)}\n\nTerima kasih${nama?', '+nama:''}!${s.footer?'\n'+s.footer:''}`;
}

/* ---------- tampilan pesanan (tagihan, status live, struk) ---------- */
function orderView(o){
 VP='order';VCUR=o.no;OCACHE[o.no]=o;
 const idx=['baru','diproses','selesai'].indexOf(o.status),st=OST[o.status]||['',''];
 const tl=idx<0?`<div class="ostat dead">${esc(st[0])}${o.alasan?' · '+esc(o.alasan):''}</div>`
  :`<ol class="otl">${[['Pesanan terkirim','baru'],['Diproses admin','diproses'],['Dibayar, struk siap','selesai']].map((x,i)=>`<li class="${i<idx?'done':i===idx?'cur':''}">${x[0]}</li>`).join('')}</ol>`;
 const exp=o.expires?`<p class="vnote">Barang ditahan sampai ${new Date(o.expires).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}.</p>`:'';
 const bill=`<div class="bill"><div class="bh"><b>${esc(o.no)}</b><span class="tag ${st[1]}">${esc(st[0])}</span></div>${o.items.map(i=>`<div class="br2"><span>${i.qty} × ${esc(i.nama)}</span><span>${rp(i.qty*i.harga)}</span></div>`).join('')}<div class="br2 tt"><span>Total tagihan</span><b>${rp(o.total)}</b></div></div>`;
 let acts='';
 if(o.status==='baru'||o.status==='diproses')acts=`<a class="btn p" href="${esc(waUrl(waAdmin(),tagihanText(o)))}" target="_blank" rel="noopener noreferrer">Kirim tagihan ke WhatsApp admin</a>`+(o.status==='baru'?`<button class="btn d" ${A('oCancel',o.no)}>Batalkan pesanan</button>`:'')+`<button class="btn" ${A('oRefresh',o.no)}>Perbarui status</button>`;
 let paper='';
 if(o.status==='selesai'&&o.struk){
  paper=`<div class="paper" id="vpaper">${rcHTML(o.struk)}</div>`;
  acts=`<a class="btn p" href="${esc(waUrl(o.wa,strukText(o.struk,o.no,o.nama)))}" target="_blank" rel="noopener noreferrer">Kirim struk ke WhatsApp saya</a><button class="btn" ${A('vPrint')}>Cetak / simpan PDF</button>`;
 }
 vOpen(`<div class="vhead"><h3>Pesanan ${esc(o.no)}</h3><button class="vx" ${A('vClose')} aria-label="Tutup">✕</button></div><div class="vbody">${tl}${bill}${exp}${paper}<div class="vacts">${acts}</div><button class="lnk" ${A('cartOpen')}>← Kembali ke keranjang</button></div>`);
}
H.oView=no=>{const o=OCACHE[no];if(o)return orderView(o);H.oRefresh(no)};
H.oRefresh=no=>run(async()=>{const rec=VO.find(x=>x.no===no);if(!rec)return;const r=await api('GET',`/api/order/${encodeURIComponent(no)}?t=${encodeURIComponent(rec.t)}`);rec.status=r.status;lsSet('kp_orders',VO);orderView(r);vWatch()});
H.oCancel=async no=>{
 if(!await ask('Pesanan ini akan dibatalkan dan stok yang ditahan dilepas kembali.',{title:'Batalkan pesanan?',ok:'Ya, batalkan',cancel:'Tidak',danger:true,icon:'🧾'}))return;
 run(async()=>{const rec=VO.find(x=>x.no===no);const r=await api('POST',`/api/order/${encodeURIComponent(no)}/cancel`,{t:rec.t});rec.status=r.status;lsSet('kp_orders',VO);await refreshPub();katalog();orderView(r);toast('Pesanan dibatalkan')});
};
H.vPrint=()=>{const o=OCACHE[VCUR];if(o&&o.struk)printR(o.struk)};

/* ---------- pemantauan status live ---------- */
function vWatch(){clearInterval(vPoll);vPoll=null;if(VO.some(o=>!FINAL.includes(o.status)))vPoll=setInterval(vTick,8000)}
async function vTick(){
 if(document.hidden||S.me)return;let ch=false;
 for(const o of VO.filter(x=>!FINAL.includes(x.status))){
  try{
   const r=await api('GET',`/api/order/${encodeURIComponent(o.no)}?t=${encodeURIComponent(o.t)}`,undefined,{poll:true});OCACHE[o.no]=r;
   if(r.status!==o.status){o.status=r.status;ch=true;
    toast(r.status==='diproses'?`Pesanan ${o.no} sedang diproses admin`:r.status==='selesai'?`Pesanan ${o.no} sudah dibayar. Struk siap!`:`Pesanan ${o.no}: ${(OST[r.status]||[''])[0]}`);
    if(VP==='order'&&VCUR===o.no)orderView(r)}
  }catch(e){if(e.status===404){o.status='batal';ch=true}}
 }
 if(ch){lsSet('kp_orders',VO);vWatch()}
}

/* ============================================================
   CHATBOT (aturan sederhana; untuk hal lain diteruskan ke WhatsApp admin)
   ============================================================ */
let BM=[];
const botSay=h=>BM.push({b:1,h});
const botMe=t=>BM.push({b:0,h:esc(t)});
const botWa=(label,text,pri)=>`<a class="btn s ${pri===false?'':'p'}" href="${esc(waUrl(waAdmin(),text))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const STOP=['harga','stok','berapa','apakah','ada','yang','untuk','dan','atau','cari','mau','beli','tanya','nya','dong','kak','min','admin','tolong'];
function botFind(q){
 const tk=q.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!STOP.includes(w));if(!tk.length)return[];
 return PP().map(p=>{const n=p.nama.toLowerCase(),k=p.kode.toLowerCase();return{p,sc:tk.filter(w=>n.includes(w)||k.includes(w)).length}}).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc||b.p.a-a.p.a).slice(0,4).map(x=>x.p);
}
function botResult(q){
 const f=botFind(q),s=SSTO();
 if(!f.length){botSay(`Belum ketemu barang "${esc(q)}" di etalase. Tanya admin langsung, siapa tahu barangnya ada atau bisa dipesankan.<div class="bact">${botWa('Tanya admin lewat WhatsApp',`Halo admin ${s.nama}, apakah ada barang: ${q}?`)}</div>`);return}
 botSay(`Ini yang saya temukan:<div class="bres">${f.map(p=>`<div class="br"><div><b>${esc(p.nama)}</b><small>${rp(p.harga)} · ${p.a>0?(p.a>20?'stok tersedia':'sisa '+p.a):'stok habis'}</small></div>${p.a>0?`<button class="btn s" ${A('cAdd',p.id)}>+ Keranjang</button>`:''}</div>`).join('')}</div><div class="bact">${botWa('Tanya admin soal ini',`Halo admin ${s.nama}, saya mau tanya tentang: ${f[0].nama}`,false)}</div>`);
}
function botTopic(k){
 const s=SSTO(),q=encodeURIComponent((s.maps||s.alamat||'').trim());
 if(k==='stok'||k==='harga'){botMe(k==='stok'?'Cek stok barang':'Tanya harga');botSay(`Ketik nama barang yang ingin ${k==='stok'?'dicek stoknya':'ditanyakan harganya'}, misalnya "kursi plastik" atau "ember".`)}
 else if(k==='grosir'){botMe('Beli grosir');botSay(`Untuk pembelian banyak (kos, kontrakan, usaha) harga bisa lebih miring. Sebutkan barang dan jumlahnya ke admin.<div class="bact">${botWa('Tanya harga grosir',`Halo admin ${s.nama}, saya tertarik beli grosir. Barang: ... Jumlah: ...`)}</div>`)}
 else if(k==='lokasi'){botMe('Lokasi dan jam buka');botSay(`${esc(s.alamat||'Alamat belum diisi')}<br>Buka setiap hari ${esc(s.jam)}.${q?`<div class="bact"><a class="btn s p" href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}" target="_blank" rel="noopener noreferrer">Petunjuk arah</a></div>`:''}`)}
 else if(k==='pesanan'){botMe('Pesanan saya');botSay(VO.length?`Pesanan di perangkat ini:<div class="bres">${VO.map(o=>`<div class="br"><div><b>${esc(o.no)}</b><small>${esc((OST[o.status]||['Baru'])[0])}</small></div><button class="btn s" ${A('oView',o.no)}>Lihat</button></div>`).join('')}</div>`:'Belum ada pesanan dari perangkat ini. Tambahkan barang ke keranjang lalu kirim pesanan.')}
 else if(k==='admin'){botMe('Chat admin');botSay(`Baik, saya hubungkan ke admin lewat WhatsApp.<div class="bact">${botWa('Buka WhatsApp admin',`Halo admin ${s.nama}, saya mau bertanya.`)}</div>`)}
}
function botView(){
 VP='bot';
 const chips=[['stok','Cek stok'],['harga','Tanya harga'],['grosir','Beli grosir'],['lokasi','Lokasi & jam'],['pesanan','Pesanan saya'],['admin','Chat admin']];
 vOpen(`<div class="vhead"><div><h3>Chat ${esc(SSTO().nama||'toko')}</h3><span class="mut">Asisten otomatis · lanjut ke WhatsApp admin</span></div><button class="vx" ${A('vClose')} aria-label="Tutup">✕</button></div>
 <div class="vbody bchat" id="bchat">${BM.map(m=>`<div class="bm ${m.b?'bot':'me'}">${m.h}</div>`).join('')}</div>
 <div class="bchips">${chips.map(c=>`<button ${A('botChip',c[0])}>${c[1]}</button>`).join('')}</div>
 <form class="bform" ${F('botSend')}><input id="bin" maxlength="120" placeholder="Ketik pertanyaan atau nama barang…" autocomplete="off"><button class="btn p">Kirim</button></form>`,'bot');
 const b=$('bchat');if(b)b.scrollTop=b.scrollHeight;const i=$('bin');if(i&&matchMedia('(pointer: fine)').matches)i.focus();
}
H.botOpen=async()=>{
 await refreshPub();
 if(!BM.length)botSay(`Halo! Saya asisten ${esc(SSTO().nama||'toko')}. Pilih topik di bawah atau ketik nama barang yang dicari. Untuk hal lain, saya teruskan ke admin lewat WhatsApp.`);
 botView();
};
H.botChip=k=>{botTopic(k);botView()};
H.botSend=()=>{
 const v=$('bin').value.trim();if(!v)return;botMe(v);const l=v.toLowerCase();
 if(/grosir|banyak|partai/.test(l))botTopic('grosir');
 else if(/lokasi|alamat|dimana|di mana|jam|buka|tutup/.test(l))botTopic('lokasi');
 else if(/pesanan|booking|status/.test(l))botTopic('pesanan');
 else if(/^(hai|halo|hello|selamat|p)\b/.test(l)&&l.length<25)botSay('Halo! Mau cek stok, tanya harga, atau langsung chat admin?');
 else botResult(v);
 botView();
};

/* ============================================================
   ULASAN: FORM PENGUNJUNG + DAFTAR DI HALAMAN AWAL
   ============================================================ */
let RV_R=0;
const stars=n=>'★'.repeat(n)+'☆'.repeat(5-n);
H.rvForm=()=>{
 RV_R=0;
 modal(`<h3>Tulis ulasan</h3><p class="mut" style="margin:4px 0 8px">Ulasan Anda akan tampil setelah disetujui admin.</p>
 <form ${F('rvSend')}><label>Rating</label><div class="rvstars" id="rvst">${[1,2,3,4,5].map(n=>`<button type="button" ${A('rvStar',n)} aria-label="${n} bintang">★</button>`).join('')}</div>
 <label for="rvn">Nama</label><input id="rvn" required minlength="2" maxlength="40" value="${esc(lsGet('kp_nama',''))}" autocomplete="name">
 <label for="rvc">Komentar (opsional)</label><textarea id="rvc" maxlength="300" rows="3" placeholder="Ceritakan pengalaman belanja Anda"></textarea>
 <input class="hp" id="rvw" tabindex="-1" autocomplete="off" aria-hidden="true">
 <div class="tabs" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Kirim ulasan</button></div></form>`);
};
H.rvStar=n=>{RV_R=n;document.querySelectorAll('#rvst button').forEach((b,i)=>b.classList.toggle('on',i<n))};
H.rvSend=()=>run(async()=>{
 if(!RV_R)return toast('Pilih jumlah bintang dulu');
 const r=await api('POST','/api/reviews',{nama:$('rvn').value.trim(),rating:RV_R,komentar:$('rvc').value.trim(),website:$('rvw').value});
 lsSet('kp_nama',$('rvn').value.trim());closeM();toast(r.msg);
});
function lReviews(){
 const rv=(S.pub&&S.pub.reviews)||{avg:0,count:0,list:[]};
 $('lRvSum').innerHTML=rv.count?`<b>${rv.avg.toFixed(1)}</b> <span class="stars">${stars(Math.round(rv.avg))}</span> <span class="mut">${rv.count} ulasan</span>`:'';
 $('lTesti').innerHTML=rv.count?rv.list.map((r,i)=>`<div class="tc rv" style="--d:${i*70}ms"><div class="stars">${stars(r.rating)}</div>${r.komentar?`<p>${esc(r.komentar)}</p>`:'<p class="mut">Pelanggan memberi rating tanpa komentar.</p>'}<div class="who"><i>${esc(ini(r.nama))}</i><div><b>${esc(r.nama)}</b><span>${new Date(r.date).toLocaleDateString('id-ID',{dateStyle:'medium'})}</span></div></div>${r.balasan?`<div class="rbal"><b>Balasan toko</b>${esc(r.balasan)}</div>`:''}</div>`).join('')
  :'<p class="mut" style="grid-column:1/-1;font-size:14px">Belum ada ulasan. Jadilah yang pertama membagikan pengalaman belanja Anda.</p>';
}
function lMap(){
 const s=(S.pub&&S.pub.store)||{},sec=$('lokasi'),q=encodeURIComponent((s.maps||s.alamat||'').trim());
 sec.classList.toggle('hide',!q);if(!q)return;
 const wa='https://wa.me/'+waNum(s.wa||s.telp);
 $('lMap').innerHTML=`<div class="mapw rv"><div class="mapi"><h3>${esc(s.nama)}</h3><p>${esc(s.alamat)}</p><p>Buka setiap hari ${esc(s.jam)}</p>
 <div class="mapb"><a class="btn p" href="https://www.google.com/maps/dir/?api=1&amp;destination=${q}" target="_blank" rel="noopener noreferrer">Petunjuk arah</a><a class="btn" href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener noreferrer">Buka di Google Maps</a><a class="btn" href="${wa}" target="_blank" rel="noopener noreferrer">Chat WhatsApp</a></div></div>
 <div class="mapf"><iframe title="Peta lokasi ${esc(s.nama)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${q}&amp;output=embed&amp;hl=id"></iframe></div></div>`;
}
H.toLok=()=>$('lokasi').scrollIntoView({behavior:'smooth'});

/* ============================================================
   MENU PESANAN (Owner & Admin)
   ============================================================ */
let OF='open',OD={list:[],counts:{}},OTOT=0,LASTO=null;
VIEWS.pesanan=async()=>{loading();await loadOrders()};
async function loadOrders(){const d=await api('GET','/api/orders?s='+OF);if(cur!=='pesanan')return;OD=d;drawOrders();setBadge('pesanan',d.counts.baru)}
H.ofSet=f=>{OF=f;run(loadOrders)};
const OSTAFF={baru:['Baru','no'],diproses:['Diproses',''],selesai:['Selesai','ok'],batal:['Dibatalkan','old'],kedaluwarsa:['Kedaluwarsa','old']};
function drawOrders(){
 const d=OD,tabs=[['open','Aktif'],['selesai','Selesai'],['tutup','Batal / kedaluwarsa'],['all','Semua']];
 $('view').innerHTML=`<div class="tabs">${tabs.map(([k,l])=>`<button class="btn s ${OF===k?'p':''}" ${A('ofSet',k)}>${l}${k==='open'&&(d.counts.baru+d.counts.proses)?` (${d.counts.baru+d.counts.proses})`:''}</button>`).join('')}<button class="btn s" ${A('ofSet',OF)}>Muat ulang</button></div>
 <p class="mut" style="margin:-4px 0 12px">Barang pada pesanan aktif ditahan, jadi tidak bisa terjual di kasir. Pesanan baru yang tidak diproses akan kedaluwarsa dalam 24 jam.</p>
 ${d.list.length?d.list.map(orderCard).join(''):'<div class="card"><div class="empty">Belum ada pesanan pada kategori ini.</div></div>'}`;
}
function orderCard(o){
 const st=OSTAFF[o.status]||['',''],open=o.status==='baru'||o.status==='diproses',short=o.items.some(i=>!i.ada||i.qty>i.stokFisik);
 const s=S.set,wl=`https://wa.me/${o.wa}`;
 let acts=`<a class="btn s" href="${esc(waUrl(o.wa,`Halo ${o.nama}, ini admin ${s.nama}. Terkait pesanan ${o.no}: `))}" target="_blank" rel="noopener noreferrer">Hubungi WA</a>`;
 if(o.status==='baru')acts+=`<button class="btn s" ${A('oProc',o.no)}>Proses</button>`;
 if(open)acts+=`<button class="btn s p" ${A('oPay',o.no)}>Bayar &amp; cetak struk</button><button class="btn s d" ${A('oBatal',o.no)}>Batalkan</button>`;
 if(o.status==='selesai'&&o.struk)acts+=`<button class="btn s" ${A('oPrint',o.no)}>Cetak struk</button><a class="btn s p" href="${esc(waUrl(o.wa,strukText(o.struk,o.no,o.nama)))}" target="_blank" rel="noopener noreferrer">Kirim struk via WA</a>`;
 return`<div class="card ord"><div class="ordh"><div><b>${esc(o.no)}</b> <span class="tag ${st[1]}">${st[0]}</span><div class="mut">${esc(o.nama)} · <a href="${wl}" target="_blank" rel="noopener noreferrer">${esc(o.wa)}</a> · ${fmtT(o.date)}</div></div><b class="ordt">${rp(o.total)}</b></div>
 ${o.items.map(i=>`<div class="row"><span>${i.qty} × ${esc(i.nama)} <span class="tag">${esc(i.kode)}</span></span><span class="${open&&(!i.ada||i.qty>i.stokFisik)?'warn':'mut'}">${rp(i.qty*i.harga)} · stok fisik ${i.ada?i.stokFisik:'tidak ada'}</span></div>`).join('')}
 ${o.catatan?`<div class="mut" style="margin-top:6px">Catatan: ${esc(o.catatan)}</div>`:''}${o.alasan?`<div class="mut" style="margin-top:6px">Alasan: ${esc(o.alasan)}</div>`:''}
 ${open&&short?'<div class="warnbox">Stok fisik kurang dari jumlah pesanan. Perbarui stok di Gudang atau hubungi pelanggan sebelum menerima pembayaran.</div>':''}
 <div class="tabs" style="margin:10px 0 0">${acts}</div></div>`;
}
const ordOfNo=no=>OD.list.find(x=>x.no===no);
H.oProc=no=>run(async()=>{await api('POST',`/api/orders/${encodeURIComponent(no)}/proses`);toast('Pesanan diproses. Pelanggan melihat statusnya langsung.');return loadOrders()});
H.oBatal=async no=>{
 if(!await ask('Stok yang ditahan akan dilepas dan pelanggan melihat pesanannya dibatalkan.',{title:'Batalkan pesanan?',ok:'Ya, batalkan',cancel:'Tidak',danger:true,icon:'🧾'}))return;
 run(async()=>{await api('POST',`/api/orders/${encodeURIComponent(no)}/batal`,{alasan:'Dibatalkan toko'});toast('Pesanan dibatalkan');return loadOrders()});
};
H.oPay=no=>{
 const o=ordOfNo(no);if(!o)return;OTOT=o.total;
 modal(`<h3>Bayar ${esc(o.no)}</h3><p class="mut" style="margin:4px 0 8px">${esc(o.nama)} · ${esc(o.wa)}</p>${o.items.map(i=>`<div class="row"><span>${i.qty} × ${esc(i.nama)}</span><span>${rp(i.qty*i.harga)}</span></div>`).join('')}
 <div class="mut" style="margin-top:10px">Total</div><div class="total">${rp(o.total)}</div>
 <form ${F('oPayGo',no)}><label for="opay">Uang diterima (Rp)</label><input id="opay" type="number" min="0" step="1" inputmode="numeric" required data-in="oChg">
 <div class="tabs" style="margin-top:8px">${[50000,100000,200000].map(n=>`<button type="button" class="btn s" ${A('oFix',n)}>${n/1000}rb</button>`).join('')}<button type="button" class="btn s" ${A('oFix',-1)}>Pas</button></div>
 <div class="mut">Kembalian: <b id="ocg" style="color:var(--g)">Rp 0</b></div>
 <div class="tabs" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Bayar &amp; cetak struk</button></div></form>`);
};
H.oChg=()=>{const d=(+$('opay').value||0)-OTOT;$('ocg').textContent=d<0?'Uang kurang':rp(d);$('ocg').style.color=d<0?'var(--red)':'var(--g)'};
H.oFix=n=>{$('opay').value=n<0?OTOT:n;H.oChg()};
H.oPayGo=no=>run(async()=>{
 const bayar=Math.round(+$('opay').value||0);if(bayar<OTOT)return toast('Uang yang diterima kurang');
 const r=await api('POST',`/api/orders/${encodeURIComponent(no)}/bayar`,{bayar});LASTO=r;
 modal(`<h3>Pembayaran berhasil</h3><p class="mut" style="margin:4px 0 10px">${esc(r.order.no)} · struk ${esc(r.tx.no)}</p><div class="row"><span>Total</span><b>${rp(r.tx.total)}</b></div><div class="row"><span>Kembalian</span><b>${rp(r.tx.kembali)}</b></div>
 <p class="mut" style="margin:10px 0">Pelanggan yang membuka pesanannya langsung melihat struk. Anda juga bisa mengirimnya ke WhatsApp pelanggan.</p>
 <div class="vacts"><a class="btn p" href="${esc(waUrl(r.order.wa,strukText(r.tx,r.order.no,r.order.nama)))}" target="_blank" rel="noopener noreferrer">Kirim struk ke WhatsApp pelanggan</a><button class="btn" ${A('oPrintLast')}>Cetak struk</button><button class="btn" ${A('oDone')}>Selesai</button></div>`);
 return loadOrders();
});
H.oPrintLast=()=>{if(LASTO)printR(LASTO.tx)};
H.oDone=()=>closeM();
H.oPrint=no=>{const o=ordOfNo(no);if(o&&o.struk)printR(o.struk)};

/* ============================================================
   MENU ULASAN (Owner & Admin)
   ============================================================ */
let RVF='pending',RVD=[];
VIEWS.ulasan=async()=>{loading();RVD=await api('GET','/api/reviews');if(cur==='ulasan')drawRv()};
H.rvF=f=>{RVF=f;drawRv()};
function drawRv(){
 const ok=RVD.filter(r=>r.status==='tampil'),avg=ok.length?ok.reduce((a,r)=>a+r.rating,0)/ok.length:0,pend=RVD.filter(r=>r.status==='pending').length;
 const map={pending:'Menunggu',tampil:'Tampil',sembunyi:'Disembunyikan',all:'Semua'},list=RVF==='all'?RVD:RVD.filter(r=>r.status===RVF);
 const dist=[5,4,3,2,1].map(n=>({n:n+' bintang',v:ok.filter(r=>r.rating===n).length}));
 setBadge('ulasan',pend);
 $('view').innerHTML=`<div class="grid g4">${[['Rating rata-rata (tampil)',ok.length?avg.toFixed(1)+' / 5':'-'],['Ulasan tampil',ok.length],['Menunggu persetujuan',pend],['Total ulasan',RVD.length]].map(statCard).join('')}</div>
 <div class="card" style="margin-top:14px"><h3>Sebaran rating <small>ulasan yang tampil</small></h3>${hbars(dist,{fmtv:v=>v+' ulasan',empty:'Belum ada ulasan yang tampil.'})}</div>
 <div class="tabs" style="margin-top:14px">${Object.entries(map).map(([k,l])=>`<button class="btn s ${RVF===k?'p':''}" ${A('rvF',k)}>${l}${k==='pending'&&pend?` (${pend})`:''}</button>`).join('')}</div>
 ${list.length?list.map(r=>`<div class="card rvc"><div class="ordh"><div><span class="stars">${stars(r.rating)}</span> <b>${esc(r.nama)}</b> <span class="tag ${r.status==='tampil'?'ok':r.status==='pending'?'no':'old'}">${esc(map[r.status]||r.status)}</span><div class="mut">${fmtT(r.date)}</div></div></div>
  <p style="margin:8px 0">${r.komentar?esc(r.komentar):'<span class="mut">Tanpa komentar</span>'}</p>${r.balasan?`<div class="rbal"><b>Balasan ${esc(r.balasOleh||'toko')}</b>${esc(r.balasan)}</div>`:''}
  <div class="tabs" style="margin:10px 0 0">${r.status!=='tampil'?`<button class="btn s p" ${A('rvSet',r.id,'tampil')}>Tampilkan</button>`:`<button class="btn s" ${A('rvSet',r.id,'sembunyi')}>Sembunyikan</button>`}<button class="btn s" ${A('rvReply',r.id)}>${r.balasan?'Ubah balasan':'Balas'}</button><button class="btn s d" ${A('rvDel',r.id)}>Hapus</button></div></div>`).join(''):'<div class="card"><div class="empty">Tidak ada ulasan pada kategori ini.</div></div>'}`;
}
H.rvSet=(id,st)=>run(async()=>{await api('POST',`/api/reviews/${id}/status`,{status:st});RVD=await api('GET','/api/reviews');drawRv();toast(st==='tampil'?'Ulasan ditampilkan di halaman toko':'Ulasan disembunyikan')});
H.rvReply=id=>{const r=RVD.find(x=>x.id===id);if(!r)return;modal(`<h3>Balas ulasan</h3><p class="mut" style="margin:4px 0 8px">${esc(r.nama)}: ${esc(r.komentar||'(tanpa komentar)')}</p><form ${F('rvReplySave',id)}><label for="rvb">Balasan (tampil di bawah ulasan)</label><textarea id="rvb" maxlength="300" rows="3">${esc(r.balasan||'')}</textarea><div class="tabs" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn" ${A('closeM')}>Batal</button><button class="btn p">Simpan balasan</button></div></form>`)};
H.rvReplySave=id=>run(async()=>{await api('POST',`/api/reviews/${id}/reply`,{balasan:$('rvb').value.trim()});closeM();RVD=await api('GET','/api/reviews');drawRv();toast('Balasan disimpan')});
H.rvDel=async id=>{if(!await ask('Ulasan ini dihapus permanen.',{title:'Hapus ulasan?',ok:'Ya, hapus',danger:true,icon:'💬'}))return;run(async()=>{await api('DELETE','/api/reviews/'+id);RVD=await api('GET','/api/reviews');drawRv();toast('Ulasan dihapus')})};

/* ---------- lencana menu & notifikasi pesanan baru ---------- */
let badgeT=null,lastOrd;
function setBadge(k,n){
 const el=document.querySelector(`#nav button[data-k="${k}"]`);if(!el)return;let b=el.querySelector('.bdg');
 if(!n){if(b)b.remove();return}
 if(!b){b=document.createElement('span');b.className='bdg';el.appendChild(b)}b.textContent=n>99?'99+':n;
}
function startBadges(){
 clearInterval(badgeT);badgeT=null;lastOrd=undefined;if(!S.me||!['owner','admin'].includes(S.me.role))return;
 const tick=async()=>{
  if(document.hidden||!S.me)return;
  try{const b=await api('GET','/api/badges',undefined,{poll:true});setBadge('pesanan',b.pesanan);setBadge('ulasan',b.ulasan);
   const now=b.last?b.last.no:'';if(lastOrd!==undefined&&now&&now!==lastOrd)toast(`Pesanan baru dari ${b.last.nama}`);lastOrd=now;
   if(cur==='pesanan'&&OF==='open'&&OD&&OD.counts&&(b.pesanan!==OD.counts.baru||b.proses!==OD.counts.proses))loadOrders().catch(()=>{})}catch(e){}
 };
 tick();badgeT=setInterval(tick,20000);
}


/* ============================================================
   MULAI
   ============================================================ */
(async function boot(){
 const[pub,ses]=await Promise.all([api('GET','/api/public').catch(()=>null),api('GET','/api/session').catch(()=>null)]);
 if(pub&&ses)pub.setup=!!ses.setup;S.pub=pub;landing();
 if(ses&&ses.user)run(()=>enterApp(ses.user));   // sesi masih berlaku: langsung masuk, data tetap utuh
})();
