export function render(ctx) {
const {reportSales,reportFrom,reportTo,metrics,C,date,plantilla,E,state,stock}=ctx;

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
