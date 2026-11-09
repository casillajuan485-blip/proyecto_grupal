/* ATELIER · Aplicación frontend. jQuery 3.7.1. Sin servidor ni base de datos. */
'use strict';
/* 1. LÓGICA DEL NEGOCIO.
   Este objeto reúne datos, validaciones, ventas, inventario, bitácora y respaldos.
   No depende de la interfaz: por eso se puede verificar sin abrir el navegador. */
// Comparte las mismas reglas con el guardado, la importación y los formularios.
const V =
  typeof module !== 'undefined'
    ? require('./validaciones.js').AtelierValidation
    : AtelierValidation;
const AtelierCore = (() => {
  // Nombre de la entrada donde localStorage guarda todos los datos del negocio.
  const KEY = 'atelier.store.v1';
  // Tipos de operaciones admitidas: son eventos de negocio, distintos de los clics de jQuery.
  const TYPES = ['Venta', 'Entrada', 'Devolución', 'Ajuste', 'Producto', 'Estado'];
  // Presenta importes en bolivianos; cambia es-BO y BOB si la tienda usa otra moneda.
  // El prefijo se escribe de forma explícita para que nunca se confunda con dólares.
  const money = (n) =>
    'Bs ' +
    new Intl.NumberFormat('es-BO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  // Redondea cálculos monetarios a dos decimales.
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Catálogo de referencia. Cada fila define nombre, categoría, precio, descripción, foto, colores y existencias base.
  const initialProducts = [
    [
      'Camiseta Essential',
      'Camisetas',
      89,
      'Corte relajado, algodón suave y un básico que combina con todo.',
      'shirt',
      ['Arena', 'Negro'],
      18,
    ],
    [
      'Chaqueta Urban',
      'Chaquetas',
      349,
      'Chaqueta de textura efecto cuero. Una capa con carácter para todos los días.',
      'jacket',
      ['Negro'],
      8,
    ],
    [
      'Pantalón Tailored',
      'Pantalones',
      229,
      'Silueta recta y tejido cómodo para acompañarte del trabajo al fin de semana.',
      'pants',
      ['Oliva', 'Negro'],
      12,
    ],
    [
      'Camiseta Signature',
      'Camisetas',
      99,
      'Camiseta de algodón con estampado para un estilo casual y relajado.',
      'red',
      ['Blanco'],
      16,
    ],
    [
      'Jean Straight',
      'Pantalones',
      249,
      'Denim de corte recto y acabado versátil. Tu próximo favorito.',
      'jeans',
      ['Azul'],
      10,
    ],
    [
      'Camisa Studio',
      'Camisas',
      179,
      'Camisa de manga larga y líneas limpias para un estilo sin esfuerzo.',
      'white',
      ['Blanco', 'Arena'],
      14,
    ],
    [
      'Vestido Aura',
      'Vestidos',
      289,
      'Vestido fluido de largo midi, con una silueta ligera y elegante.',
      'dress',
      ['Negro', 'Arena'],
      7,
    ],
    [
      'Bolso Everyday',
      'Accesorios',
      159,
      'Bolso práctico de acabado resistente para llevar tus esenciales.',
      'bag',
      ['Negro'],
      9,
    ],
  ];
  /* ESTADO INICIAL. Construye el catálogo de ejemplo, sus variantes y las listas vacías de eventos, ventas y carrito. Se usa cuando el navegador aún no tiene datos. */
  /* FECHA LOCAL LEGIBLE. El dato original sigue almacenado en ISO.
     Esta presentación usa YYYY-MM-DD HH:mm:ss y añade segundos, sin afirmar hora de servidor. */
  /* PAGINACIÓN SIN PÉRDIDA DE DATOS. Solo limita lo que se muestra por pantalla.
     Ajusta una página fuera de rango y conserva el arreglo original sin modificarlo. */
  function paginate(items, page, size) {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1));
    const start = current * size;
    return {
      items: items.slice(start, start + size),
      page: current,
      pages,
      total: items.length,
      start: items.length ? start + 1 : 0,
      end: Math.min(start + size, items.length),
    };
  }
  function localStamp(value) {
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }
  function fresh() {
    return {
      version: 1,
      products: initialProducts.map((p, i) => ({
        id: i + 1,
        name: p[0],
        category: p[1],
        price: p[2],
        description: p[3],
        image: p[4],
        active: true,
        discount: i === 3 ? 10 : 0,
        variants: p[5].flatMap((color) =>
          (i === 7 ? ['Única'] : ['S', 'M', 'L']).map((size, j) => ({
            size,
            color,
            stock: Math.max(1, p[6] - j * 3),
          })),
        ),
      })),
      events: [],
      sales: [],
      cart: [],
      nextEvent: 1,
      nextSale: 1,
      nextProduct: 9,
      backup: null,
    };
  }
  /* COPIA DE TRABAJO. Duplica los datos antes de modificarlos. Permite descartar una operación que falle sin dejar el inventario a medias. */
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  /* VALIDACIÓN DE CANTIDADES. Comprueba que un número sea entero y esté entre el mínimo y máximo permitidos; evita unidades negativas o fraccionarias. */
  function integer(n, min, max = 1000000) {
    return Number.isSafeInteger(n) && n >= min && n <= max;
  }
  /* VALIDACIÓN DEL RESPALDO Y DEL ESTADO. Revisa productos, variantes, eventos, ventas, carrito, contadores y marca de agua. Un archivo JSON no se acepta solo por tener la extensión correcta. */
  function validate(s) {
    V.inspectData(s);
    if (
      !s ||
      s.version !== 1 ||
      !Array.isArray(s.products) ||
      !Array.isArray(s.events) ||
      !Array.isArray(s.sales) ||
      !Array.isArray(s.cart) ||
      s.products.length > 10000 ||
      s.events.length > 100000 ||
      s.sales.length > 100000
    )
      throw Error('El archivo no tiene un formato de respaldo válido.');
    const str = (v, n) => typeof v === 'string' && !V.text(v, 1, n);
    const date = (v) => str(v, 50) && Number.isFinite(Date.parse(v));
    const ids = new Set();
    for (const p of s.products) {
      if (
        !integer(p.id, 1) ||
        ids.has(p.id) ||
        !str(p.name, 100) ||
        !str(p.category, 60) ||
        !str(p.description, 1000) ||
        !['shirt', 'jacket', 'pants', 'red', 'jeans', 'white', 'dress', 'bag'].includes(p.image) ||
        typeof p.active !== 'boolean' ||
        !Number.isFinite(p.price) ||
        p.price <= 0 ||
        p.price > 1000000 ||
        !Number.isFinite(p.discount) ||
        p.discount < 0 ||
        p.discount > 90 ||
        !Array.isArray(p.variants) ||
        !p.variants.length ||
        p.variants.length > 100
      )
        throw Error('Hay productos inválidos en el respaldo.');
      // Una importación debe respetar las mismas reglas de texto y precio que los formularios.
      const productError =
        V.field('p-name', p.name) ||
        V.field('p-category', p.category) ||
        V.field('p-description', p.description) ||
        V.field('p-price', String(p.price)) ||
        V.field('p-discount', String(p.discount));
      if (productError) throw Error('Prenda inválida en el respaldo: ' + productError);
      ids.add(p.id);
      const keys = new Set();
      for (const v of p.variants) {
        const k = v.size + '|' + v.color;
        if (!str(v.size, 12) || !str(v.color, 30) || !integer(v.stock, 0) || keys.has(k))
          throw Error('Hay variantes inválidas.');
        keys.add(k);
      }
    }
    let last = 0;
    for (const e of s.events) {
      if (
        !integer(e.id, 1) ||
        e.id <= last ||
        !TYPES.includes(e.type) ||
        !str(e.description, 500) ||
        !str(e.actor, 80) ||
        !date(e.at) ||
        typeof e.demo !== 'boolean'
      )
        throw Error('La bitácora no es válida.');
      last = e.id;
    }
    if (
      !integer(s.nextEvent, last + 1) ||
      !integer(s.nextProduct, Math.max(0, ...s.products.map((p) => p.id)) + 1) ||
      !integer(s.nextSale, 1)
    )
      throw Error('Los contadores no son válidos.');
    const saleIds = new Set();
    for (const sale of s.sales) {
      if (
        !integer(sale.id, 1) ||
        sale.id >= s.nextSale ||
        saleIds.has(sale.id) ||
        !date(sale.at) ||
        !['Pendiente', 'Confirmado', 'Entregado', 'Cancelado'].includes(sale.status) ||
        !['Web', 'Tienda'].includes(sale.channel) ||
        typeof sale.demo !== 'boolean' ||
        !Number.isFinite(sale.total) ||
        sale.total <= 0 ||
        !Array.isArray(sale.items) ||
        !sale.items.length ||
        sale.items.length > 1000
      )
        throw Error('Hay ventas inválidas.');
      saleIds.add(sale.id);
      for (const item of sale.items) {
        if (
          !ids.has(item.productId) ||
          !str(item.name, 100) ||
          !str(item.size, 12) ||
          !str(item.color, 30) ||
          !integer(item.qty, 1) ||
          !integer(item.returned, 0, item.qty) ||
          !Number.isFinite(item.price) ||
          item.price <= 0
        )
          throw Error('Los detalles de la venta no son válidos.');
        const p = s.products.find((p) => p.id === item.productId);
        if (!p.variants.some((v) => v.size === item.size && v.color === item.color))
          throw Error('La variante de una venta no existe.');
      }
      const expected = round(sale.items.reduce((sum, i) => sum + i.price * i.qty, 0));
      if (Math.abs(expected - sale.total) > 0.01) throw Error('El total de una venta no coincide.');
    }
    const cartKeys = new Set();
    for (const c of s.cart) {
      const p = s.products.find((p) => p.id === c.productId);
      const k = c.productId + '|' + c.size + '|' + c.color;
      if (
        !p ||
        !p.active ||
        !p.variants.some((v) => v.size === c.size && v.color === c.color) ||
        !integer(c.qty, 1) ||
        cartKeys.has(k)
      )
        throw Error('El carrito no es válido.');
      cartKeys.add(k);
    }
    if (
      s.backup !== null &&
      (!s.backup || !date(s.backup.at) || !integer(s.backup.watermark, 0, last))
    )
      throw Error('La marca de respaldo no es válida.');
    return s;
  }
  /* BITÁCORA Y TIMESTAMP. Agrega una operación con ID consecutivo, responsable y fecha ISO automática del dispositivo. demo distingue los datos de demostración de los registros manuales. */
  function event(s, type, description, demo = false, at = new Date().toISOString()) {
    const e = {
      id: s.nextEvent++,
      type,
      description,
      actor: demo ? 'Demostración' : 'Administrador',
      at,
      demo,
    };
    s.events.push(e);
    return e;
  }
  /* PRECIO FINAL. Aplica el porcentaje de descuento de la prenda y redondea el resultado a dos decimales. */
  function price(p) {
    return round(p.price * (1 - p.discount / 100));
  }
  /* BÚSQUEDA DE VARIANTE. Localiza un producto por ID y su combinación de talla y color. Si no existe, detiene la operación. */
  function variant(s, id, size, color) {
    const p = s.products.find((p) => p.id === id);
    const v = p?.variants.find((v) => v.size === size && v.color === color);
    if (!p || !v) throw Error('No se encontró la variante.');
    return { p, v };
  }
  /* REGISTRO DE VENTA O PEDIDO. Combina cantidades repetidas, verifica todas las existencias, descuenta unidades, guarda el detalle de la venta y crea su evento. No procesa pagos reales. */
  function sell(s, channel = 'Web', demo = false, at = new Date().toISOString()) {
    if (!['Web', 'Tienda'].includes(channel)) throw Error('El canal de venta no es válido.');
    if (!s.cart.length) throw Error('El carrito está vacío.');
    const merged = new Map();
    for (const c of s.cart) {
      const key = c.productId + '|' + c.size + '|' + c.color;
      const old = merged.get(key);
      merged.set(key, { ...c, qty: c.qty + (old?.qty || 0) });
    }
    const lines = [...merged.values()];
    const items = lines.map((c) => {
      const { p, v } = variant(s, c.productId, c.size, c.color);
      if (!p.active || !integer(c.qty, 1) || v.stock < c.qty)
        throw Error(
          'No hay existencias suficientes de ' + p.name + ' (' + c.size + ', ' + c.color + ').',
        );
      return { ...c, name: p.name, price: price(p), returned: 0 };
    });
    items.forEach((i) => {
      variant(s, i.productId, i.size, i.color).v.stock -= i.qty;
    });
    const sale = {
      id: s.nextSale++,
      at,
      channel,
      status: channel === 'Web' ? 'Pendiente' : 'Entregado',
      items,
      total: round(items.reduce((n, i) => n + i.qty * i.price, 0)),
      demo,
    };
    s.sales.push(sale);
    s.cart = [];
    event(
      s,
      'Venta',
      `Venta #${sale.id.toString().padStart(4, '0')} · ${items.reduce((n, i) => n + i.qty, 0)} prendas · ${money(sale.total)}`,
      demo,
      at,
    );
    return sale;
  }
  /* ESTADOS DEL PEDIDO. Permite pasar de Pendiente a Confirmado o Cancelado, y de Confirmado a Entregado o Cancelado. Una cancelación devuelve el stock una sola vez. */
  function status(s, id, next) {
    const sale = s.sales.find((v) => v.id === id);
    const allowed = {
      Pendiente: ['Confirmado', 'Cancelado'],
      Confirmado: ['Entregado', 'Cancelado'],
      Entregado: [],
      Cancelado: [],
    };
    if (!sale || !allowed[sale.status]?.includes(next))
      throw Error('Ese cambio de estado no está permitido.');
    if (next === 'Cancelado')
      sale.items.forEach((i) => {
        variant(s, i.productId, i.size, i.color).v.stock += i.qty - i.returned;
      });
    const old = sale.status;
    sale.status = next;
    event(s, 'Estado', `Pedido #${id} · ${old} → ${next}`);
  }
  /* ENTRADA O AJUSTE DE STOCK. Una entrada suma unidades; un ajuste establece la cantidad final contada. Ambos requieren un motivo y generan un evento. */
  function movement(s, { type, productId, size, color, qty, reason }) {
    const reasonError = V.text(String(reason || ''), 4, 200);
    if (reasonError) throw Error(reasonError);
    const { p, v } = variant(s, productId, size, color);
    if (!integer(qty, type === 'Ajuste' ? 0 : 1) || !reason || reason.trim().length < 4)
      throw Error('Completa una cantidad válida y un motivo de al menos 4 caracteres.');
    if (!['Entrada', 'Ajuste'].includes(type)) throw Error('Movimiento no válido.');
    const before = v.stock;
    v.stock = type === 'Entrada' ? v.stock + qty : qty;
    if (!integer(v.stock, 0)) throw Error('La cantidad supera el máximo permitido.');
    event(s, type, `${p.name} · ${size}/${color} · ${before} → ${v.stock} uds. · ${reason.trim()}`);
  }
  /* DEVOLUCIÓN PARCIAL. Solo admite ventas entregadas y cantidades aún no devueltas. Reingresa las unidades al inventario y registra el motivo. */
  function refund(s, id, index, qty, reason) {
    const reasonError = V.text(String(reason || ''), 4, 200);
    if (reasonError) throw Error(reasonError);
    const sale = s.sales.find((x) => x.id === id);
    const item = sale?.items[index];
    if (
      !sale ||
      sale.status !== 'Entregado' ||
      !item ||
      !integer(qty, 1) ||
      qty > item.qty - item.returned ||
      !reason ||
      reason.trim().length < 4
    )
      throw Error('Revisa la venta, cantidad y motivo de la devolución.');
    item.returned += qty;
    variant(s, item.productId, item.size, item.color).v.stock += qty;
    event(
      s,
      'Devolución',
      `Venta #${id} · ${qty} × ${item.name} (${item.size}/${item.color}) · ${reason.trim()}`,
    );
  }
  /* DEMOSTRACIÓN DE 200 EVENTOS. Crea 100 entradas y 100 ventas identificadas como DEMO. Cada entrada compensa la venta siguiente para conservar el stock. La carga no se repite. */
  function demo(s) {
    if (s.events.some((e) => e.demo)) throw Error('Los datos de demostración ya se cargaron.');
    const savedCart = s.cart;
    s.cart = [];
    const start = Date.now() - 14 * 86400000;
    for (let i = 0; i < 100; i++) {
      const p = s.products[i % s.products.length];
      const v = p.variants[i % p.variants.length];
      const at = new Date(start + i * 3 * 3600000).toISOString();
      v.stock += 1;
      event(
        s,
        'Entrada',
        `${p.name} · ${v.size}/${v.color} · +1 ud. · Reposición de demostración`,
        true,
        at,
      );
      s.cart = [{ productId: p.id, size: v.size, color: v.color, qty: 1 }];
      sell(s, 'Tienda', true, at);
    }
    s.cart = savedCart;
  }
  /* INDICADORES DEL NEGOCIO. Suma importes y existencias; excluye pedidos cancelados y resta devoluciones. Los pendientes son importes registrados, no cobros efectivos. */
  function stats(s) {
    const valid = s.sales.filter((v) => v.status !== 'Cancelado');
    return {
      revenue: round(
        valid.reduce(
          (n, v) => n + v.items.reduce((a, i) => a + i.price * (i.qty - i.returned), 0),
          0,
        ),
      ),
      orders: valid.length,
      stock: s.products
        .filter((p) => p.active)
        .reduce((n, p) => n + p.variants.reduce((a, v) => a + v.stock, 0), 0),
      low: s.products.filter((p) => p.active && p.variants.some((v) => v.stock <= 3)).length,
    };
  }
  return {
    KEY,
    localStamp,
    paginate,
    TYPES,
    money,
    round,
    fresh,
    clone,
    validate,
    event,
    price,
    variant,
    sell,
    status,
    movement,
    refund,
    demo,
    stats,
    integer,
  };
})();
if (typeof module !== 'undefined') module.exports = AtelierCore;
/* 2. INTERFAZ CON JQUERY.
   $(function () { ... }) espera a que el HTML esté listo.
   Las plantillas están en index.html; aquí se calculan sus datos y se atienden los eventos.
   jQuery es una biblioteca JavaScript local, no un servidor ni un framework de backend. */
if (typeof window !== 'undefined')
  $(function () {
    // C es un nombre corto para acceder a las operaciones del negocio.
    const C = AtelierCore;
    const guide = AtelierGuidedForms.create({ $: $, getState: () => state });
    let eventFrom = '',
      eventTo = '';
    // state guarda productos, ventas, carrito y eventos; view identifica la pantalla activa.
    // El resto controla paginación, foco, avisos temporales y fechas del reporte.
    let state,
      storageOk = true,
      view = 'inicio',
      eventPage = 0,
      lastFocus = null,
      toastTimer,
      clockTimer,
      reportFrom = '',
      reportTo = '';

    /* Lee una plantilla HTML de index.html y sustituye sus marcadores numerados.
       <!--ATELIER_DATO_0--> reserva contenido; __ATELIER_DATO_0__ reserva un atributo.
       Los textos del usuario pasan primero por E() para que no se ejecuten como HTML.
       Solo se clona la plantilla de la pantalla activa; no se duplican sus controles. */
    /* UNIÓN ENTRE HTML Y DATOS. Lee un <template> de index.html y sustituye sus marcadores ATELIER_DATO con los valores calculados en JavaScript. El resultado se inserta en la vista activa. */
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

    const $content = $('#content');
    // Escapa caracteres especiales: un nombre escrito por el usuario se muestra como texto, no como código HTML.
    const escape = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
    const E = escape;
    const date = C.localStamp;
    // Títulos y descripciones de las seis pantallas disponibles en el menú.
    // La vista elegida es una preferencia visual. No representa permisos ni una cuenta real.
    let mode = 'cliente';
    // Estado de presentación: cambiar de página nunca elimina eventos, productos ni ventas.
    let catalogPage = 0,
      inventoryPage = 0,
      salePage = 0,
      salesTab = 'cart',
      reportTab = 'ventas';
    try {
      if (localStorage.getItem('atelier.mode') === 'admin') mode = 'admin';
    } catch {}
    const names = {
      tienda: ['Bienvenido a ATELIER', 'Descubre prendas para tu día a día.'],
      inicio: ['Vista general', 'Cada prenda, cada movimiento. Todo en un solo lugar.'],
      catalogo: ['Catálogo de prendas', 'Encuentra el próximo favorito. Filtra, explora y elige.'],
      inventario: ['Inventario', 'Tallas, colores y existencias siempre a la vista.'],
      ventas: ['Ventas y carrito', 'Prepara una venta y consulta el historial de pedidos.'],
      eventos: ['Registro de eventos', 'Cada operación deja una huella. Consulta tu bitácora.'],
      reportes: [
        'Reportes del negocio',
        'Convierte los movimientos de tu tienda en información útil.',
      ],
    };
    // Si el usuario prefiere movimiento reducido, desactiva las animaciones de jQuery.
    $.fx.off = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      // Recupera los datos al abrir la página. Si no existen, utiliza el catálogo de referencia.
      const raw = localStorage.getItem(C.KEY);
      state = raw ? C.validate(JSON.parse(raw)) : C.fresh();
    } catch (err) {
      state = C.fresh();
      storageOk = false;
      $('#storage-warning')
        .prop('hidden', false)
        .text(
          'No se pudieron leer los datos guardados. Para evitar sobrescribirlos, usa un respaldo válido o revisa el almacenamiento del navegador. ' +
            err.message,
        );
    }
    /* GUARDADO COMPLETO. Trabaja sobre una copia, ejecuta la operación, valida y escribe en localStorage. Solo actualiza el estado de la interfaz cuando el guardado termina correctamente. */
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
    /* MANEJO DE ERRORES. Ejecuta una acción y muestra su mensaje si falla, en lugar de interrumpir toda la página. */
    function safe(fn) {
      try {
        return fn();
      } catch (err) {
        toast(err.message, true);
        return null;
      }
    }
    /* AVISO TEMPORAL CON JQUERY. stop evita acumular animaciones; text coloca el mensaje; slideDown lo muestra y fadeOut lo oculta después de unos segundos. */
    function toast(message, error = false) {
      clearTimeout(toastTimer);
      $('#toast')
        .stop(true, true)
        .css('border-color', error ? 'var(--red)' : 'var(--accent)')
        .text((error ? '⚠ ' : '✓ ') + message)
        .slideDown(160);
      toastTimer = setTimeout(() => $('#toast').stop(true, true).fadeOut(220), 4200);
    }
    /* CONTADOR DEL CARRITO. Suma las cantidades y actualiza el número del menú usando .text(). Agregar al carrito todavía no descuenta stock. */
    function cartBadge() {
      const count = state.cart.reduce((n, i) => n + i.qty, 0);
      $('#cart-count').text(count);
      $('.dock-count')
        .text(count)
        .prop('hidden', count === 0);
    }
    /* ABRIR DIÁLOGO. Recuerda qué botón tenía el foco, inserta el formulario, muestra la ventana con fadeIn y enfoca su primer control disponible. */
    function modal(title, html) {
      lastFocus = document.activeElement;
      $('#modal-title').text(title);
      $('#modal-body').html(html);
      guide.prepare(document.getElementById('modal-body'));
      $('#modal-overlay').stop(true, true).fadeIn(180);
      setTimeout(
        () =>
          $('#modal-body').find('input,select,button').filter(':enabled').first().trigger('focus'),
        40,
      );
    }
    /* CERRAR DIÁLOGO. Oculta la ventana con fadeOut y devuelve el foco al control que la abrió para poder continuar usando el teclado. */
    function closeModal() {
      $('#modal-overlay')
        .stop(true, true)
        .fadeOut(150, () => {
          lastFocus?.focus();
        });
    }
    /* ERROR DEL FORMULARIO. Coloca un texto accesible y muestra el espacio de error con .show(). */
    function formError(message) {
      $('#form-error').text(message).attr('role', 'alert').show();
    }
    /* CONFIRMACIÓN DEL FORMULARIO. Ejecuta su operación; si tiene éxito cierra el diálogo y actualiza la vista. Si falla conserva el formulario y explica el error. */
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
    /* ESPACIO PARA ERRORES. Devuelve el párrafo donde se mostrará un mensaje de validación; empieza oculto. */
    function errorSlot() {
      return '<p id="form-error" class="validation" aria-live="polite" style="display:none"></p>';
    }
    /* BOTONES REUTILIZABLES. Prepara el espacio de errores y la plantilla de Cancelar y Guardar para los formularios. */
    function actions(label = 'Guardar operación') {
      return (
        errorSlot() +
        plantilla('tpl-acciones-formulario', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ label,
        ])
      );
    }
    const stock = (p) => p.variants.reduce((n, v) => n + v.stock, 0);
    // Colores de los puntos de las tarjetas. Estos colores sí pertenecen a la página.
    const colorHex = {
      Arena: '#c9bda6',
      Negro: '#292d33',
      Oliva: '#7c8366',
      Terracota: '#b25f4c',
      Azul: '#758a9d',
      Blanco: '#eee',
    };
    /* TARJETA DE PRENDA. Calcula stock, precio, colores y etiqueta de oferta. Completa la estructura de tpl-tarjeta-prenda en index.html. */
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
      ]);
    }
    /* INDICADOR INDIVIDUAL. Completa una tarjeta con título, valor y nota. En el indicador de eventos añade la barra de progreso hacia el mínimo de 200. */
    function metric(label, value, note, icon, progress = false) {
      return plantilla('tpl-tarjeta-indicador', [
        /* Dato 0: completa el marcador del mismo número en index.html. */ label,
        /* Dato 1: completa el marcador del mismo número en index.html. */
        icon,
        /* Dato 2: completa el marcador del mismo número en index.html. */
        value,
        /* Dato 3: completa el marcador del mismo número en index.html. */
        note,
        /* Dato 4: completa el marcador del mismo número en index.html. */
        progress
          ? plantilla('tpl-tarjeta-indicador-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              Math.min(state.events.length, 200),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              Math.min(state.events.length / 2, 100),
            ])
          : '',
      ]);
    }
    /* RESUMEN DEL PANEL. Construye los cuatro indicadores con sus valores actuales: importe registrado, pedidos, prendas y eventos. */
    function metrics() {
      const s = C.stats(state);
      return plantilla('tpl-resumen-indicadores', [
        /* Dato 0: completa el marcador del mismo número en index.html. */
        metric(
          'Ventas acumuladas',
          C.money(s.revenue),
          '<em>↗</em> Importe neto de devoluciones',
          '↗',
        ),
        /* Dato 1: completa el marcador del mismo número en index.html. */
        metric('Pedidos registrados', s.orders, 'Web y ventas presenciales', '▧'),
        /* Dato 2: completa el marcador del mismo número en index.html. */
        metric('Prendas disponibles', s.stock, `${s.low} productos con alguna variante baja`, '▣'),
        /* Dato 3: completa el marcador del mismo número en index.html. */
        metric(
          'Eventos registrados',
          plantilla('tpl-resumen-indicadores-2', [
            /* Dato 0: completa el marcador del mismo número en index.html. */ state.events.length,
          ]),
          state.events.length >= 200
            ? '<em>✓ Meta mínima cumplida</em>'
            : 'Tu actividad construye el historial',
          '◷',
          true,
        ),
      ]);
    }
    /* ACTIVIDAD RECIENTE. Obtiene los últimos cinco eventos y completa sus filas. Si no existen, muestra un mensaje informativo. */
    function recent() {
      return (
        state.events
          .slice(-3)
          .reverse()
          .map((e) =>
            plantilla('tpl-actividad-reciente', [
              /* Dato 0: completa el marcador del mismo número en index.html. */
              {
                Venta: '↗',
                Entrada: '＋',
                Devolución: '↶',
                Ajuste: '≋',
                Producto: '▣',
                Estado: '◷',
              }[e.type],
              /* Dato 1: completa el marcador del mismo número en index.html. */
              E(e.type),
              /* Dato 2: completa el marcador del mismo número en index.html. */
              e.demo ? '· DEMO' : '',
              /* Dato 3: completa el marcador del mismo número en index.html. */
              E(e.description.length > 65 ? e.description.slice(0, 65) + '…' : e.description),
              /* Dato 4: completa el marcador del mismo número en index.html. */
              date(e.at),
            ]),
          )
          .join('') ||
        '<p class="empty" style="padding:20px 0;font-size:11px">Tus próximas operaciones aparecerán aquí.</p>'
      );
    }
    /* PANTALLA DE INICIO. Completa la plantilla del panel con indicadores, seis prendas activas, actividad reciente y fecha del último respaldo. */
    function dashboard() {
      return (
        metrics() +
        plantilla('tpl-vista-inicio', [
          /* Dato 0: completa el marcador del mismo número en index.html. */
          state.products
            .filter((p) => p.active)
            .slice(0, 3)
            .map(card)
            .join(''),
          /* Dato 1: completa el marcador del mismo número en index.html. */
          recent(),
          /* Dato 2: completa el marcador del mismo número en index.html. */
          state.backup
            ? 'Último respaldo: ' + date(state.backup.at) + ' · evento #' + state.backup.watermark
            : 'Aún no tienes una copia de seguridad. Exporta tus datos y guárdalos en un lugar seguro.',
        ])
      );
    }
    /* FILTROS DEL CATÁLOGO. Completa los selectores con las categorías, tallas y colores existentes. Su estructura y etiquetas están en index.html. */
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
    /* FILTRADO COMBINADO. Lee búsqueda, categoría, talla, color, precio, stock y ofertas; ordena el resultado y reconstruye las tarjetas. fadeTo atenúa el cambio y appendTo inserta cada tarjeta. */
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
          $(this).empty();
          page.items.forEach((p) => $(card(p)).appendTo(this));
          if (!list.length)
            $(this).append('<p class="empty">No encontramos prendas con esos filtros.</p>');
          $(this).fadeTo(100, 1);
        });
    }
    /* TABLA DE INVENTARIO. Recorre las prendas y completa nombre, categoría, precio, existencias, estado y botones de edición o stock. */
    function inventory() {
      const page = C.paginate(state.products, inventoryPage, tableSize());
      inventoryPage = page.page;
      return plantilla('tpl-vista-inventario', [
        /* Dato 0: completa el marcador del mismo número en index.html. */
        page.items
          .map((p) =>
            plantilla('tpl-vista-inventario-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(p.name),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              p.variants.length,
              /* Dato 2: completa el marcador del mismo número en index.html. */
              E(p.category),
              /* Dato 3: completa el marcador del mismo número en index.html. */
              C.money(C.price(p)),
              /* Dato 4: completa el marcador del mismo número en index.html. */
              stock(p),
              /* Dato 5: completa el marcador del mismo número en index.html. */
              p.active ? 'Activa' : 'Inactiva',
              /* Dato 6: completa el marcador del mismo número en index.html. */
              p.id,
              /* Dato 7: completa el marcador del mismo número en index.html. */
              p.id,
            ]),
          )
          .join(''),
      ]);
    }
    /* FILAS DEL CARRITO. Consulta cada variante y prepara su selector de cantidad, precio, importe y botón para quitarla. */
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
    /* PANTALLA DE VENTAS. Calcula el total del carrito y completa el historial. Ofrece cambio de estado para pedidos abiertos y devolución para ventas entregadas. */
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
    /* PANTALLA DE EVENTOS. Completa el contador, la meta mínima, los tipos de filtro y el estado del botón de carga de demostración. */
    function events() {
      return plantilla('tpl-vista-eventos', [
        /* Dato 0: completa el marcador del mismo número en index.html. */ state.events.length,
        /* Dato 1: completa el marcador del mismo número en index.html. */
        state.events.length >= 200
          ? 'Meta mínima de 200 cumplida.'
          : 'Meta mínima: 200 operaciones.',
        /* Dato 2: completa el marcador del mismo número en index.html. */
        state.events.some((e) => e.demo) ? 'disabled' : '',
        /* Dato 3: completa el marcador del mismo número en index.html. */
        C.TYPES.map((t) =>
          plantilla('tpl-vista-eventos-2', [
            /* Dato 0: completa el marcador del mismo número en index.html. */ t,
          ]),
        ).join(''),
      ]);
    }
    /* BÚSQUEDA EN LA BITÁCORA. Combina texto o ID, tipo, origen y rango de fechas; devuelve las coincidencias en orden inverso de registro. */
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
    /* PAGINACIÓN DE EVENTOS. Presenta un lote corto según la pantalla; los filtros y CSV conservan el conjunto completo. */
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
    /* PERÍODO DEL REPORTE. Selecciona las ventas entre las fechas elegidas según la fecha local de cada operación. */
    function reportSales() {
      return state.sales.filter((s) => {
        const d = new Date(s.at);
        const day = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-');
        return (!reportFrom || day >= reportFrom) && (!reportTo || day <= reportTo);
      });
    }
    /* REPORTES DEL NEGOCIO. Calcula las prendas más vendidas, existencias por categoría y alertas de stock bajo. Completa barras y resumen de respaldo; los indicadores superiores conservan los acumulados globales. */
    function reports() {
      const sales = reportSales().filter((s) => s.status !== 'Cancelado');
      const counts = new Map();
      sales.forEach((s) =>
        s.items.forEach((i) => counts.set(i.name, (counts.get(i.name) || 0) + i.qty - i.returned)),
      );
      const ranked = [...counts].sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...ranked.map((i) => i[1]));
      return plantilla('tpl-vista-reportes', [
        /* Dato 0: completa el marcador del mismo número en index.html. */ reportFrom,
        /* Dato 1: completa el marcador del mismo número en index.html. */
        reportTo,
        /* Dato 2: completa el marcador del mismo número en index.html. */
        metrics(),
        /* Dato 3: completa el marcador del mismo número en index.html. */
        reportFrom || 'inicio',
        /* Dato 4: completa el marcador del mismo número en index.html. */
        reportTo || 'actualidad',
        /* Dato 5: completa el marcador del mismo número en index.html. */
        C.money(
          sales.reduce(
            (n, s) => n + s.items.reduce((a, i) => a + i.price * (i.qty - i.returned), 0),
            0,
          ),
        ),
        /* Dato 6: completa el marcador del mismo número en index.html. */
        sales.length,
        /* Dato 7: completa el marcador del mismo número en index.html. */
        date(new Date().toISOString()),
        /* Dato 8: completa el marcador del mismo número en index.html. */
        ranked
          .map(([name, n]) =>
            plantilla('tpl-vista-reportes-2', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(name),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              n,
              /* Dato 2: completa el marcador del mismo número en index.html. */
              (n / max) * 100,
            ]),
          )
          .join('') || '<p class="empty">Registra tu primera venta para ver este reporte.</p>',
        /* Dato 9: completa el marcador del mismo número en index.html. */
        [...new Set(state.products.map((p) => p.category))]
          .map((cat) => {
            const n = state.products
              .filter((p) => p.active && p.category === cat)
              .reduce((n, p) => n + stock(p), 0);
            return plantilla('tpl-vista-reportes-3', [
              /* Dato 0: completa el marcador del mismo número en index.html. */ E(cat),
              /* Dato 1: completa el marcador del mismo número en index.html. */
              n,
              /* Dato 2: completa el marcador del mismo número en index.html. */
              Math.min((n / Math.max(C.stats(state).stock, 1)) * 100, 100),
            ]);
          })
          .join(''),
        /* Dato 10: completa el marcador del mismo número en index.html. */
        state.products
          .filter((p) => p.active)
          .flatMap((p) =>
            p.variants
              .filter((v) => v.stock <= 3)
              .map((v) =>
                plantilla('tpl-vista-reportes-4', [
                  /* Dato 0: completa el marcador del mismo número en index.html. */ E(p.name),
                  /* Dato 1: completa el marcador del mismo número en index.html. */
                  E(v.size),
                  /* Dato 2: completa el marcador del mismo número en index.html. */
                  E(v.color),
                  /* Dato 3: completa el marcador del mismo número en index.html. */
                  v.stock,
                ]),
              ),
          )
          .join('') || '<tr><td>No hay variantes con stock bajo.</td></tr>',
        /* Dato 11: completa el marcador del mismo número en index.html. */
        state.backup
          ? 'Copia preparada el ' +
            date(state.backup.at) +
            '.<br>Marca de agua: evento #' +
            state.backup.watermark +
            '.<br>' +
            state.events.filter((e) => e.id > state.backup.watermark).length +
            ' eventos posteriores a la última copia.'
          : 'Todavía no se ha exportado un respaldo.',
      ]);
    }
    /* ACTUALIZAR LA VISTA. Inserta en #content la pantalla seleccionada y vuelve a calcular sus datos. Los botones nuevos funcionan gracias a la delegación de eventos. */

    /* VISTAS CLIENTE/ADMINISTRADOR. Oculta los controles que no corresponden,
       cambia las etiquetas y conserva el modo elegido en el navegador.
       No hay autenticación: es una separación visual para el proyecto frontend. */
    function applyMode() {
      const client = mode === 'cliente';
      $('body').toggleClass('customer-view', client);
      $('[data-mode]').each(function () {
        $(this).attr('aria-pressed', String($(this).data('mode') === mode));
      });
      $('#cart-nav-label').text(client ? 'Mi carrito' : 'Ventas y pedidos');
      $('#profile-name').text(client ? 'Cliente' : 'Administrador');
      $('#context-label').text(client ? 'Tu tienda' : 'Espacio de trabajo');
      $('.eyebrow')
        .first()
        .text(client ? 'ENCUENTRA TU PRÓXIMO FAVORITO' : 'TU TIENDA, BAJO CONTROL');
      $('.avatar').text(client ? 'CL' : 'AD');
      $('.brand').attr('href', client ? '#tienda' : '#inicio');
      $('.workspace').text('PANEL DE ADMINISTRACIÓN');
    }
    function changeMode(next) {
      if (!['cliente', 'admin'].includes(next)) return;
      mode = next;
      try {
        localStorage.setItem('atelier.mode', mode);
      } catch {}
      if ($('#modal-overlay').is(':visible')) closeModal();
      applyMode();
      const route = mode === 'cliente' ? 'tienda' : 'inicio';
      location.hash = route;
      navigate(route);
    }

    /* DESCARGA PDF DIRECTA. El archivo se construye en memoria con jsPDF y se descarga.
       Respeta el período seleccionado e incluye frecuencia neta y el historial de ventas. */
    function exportPdf() {
      if (mode !== 'admin') return;
      safe(() => {
        if (view !== 'reportes') {
          navigate('reportes');
          location.hash = 'reportes';
        }
        const now = new Date();
        const doc = AtelierPdf.create(
          reportSales(),
          {
            from: reportFrom,
            to: reportTo,
            generatedAt: now.toISOString(),
            money: C.money,
            date: C.localStamp,
          },
          window.jspdf?.jsPDF,
        );
        doc.save('atelier-ventas-' + C.localStamp(now).slice(0, 10) + '.pdf');
        toast('Reporte PDF preparado para descargar.');
      });
    }

    /* ICONOS DECORATIVOS. Se conserva el texto de los botones para que sean comprensibles. */
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
    /* BOTONES DE PÁGINA. Muestran rango, total y posición para que el usuario se ubique. */
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
    /* APARTADOS DE VENTAS. El administrador ve carrito o historial, no dos bloques apilados. */
    function applySalesTab() {
      const history = mode === 'admin' && salesTab === 'history';
      $('#cart-panel').prop('hidden', history);
      $('#sales-history-panel').prop('hidden', !history);
      $('[data-sales-tab]').each(function () {
        $(this).attr('aria-pressed', String($(this).data('sales-tab') === salesTab));
      });
    }
    /* APARTADOS DE REPORTES. Reduce la pantalla a ventas, inventario o respaldo. */
    function applyReportTab() {
      $('.report-actions [data-pdf],.report-actions [data-sales-csv]').prop(
        'hidden',
        reportTab !== 'ventas',
      );
      $('.report-actions [data-backup],.report-actions [data-import]').prop(
        'hidden',
        reportTab !== 'backup',
      );
      $('.report-actions').prop('hidden', reportTab === 'stock');
      $('[data-report-panel]').each(function () {
        $(this).prop('hidden', $(this).data('report-panel') !== reportTab);
      });
      $('#report-content').attr('data-section', reportTab);
      $('[data-report-tab]').each(function () {
        $(this).attr('aria-pressed', String($(this).data('report-tab') === reportTab));
      });
    }
    /* EFECTO JQUERY DE LAS TARJETAS. El enfoque del teclado revela el mismo control que el mouse.
       En pantallas táctiles el botón se conserva visible mediante CSS, sin depender de hover. */
    $content.on('mouseenter focusin', '.product', function () {
      $(this).find('.photo-detail').stop(true, true).fadeTo(120, 1);
    });
    $content.on('mouseleave', '.product', function () {
      if (!$(this).find(':focus').length)
        $(this).find('.photo-detail').stop(true, true).fadeTo(120, 0);
    });
    $content.on('focusout', '.product', function (e) {
      if (!this.contains(e.relatedTarget))
        $(this).find('.photo-detail').stop(true, true).fadeTo(120, 0);
    });
    /* PAGINACIÓN DE CATÁLOGO Y TABLAS. Cambia el lote visible, sin recargar el documento. */
    $content.on('click', '[data-paginate]', function () {
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
    $content.on('click', '[data-sales-tab]', function () {
      salesTab = $(this).data('sales-tab');
      applySalesTab();
    });
    $content.on('click', '[data-report-tab]', function () {
      reportTab = $(this).data('report-tab');
      applyReportTab();
    });
    $(document).on('click', '[data-shopping-help]', () =>
      modal('Cómo comprar', plantilla('tpl-ayuda-compra')),
    );
    $content.on('click', '[data-report-explain]', () =>
      modal('Cómo leer los reportes', $('#report-info').html()),
    );
    /* Filtros secundarios de la bitácora: se consultan cuando hacen falta, sin alargar la vista inicial. */
    $content.on('click', '#event-more-filters', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this).attr('aria-expanded', String(!open));
      $('#event-extra-filters').stop(true, true).slideToggle(150);
    });
    /* Al cruzar un tamaño de pantalla se mantiene una cantidad adecuada por página. */
    let lastCompact = catalogSize();
    $(window).on('resize', () => {
      const compact = catalogSize();
      if (compact === lastCompact) return;
      lastCompact = compact;
      if (view === 'catalogo') {
        catalogPage = 0;
        filterProducts(false);
      } else if (['ventas', 'inventario'].includes(view)) render();
    });

    function render() {
      cartBadge();
      if (view === 'tienda')
        $content.html(
          plantilla('tpl-vista-cliente', [
            state.products
              .filter((p) => p.active)
              .slice(0, 4)
              .map(card)
              .join(''),
          ]),
        );
      if (view === 'inicio') $content.html(dashboard());
      if (view === 'catalogo') {
        $content.html(
          filters() +
            '<div id="catalog-grid" class="products catalog-products"></div><div id="catalog-pagination"></div>',
        );
        filterProducts();
      }
      if (view === 'inventario') {
        $content.html(inventory());
        mountPager(
          'inventario',
          C.paginate(state.products, inventoryPage, tableSize()),
          '#inventory-pagination',
        );
      }
      if (view === 'ventas') {
        $content.html(sales());
        applySalesTab();
        mountPager('ventas', C.paginate(state.sales, salePage, tableSize()), '#sales-pagination');
      }
      if (view === 'eventos') {
        $content.html(events());
        $('#event-from').val(eventFrom);
        $('#event-to').val(eventTo);
        renderEvents();
      }
      if (view === 'reportes') {
        $content.html(reports());
        applyReportTab();
        if (reportFrom || reportTo)
          $('#report-date-note').text(
            'Período aplicado. Si editas las fechas, vuelve a pulsar Aplicar.',
          );
      }
      /* El comprador no ve controles administrativos ni el historial global de ventas. */
      if (view === 'ventas' && mode === 'cliente') {
        $('#sale-channel').val('Web');
        $('#checkout').text('Confirmar pedido →');
        $('.cart-layout > .panel').eq(1).find('h2').text('Resumen de tu pedido');
        const last = state.sales.filter((s) => s.channel === 'Web' && !s.demo).at(-1);
        if (last)
          $content.prepend(
            plantilla('tpl-ultimo-pedido', [
              String(last.id).padStart(4, '0'),
              E(last.status),
              C.money(last.total),
            ]),
          );
      }
    }
    /* NAVEGACIÓN SIN RECARGA COMPLETA. Cambia la vista y sus títulos, marca el menú activo y aplica hide/fadeIn. En móvil recoge el menú con slideUp. */
    function navigate(next) {
      if (!names[next]) next = mode === 'cliente' ? 'tienda' : 'inicio';
      if (mode === 'cliente' && !['tienda', 'catalogo', 'ventas'].includes(next)) next = 'tienda';
      if (mode === 'admin' && next === 'tienda') next = 'inicio';
      $('body').attr('data-page', next);
      view = next;
      eventPage = 0;
      catalogPage = 0;
      inventoryPage = 0;
      salePage = 0;
      $('nav button').removeClass('active').removeAttr('aria-current');
      $(`nav button[data-view="${next}"]`).addClass('active').attr('aria-current', 'page');
      $('#page-title,#breadcrumb').text(
        mode === 'cliente' && next === 'ventas' ? 'Mi carrito' : names[next][0],
      );
      $('#page-description').text(
        mode === 'cliente' && next === 'ventas'
          ? 'Revisa tu selección y confirma tu pedido para recoger en tienda.'
          : names[next][1],
      );
      $content.stop(true, true).hide();
      render();
      $content.fadeIn(160);
      if (window.innerWidth <= 900) {
        $('#sidebar').stop(true, true).slideUp(160);
        $('#hamburger').attr('aria-expanded', 'false');
      }
      window.scrollTo(0, 0);
    }
    /* OPCIONES DE TALLA Y COLOR. Recorre las variantes y crea una opción por combinación con sus existencias. */
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
    /* DETALLE DE UNA PRENDA. Busca el producto y abre su foto, descripción, precio, selector de variante y formulario del carrito. */
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
    /* LÍMITE DE CANTIDAD. Ajusta el máximo del campo al stock de la variante elegida y deshabilita Agregar cuando se encuentra agotada. */
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
    /* CREAR O EDITAR PRODUCTOS. Carga los datos actuales en el formulario o deja campos para una prenda nueva. La desactivación conserva su historial. */
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
    /* FORMULARIO DE MOVIMIENTO. Abre el registro de entrada o ajuste y carga las prendas. Después rellena el selector de variantes. */
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
    /* SELECTOR DEPENDIENTE. Vacía las opciones anteriores con .empty() y añade con .prepend() las tallas y colores de la prenda seleccionada. */
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
    /* DESCARGA LOCAL. Convierte texto en un archivo Blob, activa su descarga y libera la dirección temporal. No envía datos a un servicio externo. */
    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    /* COPIA DE SEGURIDAD JSON. Incluye todo el estado y registra una marca de agua: ID del último evento incluido. Descarga la copia y muestra cuándo se preparó. */
    function backup() {
      safe(() => {
        const copy = C.clone(state);
        copy.backup = { at: new Date().toISOString(), watermark: copy.nextEvent - 1 };
        C.validate(copy);
        download(
          'atelier-respaldo-' + new Date().toISOString().slice(0, 10) + '.json',
          JSON.stringify(copy, null, 2),
          'application/json',
        );
        if (storageOk)
          commit((s) => {
            s.backup = copy.backup;
          });
        render();
        toast('Respaldo preparado. Conserva el archivo descargado.');
      });
    }
    /* EXPORTACIÓN CSV. Convierte las filas a texto separado por punto y coma, protege comillas y neutraliza fórmulas al abrir el archivo en una hoja de cálculo. */
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
    /* EVENTO click. Abre la pantalla indicada por el botón del menú y actualiza la dirección # de la página. Delegación: el contenedor atiende también controles creados después. */
    $('nav').on('click', '[data-view]', function () {
      location.hash = $(this).data('view');
      navigate($(this).data('view'));
    });
    /* EVENTO hashchange. Sincroniza la pantalla con la dirección # y con Atrás/Adelante. */
    $(window).on('hashchange', () => navigate(location.hash.slice(1)));
    /* EVENTO click. Permite que las acciones rápidas lleven a otra pantalla. Delegación: el contenedor atiende también controles creados después. */
    $(document).on('click', '[data-go]', function () {
      const next = $(this).data('go');
      location.hash = next;
      navigate(next);
    });
    /* EVENTO click. Alterna el menú móvil con slideToggle y actualiza aria-expanded. */
    $('#hamburger').on('click', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this).attr('aria-expanded', String(!open));
      $('#sidebar').stop(true, true).slideToggle(180);
    });
    /* EVENTO resize. Adapta el menú al cambiar el ancho de la pantalla. */
    $(window).on('resize', () => {
      if (window.innerWidth > 900) $('#sidebar').removeAttr('style');
      else if ($('#hamburger').attr('aria-expanded') !== 'true') $('#sidebar').hide();
    });
    /* EVENTO click. Alterna la clase light para cambiar el tema, guarda la preferencia y actualiza el nombre accesible del botón. */
    $('#theme').on('click', () => {
      const light = $('body').toggleClass('light').is('.light');
      safe(() => localStorage.setItem('atelier.theme', light ? 'light' : 'dark'));
      $('#theme')
        .attr('aria-label', light ? 'Activar modo oscuro' : 'Activar modo claro')
        .html(uiIcon(light ? 'moon' : 'sun'));
    });
    try {
      if (localStorage.getItem('atelier.theme') === 'light') $('body').addClass('light');
    } catch {}
    /* EVENTO click. Abre el formulario para registrar una entrada o un ajuste de stock. */
    $('#new-event').on('click', () => movementForm());
    /* EVENTO click. Muestra los últimos eventos en una ventana de consulta. */
    $('#notifications').on('click', () => modal('Actividad reciente', recent()));
    /* EVENTO click. Cierra la ventana y recupera el foco del teclado. */
    $('#close-modal').on('click', closeModal);
    /* EVENTO click. Permite cancelar formularios creados dinámicamente. Delegación: el contenedor atiende también controles creados después. */
    $(document).on('click', '[data-close]', closeModal);
    /* EVENTO click. Cierra el diálogo al hacer clic en el fondo exterior, sin cerrar por clics dentro del formulario. */
    $('#modal-overlay').on('click', function (e) {
      if (e.target === this) closeModal();
    });
    /* EVENTO keydown. Gestiona Escape para cerrar y Tab para mantener el foco dentro del diálogo. */
    $(document).on('keydown', function (e) {
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
    /* EVENTO click. Abre el detalle de la prenda usando su ID guardado en data-detail. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-detail]', function () {
      detail(Number($(this).data('detail')));
    });
    /* COMPRA DIRECTA DESDE LA TARJETA. Tras elegir la variante, lleva al resumen del carrito. */
    $content.on('click', '[data-buy]', function () {
      detail(Number($(this).data('buy')), true);
    });
    /* EFECTO DE BOTONES CON JQUERY. El resaltado también funciona con el foco del teclado. */
    $(document).on('mouseenter focusin', 'button:not(:disabled)', function () {
      $(this).addClass('button-highlight');
    });
    $(document).on('mouseleave focusout', 'button', function () {
      $(this).removeClass('button-highlight');
    });
    $(document).on('click', '[data-admin-guide]', () =>
      modal('Cómo usar el administrador', plantilla('tpl-guia-admin')),
    );
    /* EVENTO input change. Vuelve a aplicar los filtros cuando se escribe o cambia un selector. Delegación: el contenedor atiende también controles creados después. */
    $content.on(
      'input change',
      '#catalog-filters input,#catalog-filters select,#extra-filters input,#extra-filters select',
      filterProducts,
    );
    /* EVENTO click. Despliega o recoge los filtros adicionales con slideToggle. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#more-filters', function () {
      $('#extra-filters').stop(true, true).slideToggle(180);
      $(this).attr('aria-expanded', String($(this).attr('aria-expanded') !== 'true'));
    });
    /* EVENTO click. Limpia campos y casillas, restablece el orden y resalta temporalmente la búsqueda con delay y queue. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#clear-filters', () => {
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
    /* EVENTO click. Abre o cierra los detalles mediante .next() y slideToggle. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('click', '#product-details-toggle', function () {
      $(this).next().stop(true, true).slideToggle(160);
      $(this).attr('aria-expanded', String($(this).attr('aria-expanded') !== 'true'));
    });
    /* EVENTO change. Actualiza la cantidad máxima al cambiar de talla o color. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('change', '#cart-variant', updateCartMax);
    /* EVENTO submit. Evita la recarga, valida existencias y guarda la selección en el carrito. Todavía no registra una venta. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#cart-form', function (e) {
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
        setTimeout(() => $('#page-title').attr('tabindex', '-1').trigger('focus'), 180);
      }
    });
    /* EVENTO change. Valida y guarda la cantidad de una línea del carrito. Delegación: el contenedor atiende también controles creados después. */
    $content.on('change', '[data-cart-qty]', function () {
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
    /* EVENTO click. Quita una línea del carrito y vuelve a calcular el total. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-remove]', function () {
      safe(() =>
        commit((s) => {
          s.cart.splice(Number($(this).data('remove')), 1);
        }),
      );
      render();
    });
    /* EVENTO click. Abre la confirmación antes de registrar una venta o pedido. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#checkout', () => {
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
    /* EVENTO submit. Confirma la venta: guarda la operación, descuenta stock y crea el evento con fecha automática. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#checkout-form', function (e) {
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
    /* EVENTO click. Abre el selector de los estados permitidos del pedido. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-status]', function () {
      const sale = state.sales.find((s) => s.id === Number($(this).data('status')));
      modal(
        'Estado del pedido #' + sale.id,
        plantilla('tpl-dialogo-interaccion-2', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ sale.id,
          /* Dato 1: completa el marcador del mismo número en index.html. */
          (sale.status === 'Pendiente' ? ['Confirmado', 'Cancelado'] : ['Entregado', 'Cancelado'])
            .map((v) =>
              plantilla('tpl-dialogo-interaccion-3', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ v,
              ]),
            )
            .join(''),
          /* Dato 2: completa el marcador del mismo número en index.html. */
          actions('Actualizar estado'),
        ]),
      );
    });
    /* EVENTO submit. Aplica el nuevo estado. Cancelar devuelve las existencias reservadas. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#status-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        commit((s) => C.status(s, Number($(this).data('id')), $('#next-status').val()));
        toast('Estado actualizado.');
      });
    });
    /* EVENTO click. Muestra el detalle original y el importe neto después de devoluciones. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-sale]', function () {
      const s = state.sales.find((s) => s.id === Number($(this).data('sale')));
      modal(
        'Venta #' + String(s.id).padStart(4, '0'),
        plantilla('tpl-dialogo-interaccion-4', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ date(s.at),
          /* Dato 1: completa el marcador del mismo número en index.html. */
          s.channel,
          /* Dato 2: completa el marcador del mismo número en index.html. */
          s.status,
          /* Dato 3: completa el marcador del mismo número en index.html. */
          s.demo ? ' · DEMOSTRACIÓN' : '',
          /* Dato 4: completa el marcador del mismo número en index.html. */
          s.items
            .map((i) =>
              plantilla('tpl-dialogo-interaccion-5', [
                /* Dato 0: completa el marcador del mismo número en index.html. */ E(i.name),
                /* Dato 1: completa el marcador del mismo número en index.html. */
                E(i.size),
                /* Dato 2: completa el marcador del mismo número en index.html. */
                E(i.color),
                /* Dato 3: completa el marcador del mismo número en index.html. */
                i.returned ? ' · ' + i.returned + ' devueltas' : '',
                /* Dato 4: completa el marcador del mismo número en index.html. */
                i.qty,
                /* Dato 5: completa el marcador del mismo número en index.html. */
                C.money(i.price),
              ]),
            )
            .join(''),
          /* Dato 5: completa el marcador del mismo número en index.html. */
          C.money(s.total),
          /* Dato 6: completa el marcador del mismo número en index.html. */
          C.money(s.items.reduce((n, i) => n + i.price * (i.qty - i.returned), 0)),
        ]),
      );
    });
    /* EVENTO click. Abre el formulario de devolución con las cantidades todavía disponibles para devolver. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-refund]', function () {
      const s = state.sales.find((s) => s.id === Number($(this).data('refund')));
      modal(
        'Devolución · Venta #' + s.id,
        plantilla('tpl-dialogo-interaccion-6', [
          /* Dato 0: completa el marcador del mismo número en index.html. */ s.id,
          /* Dato 1: completa el marcador del mismo número en index.html. */
          s.items
            .map((i, n) =>
              i.returned < i.qty
                ? plantilla('tpl-dialogo-interaccion-7', [
                    /* Dato 0: completa el marcador del mismo número en index.html. */ n,
                    /* Dato 1: completa el marcador del mismo número en index.html. */
                    E(i.name),
                    /* Dato 2: completa el marcador del mismo número en index.html. */
                    E(i.size),
                    /* Dato 3: completa el marcador del mismo número en index.html. */
                    E(i.color),
                    /* Dato 4: completa el marcador del mismo número en index.html. */
                    i.qty - i.returned,
                  ])
                : '',
            )
            .join(''),
          /* Dato 2: completa el marcador del mismo número en index.html. */
          actions('Registrar devolución'),
        ]),
      );
    });
    /* EVENTO submit. Registra una devolución parcial, su motivo y el reingreso de existencias. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#refund-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        commit((s) =>
          C.refund(
            s,
            Number($(this).data('id')),
            Number($('#refund-item').val()),
            Number($('#refund-qty').val()),
            $('#refund-reason').val(),
          ),
        );
        toast('Devolución registrada y stock actualizado.');
      });
    });
    /* EVENTO click. Abre el formulario de una prenda nueva. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#add-product', () => productForm());
    /* EVENTO click. Abre el formulario con los datos de la prenda seleccionada. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-edit]', function () {
      productForm(Number($(this).data('edit')));
    });
    /* EVENTO click. Abre un movimiento de stock para esa prenda. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-stock]', function () {
      movementForm(Number($(this).data('stock')));
    });
    /* EVENTO input. Marca visualmente los campos inválidos y actualiza aria-invalid. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('input', 'input,textarea', function () {
      if (guide.owns(this)) {
        guide.refresh();
        return;
      }
      const invalid = !this.checkValidity();
      $(this).toggleClass('invalid', invalid).attr('aria-invalid', String(invalid));
    });
    /* EVENTO submit. Lee los campos, crea o actualiza la prenda y registra el cambio en la bitácora. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#product-form', function (e) {
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
    /* EVENTO change. Recarga las variantes disponibles para la prenda seleccionada. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('change', '#movement-product', updateMovementVariant);
    /* EVENTO change. Cambia la etiqueta: una entrada suma unidades y un ajuste define la cantidad final. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('change', '#movement-type', function () {
      const adjust = $(this).val() === 'Ajuste';
      $('#qty-label').text(adjust ? 'Existencias finales' : 'Unidades a ingresar');
      $('#movement-qty').attr('min', adjust ? 0 : 1);
    });
    /* EVENTO submit. Valida cantidad y motivo; guarda el movimiento y su evento. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#movement-form', function (e) {
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
    /* EVENTO input change. Aplica los filtros de la bitácora y vuelve a su primera página. Delegación: el contenedor atiende también controles creados después. */
    $content.on('input change', '#event-search,#event-type,#event-source', () => {
      eventPage = 0;
      renderEvents();
    });
    /* EVENTO click. Muestra los quince eventos de la página anterior. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#prev-page', () => {
      eventPage--;
      renderEvents();
    });
    /* EVENTO click. Muestra los quince eventos de la siguiente página. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#next-page', () => {
      eventPage++;
      renderEvents();
    });
    /* EVENTO click. Explica qué datos DEMO se crearán antes de confirmar su carga. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#load-demo', () =>
      modal(
        'Cargar datos de demostración',
        plantilla('tpl-dialogo-interaccion-8', [
          /* Dato 0: completa el marcador del mismo número en index.html. */
          actions('Cargar 200 eventos'),
        ]),
      ),
    );
    /* EVENTO submit. Carga los 200 eventos de demostración, conserva el stock y evita duplicar la carga. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('submit', '#demo-form', function (e) {
      e.preventDefault();
      submitForm(() => {
        commit(C.demo);
        toast('200 eventos de demostración creados y guardados.');
      });
    });
    /* EVENTO click. Prepara y descarga un respaldo completo de los datos locales. Delegación: el contenedor atiende también controles creados después. */
    $(document).on('click', '[data-backup]', backup);
    /* EVENTO click. Abre el selector de un archivo JSON de respaldo. Delegación: el contenedor atiende también controles creados después. */
    $(document).on('click', '[data-import]', () => $('#import-file').trigger('click'));
    /* EVENTO change. Lee y valida el archivo. Muestra un resumen y pide confirmar el reemplazo antes de restaurar. */
    $('#import-file').on('change', async function () {
      const file = this.files[0];
      this.value = '';
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) return toast('El archivo supera el límite de 25 MB.', true);
      try {
        const data = C.validate(JSON.parse(await file.text()));
        modal(
          'Restaurar respaldo',
          plantilla('tpl-dialogo-interaccion-9', [
            /* Dato 0: completa el marcador del mismo número en index.html. */ data.products.length,
            /* Dato 1: completa el marcador del mismo número en index.html. */
            data.sales.length,
            /* Dato 2: completa el marcador del mismo número en index.html. */
            data.events.length,
            /* Dato 3: completa el marcador del mismo número en index.html. */
            actions('Reemplazar y restaurar'),
          ]),
        );
        /* EVENTO submit. Gestiona esta interacción de la interfaz. */
        $('#restore-form').on('submit', (e) => {
          e.preventDefault();
          try {
            C.validate(data);
            localStorage.setItem(C.KEY, JSON.stringify(data));
            state = data;
            storageOk = true;
            $('#storage-warning').prop('hidden', true);
            closeModal();
            render();
            toast('Respaldo restaurado correctamente.');
          } catch (err) {
            formError('No se pudo restaurar: ' + err.message);
          }
        });
      } catch (err) {
        toast('No se importó el archivo: ' + err.message, true);
      }
    });
    /* EVENTO click. Genera el reporte PDF con la biblioteca local, sin abrir impresión. */
    $(document).on('click', '[data-pdf]', exportPdf);
    /* EVENTO click. Cambia entre experiencia del comprador y panel de administración. */
    $(document).on('click', '[data-mode]', function () {
      changeMode($(this).data('mode'));
    });
    /* EVENTO click. Acceso directo a una categoría desde el inicio del cliente. */
    $(document).on('click', '[data-category-link]', function () {
      history.replaceState(null, '', '#catalogo');
      navigate('catalogo');
      $('#category').val($(this).data('category-link'));
      filterProducts();
    });
    /* EVENTO click. Exporta las coincidencias de los filtros actuales de la bitácora. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-events-csv]', () =>
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
    /* EVENTO change. Guarda el período elegido y vuelve a calcular el reporte. Delegación: el contenedor atiende también controles creados después. */
    /* La fecha se aplica con un botón: escribir el año no reconstruye el campo ni quita el foco. */
    $content.on('click', '#apply-report-period', () => {
      if (!applyDates('report')) return;
      render();
    });
    $content.on('click', '#apply-event-period', () => {
      if (!applyDates('event')) return;
      eventPage = 0;
      renderEvents();
    });
    $content.on('click', '#clear-event-period', () => {
      eventFrom = '';
      eventTo = '';
      $('#event-from,#event-to').val('').attr('aria-invalid', 'false');
      $('#event-date-note').text('Se muestran todas las fechas.');
      eventPage = 0;
      renderEvents();
    });
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
    $content.on('input', '#report-from,#report-to,#event-from,#event-to', function () {
      const kind = this.id.startsWith('report') ? 'report' : 'event';
      $('#' + kind + '-date-note')
        .text('Completa el año de cuatro cifras y pulsa Aplicar.')
        .removeClass('date-error');
    });
    $(document).on('click', '[data-open-contact]', () =>
      modal('ATELIER · Contacto y redes', plantilla('tpl-contacto-atelier')),
    );
    $('#modal-body').on('click', '#social-toggle', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this)
        .attr('aria-expanded', String(!open))
        .text(open ? 'Ver redes de ATELIER' : 'Ocultar redes de ATELIER');
      $('#social-links').stop(true, true).slideToggle(180);
    });
    /* EVENTO click. Quita el rango de fechas para consultar todas las ventas. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '#clear-report-period', () => {
      reportFrom = '';
      reportTo = '';
      render();
    });
    /* EVENTO click. Exporta los detalles de ventas del período seleccionado. Delegación: el contenedor atiende también controles creados después. */
    $content.on('click', '[data-sales-csv]', () =>
      csv('atelier-ventas.csv', [
        [
          'Venta',
          'Fecha',
          'Canal',
          'Estado',
          'Prenda',
          'Talla',
          'Color',
          'Cantidad',
          'Devueltas',
          'Precio unitario',
          'Demo',
        ],
        ...reportSales().flatMap((s) =>
          s.items.map((i) => [
            s.id,
            s.at,
            s.channel,
            s.status,
            i.name,
            i.size,
            i.color,
            i.qty,
            i.returned,
            i.price,
            s.demo ? 'Sí' : 'No',
          ]),
        ),
      ]),
    );
    /* EVENTO click. Muestra la explicación del alcance frontend y la información de demostración de la tienda. */
    $('#help').on('click', () =>
      modal('Acerca de ATELIER', plantilla('tpl-dialogo-interaccion-10', [])),
    );
    /* EVENTO click. Alterna contacto y horarios con fadeToggle y actualiza aria-expanded. Delegación: el contenedor atiende también controles creados después. */
    $('#modal-body').on('click', '#contact-toggle', function () {
      $('#contact-info').stop(true, true).fadeToggle(180);
      $(this).attr('aria-expanded', String($(this).attr('aria-expanded') !== 'true'));
    });
    /* EVENTO storage. Recibe los cambios de otra pestaña del mismo navegador; no sincroniza otros dispositivos. */
    $(window).on('storage', (e) => {
      if (e.originalEvent.key === C.KEY) {
        try {
          const data = C.validate(JSON.parse(e.originalEvent.newValue));
          state = data;
          render();
          toast('Datos actualizados desde otra pestaña del mismo navegador.');
        } catch {
          toast('El almacenamiento cambió. Recarga y revisa tus datos.', true);
        }
      }
    });
    /* RELOJ DE LA CABECERA. Actualiza fecha y hora del dispositivo. setInterval ejecuta esta función cada segundo; no es la hora de un servidor. */
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
    tick();
    // Ejecuta el reloj cada segundo sin recargar la página.
    clockTimer = setInterval(tick, 1000);
    $('nav button').each(function (i) {
      $(this).attr('data-order', i);
    });
    applyMode();
    navigate(location.hash.slice(1) || (mode === 'cliente' ? 'tienda' : 'inicio'));
  });
