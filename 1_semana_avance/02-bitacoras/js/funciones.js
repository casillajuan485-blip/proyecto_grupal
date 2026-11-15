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
let mode="admin",view="eventos";
const allowed=["eventos"];
const sectionModules=new Map();
sectionModules.set('eventos',await import('./secciones/eventos.js'));

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

function debounce(fn, ms = 240) {
      let timer;
      const wrapped = (...args) => { clearTimeout(timer); pendingTimers.delete(timer); timer = later(() => fn(...args), ms); };
      wrapped.cancel = () => { clearTimeout(timer); pendingTimers.delete(timer); };
      return wrapped;
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

function events(){ return sectionModules.get('eventos').render({plantilla,state,C}); }

function filteredEvents() {
      const q = String($('#event-search').val() || '').toLowerCase(),
        type = $('#event-type').val(),
        source = $('#event-source').val(),
        from = eventFrom,
        to = eventTo;
      return state.events
        .filter((e) => {
          const d = new Date(e.at);
          const day = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0'),
          ].join('-');
          return (
            (!q || e.description.toLowerCase().includes(q) || String(e.id).includes(q)) &&
            (!type || e.type === type) &&
            (!source || e.demo === (source === 'demo')) &&
            (!from || day >= from) &&
            (!to || day <= to)
          );
        })
        .reverse();
    }

function renderEvents() {
      const list = filteredEvents();
      const page = C.paginate(list, eventPage, window.innerWidth <= 650 ? 2 : 5);
      eventPage = page.page;
      $('#event-rows').html(
        page.items
          .map((e) =>
            plantilla('tpl-fila-evento', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              String(e.id).padStart(4, '0'),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              E(e.type),
              /* Dato 2: completa el marcador del mismo número en index.html. */
              E(e.description),
              /* Dato 3: completa el marcador del mismo número en index.html. */
              e.demo ? '<small>DEMOSTRACIÓN</small>' : '',
              /* Dato 4: completa el marcador del mismo número en index.html. */
              E(e.actor),
              /* Dato 5: completa el marcador del mismo número en index.html. */
              date(e.at),
            ]),
          )
          .join('') || '<tr><td colspan="5" class="empty">No hay eventos que coincidan.</td></tr>',
      );
      $('#event-range').text(
        list.length
          ? `${page.start}–${page.end} de ${list.length} eventos · Página ${page.page + 1} / ${page.pages}`
          : '0 eventos',
      );
      $('#prev-page').prop('disabled', eventPage === 0);
      $('#next-page').prop('disabled', eventPage === page.pages - 1);
    }

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

function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      downloadURLs.add(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloadURLs.delete(url); downloadTimers.delete(timer); }, 2000); downloadTimers.add(timer);
    }

function csv(name, rows) {
      const cell = (v) => {
        let s = String(v ?? '');
        if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      download(
        name,
        '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n'),
        'text/csv;charset=utf-8',
      );
    }

function applyDates(kind) {
      const from = $('#' + kind + '-from'),
        to = $('#' + kind + '-to');
      const error =
        from[0].validity.badInput || to[0].validity.badInput
          ? 'Completa el día, mes y año de cuatro cifras.'
          : V.range(String(from.val() || ''), String(to.val() || ''));
      from.add(to).attr('aria-invalid', String(!!error));
      $('#' + kind + '-date-note')
        .text(error || 'Fechas aplicadas.')
        .toggleClass('date-error', !!error);
      if (error) {
        toast(error, true);
        return false;
      }
      if (kind === 'report') {
        reportFrom = String(from.val() || '');
        reportTo = String(to.val() || '');
      } else {
        eventFrom = String(from.val() || '');
        eventTo = String(to.val() || '');
      }
      return true;
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
bind($content, 'click', '#event-more-filters', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this).attr('aria-expanded', String(!open));
      $('#event-extra-filters').stop(true, true).slideToggle(150);
    });

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

bind($content, 'input change', '#event-search,#event-type,#event-source', debounce(() => {
      eventPage = 0;
      renderEvents();
    }));

bind($content, 'click', '#prev-page', () => {
      eventPage--;
      renderEvents();
    });

bind($content, 'click', '#next-page', () => {
      eventPage++;
      renderEvents();
    });

bind($content, 'click', '#load-demo', () =>
      modal(
        'Cargar datos de demostración',
        plantilla('tpl-dialogo-interaccion-8', [
          /* Dato 0: completa el marcador del mismo número en index.html. */
          actions('Cargar 200 eventos'),
        ]),
      ),
    );

bind($('#modal-body'), 'submit', '#demo-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        commit(C.demo);
        toast('200 eventos de demostración creados y guardados.');
      });
    });

bind($content, 'click', '[data-events-csv]', () =>
      csv('atelier-eventos.csv', [
        ['ID', 'Tipo', 'Descripción', 'Responsable', 'Fecha ISO (dispositivo)', 'Demo'],
        ...filteredEvents().map((e) => [
          e.id,
          e.type,
          e.description,
          e.actor,
          e.at,
          e.demo ? 'Sí' : 'No',
        ]),
      ]),
    );

bind($content, 'click', '#apply-event-period', () => {
      if (!applyDates('event')) return;
      eventPage = 0;
      renderEvents();
    });

bind($content, 'click', '#clear-event-period', () => {
      eventFrom = '';
      eventTo = '';
      $('#event-from,#event-to').val('').attr('aria-invalid', 'false');
      $('#event-date-note').text('Se muestran todas las fechas.');
      eventPage = 0;
      renderEvents();
    });

bind($content, 'input', '#report-from,#report-to,#event-from,#event-to', function () {
      const kind = this.id.startsWith('report') ? 'report' : 'event';
      $('#' + kind + '-date-note')
        .text('Completa el año de cuatro cifras y pulsa Aplicar.')
        .removeClass('date-error');
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
