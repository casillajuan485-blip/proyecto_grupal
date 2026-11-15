import {ready} from './data-loader.js';
let started=false, pdfPromise;
const pendingScripts=new Set();
function loadScript(src){return new Promise((resolve,reject)=>{
 const el=document.createElement('script');el.src=src;
 const release=()=>{clearTimeout(timer);el.onload=null;el.onerror=null;pendingScripts.delete(cancel);};
 const cancel=()=>{release();el.remove();reject(Error('Carga cancelada al salir de la página.'));};
 const timer=setTimeout(()=>{release();el.remove();reject(Error('La carga tardó demasiado. Vuelve a intentarlo.'));},10000);
 pendingScripts.add(cancel);
 el.onload=()=>{release();resolve();};el.onerror=()=>{release();el.remove();reject(Error('No se pudo cargar el módulo. Vuelve a intentarlo.'));};document.head.append(el);
});}
export async function loadPdf(){
 if(!pdfPromise)pdfPromise=(async()=>{if(!window.jspdf)await loadScript('js/lib/jspdf.umd.min.js');return(await import('./pdf-report.js')).default;})().catch(error=>{pdfPromise=null;throw error;});
 return pdfPromise;
}
export async function initPwa(){
 if(started)return;started=true;await ready;
 const $=window.jQuery,cleanups=[];let installPrompt,registration,frame,focusTimer,disposed=false,fullHeight=innerHeight;
 const on=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
 const status=text=>$('#connection-status').text(text);
 function connection(){status(navigator.onLine?(window.ATELIER_DATA_FALLBACK?'Catálogo de respaldo disponible · Guardado local.':'Con conexión · Guardado en este dispositivo.'):'Sin conexión · Puedes continuar con los datos disponibles.');}
 function viewport(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  const height=window.visualViewport?.height||innerHeight,input=document.activeElement?.matches('input,select,textarea');
  if(!input)fullHeight=innerHeight;
  const keyboard=!!input&&fullHeight-height>120;
  document.documentElement.style.setProperty('--visible-height',height+'px');document.body.classList.toggle('keyboard-open',keyboard);
  if(keyboard)document.activeElement.scrollIntoView({block:'nearest',behavior:'instant'});
 });}
 connection();viewport();on(window,'online',connection);on(window,'offline',connection);on(window,'resize',viewport);
 if(window.visualViewport)on(visualViewport,'resize',viewport);
 on(document,'focusin',viewport);on(document,'focusout',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(viewport,180);});
 on(window,'beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('[data-install]').prop('hidden',false);});
 on(window,'appinstalled',()=>{installPrompt=null;$('[data-install]').prop('hidden',true);});
 $(document).off('click.pwa','[data-install]').on('click.pwa','[data-install]',async()=>{
  if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('[data-install]').prop('hidden',true);
 });
 $(document).off('click.pwa','[data-update]').on('click.pwa','[data-update]',()=>registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'}));
 const updateReady=()=>{$('[data-update]').prop('hidden',false);status('Nueva versión disponible. Guarda tu formulario antes de actualizar.');};
 if('serviceWorker' in navigator&&location.protocol!=='file:'){
  try{
   registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
   if(registration.waiting)updateReady();
   on(registration,'updatefound',()=>{const worker=registration.installing;if(worker)on(worker,'statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)updateReady();});});
   let reloading=false;on(navigator.serviceWorker,'controllerchange',()=>{if(!reloading&&!$('[data-update]').prop('hidden')){reloading=true;location.reload();}});
   navigator.serviceWorker.ready.then(()=>{if(!disposed&&!registration.waiting)status(navigator.onLine?'Lista para usar sin conexión · Guardado local.':'Sin conexión · Aplicación disponible con datos guardados.');});
  }catch{status('No se pudo preparar el modo offline. Revisa la conexión y vuelve a cargar.');}
 }else if(location.protocol==='file:')status('Para instalar esta PWA, utiliza HTTPS o localhost.');
 on(window,'pagehide',event=>{disposed=true;cancelAnimationFrame(frame);clearTimeout(focusTimer);if(!event.persisted){pendingScripts.forEach(cancel=>cancel());pendingScripts.clear();cleanups.splice(0).forEach(fn=>fn());$(document).off('.pwa');started=false;}});
 on(window,'pageshow',()=>{disposed=false;connection();viewport();});
}
