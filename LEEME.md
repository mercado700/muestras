# Muestras de campo

Página web para el celular, pensada para el inspector que toma muestras de laboratorio en campo. Marca los puntos de cada muestra con el GPS, guarda los precintos y el ADT, y antes de salir de la finca enseña qué falta («Revisar antes de salir»). Funciona sin señal y no depende de Gravi. Todo queda en el teléfono (IndexedDB); lo único que usa la red es cargar la página y bajar teselas del mapa (Esri).

Especificación: `ESPECIFICACION.md`.

## Probar en el computador

```
cd muestras-campo
python3 -m http.server 8765
```
y abrir `http://localhost:8765/`. Detener con Ctrl+C. Pruebas de la lógica: `node pruebas.cjs`.

## Instalar en el iPhone

1. Abrir la dirección publicada en **Safari** (con señal).
2. Compartir, «Añadir a pantalla de inicio».
3. Abrirla una vez con señal: el service worker guarda la página y las librerías. Después abre sin señal.
4. En la visita, «Mapa sin señal» baja las teselas de la zona (satélite y mapa de calles) mientras haya señal.

Si se cambia cualquier archivo, subir la constante `VERSION` de `sw.js` para que los teléfonos se actualicen.

## Publicar en GitHub Pages

Crear el repositorio `muestras` en la cuenta `mercado700`, subir el contenido de esta carpeta (rama `main`) y en Settings, Pages, elegir «Deploy from a branch», `main`, `/ (root)`. Queda en `https://mercado700.github.io/muestras/`. Todo usa rutas relativas.

## Traer de Gravi

En el inicio, «Traer de Gravi» lee `visitas-de-campo.json` (formato `gravi-visitas-campo`, lo escribe Gravi en `iCloud Drive/Gravi/Campo/`). Crea o actualiza visitas por `id` (`origen: "gravi"`, `graviId`): agrega unidades nuevas y actualiza los datos de las existentes (por `clave`), pero **nunca** toca muestras, puntos ni precintos. Una unidad que Gravi ya no trae se quita si no tiene muestras; si las tiene, se conserva marcada «ya no está en Gravi». Un ADT ya escrito en el teléfono no se pisa. Un archivo mal formado se rechaza entero, con el motivo. Al terminar enseña el resumen («3 visitas nuevas, 1 actualizada»). El inicio es la agenda: próximas por fecha de visita (Hoy, Mañana, dd/mm/aaaa o rango), luego pasadas y sin fecha.

El **ADT es uno por visita** (`visita.adt`): viene de Gravi (`numADT`) o se teclea una vez arriba en la pantalla de la visita. Las visitas guardadas antes (y los archivos v1) se migran al abrirlas: si todas las muestras comparten ADT, pasa a la visita; si difieren, se toma el más repetido y «Revisar» avisa «Había ADT distintos por muestra: …». «Revisar» da error si falta el ADT de la visita.

## Formato del archivo exportado (`muestras-<expediente>-<aaaammdd>.json`), versión 2

```json
{ "formato": "muestras-campo", "version": 2,
  "visita": { "id": "uuid", "origen": "gravi|a_mano", "graviId": "900173/general", "adt": "700001",
    "expediente": "900173", "cliente": "…", "creada": "ISO",
    "unidades": [ { "clave": "PRD 100974", "codigo": "PRD 100974", "productor": "", "finca": "Finca Ejemplo",
        "hoja": "F-01", "cultivos": ["banano"], "origen": "gravi|lista|a_mano" } ],
    "muestras": [ { "id": "uuid", "clave": "<clave de la unidad>", "cultivo": "banano", "numero": 1,
        "puntos": [ { "n": 1, "lat": -3.2578, "lon": -79.9541, "alt": 12, "precision": 6, "hora": "ISO" } ],
        "precintos": { "laboratorio": "", "cu": "", "contramuestra": "NA" }, "nota": "" } ] } }
```

- `graviId` solo existe en visitas de Gravi. En grupo, cada unidad lleva el `productor` y la `finca` del socio y el `codigo` del grupo; las unidades de la Lista llevan además `prd`, `hoja`, `codCampo`, etc.
- La unidad se identifica por `clave`, no por nombre ni por PRD: la Lista trae el PRD por hoja (`prd` es `null` si la hoja no tiene o tiene varios). Las unidades a mano llevan `clave` `a_mano|uuid` y no tienen código.
- El ADT va una sola vez, en la visita; las muestras ya no lo llevan. Importar sigue aceptando la versión 1 (el ADT de las muestras se migra a la visita).
- `coord` es opcional y solo sirve para centrar el mapa; no es la ubicación de la finca. Cédulas: nunca se leen ni se guardan.
- No hay campo para el resultado del laboratorio.
- Además: CSV de puntos (`;` separador, punto decimal; el ADT va en la columna `adt`) y resumen en texto para Notas/WhatsApp (el ADT sale una vez en la cabecera).

## Archivos

`index.html`, `app.js` (pantallas), `nucleo.js` (lógica pura), `lista.js` (lector de la Lista y `parseCoord`), `estilos.css`, `sw.js`, `manifest.webmanifest`, íconos (`herramientas/iconos.py` los genera), `vendor/` (Leaflet 1.9.4, SheetJS 0.20.3).
