/* Conserva las llamadas jQuery slideToggle/Up/Down; anima únicamente transform y opacity.
   La geometría se actualiza una sola vez con show/hide, sin animar height o padding. */
export function createMotion($){
 const media=matchMedia('(prefers-reduced-motion: reduce)'),live=new Map();
 const originals={slideToggle:$.fn.slideToggle,slideUp:$.fn.slideUp,slideDown:$.fn.slideDown,stop:$.fn.stop};
 const preference=()=>{$.fx.off=media.matches;};preference();media.addEventListener('change',preference);
 function run(element,show,speed,callback){
  const old=live.get(element);if(old){old.cancel();live.delete(element);}
  const el=$(element);if(show)el.show();
  const end=()=>{live.delete(element);if(!show)el.hide();callback?.call(element);};
  const duration=media.matches||$.fx.off?0:typeof speed==='number'?speed:180;
  if(!duration||!element.animate){end();return;}
  const frames=show?[{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'translateY(0)'}]:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-6px)'}];
  const animation=element.animate(frames,{duration,easing:'ease-out'});live.set(element,animation);
  animation.onfinish=end;animation.oncancel=()=>live.delete(element);
 }
 for(const name of ['slideToggle','slideUp','slideDown'])$.fn[name]=function(speed,easing,callback){
  const done=typeof speed==='function'?speed:typeof easing==='function'?easing:callback;
  return this.each(function(){run(this,name==='slideDown'||name==='slideToggle'&&!$(this).is(':visible'),speed,done);});
 };
 $.fn.stop=function(...args){this.each(function(){const a=live.get(this);if(a){if(args[1])a.finish();else a.cancel();}});return originals.stop.apply(this,args);};
 function stop(){for(const a of live.values())a.cancel();live.clear();}
 return {stop,destroy(){stop();media.removeEventListener('change',preference);Object.assign($.fn,originals);}};
}
