/* Recibe solo plantillas propias con valores escapados. No acepta HTML remoto. */
function key(node){return node.nodeType===1?(node.id||(node.matches('.product[data-id]')?'product-'+node.dataset.id:'')):'';}
function same(a,b){return a.nodeType===b.nodeType&&a.nodeName===b.nodeName;}
function patch(a,b){
 if(!same(a,b)){a.replaceWith(b);return;}
 if(a.isEqualNode(b))return;
 if(a.nodeType!==1){a.nodeValue=b.nodeValue;return;}
 const focused=a===document.activeElement;
 for(const attr of [...a.attributes])if(!b.hasAttribute(attr.name)&&!(focused&&attr.name==='value'))a.removeAttribute(attr.name);
 for(const attr of b.attributes)if(a.getAttribute(attr.name)!==attr.value&&!(focused&&attr.name==='value'))a.setAttribute(attr.name,attr.value);
 if(!focused&&a.matches('input,textarea'))a.value=b.value;
 reconcile(a,b);
}
function reconcile(parent,source){
 const keyed=new Map([...parent.childNodes].map(n=>[key(n),n]).filter(([k])=>k));let cursor=parent.firstChild;
 for(const incoming of [...source.childNodes]){
  const id=key(incoming);const current=id?keyed.get(id):cursor&&!key(cursor)&&same(cursor,incoming)?cursor:null;
  if(!current){parent.insertBefore(incoming,cursor);continue;}
  if(current!==cursor)parent.insertBefore(current,cursor);
  const next=current.nextSibling;patch(current,incoming);cursor=next;
 }
 while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
}
export function updateDOM(root,html){if(!root)return;const t=document.createElement('template');t.innerHTML=html;reconcile(root,t.content);}
