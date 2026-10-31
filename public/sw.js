const V='kp-pos-v15.0.0'; // NAIKKAN angka ini setiap kali upload versi baru
const SHELL=['./','index.html','style.css','script.js','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&/^(tk|kp)-pos-/.test(x)).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  // DATA (/api/*) TIDAK PERNAH disimpan di cache: selalu langsung ke server
  if(u.origin===location.origin&&u.pathname.startsWith('/api/'))return;
  if(u.origin===location.origin){
    e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})
      .catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
  }else if(/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){
    e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{c.put(r,res.clone());return res}).catch(()=>m))));
  }
});
