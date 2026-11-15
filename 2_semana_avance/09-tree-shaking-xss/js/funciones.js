import {AtelierCore} from './core.js';
import {AtelierValidation,AtelierGuidedForms} from './validaciones.js';
import {createMotion} from './motion.js';
import {createQuantities} from './quantity.js';
import {updateDOM} from './dom.js';

export async function iniciar(){
const $=window.jQuery,C=AtelierCore,V=AtelierValidation;
let state=C.fresh(),storageOk=true,lastFocus=null,toastTimer,clockTimer;
try{const raw=localStorage.getItem(C.KEY);if(raw)state=C.validate(JSON.parse(raw));}catch(error){storageOk=false;$('#storage-warning').prop('hidden',false).text(error.message);}
const pendingTimers=new Set(),downloadTimers=new Set(),downloadURLs=new Set();
const $content=$('#content');let paintedView='';let quantities=createQuantities($);const motion=createMotion($);
const guide=AtelierGuidedForms.create({$:$,getState:()=>state});
let catalogPage=0,inventoryPage=0,salePage=0,eventPage=0,salesTab='cart',reportTab='ventas';
let eventFrom='',eventTo='',reportFrom='',reportTo='';
const escape = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
const E = escape;
const date = C.localStamp;
const stock = (p) => p.variants.reduce((n, v) => n + v.stock, 0);
const colorHex = {
      Arena: '#c9bda6',
      Negro: '#292d33',
      Oliva: '#7c8366',
      Terracota: '#b25f4c',
      Azul: '#758a9d',
      Blanco: '#eee',
    };
let mode="admin",view="inventario";
const allowed=["inventario"];
const sectionModules=new Map();
sectionModules.set('inventario',await import('./secciones/inventario.js'));

function bind($root, events, selector, handler) {
      const names = events.split(/\s+/).map(e => e + '.atelier').join(' ');
      if (typeof selector === 'function') {
        $root.off(names, selector).on(names, selector);
      } else $root.off(names, selector, handler).on(names, selector, handler);
    }

function releaseDownloads() {
      downloadTimers.forEach(clearTimeout); downloadTimers.clear();
      downloadURLs.forEach(URL.revokeObjectURL); downloadURLs.clear();
    }

function later(fn, ms) {
      const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
      pendingTimers.add(id); return id;
    }

function plantilla(id, datos = []) {
      const elemento = document.getElementById(id);
      if (!elemento) throw Error('No se encontró la plantilla HTML: ' + id);
      const html = elemento.innerHTML.replace(
        /<!--ATELIER_DATO_(\d+)-->|__ATELIER_DATO_(\d+)__|data-atelier-dato-(\d+)(?:="")?/g,
        (marcador, contenido, atributo, booleano) =>
          String(datos[Number(contenido ?? atributo ?? booleano)] ?? ''),
      );

      /* ESTILOS DINÁMICOS CON CSS VÁLIDO.
         El HTML empieza con width: 0% y un color de referencia.
         data-ancho-dato y data-color-dato indican qué posición del arreglo datos usar.
         Los valores calculados se aplican con .css(), después de completar la plantilla.
         Así VS Code puede validar el CSS sin encontrar marcadores como ancho porcentual. */
      const copia = document.createElement('template');
      copia.innerHTML = html;
      copia.content.querySelectorAll('[data-ancho-dato]').forEach((barra) => {
        const indice = Number(barra.getAttribute('data-ancho-dato'));
        const valor = Number(datos[indice]);
        const porcentaje = Number.isFinite(valor) ? Math.max(0, Math.min(valor, 100)) : 0;
        $(barra)
          .css('width', porcentaje + '%')
          .removeAttr('data-ancho-dato');
      });
      copia.content.querySelectorAll('[data-color-dato]').forEach((punto) => {
        const indice = Number(punto.getAttribute('data-color-dato'));
        const color = String(datos[indice] ?? '#aaa');
        $(punto).css('background-color', color).removeAttr('data-color-dato');
      });
      return copia.innerHTML;
    }

function commit(fn) {
      if (!storageOk)
        throw Error(
          'El almacenamiento no está disponible. Importa un respaldo válido antes de continuar.',
        );
      // Detecta cambios guardados por otra pestaña antes de sobrescribir una copia antigua.
      const persisted = localStorage.getItem(C.KEY);
      if (persisted) {
        const latest = C.validate(JSON.parse(persisted));
        if (JSON.stringify(latest) !== JSON.stringify(state)) {
          state = latest;
          throw Error(
            'Los datos cambiaron en otra pestaña. Revisa la información y vuelve a confirmar.',
          );
        }
      }
      const next = C.clone(state);
      const result = fn(next);
      C.validate(next);
      try {
        localStorage.setItem(C.KEY, JSON.stringify(next));
      } catch {
        throw Error(
          'No se pudo guardar. Revisa el espacio o los permisos del navegador. No se aplicaron cambios.',
        );
      }
      state = next;
      return result;
    }

function safe(fn) {
      try {
        const result = fn();
        if (result && typeof result.then === 'function') return result.catch(err => toast(err.message, true));
        return result;
      } catch (err) {
        toast(err.message, true);
        return null;
      }
    }

function toast(message, error = false) {
      clearTimeout(toastTimer);
      $('#toast')
        .stop(true, true)
        .css('border-color', error ? 'var(--red)' : 'var(--accent)')
        .text((error ? '⚠ ' : '✓ ') + message)
        .slideDown(160);
      toastTimer = later(() => $('#toast').stop(true, true).fadeOut(220), 4200);
    }

function modal(title, html) {
      lastFocus = document.activeElement;
      $('#modal-title').text(title);
      $('#modal-body').html(html);
      guide.prepare(document.getElementById('modal-body'));
      quantities.enhance(document.getElementById('modal-body'));
      $('#modal-overlay').stop(true, true).fadeIn(180);
      later(
        () =>
          $('#modal-body').find('input,select,button').filter(':enabled').first().trigger('focus'),
        40,
      );
    }

function closeModal() {
      guide.destroy();
      $('#modal-overlay')
        .stop(true, true)
        .fadeOut(150, () => {
          lastFocus?.focus();
        });
    }

function formError(message) {
      $('#form-error').text(message).attr('role', 'alert').show();
    }

function submitForm(fn) {
      const form = document.querySelector('#modal-body form');
      if (form && !guide.validateAll(form)) return false;
      try {
        fn();
        closeModal();
        render();
        return true;
      } catch (err) {
        formError(err.message);
        return false;
      }
    }

function errorSlot() {
      return '<p id="form-error" class="validation" aria-live="polite" style="display:none"></p>';
    }

function actions(label = 'Guardar operación') {
      return (
        errorSlot() +
        plantilla('tpl-acciones-formulario', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ label,
        ])
      );
    }

function inventory(){ return sectionModules.get('inventario').render({C,state,inventoryPage,tableSize,plantilla,E,stock,setPage:value=>{inventoryPage=value;}}); }

function uiIcon(name) {
      const allowed = [
        'home',
        'grid',
        'box',
        'bag',
        'clock',
        'chart',
        'eye',
        'sliders',
        'help',
        'menu',
        'sun',
        'moon',
        'bell',
        'file',
        'backup',
        'left',
        'right',
      ];
      const file = allowed.includes(name) ? name : 'help';
      return '<img class="ui-icon" src="img/iconos/' + file + '.svg" alt="" aria-hidden="true">';
    }

function tableSize() {
      return window.innerWidth <= 650 ? 4 : 6;
    }

function mountPager(kind, page, target) {
      $(target).html(
        plantilla('tpl-pagination', [
          kind,
          page.start +
            '–' +
            page.end +
            ' de ' +
            page.total +
            ' · Página ' +
            (page.page + 1) +
            ' / ' +
            page.pages,
          page.page === 0 ? 'disabled' : '',
          page.page === page.pages - 1 ? 'disabled' : '',
        ]),
      );
    }

function productForm(id) {
      const p = state.products.find((p) => p.id === id);
      modal(
        p ? 'Editar prenda' : 'Nueva prenda',
        plantilla('tpl-formulario-prenda', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ p?.id || 0,
          /* Dato 1: completa el marcador del mismo número en index.html. */
          E(p?.name || ''),
          /* Dato 2: completa el marcador del mismo número en index.html. */
          E(p?.category || ''),
          /* Dato 3: completa el marcador del mismo número en index.html. */
          [...new Set(state.products.map((p) => p.category))]
            .map((c) =>
              plantilla('tpl-formulario-prenda-2', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ E(c),
              ]),
            )
            .join(''),
          /* Dato 4: completa el marcador del mismo número en index.html. */
          p?.price || '',
          /* Dato 5: completa el marcador del mismo número en index.html. */
          p?.discount || 0,
          /* Dato 6: completa el marcador del mismo número en index.html. */
          ['shirt', 'jacket', 'pants', 'red', 'jeans', 'white', 'dress', 'bag']
            .map((x, i) =>
              plantilla('tpl-formulario-prenda-3', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ x,
                /* Dato 1: completa el marcador del mismo número en index.html. */
                p?.image === x ? 'selected' : '',
                /* Dato 2: completa el marcador del mismo número en index.html. */
                [
                  'Camiseta',
                  'Chaqueta',
                  'Pantalón',
                  'Camiseta roja',
                  'Jean',
                  'Camisa',
                  'Vestido',
                  'Bolso',
                ][i],
              ]),
            )
            .join(''),
          /* Dato 7: completa el marcador del mismo número en index.html. */
          E(p?.description || ''),
          /* Dato 8: completa el marcador del mismo número en index.html. */
          !p
            ? '<div class="field"><label for="p-sizes">Tallas (separadas por coma)</label><input id="p-sizes" maxlength="100" value="S, M, L" required></div><div class="field"><label for="p-colors">Colores (separados por coma)</label><input id="p-colors" maxlength="100" value="Negro" required></div><div class="field wide"><label for="p-stock">Existencias iniciales por variante</label><input id="p-stock" type="number" min="0" max="1000000" value="0" required></div>'
            : '<div class="field wide"><label><input type="checkbox" id="p-active" ' +
              (p.active ? 'checked' : '') +
              '> Prenda activa en el catálogo</label></div>',
          /* Dato 9: completa el marcador del mismo número en index.html. */
          actions('Guardar prenda'),
        ]),
      );
    }

function movementForm(id) {
      const products = state.products;
      modal(
        'Registrar operación',
        plantilla('tpl-formulario-operacion', [
          /* Dato 0: completa el marcador del mismo número en index.html. */
          products
            .map((p) =>
              plantilla('tpl-formulario-operacion-2', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ p.id,
                /* Dato 1: completa el marcador del mismo número en index.html. */
                p.id === id ? 'selected' : '',
                /* Dato 2: completa el marcador del mismo número en index.html. */
                E(p.name),
                /* Dato 3: completa el marcador del mismo número en index.html. */
                p.active ? '' : ' · Inactiva',
              ]),
            )
            .join(''),
          /* Dato 1: completa el marcador del mismo número en index.html. */
          actions(),
        ]),
      );
      updateMovementVariant();
    }

function updateMovementVariant() {
      const p = state.products.find((p) => p.id === Number($('#movement-product').val()));
      const $select = $('#movement-variant').empty();
      p.variants
        .slice()
        .reverse()
        .forEach((v, index) =>
          $select.prepend(
            plantilla('tpl-opcion-stock', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              p.variants.length - 1 - index,
              /* Dato 1: completa el marcador del mismo número en index.html. */
              E(v.size),
              /* Dato 2: completa el marcador del mismo número en index.html. */
              E(v.color),
              /* Dato 3: completa el marcador del mismo número en index.html. */
              v.stock,
            ]),
          ),
        );
      $select.val('0');
    }

function tick() {
      $('.today').text(
        new Date().toLocaleDateString('es-BO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }) +
          ' · ' +
          new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
      );
    }
bind($(document), 'click', '[data-go]', function () {
      const next = $(this).data('go');
      location.hash = next;
      navigate(next);
    });

bind($('#hamburger'), 'click', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this).attr('aria-expanded', String(!open));
      $('#sidebar').stop(true, true).slideToggle(180);
    });

bind($('#theme'), 'click', () => {
      const light = $('body').toggleClass('light').is('.light');
      safe(() => localStorage.setItem('atelier.theme', light ? 'light' : 'dark'));
      $('#theme')
        .attr('aria-label', light ? 'Activar modo oscuro' : 'Activar modo claro')
        .html(uiIcon(light ? 'moon' : 'sun'));
    });

bind($('#new-event'), 'click', () => movementForm());

bind($('#close-modal'), 'click', closeModal);

bind($(document), 'click', '[data-close]', closeModal);

bind($('#modal-overlay'), 'click', function (e) {
      if (e.target === this) closeModal();
    });

bind($(document), 'keydown', function (e) {
      if (!$('#modal-overlay').is(':visible')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
      if (e.key === 'Tab') {
        const controls = $('#modal')
          .find('button,input,select,textarea,a[href]')
          .filter(':visible:enabled');
        const first = controls.first()[0],
          last = controls.eq(-1)[0];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    });

bind($content, 'click', '#add-product', () => productForm());

bind($content, 'click', '[data-edit]', function () {
      productForm(Number($(this).data('edit')));
    });

bind($content, 'click', '[data-stock]', function () {
      movementForm(Number($(this).data('stock')));
    });

bind($('#modal-body'), 'input', 'input,textarea', function () {
      if (guide.owns(this)) {
        guide.refresh();
        return;
      }
      const invalid = !this.checkValidity();
      $(this).toggleClass('invalid', invalid).attr('aria-invalid', String(invalid));
    });

bind($('#modal-body'), 'submit', '#product-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        const id = Number($(this).data('id'));
        const name = String($('#p-name').val()).trim(),
          category = String($('#p-category').val()).trim(),
          description = String($('#p-description').val()).trim(),
          price = Number($('#p-price').val()),
          discount = Number($('#p-discount').val()),
          image = $('#p-image').val();
        const fieldValues = Object.fromEntries(
          [...this.querySelectorAll('input,select,textarea')]
            .filter((el) => el.id)
            .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value]),
        );
        for (const [key, value] of Object.entries(fieldValues)) {
          const message = V.field(key, value, { state, values: fieldValues });
          if (message) throw Error(message);
        }
        if (
          !/\S.{1,99}/u.test(name) ||
          !category ||
          !description ||
          !Number.isFinite(price) ||
          price <= 0
        )
          throw Error('Completa los datos de la prenda.');
        commit((s) => {
          if (id) {
            const p = s.products.find((p) => p.id === id);
            const active = $('#p-active').prop('checked');
            Object.assign(p, {
              name,
              category,
              description,
              price,
              discount,
              image,
              active,
            });
            if (!active) s.cart = s.cart.filter((i) => i.productId !== id);
            C.event(
              s,
              'Producto',
              `Prenda actualizada: ${name} · ${active ? 'Activa' : 'Inactiva'}`,
            );
          } else {
            const parts = (x) => [
              ...new Set(
                String(x)
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ];
            const sizes = parts($('#p-sizes').val()),
              colors = parts($('#p-colors').val()),
              qty = Number($('#p-stock').val());
            if (
              !sizes.length ||
              !colors.length ||
              sizes.length * colors.length > 100 ||
              !C.integer(qty, 0)
            )
              throw Error('Revisa tallas, colores y existencias iniciales.');
            const p = {
              id: s.nextProduct++,
              name,
              category,
              description,
              price,
              discount,
              image,
              active: true,
              variants: colors.flatMap((color) =>
                sizes.map((size) => ({ size, color, stock: qty })),
              ),
            };
            s.products.push(p);
            C.event(
              s,
              'Producto',
              `Nueva prenda: ${name} · ${p.variants.length} variantes · ${qty} unidades por variante`,
            );
          }
        });
        toast('Prenda guardada correctamente.');
      });
    });

bind($('#modal-body'), 'change', '#movement-product', updateMovementVariant);

bind($('#modal-body'), 'change', '#movement-type', function () {
      const adjust = $(this).val() === 'Ajuste';
      $('#qty-label').text(adjust ? 'Existencias finales' : 'Unidades a ingresar');
      $('#movement-qty').attr('min', adjust ? 0 : 1);
    });

bind($('#modal-body'), 'submit', '#movement-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        const id = Number($('#movement-product').val()),
          p = state.products.find((p) => p.id === id),
          v = p.variants[Number($('#movement-variant').val())];
        commit((s) =>
          C.movement(s, {
            type: $('#movement-type').val(),
            productId: id,
            size: v.size,
            color: v.color,
            qty: Number($('#movement-qty').val()),
            reason: $('#movement-reason').val(),
          }),
        );
        toast('Operación registrada con fecha y hora automáticas.');
      });
    });

// Composición del recorte: solo abre las vistas incluidas. Las operaciones se ejecutan en las funciones extraídas.
function render(){
 if(view==='catalogo'){$content.html(filters()+'<div id="catalog-grid" class="products catalog-products"></div><div id="catalog-pagination"></div>');filterProducts();}
 if(view==='ventas'){$content.html(sales());applySalesTab();mountPager('ventas',C.paginate(state.sales,salePage,tableSize()),'#sales-pagination');if(mode==='cliente')$('#sale-channel').val('Web');}
 if(view==='eventos'){$content.html(events());$('#event-from').val(eventFrom);$('#event-to').val(eventTo);renderEvents();}
 if(view==='inventario'){$content.html(inventory());mountPager('inventario',C.paginate(state.products,inventoryPage,tableSize()),'#inventory-pagination');}
 if(view==='operacion')$content.empty();
 quantities.enhance();if(typeof cartBadge==='function')cartBadge();
}
function navigate(next){if(!allowed.includes(next))return;view=next;pendingTimers.forEach(clearTimeout);pendingTimers.clear();$('nav [data-view]').removeClass('active').filter('[data-view="'+view+'"]').addClass('active');render();$('#sidebar').stop(true,true).slideUp(140);$('#hamburger').attr('aria-expanded','false');}
bind($('nav'),'click','[data-view]',function(){navigate(this.dataset.view);});
bind($(window),'hashchange',()=>navigate(location.hash.slice(1)));
document.body.classList.toggle('customer-view',mode==='cliente');
$('#profile-name').text(mode==='cliente'?'Cliente':'Administrador');
try{if(localStorage.getItem('atelier.theme')==='light')$('body').addClass('light');}catch{}
window.AtelierDestroy=()=>{guide.destroy();quantities.destroy();clearInterval(clockTimer);clearTimeout(toastTimer);releaseDownloads();motion.destroy();pendingTimers.forEach(clearTimeout);pendingTimers.clear();$(window).add(document).add('nav,#content,#modal-body,#hamburger,#theme,#new-event,#notifications,#close-modal,#modal-overlay,#import-file,#help').off('.atelier');};
window.addEventListener('pagehide',()=>window.AtelierDestroy(),{once:true});
tick();clockTimer=setInterval(tick,30000);
window.AtelierParte={get state(){return state},get view(){return view},navigate,render,detail:typeof detail==='function'?detail:null,quantity(){return quantities},C};
navigate(allowed.includes(location.hash.slice(1))?location.hash.slice(1):allowed[0]);
document.body.dataset.preparado='si';window.dispatchEvent(new Event('atelier:preparado'));

}
