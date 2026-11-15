// Extracción del bloque VisualViewport de fuentes/pwa.js. No registra service worker.
export function startViewport(){
let frame,focusTimer,fullHeight=innerHeight;const cleanups=[];const on=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
 function viewport(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  const height=window.visualViewport?.height||innerHeight,input=document.activeElement?.matches('input,select,textarea');
  if(!input)fullHeight=innerHeight;
  const keyboard=!!input&&fullHeight-height>120;
  document.documentElement.style.setProperty('--visible-height',height+'px');document.body.classList.toggle('keyboard-open',keyboard);
  if(keyboard)document.activeElement.scrollIntoView({block:'nearest',behavior:'instant'});
 });}
viewport();on(window,'resize',viewport);if(window.visualViewport)on(visualViewport,'resize',viewport);on(document,'focusin',viewport);on(document,'focusout',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(viewport,180);});on(window,'pagehide',()=>{cancelAnimationFrame(frame);clearTimeout(focusTimer);cleanups.splice(0).forEach(fn=>fn());});
}
