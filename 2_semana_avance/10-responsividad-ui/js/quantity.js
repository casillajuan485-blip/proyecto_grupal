/* Controles reales de 44×44 px; no dependen de las flechas pequeñas del navegador. */
export function createQuantities($){
 let counter=0;
 function enhance(root=document){
  root.querySelectorAll('#cart-quantity,[data-cart-qty],#movement-qty,#refund-qty').forEach(input=>{
   if(!input.id)input.id='atelier-quantity-'+(++counter);
   input.inputMode='numeric';
   if(!input.closest('.quantity-control')){
    const wrap=document.createElement('div');wrap.className='quantity-control';input.before(wrap);wrap.append(input);
    for(const [step,label]of [[-1,'Disminuir cantidad'],[1,'Aumentar cantidad']]){
     const button=document.createElement('button');button.type='button';button.dataset.quantityStep=String(step);button.dataset.quantityTarget=input.id;
     button.textContent=step<0?'−':'+';button.setAttribute('aria-label',label);button.setAttribute('aria-controls',input.id);
     if(step<0)wrap.prepend(button);else wrap.append(button);
    }
   }
   const value=Number(input.value),min=input.min===''?0:Number(input.min),max=input.max===''?Infinity:Number(input.max);
   input.closest('.quantity-control').querySelectorAll('[data-quantity-step]').forEach(button=>{
    button.disabled=input.disabled||(Number(button.dataset.quantityStep)<0?value<=min:value>=max);
   });
  });
 }
 $(document).off('click.quantity','[data-quantity-step]').on('click.quantity','[data-quantity-step]',function(){
  const input=document.getElementById(this.dataset.quantityTarget);if(!input||input.disabled)return;
  const min=input.min===''?0:Number(input.min),max=input.max===''?Infinity:Number(input.max);
  const next=Math.min(max,Math.max(min,(Number(input.value)||min)+Number(this.dataset.quantityStep)));
  $(input).val(next).trigger('input').trigger('change');enhance(input.closest('form')||document);
 });
 $(document).off('input.quantity change.quantity','#cart-quantity,[data-cart-qty],#movement-qty,#refund-qty').on('input.quantity change.quantity','#cart-quantity,[data-cart-qty],#movement-qty,#refund-qty',()=>enhance());
 return{enhance,destroy(){ $(document).off('.quantity'); }};
}
