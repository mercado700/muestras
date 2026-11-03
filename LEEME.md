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

## Formato del archivo exportado (`muestras-<expediente>-<aaaammdd>.json`)

```json
{ "formato": "muestras-campo", "version": 1,
  "visita": { "id": "uuid", "expediente": "900110", "cliente": "…", "creada": "ISO",
    "unidades": [ { "clave": "hoja|codAgricultor|codCampo|filaExcel", "hoja": "F01", "filaExcel": 5,
        "prd": "100017", "prdVarios": [], "prdHoja": "", "codAgricultor": "A1", "codCampo": "C1",
        "productor": "…", "finca": "…", "cultivos": ["banano"], "haCultivo": 4, "haTotal": 5,
        "bufferHa": 0, "coord": {"lat": -3.2, "lon": -79.9}, "origen": "lista|a_mano" } ],
    "muestras": [ { "id": "uuid", "clave": "<clave de la unidad>", "cultivo": "banano", "numero": 1,
        "puntos": [ { "n": 1, "lat": -3.2578, "lon": -79.9541, "alt": 12, "precision": 6, "hora": "ISO" } ],
        "precintos": { "laboratorio": "", "cu": "", "contramuestra": "NA", "adt": "" }, "nota": "" } ] } }
```

- La unidad se identifica por `clave`, no por nombre ni por PRD: la Lista trae el PRD por hoja (`prd` es `null` si la hoja no tiene o tiene varios; en ese caso `prdVarios` o `prdHoja` dicen qué había). Las unidades a mano llevan `clave` `a_mano|uuid` y no tienen PRD.
- `coord` es opcional y solo sirve para centrar el mapa; no es la ubicación de la finca. Cédulas: nunca se leen ni se guardan.
- No hay campo para el resultado del laboratorio.
- Además: CSV de puntos (`;` separador, punto decimal) y resumen en texto para Notas/WhatsApp.

## Archivos

`index.html`, `app.js` (pantallas), `nucleo.js` (lógica pura), `lista.js` (lector de la Lista y `parseCoord`), `estilos.css`, `sw.js`, `manifest.webmanifest`, íconos (`herramientas/iconos.py` los genera), `vendor/` (Leaflet 1.9.4, SheetJS 0.20.3).
