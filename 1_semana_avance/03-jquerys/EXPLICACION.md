# Animaciones jQuery

Animaciones originales de catálogo, avisos, menú y detalles desplegables.

## Cómo probar

1. Abre Ver detalles de una prenda y despliega su información: ejecuta slideToggle.
2. Añade una prenda al carrito: aparece el aviso original; el modal se cierra con fadeOut.
3. Abre Más filtros y cambia entre Catálogo y Carrito: observa los efectos de visibilidad.



## Archivos

- index.html: shell de ATELIER y solo las plantillas necesarias.
- css/styles.css y css/pwa.css: copias intactas de los estilos originales.
- css/explicacion.css: únicamente la presentación del recuadro explicativo añadido.
- js/funciones.js: cuerpos de funciones y escuchadores extraídos, más inicialización para montar este recorte.
- js/core.js: núcleo original con su clave local separada para no mezclar proyectos.
- js/app.js: inicia esta carpeta y muestra errores de arranque.
- procedencia.json: archivo, función, línea y copias con SHA-256.

## Qué código ejecuta esta carpeta

- `bind()` — fuentes/app.js, línea 439.
- `releaseDownloads()` — fuentes/app.js, línea 447.
- `later()` — fuentes/app.js, línea 451.
- `debounce()` — fuentes/app.js, línea 455.
- `plantilla()` — fuentes/app.js, línea 481.
- `commit()` — fuentes/app.js, línea 568.
- `safe()` — fuentes/app.js, línea 598.
- `toast()` — fuentes/app.js, línea 609.
- `cartBadge()` — fuentes/app.js, línea 619.
- `modal()` — fuentes/app.js, línea 627.
- `closeModal()` — fuentes/app.js, línea 641.
- `formError()` — fuentes/app.js, línea 650.
- `submitForm()` — fuentes/app.js, línea 654.
- `errorSlot()` — fuentes/app.js, línea 668.
- `actions()` — fuentes/app.js, línea 672.
- `card()` — fuentes/app.js, línea 691.
- `filters()` — fuentes/app.js, línea 821.
- `filterProducts()` — fuentes/app.js, línea 850.
- `cartRows()` — fuentes/app.js, línea 899.
- `sales()` — fuentes/app.js, línea 932.
- `uiIcon()` — fuentes/app.js, línea 1129.
- `catalogSize()` — fuentes/app.js, línea 1152.
- `tableSize()` — fuentes/app.js, línea 1155.
- `mountPager()` — fuentes/app.js, línea 1159.
- `applySalesTab()` — fuentes/app.js, línea 1178.
- `variantOptions()` — fuentes/app.js, línea 1374.
- `detail()` — fuentes/app.js, línea 1390.
- `updateCartMax()` — fuentes/app.js, línea 1425.
- `tick()` — fuentes/app.js, línea 2257.

La lógica de negocio no se reemplaza por ejemplos. El controlador de composición solo elige las vistas incluidas, inicializa el estado y conecta los módulos originales. Se comparten dependencias cuando una función las necesita. Cada carpeta puede publicarse sola.

No utiliza backend ni base de datos. Abre con Live Server o GitHub Pages; file:// no permite los módulos y Fetch correctamente. Para publicar en un repositorio independiente, sube el contenido de esta carpeta, dejando index.html en la raíz.

## Qué hace cada función extraída

| Función | Explicación | Línea original |
|---|---|---|
| `bind()` | Retira y vuelve a registrar el mismo escuchador con namespace .atelier, para que una reinicialización no duplique la acción. | 439 |
| `releaseDownloads()` | Cancela temporizadores de descarga y libera las URL temporales de los archivos Blob. | 447 |
| `later()` | Programa una tarea y conserva su temporizador para poder cancelarlo al salir. | 451 |
| `debounce()` | Espera una pausa al escribir antes de aplicar filtros; cancela el temporizador anterior. | 455 |
| `plantilla()` | Lee un template del index y sustituye sus marcadores por los datos calculados. | 481 |
| `commit()` | Clona el estado, ejecuta la operación, valida y guarda en localStorage antes de actualizar la interfaz. | 568 |
| `safe()` | Captura errores y los muestra con el aviso original, también en operaciones asíncronas. | 598 |
| `toast()` | Muestra un aviso con slideDown y lo oculta con fadeOut; evita acumular animaciones. | 609 |
| `cartBadge()` | Suma las unidades del carrito y actualiza sus contadores. | 619 |
| `modal()` | Abre la ventana original, prepara validaciones y cantidades, y enfoca su primer control. | 627 |
| `closeModal()` | Libera la validación guiada, oculta el modal y devuelve el foco al botón que lo abrió. | 641 |
| `formError()` | Muestra un mensaje de error accesible sin insertar HTML del usuario. | 650 |
| `submitForm()` | Valida el formulario original, realiza la operación, cierra y actualiza; conserva el formulario si hay errores. | 654 |
| `errorSlot()` | Crea el espacio inicialmente oculto destinado a errores del formulario. | 668 |
| `actions()` | Completa la plantilla original de botones Cancelar y Guardar. | 672 |
| `card()` | Completa la tarjeta original con foto, precio, stock, colores, descripción y acciones. | 691 |
| `filters()` | Construye categorías, tallas y colores a partir del catálogo real. | 821 |
| `filterProducts()` | Combina búsqueda y filtros, ordena, pagina y actualiza solo las tarjetas necesarias. | 850 |
| `cartRows()` | Calcula cantidades e importes de las líneas del carrito y genera sus controles. | 899 |
| `sales()` | Calcula el total y completa el carrito y el historial originales. | 932 |
| `uiIcon()` | Genera el HTML de los iconos locales originales. | 1129 |
| `catalogSize()` | Determina cuántas prendas caben por página según el ancho de pantalla. | 1152 |
| `tableSize()` | Determina cuántas filas se muestran por página según el dispositivo. | 1155 |
| `mountPager()` | Completa los controles originales de paginación con el rango y los botones disponibles. | 1159 |
| `applySalesTab()` | Alterna entre carrito e historial sin duplicar bloques de contenido. | 1178 |
| `variantOptions()` | Prepara las opciones reales de talla, color y existencias de una prenda. | 1374 |
| `detail()` | Abre la ficha original de una prenda y su formulario para añadirla al carrito. | 1390 |
| `updateCartMax()` | Resta lo ya añadido y limita la cantidad al stock restante de la variante. | 1425 |
| `tick()` | Actualiza la fecha y hora del dispositivo en la cabecera. | 2257 |

## Núcleo del negocio

`C.fresh()` prepara el estado original; `C.validate()` comprueba su integridad; `C.price()` aplica el descuento; `C.sell()` registra la venta y descuenta existencias; `C.movement()` aplica entradas o ajustes; `C.event()` añade ID, tipo, descripción, responsable y fecha a la bitácora. Estas operaciones conservan su implementación original dentro de js/core.js.
