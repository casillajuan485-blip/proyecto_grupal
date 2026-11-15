import {AtelierValidation as V} from './validaciones.js';
import fallback from './catalog-source.js';
const AtelierCore = (() => {
  // Nombre de la entrada donde localStorage guarda todos los datos del negocio.
  const KEY = 'atelier.separado.06-memory-leak-hidratacion.v1';
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
  const initialProducts = fallback;
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
      products: (window.ATELIER_CATALOG || initialProducts).map((p, i) => ({
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
export {AtelierCore};
