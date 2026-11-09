/* REPORTES PDF EN EL NAVEGADOR.
   Usa la copia local de jsPDF: https://github.com/parallax/jsPDF (licencia MIT).
   Este archivo es JavaScript de frontend; no necesita servidor ni servicios externos.
   create() prepara el documento; app.js activa su descarga después de un clic. */
const AtelierPdf = (() => {
  /* TEXTO DEL PDF. Conserva los caracteres españoles de la fuente Helvetica y
     sustituye caracteres ajenos a su alfabeto. No interpreta el contenido como HTML. */
  function clean(value) {
    return String(value ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\x20-\x7e\xa0-\xff]/g, '-');
  }

  /* DOCUMENTO COMPLETO. Recibe ventas ya filtradas por período y funciones de formato.
     Incluye canceladas en el historial, pero no en el importe ni en la frecuencia. */
  function create(sales, options, Pdf) {
    if (!Pdf) throw Error('No se pudo cargar jsPDF. Revisa js/lib/jspdf.umd.min.js.');
    const doc = new Pdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const money = options.money;
    const date = options.date;
    let y = 43;
    const width = 178;
    const active = sales.filter((s) => s.status !== 'Cancelado');
    const net = (s) => s.items.reduce((sum, i) => sum + i.price * (i.qty - i.returned), 0);

    /* CABECERA. Se repite al añadir páginas para conservar el contexto del reporte. */
    function header() {
      doc.setFillColor(21, 37, 33);
      doc.rect(0, 0, 210, 32, 'F');
      doc.setTextColor(193, 240, 216);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('ATELIER', 16, 14);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text('Reporte de ventas y frecuencia de prendas', 16, 22);
      doc.setTextColor(60, 70, 70);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        clean('Período: ' + (options.from || 'Inicio') + ' a ' + (options.to || 'Actualidad')),
        16,
        38,
      );
      y = 44;
    }

    /* SALTO DE PÁGINA. Ninguna fila se corta entre dos páginas. */
    function room(height) {
      if (y + height > 276) {
        doc.addPage();
        header();
        return true;
      }
      return false;
    }

    /* PÁRRAFO. Ajusta el texto al ancho A4 y respeta los márgenes. */
    function paragraph(text, size = 9) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(clean(text), width);
      for (const line of lines) {
        room(5);
        doc.text(line, 16, y);
        y += 5;
      }
      y += 2;
    }

    /* TÍTULO DE SECCIÓN. Usa el mismo color que la interfaz. */
    function title(text) {
      room(18);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(28, 91, 69);
      doc.text(clean(text), 16, y);
      y += 8;
      doc.setTextColor(40, 46, 48);
    }

    /* TABLA CON VARIAS PÁGINAS. Repite sus encabezados y envuelve los nombres largos. */
    function table(headings, rows, widths) {
      function tableHeader() {
        room(9);
        doc.setFillColor(231, 240, 234);
        doc.rect(16, y - 4, width, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        let x = 18;
        headings.forEach((heading, i) => {
          doc.text(clean(heading), x, y + 1);
          x += widths[i];
        });
        y += 9;
      }
      tableHeader();
      for (const row of rows) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const cells = row.map((cell, i) => doc.splitTextToSize(clean(cell), widths[i] - 4));
        const height = Math.max(...cells.map((lines) => lines.length)) * 4 + 4;
        if (room(height)) tableHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        let x = 18;
        cells.forEach((lines, i) => {
          doc.text(lines, x, y);
          x += widths[i];
        });
        y += height;
        doc.setDrawColor(220, 226, 223);
        doc.line(16, y - 3, 194, y - 3);
      }
    }

    header();
    paragraph('Preparado: ' + date(options.generatedAt) + ' | Fecha y hora del dispositivo.', 8);
    title('Resumen del período');
    paragraph(
      'Operaciones: ' +
        sales.length +
        ' | Activas: ' +
        active.length +
        ' | Canceladas: ' +
        (sales.length - active.length),
    );
    paragraph('Importe neto registrado: ' + money(active.reduce((sum, s) => sum + net(s), 0)));
    paragraph(
      'Entregadas, neto: ' +
        money(active.filter((s) => s.status === 'Entregado').reduce((sum, s) => sum + net(s), 0)),
    );
    paragraph(
      'Pedidos por entregar, neto: ' +
        money(active.filter((s) => s.status !== 'Entregado').reduce((sum, s) => sum + net(s), 0)),
    );
    paragraph(
      'DEMO: ' +
        sales.filter((s) => s.demo).length +
        ' operaciones de prueba. Los pedidos pendientes no representan pagos cobrados. Las devoluciones se descuentan del neto. No es un comprobante fiscal.',
      8,
    );

    title('Frecuencia de prendas vendidas');
    const ranking = new Map();
    active.forEach((s) =>
      s.items.forEach((item) => {
        const current = ranking.get(item.productId) || { name: item.name, qty: 0, total: 0 };
        current.qty += item.qty - item.returned;
        current.total += (item.qty - item.returned) * item.price;
        ranking.set(item.productId, current);
      }),
    );
    const ranked = [...ranking.values()]
      .filter((item) => item.qty > 0)
      .sort((a, b) => b.qty - a.qty);
    if (ranked.length)
      table(
        ['Prenda', 'Unidades netas', 'Importe neto'],
        ranked.map((item) => [item.name, item.qty, money(item.total)]),
        [98, 38, 42],
      );
    else paragraph('No hay prendas vendidas en este período.');

    title('Historial de ventas y pedidos');
    if (!sales.length) paragraph('No se registraron operaciones en el período elegido.');
    else
      table(
        ['Venta / origen', 'Fecha / canal', 'Estado', 'Neto'],
        sales
          .slice()
          .reverse()
          .map((s) => [
            '#' + String(s.id).padStart(4, '0') + (s.demo ? ' DEMO' : ''),
            date(s.at) + ' / ' + s.channel,
            s.status,
            s.status === 'Cancelado' ? money(0) : money(net(s)),
          ]),
        [35, 68, 37, 38],
      );

    /* NUMERACIÓN FINAL. Se añade después de conocer el total de páginas. */
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 110, 105);
      doc.text('ATELIER | Reporte local de demostración', 16, 287);
      doc.text(page + ' / ' + pages, 194, 287, { align: 'right' });
    }
    return doc;
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = AtelierPdf;
