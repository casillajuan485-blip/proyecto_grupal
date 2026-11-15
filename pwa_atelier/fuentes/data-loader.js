import fallback from './catalog-source.js';
const valid = data => Array.isArray(data) && data.length > 0 && data.length <= 10000 && data.every(p =>
 Array.isArray(p) && p.length===7 && typeof p[0]==='string' && p[0].length<=100 && typeof p[1]==='string' &&
 Number.isFinite(p[2]) && p[2]>0 && typeof p[3]==='string' && p[3].length<=1000 &&
 ['shirt','jacket','pants','red','jeans','white','dress','bag'].includes(p[4]) &&
 Array.isArray(p[5]) && p[5].length>0 && p[5].every(c=>typeof c==='string'&&c.length<=30) && Number.isSafeInteger(p[6]) && p[6]>0);
export const ready = (async()=>{
 const key='atelier.catalog.reference.v2',controller=new AbortController();
 const cancel=()=>controller.abort();window.addEventListener('pagehide',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(),4500);
 try {
  const response=await fetch('json/catalogo.json',{signal:controller.signal,cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(!valid(data))throw Error('Formato de catálogo inválido');
  window.ATELIER_CATALOG=data;
  try{localStorage.setItem(key,JSON.stringify(data));}catch{}
 }catch{
  let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
  window.ATELIER_CATALOG=valid(saved)?saved:fallback;window.ATELIER_DATA_FALLBACK=true;
 }finally{clearTimeout(timer);window.removeEventListener('pagehide',cancel);}
})();
