import {iniciar} from './funciones.js';
const run=()=>iniciar().catch(error=>{document.getElementById('parte-status').textContent='No se pudo iniciar: '+error.message;console.error(error);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
