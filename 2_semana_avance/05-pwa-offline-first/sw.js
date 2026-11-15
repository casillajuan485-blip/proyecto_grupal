/* Generado: npm run build. No cambiar archivos de caché sin recompilar. */
const PREFIX='atelier-final-'+encodeURIComponent(self.registration.scope)+'-';
const LEGACY='atelier-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'8fac3e3e7a6b';
const ASSETS=["./", "index.html", "manifest.webmanifest", "css/explicacion.css", "css/pwa.css", "css/styles.css", "img/bag.jpg", "img/dress.jpg", "img/jacket.jpg", "img/jeans.jpg", "img/pants.jpg", "img/red.jpg", "img/shirt.jpg", "img/white.jpg", "js/app.js", "js/catalog-source.js", "js/core.js", "js/data-loader.js", "js/dom.js", "js/funciones.js", "js/motion.js", "js/pdf-report.js", "js/pwa.js", "js/quantity.js", "js/validaciones.js", "json/catalogo.json", "js/lib/jquery.min.js", "js/lib/jspdf.umd.min.js", "js/lib/LICENSE-jquery.txt", "img/iconos/backup.svg", "img/iconos/bag.svg", "img/iconos/bell.svg", "img/iconos/box.svg", "img/iconos/chart.svg", "img/iconos/clock.svg", "img/iconos/eye.svg", "img/iconos/file.svg", "img/iconos/grid.svg", "img/iconos/help.svg", "img/iconos/home.svg", "img/iconos/left.svg", "img/iconos/menu.svg", "img/iconos/moon.svg", "img/iconos/right.svg", "img/iconos/sliders.svg", "img/iconos/sun.svg", "img/pwa/icon-192.png", "img/pwa/icon-512.png"];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));}
 catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(k=>(k.startsWith(PREFIX)||k.startsWith(LEGACY))&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);const cached=await cache.match(event.request,{ignoreSearch:true});if(cached)return cached;
  try{return await fetch(event.request);}catch{if(event.request.mode==='navigate')return(await cache.match('index.html'))||Response.error();return Response.error();}
 })());
});