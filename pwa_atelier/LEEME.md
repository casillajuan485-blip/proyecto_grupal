# ATELIER · PWA completa de frontend

Esta versión aplica los requisitos a la tienda de prendas de ATELIER. No añade música,
snacks, equipos ni reservas. Se parte de una copia del proyecto original; su carpeta
original no se modifica. El CSS base, colores, fotografías, iconos y lógica comercial se conservan.

## Abrir

Abre `index.html` con Live Server de VS Code, o publica esta carpeta en un alojamiento
estático HTTPS como GitHub Pages. La aplicación no necesita Node para ejecutarse.
No contiene backend, base de datos, API propia ni servidor de aplicación.
Live Server solo entrega los archivos estáticos durante el desarrollo.

La instalación y el service worker requieren HTTPS o localhost. No se activan mediante
doble clic con una dirección `file://`. Espera «Lista para usar sin conexión» después
de la primera carga correcta. Entonces puedes volver a abrir la aplicación sin acceso
a los archivos de la web. Las fuentes de Google son opcionales; offline se usa una fuente local.

El botón Instalar aparece cuando el navegador lo permite. En iPhone se usa Compartir →
Añadir a pantalla de inicio. El sistema operativo decide el aspecto final de la pantalla de inicio.

## Requisitos y ubicación

| Requisito | Implementación |
|---|---|
| Celular, tablet, laptop y horizontal | `css/pwa.css`, con cuadrículas fluidas y media query de landscape |
| Reverso legible | Texto adaptable, ajuste de palabras, desplazamiento interno para descripciones extensas y acceso a detalles completos |
| Áreas táctiles | Mínimo de 44×44 px y separación; controles +/− propios en cantidades |
| Textos largos | `min-width:0`, ellipsis en títulos y texto completo en detalle |
| Teclado virtual | `100dvh`, VisualViewport, modal dentro del área visible y ocultación del dock cuando se reduce el espacio al escribir |
| click/change/input/submit | Eventos delegados con `.off()`/`.on()` y espacios de nombres; validación de submit en captura con AbortController |
| Manipulación del DOM | Reconciliación de nodos sin cambios; actualizaciones de cuadrícula, filas y contadores |
| fadeIn/fadeOut/slideToggle/show/hide | API jQuery conservada; los slides propios animan solo opacity/transform, no height |
| Accesibilidad del movimiento | `prefers-reduced-motion` en CSS y JavaScript, también al cambiar la preferencia |
| Estado de conexión | online/offline y avisos de errores de carga y respaldo |
| Manifest e instalación | Nombre, colores, inicio, scope, standalone, iconos PNG 192 y 512 maskable |
| Service Worker y Cache Storage | Precaché de HTML/CSS/JS/chunks/JSON/imágenes/iconos; limpieza de versiones propias y actualización aceptada por el usuario |
| Persistencia | localStorage, validación de datos y respaldos JSON; se conserva el estado existente |
| Fetch y JSON | `json/catalogo.json`, validación de respuesta y formato, timeout, respaldo guardado y respaldo incluido |
| Tree shaking | esbuild 0.25.12 ejecutado, con ES modules, minificación y separación de chunks |
| Carga diferida | Vista general, inventario, bitácora, reportes y generador PDF; jsPDF se ejecuta al solicitarlo |
| Offline de los módulos diferidos | Sus archivos se precargan en Cache Storage, aunque su ejecución se retrasa hasta necesitarlos |
| XSS | Validación de textos/importaciones, escape de valores en plantillas, `.text()` en avisos, imágenes limitadas a catálogo y enlaces estáticos seguros |
| Lazy loading y recursos críticos | Fotos de productos diferidas, imagen principal prioritaria y precarga del CSS base |
| Debounce | Búsquedas y filtros del catálogo y de la bitácora |
| Memory leaks | Eventos identificados, destroy por componente, AbortController, limpieza de temporizadores/animaciones/URLs Blob/cargas de scripts y pausa del reloj al ocultar la página |

La información de Cliente/Administrar es una demostración visual, no autenticación.
Las ventas son locales: no se cobra dinero ni se transmiten pedidos. Los datos no se
sincronizan entre equipos. Exporta un respaldo antes de borrar los datos del navegador.

## Organización

| Carpeta/archivo | Uso |
|---|---|
| `index.html` | Estructura y plantillas de la tienda |
| `css/styles.css` | Diseño base original, sin cambios |
| `css/pwa.css` | Adaptación y accesibilidad |
| `js/app.js`, `js/modulos/` | JavaScript de producción, compilado y optimizado |
| `js/lib/` | jQuery y jsPDF originales, con licencias necesarias |
| `json/catalogo.json` | Catálogo inicial |
| `img/` | Fotografías, iconos e iconos de instalación |
| `fuentes/` | Código JavaScript editable y comentado, necesario para mantener y recompilar |
| `manifest.webmanifest`, `sw.js` | Instalación y caché offline |
| `herramientas/compilar.cjs` | Compilación frontend; no es un servidor |
| `herramientas/salidas.json` | Registro para retirar chunks antiguos sin borrar otros archivos |
| `package.json` | Versión fijada de la herramienta de compilación |

No se incluyen node_modules, ejecutables, perfiles de navegador, servidores, pruebas
temporales ni PDFs de prueba. Las fuentes y la salida compilada tienen funciones distintas:
edita `fuentes/`, no el JavaScript minificado de `js/`.

## Editar y recompilar

1. Edita `fuentes/`, `css/` e `index.html`. El catálogo editable está en `fuentes/catalog-source.js`.
2. Instala las dependencias de desarrollo con `npm install`.
3. Ejecuta `npm run build`. Regenera JS, chunks, JSON y versión de caché.
4. Publica los archivos y acepta Actualizar cuando hayas terminado cualquier formulario abierto.

La compilación realizada redujo el código propio de aproximadamente 149 KB a 66 KB,
con seis archivos de ejecución. Este cálculo no incluye las bibliotecas de terceros.
jQuery y jsPDF conservan sus API y licencias; tree shaking se aplica a los ES modules
del proyecto, sin cortar a ciegas funciones dinámicas de las bibliotecas.

## Pruebas realizadas

En Brave se verificaron el inicio, los cuatro módulos administrativos, el formulario,
los controles de cantidad, el carrito, las vistas 390×844, 768×1024, 844×390 y laptop,
la actualización aceptada por el usuario y la conservación del carrito.

Un clic en + cambió 2 camisetas/Bs 178,00 a 3 camisetas/Bs 267,00. Un clic en − restauró
2 unidades/Bs 178,00, sin duplicación de eventos. La recarga con el origen estático
inaccesible conservó los datos. También se generó un PDF válido sin acceso al origen,
cargando sus recursos diferidos desde la caché.

Las pruebas de código pasaron para ventas/stock, persistencia, entradas HTML peligrosas,
importaciones, Fetch en seis escenarios, caché y chunks offline, fallo de instalación del
service worker, activación controlada, eliminación de código sin uso con esbuild,
dimensiones de iconos, rutas y conservación del CSS base.

Estos puntos están implementados. Las pruebas de emulación no equivalen a probar cada
modelo físico de Android/iPhone, ni constituyen una garantía absoluta contra cualquier
ataque o fuga de memoria. La apariencia del teclado y del diálogo de instalación depende
del dispositivo y del navegador.
