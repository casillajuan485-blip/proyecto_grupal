# Compilación y validación segura

Inventario y formulario original con validación, escape y compilación de sus módulos.

## Cómo probar

1. Pulsa Añadir prenda y escribe una etiqueta HTML en el nombre: la validación debe rechazarla.
2. Crea una prenda con datos válidos y comprueba que aparece en el inventario.
3. Consulta la comparación de compilación y las fuentes: ambos paquetes proceden de estos mismos módulos.



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
- `plantilla()` — fuentes/app.js, línea 481.
- `commit()` — fuentes/app.js, línea 568.
- `safe()` — fuentes/app.js, línea 598.
- `toast()` — fuentes/app.js, línea 609.
- `modal()` — fuentes/app.js, línea 627.
- `closeModal()` — fuentes/app.js, línea 641.
- `formError()` — fuentes/app.js, línea 650.
- `submitForm()` — fuentes/app.js, línea 654.
- `errorSlot()` — fuentes/app.js, línea 668.
- `actions()` — fuentes/app.js, línea 672.
- `inventory()` — fuentes/app.js, línea 897.
- `uiIcon()` — fuentes/app.js, línea 1129.
- `tableSize()` — fuentes/app.js, línea 1155.
- `mountPager()` — fuentes/app.js, línea 1159.
- `productForm()` — fuentes/app.js, línea 1439.
- `movementForm()` — fuentes/app.js, línea 1496.
- `updateMovementVariant()` — fuentes/app.js, línea 1522.
- `tick()` — fuentes/app.js, línea 2257.

La lógica de negocio no se reemplaza por ejemplos. El controlador de composición solo elige las vistas incluidas, inicializa el estado y conecta los módulos originales. Se comparten dependencias cuando una función las necesita. Cada carpeta puede publicarse sola.

No utiliza backend ni base de datos. Abre con Live Server o GitHub Pages; file:// no permite los módulos y Fetch correctamente. Para publicar en un repositorio independiente, sube el contenido de esta carpeta, dejando index.html en la raíz.

## Qué hace cada función extraída

| Función | Explicación | Línea original |
|---|---|---|
| `bind()` | Retira y vuelve a registrar el mismo escuchador con namespace .atelier, para que una reinicialización no duplique la acción. | 439 |
| `releaseDownloads()` | Cancela temporizadores de descarga y libera las URL temporales de los archivos Blob. | 447 |
| `later()` | Programa una tarea y conserva su temporizador para poder cancelarlo al salir. | 451 |
| `plantilla()` | Lee un template del index y sustituye sus marcadores por los datos calculados. | 481 |
| `commit()` | Clona el estado, ejecuta la operación, valida y guarda en localStorage antes de actualizar la interfaz. | 568 |
| `safe()` | Captura errores y los muestra con el aviso original, también en operaciones asíncronas. | 598 |
| `toast()` | Muestra un aviso con slideDown y lo oculta con fadeOut; evita acumular animaciones. | 609 |
| `modal()` | Abre la ventana original, prepara validaciones y cantidades, y enfoca su primer control. | 627 |
| `closeModal()` | Libera la validación guiada, oculta el modal y devuelve el foco al botón que lo abrió. | 641 |
| `formError()` | Muestra un mensaje de error accesible sin insertar HTML del usuario. | 650 |
| `submitForm()` | Valida el formulario original, realiza la operación, cierra y actualiza; conserva el formulario si hay errores. | 654 |
| `errorSlot()` | Crea el espacio inicialmente oculto destinado a errores del formulario. | 668 |
| `actions()` | Completa la plantilla original de botones Cancelar y Guardar. | 672 |
| `inventory()` | Solicita al módulo original de inventario el HTML de su tabla de prendas. | 897 |
| `uiIcon()` | Genera el HTML de los iconos locales originales. | 1129 |
| `tableSize()` | Determina cuántas filas se muestran por página según el dispositivo. | 1155 |
| `mountPager()` | Completa los controles originales de paginación con el rango y los botones disponibles. | 1159 |
| `productForm()` | Abre el formulario original para crear o editar una prenda con sus datos reales. | 1439 |
| `movementForm()` | Abre el formulario original de entrada o ajuste de existencias. | 1496 |
| `updateMovementVariant()` | Actualiza las tallas y colores cuando cambia la prenda seleccionada. | 1522 |
| `tick()` | Actualiza la fecha y hora del dispositivo en la cabecera. | 2257 |

## Núcleo del negocio

`C.fresh()` prepara el estado original; `C.validate()` comprueba su integridad; `C.price()` aplica el descuento; `C.sell()` registra la venta y descuenta existencias; `C.movement()` aplica entradas o ajustes; `C.event()` añade ID, tipo, descripción, responsable y fecha a la bitácora. Estas operaciones conservan su implementación original dentro de js/core.js.

La compilación se reproduce con npm install y npm run build. En esta extracción ya se seleccionaron las dependencias y ambos paquetes tienen el mismo tamaño: tree shaking está activado, pero no elimina bytes adicionales. No se añadieron funciones artificiales para fabricar una reducción.
