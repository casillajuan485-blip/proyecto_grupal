export function render(ctx) {
const {plantilla,state,C}=ctx;

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
