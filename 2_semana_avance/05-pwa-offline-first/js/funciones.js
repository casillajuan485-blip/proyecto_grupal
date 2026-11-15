import {AtelierCore} from './core.js';
import {AtelierValidation,AtelierGuidedForms} from './validaciones.js';
import {createMotion} from './motion.js';
import {createQuantities} from './quantity.js';
import {updateDOM} from './dom.js';
import {ready} from './data-loader.js';
await ready;
import {initPwa} from './pwa.js';

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
let mode="cliente",view="catalogo";
const allowed=["catalogo", "ventas"];
const sectionModules=new Map();
await initPwa();

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

function cartBadge() {
      const count = state.cart.reduce((n, i) => n + i.qty, 0);
      $('#cart-count').text(count);
      $('.dock-count')
        .text(count)
        .prop('hidden', count === 0);
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

function card(p) {
      const qty = stock(p);
      return plantilla('tpl-tarjeta-prenda', [
        /* Dato 0: completa el marcador del mismo número en index.html. */ p.id,
        /* Dato 1: completa el marcador del mismo número en index.html. */
        E(p.category),
        /* Dato 2: completa el marcador del mismo número en index.html. */
        p.image,
        /* Dato 3: completa el marcador del mismo número en index.html. */
        E(p.name),
        /* Dato 4: completa el marcador del mismo número en index.html. */
        !qty
          ? 'AGOTADO'
          : p.discount
            ? '−' + p.discount + '% · OFERTA'
            : p.id < 4
              ? 'ESENCIALES'
              : 'COLECCIÓN ATELIER',
        /* Dato 5: completa el marcador del mismo número en index.html. */
        E(p.category),
        /* Dato 6: completa el marcador del mismo número en index.html. */
        E(p.name),
        /* Dato 7: completa el marcador del mismo número en index.html. */
        C.money(C.price(p)),
        /* Dato 8: completa el marcador del mismo número en index.html. */
        qty <= 10 ? 'low' : '',
        /* Dato 9: completa el marcador del mismo número en index.html. */
        qty,
        /* Dato 10: completa el marcador del mismo número en index.html. */
        E([...new Set(p.variants.map((v) => v.color))].join(', ')),
        /* Dato 11: completa el marcador del mismo número en index.html. */
        [...new Set(p.variants.map((v) => v.color))]
          .map((c) =>
            plantilla('tpl-tarjeta-prenda-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              colorHex[c] || '#aaa',
            ]),
          )
          .join(''),
        /* Dato 12: completa el marcador del mismo número en index.html. */
        p.id,
        /* Dato 13: una prenda totalmente agotada no permite iniciar la compra. */
        qty ? '' : 'disabled',
        E(p.description),
      ]);
    }

function filters() {
      return plantilla('tpl-filtros-catalogo', [
        /* Dato 0: completa el marcador del mismo número en index.html. */
        [...new Set(state.products.filter((p) => p.active).map((p) => p.category))]
          .map((c) =>
            plantilla('tpl-filtros-catalogo-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(c),
            ]),
          )
          .join(''),
        /* Dato 1: completa el marcador del mismo número en index.html. */
        [...new Set(state.products.flatMap((p) => p.variants.map((v) => v.size)))]
          .map((s) =>
            plantilla('tpl-filtros-catalogo-3', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(s),
            ]),
          )
          .join(''),
        /* Dato 2: completa el marcador del mismo número en index.html. */
        [...new Set(state.products.flatMap((p) => p.variants.map((v) => v.color)))]
          .map((c) =>
            plantilla('tpl-filtros-catalogo-4', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(c),
            ]),
          )
          .join(''),
      ]);
    }

function filterProducts(resetPage = true) {
      if (resetPage !== false) catalogPage = 0;
      const q = String($('#search').val() || '').toLocaleLowerCase();
      const cat = $('#category').val(),
        size = $('#size-filter').val(),
        color = $('#color-filter').val();
      const min = $('#min-price').val(),
        max = $('#max-price').val();
      let list = state.products.filter(
        (p) =>
          p.active &&
          p.name.toLocaleLowerCase().includes(q) &&
          (!cat || p.category === cat) &&
          p.variants.some(
            (v) =>
              (!size || v.size === size) &&
              (!color || v.color === color) &&
              (!$('#in-stock').prop('checked') || v.stock > 0),
          ) &&
          (!$('#offers').prop('checked') || p.discount > 0) &&
          (min === '' || C.price(p) >= Number(min)) &&
          (max === '' || C.price(p) <= Number(max)),
      );
      const order = $('#sort').val();
      list.sort((a, b) =>
        order === 'low'
          ? C.price(a) - C.price(b)
          : order === 'high'
            ? C.price(b) - C.price(a)
            : order === 'name'
              ? a.name.localeCompare(b.name)
              : b.id - a.id,
      );
      const page = C.paginate(list, catalogPage, catalogSize());
      catalogPage = page.page;
      $('#results').text(list.length + ' prendas encontradas');
      mountPager('catalogo', page, '#catalog-pagination');
      $('#catalog-grid')
        .stop(true, true)
        .fadeTo(70, 0.35, function () {
          updateDOM(this, page.items.map(card).join(''));
          if (!list.length)
            $(this).append('<p class="empty">No encontramos prendas con esos filtros.</p>');
          $(this).fadeTo(100, 1);
        });
    }

function cartRows() {
      return state.cart
        .map((i, index) => {
          const { p, v } = C.variant(state, i.productId, i.size, i.color);
          return plantilla('tpl-fila-carrito', [
            /* Dato 0: completa el marcador del mismo número en index.html. */ E(p.name),
            /* Dato 1: completa el marcador del mismo número en index.html. */
            E(i.size),
            /* Dato 2: completa el marcador del mismo número en index.html. */
            E(i.color),
            /* Dato 3: completa el marcador del mismo número en index.html. */
            v.stock,
            /* Dato 4: completa el marcador del mismo número en index.html. */
            C.money(C.price(p)),
            /* Dato 5: completa el marcador del mismo número en index.html. */
            index,
            /* Dato 6: completa el marcador del mismo número en index.html. */
            v.stock,
            /* Dato 7: completa el marcador del mismo número en index.html. */
            i.qty,
            /* Dato 8: completa el marcador del mismo número en index.html. */
            E(p.name),
            /* Dato 9: completa el marcador del mismo número en index.html. */
            C.money(C.price(p) * i.qty),
            /* Dato 10: completa el marcador del mismo número en index.html. */
            index,
            /* Dato 11: completa el marcador del mismo número en index.html. */
            E(p.name),
          ]);
        })
        .join('');
    }

function sales() {
      const total = C.round(
        state.cart.reduce(
          (n, i) => n + C.price(state.products.find((p) => p.id === i.productId)) * i.qty,
          0,
        ),
      );
      const page = C.paginate(
        mode === 'admin' ? state.sales.slice().reverse() : [],
        salePage,
        tableSize(),
      );
      salePage = page.page;
      return plantilla('tpl-vista-ventas', [
        /* Dato 0: completa el marcador del mismo número en index.html. */
        state.cart.length
          ? plantilla('tpl-vista-ventas-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ cartRows(),
            ])
          : '<p class="empty">El carrito espera tu próxima selección.</p>',
        /* Dato 1: completa el marcador del mismo número en index.html. */
        state.cart.reduce((n, i) => n + i.qty, 0),
        /* Dato 2: completa el marcador del mismo número en index.html. */
        C.money(total),
        /* Dato 3: completa el marcador del mismo número en index.html. */
        state.cart.length ? '' : 'disabled',
        /* Dato 4: completa el marcador del mismo número en index.html. */
        page.items
          .map((s) =>
            plantilla('tpl-vista-ventas-3', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              String(s.id).padStart(4, '0'),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              s.demo ? '<small>Demostración</small>' : '',
              /* Dato 2: completa el marcador del mismo número en index.html. */
              date(s.at),
              /* Dato 3: completa el marcador del mismo número en index.html. */
              s.channel,
              /* Dato 4: completa el marcador del mismo número en index.html. */
              C.money(s.total),
              /* Dato 5: completa el marcador del mismo número en index.html. */
              s.items.some((i) => i.returned) ? '<small>Con devolución</small>' : '',
              /* Dato 6: completa el marcador del mismo número en index.html. */
              s.status,
              /* Dato 7: completa el marcador del mismo número en index.html. */
              s.id,
              /* Dato 8: completa el marcador del mismo número en index.html. */
              ['Pendiente', 'Confirmado'].includes(s.status)
                ? plantilla('tpl-vista-ventas-4', [
                    /* Dato 0: completa el marcador del mismo número en index.html. */ s.id,
                  ])
                : s.status === 'Entregado' && s.items.some((i) => i.returned < i.qty)
                  ? plantilla('tpl-vista-ventas-5', [
                      /* Dato 0: completa el marcador del mismo número en index.html. */ s.id,
                    ])
                  : '',
            ]),
          )
          .join('') || '<tr><td colspan="6" class="empty">Aún no hay ventas registradas.</td></tr>',
      ]);
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

function catalogSize() {
      return window.innerWidth <= 650 ? 2 : window.innerWidth <= 1100 ? 3 : 4;
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

function applySalesTab() {
      const history = mode === 'admin' && salesTab === 'history';
      $('#cart-panel').prop('hidden', history);
      $('#sales-history-panel').prop('hidden', !history);
      $('[data-sales-tab]').each(function () {
        $(this).attr('aria-pressed', String($(this).data('sales-tab') === salesTab));
      });
    }

function variantOptions(p) {
      return p.variants
        .map((v, i) =>
          plantilla('tpl-opcion-variante', [
            /* Dato 0: completa el marcador del mismo número en index.html. */ i,
            /* Dato 1: completa el marcador del mismo número en index.html. */
            E(v.size),
            /* Dato 2: completa el marcador del mismo número en index.html. */
            E(v.color),
            /* Dato 3: completa el marcador del mismo número en index.html. */
            v.stock,
          ]),
        )
        .join('');
    }

function detail(id, purchase = false) {
      const p = state.products.find((p) => p.id === id);
      if (!p) return;
      modal(
        purchase ? 'Comprar · ' + p.name : p.name,
        plantilla('tpl-detalle-prenda', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ p.image,
          /* Dato 1: completa el marcador del mismo número en index.html. */
          E(p.name),
          /* Dato 2: completa el marcador del mismo número en index.html. */
          E(p.description),
          /* Dato 3: completa el marcador del mismo número en index.html. */
          C.money(C.price(p)),
          /* Dato 4: completa el marcador del mismo número en index.html. */
          p.discount
            ? plantilla('tpl-detalle-prenda-2', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ p.discount,
              ])
            : '',
          /* Dato 5: completa el marcador del mismo número en index.html. */
          p.id,
          /* Dato 6: completa el marcador del mismo número en index.html. */
          variantOptions(p),
          /* Dato 7: completa el marcador del mismo número en index.html. */
          E(p.category),
          /* Dato 8: completa el marcador del mismo número en index.html. */
          actions(purchase ? 'Continuar al carrito →' : 'Agregar al carrito ＋'),
        ]),
      );
      // Comprar solicita primero talla y cantidad; no descuenta stock ni confirma la venta todavía.
      $('#cart-form').data('buy-now', purchase);
      if (purchase) $('#modal-body').find('.detail-photo').hide();
      updateCartMax();
    }

function updateCartMax() {
      const p = state.products.find((p) => p.id === Number($('#cart-form').data('id')));
      const v = p?.variants[Number($('#cart-variant').val())];
      if (v) {
        const inCart =
          state.cart.find((i) => i.productId === p.id && i.size === v.size && i.color === v.color)
            ?.qty || 0;
        const remaining = Math.max(0, v.stock - inCart);
        $('#cart-quantity').attr('max', remaining);
        $('#cart-form button[type="submit"]').prop('disabled', !remaining);
        guide.refresh();
      }
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
bind($content, 'click', '[data-paginate]', function () {
      const kind = $(this).data('paginate'),
        direction = Number($(this).data('direction'));
      if (kind === 'catalogo') {
        catalogPage += direction;
        filterProducts(false);
      } else if (kind === 'inventario') {
        inventoryPage += direction;
        render();
      } else {
        salePage += direction;
        render();
      }
    });

bind($content, 'click', '[data-sales-tab]', function () {
      salesTab = $(this).data('sales-tab');
      applySalesTab();
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

bind($content, 'click', '[data-detail]', function () {
      detail(Number($(this).data('detail')));
    });

bind($content, 'click', '[data-buy]', function () {
      detail(Number($(this).data('buy')), true);
    });

bind($content, 
      'input change',
      '#catalog-filters input,#catalog-filters select,#extra-filters input,#extra-filters select',
      debounce(filterProducts),
    );

bind($content, 'click', '#more-filters', function () {
      $('#extra-filters').stop(true, true).slideToggle(180);
      $(this).attr('aria-expanded', String($(this).attr('aria-expanded') !== 'true'));
    });

bind($content, 'click', '#clear-filters', () => {
      $('#catalog-filters input,#extra-filters input').not('[type=checkbox]').val('');
      $('#catalog-filters select,#extra-filters select').val('');
      $('#sort').val('new');
      $('#extra-filters input[type=checkbox]').prop('checked', false);
      filterProducts();
      $('#search')
        .addClass('guided')
        .delay(700)
        .queue(function (next) {
          $(this).removeClass('guided');
          next();
        })
        .trigger('focus');
    });

bind($('#modal-body'), 'click', '#product-details-toggle', function () {
      $(this).next().stop(true, true).slideToggle(160);
      $(this).attr('aria-expanded', String($(this).attr('aria-expanded') !== 'true'));
    });

bind($('#modal-body'), 'change', '#cart-variant', () => { updateCartMax(); quantities.enhance(); });

bind($('#modal-body'), 'submit', '#cart-form', function (e) {
      e.preventDefault();
      const purchase = $(this).data('buy-now') === true;
      const saved = submitForm(() => {
        const id = Number($(this).data('id')),
          p = state.products.find((p) => p.id === id),
          v = p.variants[Number($('#cart-variant').val())],
          qty = Number($('#cart-quantity').val());
        if (!C.integer(qty, 1)) throw Error('Introduce una cantidad entera válida.');
        commit((s) => {
          const existing = s.cart.find(
            (i) => i.productId === id && i.size === v.size && i.color === v.color,
          );
          if (qty + (existing?.qty || 0) > v.stock)
            throw Error('La cantidad solicitada supera las existencias, incluyendo el carrito.');
          if (existing) existing.qty += qty;
          else s.cart.push({ productId: id, size: v.size, color: v.color, qty });
        });
        toast('Prenda agregada al carrito.');
      });
      if (saved && purchase) {
        history.replaceState(null, '', '#ventas');
        navigate('ventas');
        later(() => $('#page-title').attr('tabindex', '-1').trigger('focus'), 180);
      }
    });

bind($content, 'change', '[data-cart-qty]', function () {
      const index = Number($(this).data('cart-qty')),
        qty = Number($(this).val());
      safe(() =>
        commit((s) => {
          const i = s.cart[index],
            { v } = C.variant(s, i.productId, i.size, i.color);
          if (!C.integer(qty, 1) || qty > v.stock)
            throw Error('La cantidad debe ser entera y no superar las existencias.');
          i.qty = qty;
        }),
      );
      render();
    });

bind($content, 'click', '[data-remove]', function () {
      safe(() =>
        commit((s) => {
          s.cart.splice(Number($(this).data('remove')), 1);
        }),
      );
      render();
    });

bind($content, 'click', '#checkout', () => {
      const channel = $('#sale-channel').val();
      modal(
        'Confirmar ' + (channel === 'Web' ? 'pedido' : 'venta'),
        plantilla('tpl-dialogo-interaccion', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ channel,
          /* Dato 1: completa el marcador del mismo número en index.html. */
          actions('Confirmar registro'),
        ]),
      );
    });

bind($('#modal-body'), 'submit', '#checkout-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        const sale = commit((s) => C.sell(s, $(this).data('channel')));
        if (mode === 'admin') {
          salesTab = 'history';
          salePage = 0;
        }
        toast('Operación #' + sale.id + ' registrada. Fecha y hora añadidas.');
      });
    });

bind($content, 'click', '[data-flip]', function () {
      const card = this.closest('.product');
      const open = !card.classList.contains('is-flipped');
      card.classList.toggle('is-flipped', open);
      $(card).find('[data-flip]').attr('aria-expanded', String(open));
      $(card).find('.card-back').prop('hidden', !open);
      $(card).children('.photo,.product-info').prop('inert', open);
      $(card).find(open ? '.card-back button' : '.flip-open').first().trigger('focus');
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
