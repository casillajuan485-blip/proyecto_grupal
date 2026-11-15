export function render(ctx) {
const {state,metrics,plantilla,card,recent,date}=ctx;

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
