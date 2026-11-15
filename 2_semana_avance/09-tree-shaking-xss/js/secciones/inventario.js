export function render(ctx) {
const {C,state,inventoryPage,tableSize,plantilla,E,stock}=ctx;

      const page = C.paginate(state.products, inventoryPage, tableSize());
      ctx.setPage(page.page);
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
