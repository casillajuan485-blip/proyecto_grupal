/* Compilación frontend. No contiene ni inicia un servidor.
   ES modules + tree shaking + minificación + chunks diferidos + caché versionada. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const esbuild=require(process.env.ATELIER_ESBUILD || 'esbuild');
// Supply our own files to esbuild without searching unrelated parent directories.
const localSources={name:'atelier-sources',setup(build){
 build.onResolve({filter:/.*/},args=>{
  const full=path.resolve(args.importer?path.dirname(args.importer):root,args.path);
  if(!full.startsWith(path.join(root,'fuentes')+path.sep))return{errors:[{text:'Importación fuera de fuentes: '+args.path}]};
  return{path:full,namespace:'atelier'};
 });
 build.onLoad({filter:/.*/,namespace:'atelier'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'js'}));
}};
(async()=>{
 const result=await esbuild.build({absWorkingDir:root,tsconfigRaw:{},plugins:[localSources],entryPoints:{app:path.join(root,'fuentes/app.js')},outdir:path.join(root,'js'),bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',treeShaking:true,minify:true,legalComments:'eof',chunkNames:'modulos/[name]-[hash]',metafile:true,write:false,define:{module:'undefined'}});
 const generated=result.outputFiles.map(f=>path.resolve(f.path));
 // Only generated files from the previous successful compilation can be removed.
 const record=path.join(root,'herramientas/salidas.json');let old=[];
 try{old=JSON.parse(fs.readFileSync(record,'utf8'));}catch{}
 for(const name of old){const full=path.resolve(root,name);if(full.startsWith(path.join(root,'js')+path.sep)&&!generated.includes(full)&&fs.existsSync(full))fs.unlinkSync(full);}
 for(const file of result.outputFiles){fs.mkdirSync(path.dirname(file.path),{recursive:true});fs.writeFileSync(file.path,file.contents);}
 fs.writeFileSync(record,JSON.stringify(generated.map(f=>path.relative(root,f).replaceAll('\\','/')),null,2));
 const temp=await esbuild.build({absWorkingDir:root,tsconfigRaw:{},plugins:[localSources],entryPoints:[path.join(root,'fuentes/catalog-source.js')],bundle:true,format:'cjs',platform:'node',write:false});
 const module={exports:{}};new Function('module','exports',temp.outputFiles[0].text)(module,module.exports);
 fs.mkdirSync(path.join(root,'json'),{recursive:true});fs.writeFileSync(path.join(root,'json/catalogo.json'),JSON.stringify(module.exports.default,null,2));
 function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);}
 const assets=['./','index.html','manifest.webmanifest',...walk('css'),...walk('js'),...walk('json'),...walk('img')].filter(f=>!f.endsWith('.txt'));
 const hash=crypto.createHash('sha256').update(Buffer.concat(assets.filter(f=>f!=='./').map(f=>fs.readFileSync(path.join(root,f))))).digest('hex').slice(0,12);
 const sw=`/* Generado: npm run build. No cambiar archivos de caché sin recompilar. */
const PREFIX='atelier-final-'+encodeURIComponent(self.registration.scope)+'-';
const LEGACY='atelier-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'${hash}';
const ASSETS=${JSON.stringify(assets)};
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
});`;
 fs.writeFileSync(path.join(root,'sw.js'),sw);
 const inputBytes=Object.values(result.metafile.inputs).reduce((n,f)=>n+f.bytes,0),outputBytes=result.outputFiles.reduce((n,f)=>n+f.contents.length,0);
 console.log(JSON.stringify({compiler:'esbuild '+esbuild.version,treeShaking:true,splitting:true,minified:true,inputBytes,outputBytes,chunks:generated.length,cacheVersion:hash,assets:assets.length}));
 if(process.env.ATELIER_BUILD_REPORT)fs.writeFileSync(process.env.ATELIER_BUILD_REPORT,JSON.stringify(result.metafile,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
