# ImpressReady PDF & Canvas Engine

Motor client-side en TypeScript para imposición vectorial PDF y procesamiento de imagen sobre Canvas 2D extraído de [ImpressReady](https://impressready.com).

La aplicación web completa (interfaz React, autenticación con Firebase y gestión de suscripciones) se mantiene en un repositorio privado. Este repositorio contiene el núcleo matemático y binario que procesa los documentos directamente en el navegador (`Uint8Array` y `Uint8ClampedArray`) sin subir archivos a ningún servidor.

## Módulos principales

- **Imposición PDF vectorial (`src/lib/pdf-engine.ts`):**
  - `createBookletPdf`: rellena páginas hasta múltiplos de 4 y ordena pliegos frente/dorso sobre A4 apaisado para encuadernación en caballete (saddle-stitch).
  - `createNUpPdf`: generación de rejillas `2/4/6/8/9-up` y formato `handout_3up` con líneas de notas.
  - `createBrochureFoldPdf`: maquetación para dípticos y trípticos (`bifold`, `trifold_c`, `trifold_z`) en A4 o A3 con guías de plegado.
  - Utilería de imprenta: márgenes alternos de encuadernación (`createGutterMarginPdf`), separación por páginas a color vs. escala de grises (`splitPdfByColor`), normalización de `/Rotate` (`createAutoRotatePdf`), plantillas vectoriales (`createTemplatePdf`) y lomos de archivador.
  - Helper `embedAllPdfPages`: extrae explícitamente `srcDoc.getPageIndices()` para evitar el comportamiento por defecto de `pdf-lib` (que solo incrusta la página `0` si no se indican índices).
- **Ahorro de tóner y limpieza de escaneos (`src/lib/color-algorithms.ts`, `src/lib/adaptive-threshold.ts`, `src/lib/canvas-utils.ts`):**
  - `processInkSaver`: evalúa luminancia ITU-R BT.601 y saturación HSV por píxel para convertir fondos oscuros a blanco puro (`#FFFFFF`) conservando gráficos y fotografías.
  - `cleanDocumentScan`: umbralización adaptativa por ventana deslizante local para limpiar sombras en documentos fotografiados desde el móvil.
  - Conversiones exactas `mm -> pt` y `mm -> px` a 300 DPI con control de área máxima de canvas en navegador.
- **Cálculo de lomos y cubiertas (`src/lib/book-spine.ts`):**
  - Geometría de cubierta completa con sangrado, ancho de lomo y cajeado para tapa blanda (PUR) y tapa dura a partir de 8 gramajes y calibres de papel.

## Estructura

```text
src/
  index.ts
  types/index.ts
  lib/
    adaptive-threshold.ts
    batch-processor.ts
    book-spine.ts
    canvas-utils.ts
    color-algorithms.ts
    pdf-engine.ts
tests/
  helpers/mock-canvas.ts
  canvas-and-book-spine.test.ts
  color-and-scan-algorithms.test.ts
  pdf-imposition-and-prepress.test.ts
```

## Verificación en local

La suite de Vitest genera PDFs binarios reales con `pdf-lib` y ejecuta los filtros RGBA sobre un mock ligero de `CanvasRenderingContext2D` en memoria:

```bash
npm install
npm run typecheck
npm test
```
