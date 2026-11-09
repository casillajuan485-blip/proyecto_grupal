/* VALIDACIONES DEL PROYECTO.
   Comprueban los datos en el navegador, también antes de guardarlos o restaurarlos.
   No son autenticación ni sustituyen la seguridad de un servidor.
   Se exportan en Node solo para ejecutar las pruebas del proyecto. */
const AtelierValidation = (() => {
  /* TEXTO SEGURO: limita longitud, rechaza HTML y caracteres de control.
     app.js además escapa los textos antes de insertarlos en la interfaz. */
  function text(value, min = 1, max = 100) {
    if (typeof value !== 'string') return 'Escribe un texto válido.';
    const clean = value.trim().normalize('NFC');
    if (clean.length < min)
      return 'Escribe al menos ' + min + ' caracteres, sin contar espacios al inicio o al final.';
    if (clean.length > max) return 'Usa como máximo ' + max + ' caracteres.';
    if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(clean))
      return 'Escribe texto normal, sin etiquetas HTML ni caracteres de control.';
    return '';
  }
  /* NÚMEROS: impide negativos, exponentes, decimales de unidades e importes inválidos. */
  function number(value, min, max, integer = false) {
    const raw = String(value ?? '').trim();
    if (!(integer ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/).test(raw))
      return integer
        ? 'Escribe unidades enteras, sin letras, signos ni decimales.'
        : 'Escribe un número normal con un máximo de dos decimales.';
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isSafeInteger(n)))
      return 'El valor debe estar entre ' + min + ' y ' + max + '.';
    return '';
  }
  function list(value, kind) {
    const error = text(String(value ?? ''), 1, 100);
    if (error) return error;
    const parts = String(value)
      .split(',')
      .map((s) => s.trim());
    if (parts.some((s) => !s)) return 'Separa cada opción con una coma, sin dejar opciones vacías.';
    if (new Set(parts.map((s) => s.toLocaleLowerCase())).size !== parts.length)
      return 'No repitas opciones en la lista.';
    if (
      kind === 'sizes' &&
      parts.some(
        (s) => !/^(?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|Única|Unica|\d{1,3})$/iu.test(s),
      )
    )
      return 'Usa tallas como S, M, L, XL, Única o una talla numérica; sepáralas con comas.';
    if (
      kind === 'colors' &&
      parts.some((s) => text(s, 2, 30) || !/^[\p{L}]+(?:[ -][\p{L}]+)*$/u.test(s))
    )
      return 'Escribe colores con letras, por ejemplo Negro, Azul o Verde oliva.';
    return '';
  }
  /* FECHAS: valida el año completo y días reales, incluidos los años bisiestos. */
  function date(value) {
    if (!value) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Completa día, mes y un año de cuatro cifras.';
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1900 || y > 2100)
      return 'Escribe el año completo, entre 1900 y 2100; por ejemplo 2026.';
    const check = new Date(y, m - 1, d);
    return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d
      ? ''
      : 'La fecha no existe. Revisa el día, el mes y el año.';
  }
  function range(from, to) {
    const error = date(from) || date(to);
    if (error) return error;
    return from && to && from > to ? 'La fecha Desde no puede ser posterior a Hasta.' : '';
  }
  /* RESPALDOS: revisa profundidad, tamaño lógico y claves peligrosas antes de usar el JSON. */
  function inspectData(root) {
    const stack = [[root, 0]];
    let nodes = 0;
    while (stack.length) {
      const [value, depth] = stack.pop();
      if (++nodes > 2000000 || depth > 16)
        throw Error('El respaldo es demasiado complejo o profundo.');
      if (typeof value === 'number' && !Number.isFinite(value))
        throw Error('El respaldo contiene un número no válido.');
      if (!value || typeof value !== 'object') continue;
      if (Array.isArray(value) && value.length > 100000)
        throw Error('Una lista del respaldo supera el tamaño permitido.');
      if (
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw Error('El respaldo contiene una estructura no admitida.');
      for (const key of Object.keys(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw Error('El respaldo contiene una clave no admitida: ' + key + '.');
        stack.push([value[key], depth + 1]);
      }
    }
  }
  /* REGLAS POR CAMPO. Las cantidades dependen de la variante y del carrito actual. */
  function field(id, value, context = {}) {
    const state = context.state || { products: [], sales: [], cart: [] };
    const values = context.values || {};
    if (['p-name', 'p-category'].includes(id)) {
      const error = text(String(value), id === 'p-name' ? 3 : 2, id === 'p-name' ? 100 : 60);
      return error || (!/[\p{L}]/u.test(value) ? 'Incluye al menos una letra.' : '');
    }
    if (id === 'p-description') return text(String(value), 5, 1000);
    if (id === 'p-price') return number(value, 0.01, 1000000);
    if (id === 'p-discount') return number(value, 0, 90);
    if (id === 'p-stock') return number(value, 0, 1000000, true);
    if (id === 'p-sizes') return list(value, 'sizes');
    if (id === 'p-colors') {
      const error = list(value, 'colors');
      return (
        error ||
        (String(values['p-sizes'] || '').split(',').length * String(value).split(',').length > 100
          ? 'Reduce tallas o colores: el máximo es 100 combinaciones.'
          : '')
      );
    }
    if (id === 'p-image')
      return ['shirt', 'jacket', 'pants', 'red', 'jeans', 'white', 'dress', 'bag'].includes(value)
        ? ''
        : 'Selecciona una fotografía de la lista.';
    if (id === 'p-active') return '';
    if (['movement-reason', 'refund-reason'].includes(id)) return text(String(value), 4, 200);
    if (id === 'movement-type')
      return ['Entrada', 'Ajuste'].includes(value) ? '' : 'Selecciona Entrada o Ajuste.';
    if (id === 'movement-product')
      return state.products.some((p) => p.id === Number(value))
        ? ''
        : 'Selecciona una prenda existente.';
    if (id === 'movement-variant') {
      const p = state.products.find((p) => p.id === Number(values['movement-product']));
      return p && /^\d+$/.test(String(value)) && p.variants[Number(value)]
        ? ''
        : 'Selecciona una talla y color disponibles.';
    }
    if (id === 'movement-qty')
      return number(value, values['movement-type'] === 'Ajuste' ? 0 : 1, 1000000, true);
    if (id === 'cart-variant' || id === 'cart-quantity') {
      const p = state.products.find((p) => p.id === Number(context.recordId));
      const index = id === 'cart-variant' ? value : values['cart-variant'];
      const variant = p?.variants[Number(index)];
      if (!p?.active || !/^\d+$/.test(String(index)) || !variant)
        return 'Selecciona una prenda y una variante válidas.';
      const inCart =
        state.cart.find(
          (i) => i.productId === p.id && i.size === variant.size && i.color === variant.color,
        )?.qty || 0;
      const remaining = variant.stock - inCart;
      if (remaining <= 0)
        return 'Esta variante no tiene más unidades disponibles. Elige otra talla o color.';
      return id === 'cart-quantity' ? number(value, 1, remaining, true) : '';
    }
    if (id === 'refund-item' || id === 'refund-qty') {
      const sale = state.sales.find((s) => s.id === Number(context.recordId));
      const index = id === 'refund-item' ? value : values['refund-item'];
      const item = sale?.items[Number(index)];
      if (
        !sale ||
        sale.status !== 'Entregado' ||
        !/^\d+$/.test(String(index)) ||
        !item ||
        item.qty <= item.returned
      )
        return 'Selecciona una prenda entregada que todavía admita devolución.';
      return id === 'refund-qty' ? number(value, 1, item.qty - item.returned, true) : '';
    }
    if (id === 'next-status')
      return ['Confirmado', 'Entregado', 'Cancelado'].includes(value)
        ? ''
        : 'Selecciona un estado permitido.';
    return '';
  }
  return { text, number, list, date, range, inspectData, field };
})();

/* FORMULARIOS GUIADOS CON JQUERY. Un campo por paso, ayuda visible y validación antes de avanzar. */
const AtelierGuidedForms = (() => {
  function create({ $, getState }) {
    const records = new WeakMap();
    let active = null;
    function values(form) {
      return Object.fromEntries(
        [...form.querySelectorAll('input,select,textarea')]
          .filter((el) => el.id)
          .map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value]),
      );
    }
    function error(el, form) {
      if (el.validity.badInput) return 'Escribe un número válido.';
      const message = AtelierValidation.field(
        el.id,
        el.type === 'checkbox' ? el.checked : el.value,
        { state: getState(), values: values(form), recordId: $(form).data('id') },
      );
      if (message) return message;
      if (el.required && !String(el.value).trim()) return 'Completa este campo antes de continuar.';
      if (!el.validity.valid)
        return el.validationMessage || 'Revisa el formato o los límites del campo.';
      return '';
    }
    function label(field) {
      return field.querySelector('label')?.textContent.trim() || 'este dato';
    }
    function paint(record, focus = false) {
      const { form, fields, index } = record;
      fields.forEach((field, i) => {
        field.hidden = i !== index;
      });
      const field = fields[index],
        control = field.querySelector('input,select,textarea');
      const problem = error(control, form);
      $(control).attr('aria-invalid', String(!!problem)).toggleClass('invalid', !!problem);
      $(field)
        .find('.field-feedback')
        .text(problem || 'Correcto. Puedes continuar.')
        .toggleClass('feedback-ok', !problem);
      $(form)
        .find('.guide-count')
        .text('Paso ' + (index + 1) + ' de ' + fields.length);
      $(form).find('.guide-title').text(label(field));
      $(form)
        .find('.guide-alert')
        .text(
          problem
            ? 'Completa ' + label(field) + '. ' + problem
            : 'Dato válido. ' +
                (index === fields.length - 1
                  ? 'Revisa y confirma el registro.'
                  : 'Pulsa Siguiente para avanzar.'),
        )
        .toggleClass('guide-ok', !problem);
      $(form)
        .find('[data-guide-prev]')
        .prop('disabled', index === 0);
      $(form)
        .find('[data-guide-next]')
        .prop('hidden', index === fields.length - 1)
        .prop('disabled', !!problem);
      $(form)
        .find('button[type=submit]')
        .prop('hidden', index !== fields.length - 1)
        .prop('disabled', !!problem);
      if (focus)
        setTimeout(() => {
          if (document.contains(control)) $(control).trigger('focus');
        }, 30);
    }
    function validateAll(form) {
      const record = records.get(form);
      if (!record) return true;
      const invalid = record.fields.findIndex((field) =>
        error(field.querySelector('input,select,textarea'), form),
      );
      if (invalid < 0) return true;
      record.index = invalid;
      paint(record, true);
      return false;
    }
    function prepare(container) {
      const form = container.querySelector('form');
      if (!form) return;
      const fields = [...form.querySelectorAll('.field')].filter((field) =>
        field.querySelector('input,select,textarea'),
      );
      if (!fields.length) return;
      active = form;
      form.noValidate = true;
      const record = { form, fields, index: 0, busy: false };
      records.set(form, record);
      form.classList.add('guided-form');
      $(form).prepend(
        '<div class="guide-header"><span class="guide-count"></span><strong class="guide-title"></strong></div><div class="guide-alert" role="status" aria-live="polite"></div>',
      );
      fields.forEach((field) => {
        const control = field.querySelector('input,select,textarea');
        const feedbackId = 'feedback-' + control.id;
        $(control).attr('aria-describedby', feedbackId);
        $(field).append($('<p>').addClass('field-feedback').attr('id', feedbackId));
      });
      const actions = $(form).find('.form-actions');
      $(
        '<button type="button" data-guide-prev>Anterior</button><button type="button" class="primary" data-guide-next>Siguiente →</button>',
      ).insertBefore(actions.find('button[type=submit]'));
      $(form).on('input change', 'input,select,textarea', () => paint(record));
      $(form).on('click', '[data-guide-next]', () => {
        if (error(fields[record.index].querySelector('input,select,textarea'), form))
          return paint(record, true);
        record.index++;
        paint(record, true);
      });
      $(form).on('click', '[data-guide-prev]', () => {
        record.index = Math.max(0, record.index - 1);
        paint(record, true);
      });
      /* Enter avanza; solo el último paso válido puede llegar al guardado. */
      form.addEventListener(
        'submit',
        (event) => {
          if (record.busy) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (record.index < fields.length - 1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!error(fields[record.index].querySelector('input,select,textarea'), form)) {
              record.index++;
              paint(record, true);
            } else paint(record, true);
            return;
          }
          if (!validateAll(form)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          record.busy = true;
          $(form).find('button[type=submit]').prop('disabled', true);
          setTimeout(() => {
            record.busy = false;
            if (document.contains(form)) paint(record);
          }, 400);
        },
        true,
      );
      paint(record);
    }
    return {
      prepare,
      validateAll,
      owns: (el) => records.has(el.closest('form')),
      refresh: () => {
        const record = active && records.get(active);
        if (record && document.contains(active)) paint(record);
      },
    };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = { AtelierValidation, AtelierGuidedForms };
