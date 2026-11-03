# Muestras de campo — especificación (fase 1)

Página web para el celular que usa un inspector de certificación orgánica
(Control Union, Ecuador) para tomar muestras de laboratorio en campo. Se
publica en GitHub Pages (`https://mercado700.github.io/muestras/`), se
instala con «Añadir a pantalla de inicio» y **funciona sin señal**. La usan
Nelson y sus compañeros; no depende de Gravi (la app de escritorio de Nelson).
La fase 2 (puente con Gravi) no se hace ahora, pero el formato de archivo de
esta fase debe servirle.

## La escena que resuelve

Visita a un grupo: 5 productores, una o más muestras cada uno. En cada
muestra el inspector camina la finca y toma submuestras en, por lo general,
**3 puntos** (pueden ser más), separados cientos de metros. Luego sella la
funda: precinto del laboratorio, precinto de Control Union, precinto de
contramuestra si el operador la pidió (si no, «NA») y número de ADT. Hoy lo
hace a ciegas; quiere **ver** qué lleva hecho y qué falta antes de salir.

Reglas del oficio:
- La unidad es **la muestra**, no la finca. Una finca y un cultivo pueden tener
  2 o más muestras; una finca con dos cultivos lleva una muestra por cultivo.
- La identidad de una finca es su **código PRD** de la Lista integrada. Hay
  productores y fincas con nombres iguales o parecidos: nunca se elige por
  nombre tecleado. Si una unidad no tiene código, se muestra marcada
  «sin código»; jamás se inventa.
- El resultado del laboratorio no se toca: no hay campo para él.

## Arquitectura

- Estática, sin compilación: `index.html`, `app.js` (pantallas), `nucleo.js`
  (lógica pura, sin DOM, cargable en Node para pruebas), `lista.js` (lector de
  la Lista integrada; ver abajo), `estilos.css`, `sw.js` (service worker),
  `manifest.webmanifest`, `icono-192.png`, `icono-512.png`, `apple-touch-icon.png`.
- Librerías **copiadas en `vendor/`** (no CDN en tiempo de uso; el service
  worker las precachea): Leaflet 1.9.4 (js, css e imágenes) y SheetJS
  `xlsx.full.min.js` 0.20.3 (de cdn.sheetjs.com). Descárgalas una vez con curl.
- Almacenamiento: **IndexedDB** (visitas y teselas como Blob). Pedir
  `navigator.storage.persist()`. Nada en servidores: la única red es cargar la
  página y bajar teselas.
- Service worker: precache del «shell» (todos los archivos propios y vendor),
  versión en una constante; estrategia cache-first para el shell.
- Todo en español. Fechas `dd/mm/aaaa`, horas `HH:mm`.

## Modelo de datos (también es el archivo de exportación)

```json
{
  "formato": "muestras-campo",
  "version": 1,
  "visita": {
    "id": "uuid", "expediente": "900110", "cliente": "texto", "creada": "ISO",
    "unidades": [
      {"codigo": "PRD-…", "productor": "…", "finca": "…", "cultivos": ["banano"],
       "ha": 12.5, "coord": {"lat": -3.2, "lon": -79.9} , "origen": "lista|a_mano"}
    ],
    "muestras": [
      {"id": "uuid", "codigo": "PRD-…", "cultivo": "banano", "numero": 1,
       "puntos": [{"n": 1, "lat": -3.2578, "lon": -79.9541, "alt": 12,
                   "precision": 6, "hora": "ISO"}],
       "precintos": {"laboratorio": "", "cu": "", "contramuestra": "NA", "adt": ""},
       "nota": ""}
    ]
  }
}
```
`coord` es opcional. `numero` cuenta por finca y cultivo (Muestra 1, 2…).

## Pantallas

1. **Visitas**: lista de visitas guardadas (expediente, cliente, fecha,
   «3/5 productores con muestra»). Botón «Nueva visita» (pide expediente y
   cliente) e «Importar archivo» (un JSON de este formato; fase 2 lo generará Gravi).
2. **Visita**:
   - Encabezado con expediente y cliente.
   - Si no hay unidades: botón «Cargar Lista integrada» (input file .xls/.xlsx).
     Tras leer, pantalla de selección: lista de unidades con casillas para
     marcar las que entran en esta visita, buscador por nombre o código, cada
     fila muestra **código grande**, productor, finca, cultivos y ha. Alertar
     visualmente si dos unidades comparten nombre de finca o de productor.
   - Lista de unidades incluidas con su estado y sus muestras:
     `● Juan Pérez · La Gloria · PRD-… / Muestra 1 banano ✓3 puntos ✓precintos`.
     Estados con color y texto (no solo color).
   - «+ Muestra» en cada unidad (elige cultivo si tiene varios).
   - Botones fijos abajo: «Revisar antes de salir» y «Exportar».
   - «Agregar unidad a mano» existe, pero queda marcada «a mano · sin código».
3. **Muestra**:
   - Mapa (Leaflet) a pantalla parcial: satélite de la caché si hay; si no hay
     teselas, fondo neutro con cuadrícula y escala (los puntos se ven igual).
     Puntos numerados, líneas entre consecutivos con su distancia en m,
     posición actual en azul con círculo de precisión.
   - Indicador de GPS en vivo (`watchPosition`, `enableHighAccuracy`):
     «GPS ±6 m». Verde ≤10 m, ámbar ≤25 m, rojo >25 m.
   - Botón grande **Marcar punto** (mínimo 64 px de alto, al pulgar). Si la
     precisión es >15 m pide confirmar («La precisión es ±32 m. ¿Marcar igual?»).
     Si el punto queda a <20 m del anterior, avisa al instante en la tarjeta.
   - Lista de puntos (n, hora, coordenada en decimal y GMS, ±m, distancia al
     anterior) con borrar (con confirmación) y volver a marcar.
   - Precintos: laboratorio, CU, contramuestra (por defecto «NA») y ADT.
     Teclado numérico donde aplique (`inputmode`).
   - Nota libre opcional.
4. **Revisar antes de salir** (lógica en `nucleo.js`, probada):
   - Error: muestra con menos de 3 puntos; sin precinto de laboratorio o de CU;
     sin ADT; **mismo precinto usado en dos sitios** (cualquier campo, entre
     todas las muestras de la visita, ignorando «NA» y espacios/mayúsculas).
   - Aviso: dos puntos de la misma muestra a <20 m; punto con precisión >15 m;
     unidad incluida sin ninguna muestra (puede ser correcto, solo informa).
   - Cada línea lleva a la muestra con un toque.
5. **Mapa sin señal** (desde Visita): «Descargar mapa de la zona». Zona = caja
   alrededor de las `coord` de las unidades incluidas con margen de 500 m, o
   si no hay coord, radio de 1 km alrededor de la posición actual. Zooms
   13–18. Mostrar antes cuántas teselas y MB aprox. (≈20 KB c/u); barra de
   progreso; cancelar; reintentos; tope de 3000 teselas por descarga. Fuente:
   Esri World Imagery
   `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
   con atribución visible «Imágenes: Esri». La capa del mapa lee de IndexedDB
   y, si hay red y no está, la baja y la guarda.
   **Dos capas, con selector «Satélite | Mapa»** sobre el mapa (pedido de
   Nelson, 03-11-2026). «Mapa» = Esri World Street Map
   `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}`
   (caminos, poblados, ríos). La descarga para campo baja las dos por
   defecto, con casillas para elegir; las teselas se guardan por capa. La
   capa elegida se recuerda.
6. **Exportar**:
   - Archivo JSON (el modelo de arriba) con `navigator.share({files})` si
     existe (en iPhone permite «Guardar en Archivos»), si no descarga.
     Nombre: `muestras-<expediente>-<aaaammdd>.json`.
   - CSV de puntos (`;` como separador, coma decimal NO: usar punto decimal).
   - Resumen en texto para Notas/WhatsApp: por muestra, unidad con código,
     cultivo, puntos con coordenada GMS y enlace `https://maps.apple.com/?ll=lat,lon`,
     precintos y ADT.

## Lector de la Lista integrada (`lista.js`)

Función pura `leerLista(workbook) -> {unidades:[…], avisos:[…]}` sobre el
objeto de SheetJS. Medido el 03-11-2026 contra 129 Listas reales 2024-2026
(203 hojas de datos). Formato ORG.PMOREV.F11 v1.1.

**Hallazgo que cambia la identidad:** la Lista **no trae un PRD por finca**.
El PRD está en una línea de cabecera de cada hoja, encima de la tabla
(«Licensee-unit no.: PRD 100017»). En 85 % de las hojas hay un solo PRD; hay
hojas con varios PRD, con PRD y PRC mezclados («PRD 070990;PRC 060539»), y
hojas sin PRD («F01», «900110 - F01», vacío). En grupos puede haber **un
solo PRD para 28 productores**. La columna «Cód. del campo / predio» es un
código del cliente (p. ej. «42360», «FTO 481», «AB001»), no del OC, y puede
repetirse. Hay grupos donde un tercio de las fincas comparten nombre.

Por eso la identidad de una unidad en la página es la **clave compuesta**
`hoja | cód. agricultor | cód. campo | fila Excel`, y en pantalla cada
unidad muestra **productor, finca, cód. de campo y PRD de la hoja** (o
«sin código PRD (la hoja dice: F01)», o «varios PRD: …»). Nunca se inventa
ni se hereda un PRD de otra hoja. En el modelo de datos, cada unidad lleva
`clave`, `hoja`, `filaExcel`, `prd` (null si 0 o varios), `prdVarios`,
`codAgricultor`, `codCampo`, `productor`, `finca`, `cultivos[]`, `haCultivo`,
`haTotal`, `bufferHa`, `coord`; y cada muestra referencia la unidad por `clave`
(no por `codigo`). Sin cédulas en ningún sitio.

Regla de lectura:
```js
for (hoja of libro) {
  if (/instrucc|instructivo|ejemplo|registro del sic|retirados|glosario|portada|indice/.test(norm(hoja.nombre))) continue;
  h = filaEncabezado(grid, 20);   // en las primeras 20 filas: celda "ID." o "Cód…Agricultor" (sin "Nombre" ni "Cédula")
  if (h < 0) continue;
  prd = [...textoDeFilas(0..h).matchAll(/PRD\s*(\d+)/g)].map(m => m[1]);
  prc = [...textoDeFilas(0..h).matchAll(/PRC\s*(\d+)/g)].map(m => m[1]);
  ci = {codAgr: col(["cod","agricultor"], sin ["nombre","cedula"]),
        codCampo: col(["cod","campo"], sin ["nombre"]),
        finca: col(["nombre del campo"]),
        haCultivo: col(["area de cultivo"]), haTotal: col(["area total"]),
        cultivo: col(["cultivo"], sin ["area","sistema"]),
        coord: col(["coordenadas"])};
  // Títulos normalizados: sin tildes, minúsculas. Si falta un título, ese dato queda vacío: NUNCA la columna vecina.
  // Productor: apellidos + nombres; en la fila h+1 hay subtítulos "APELLIDOS" y "NOMBRES" que dicen qué columnas son.
  for (fila de h+1 hasta la primera cuya primera celda con texto empiece por NOTA|TOTAL|RESUMEN|COLUMNAS|RENDIMIENTO:) {
    if (!productor || productor es "APELLIDOS"/"NAN" || (/\d/.test(productor) && productor.length < 10)) continue;
    if (isNaN(num(fila[ci.haCultivo]))) continue;
    aux = /AMORTIGUAMIENTO|BUFFER|PROTECCION/.test(norm(finca)) || /\(?ZB\)?$|^ZA$/i.test(codCampo);
    if (aux) { predio al que pertenece (mismo codCampo o mismo nombre base).bufferHa += haCultivo; continue; } // la zona buffer es parte de la unidad, nunca unidad propia
    if (cultivo es barbecho / sin cultivo || haCultivo <= 0) continue;
    unidades.push({...});
  }
}
// Mismo predio = misma hoja + mismo codCampo + misma finca: se funden filas de distinto cultivo en cultivos[].
```
`parseCoord`: acepta GMS («S 03° 14' 15'' W 79° 48' 14''», comillas mezcladas),
grados con minutos decimales, decimal con coma o punto y S/O («2,01012° S,
79,48063° O»), y UTM («620000.000/9630000.000», WGS84 zona 17 Sur). Valida
Ecuador (lat −5.1 a 1.7; lon −81.2 a −75.1); si no, `null` con motivo
(hay valores rotos como «79°90'»). Esa coordenada suele ser de la empacadora o
del centro, no de la finca: **solo sirve para centrar el mapa**.

Fuera de alcance: Listas viejas sin tabla F11 y `.xls` mal formados (avisar).

## Diseño

- Calma y claridad: fondo claro cálido, modo oscuro con gris carbón (nunca
  negro puro `#000`), un color de acento, tipografía del sistema, tamaño base
  17 px, objetivos táctiles ≥ 44 px, nada de animaciones superfluas.
- Pensada para una mano y sol fuerte: contraste alto, botones abajo.
- Respeta las áreas seguras del iPhone (`env(safe-area-inset-*)`).

## Fase 1b (después, no ahora): el plano de la finca con anclas en campo

Pedido de Nelson (03-11-2026): cargar el plano de la finca (foto o PDF del
cliente, a menudo dibujado a mano) y georreferenciarlo **caminando**: en una
esquina conocida, tocar ese sitio en el plano → ancla (píxel ↔ GPS). Con 2
anclas, similitud (escala, giro, traslación); con 3 o más, afín por mínimos
cuadrados, mostrando el error de cada ancla en metros para saber cuánto
fiarse de un plano deformado. Desde ahí, la posición en vivo y los puntos de
muestra se ven **sobre el plano**. Es el mismo modelo de Gravi Mapas
(`anchors: [{pdf:{x,y}, sat:{e,n}}]`, `calibration`), para que en la fase 2
los planos que Nelson ya georreferenció lleguen hechos y las anclas de campo
vuelvan a Gravi. PDF con pdf.js en `vendor/`.

Vistas de la pantalla Muestra (pedido de Nelson, 03-11-2026), con un selector
de tres botones arriba del mapa: **Satélite | Plano | Los dos**. «Plano»
enseña el PDF o la foto de la finca con la posición en vivo y los puntos
encima (solo si tiene al menos 2 anclas; si no, invita a anclarlo). «Los dos»
pone el plano encima del satélite con un deslizador de transparencia, para
ver si el plano está bien anclado. Los puntos son los mismos en las tres
vistas: se guardan en lat/lon y se proyectan.

## Pruebas

`node pruebas.mjs` (o .cjs) prueba `nucleo.js`: distancia haversine, conversión
a GMS, numeración de muestras, cada regla de «Revisar antes de salir»
(incluido el precinto repetido), exportación CSV, y `lista.js` con un libro
sintético.

## Fase 2: puente con Gravi (contrato, 03-11-2026)

Decidido con Nelson: **el ADT es uno por visita** (como en Gravi, que lo
guarda en `inspectionFacts.numADT` y lo lleva a `zxnumadt` del encabezado).

### Ida: `iCloud Drive/Gravi/Campo/visitas-de-campo.json` (lo escribe Gravi)

```json
{
  "formato": "gravi-visitas-campo", "version": 1, "generado": "ISO",
  "visitas": [
    {
      "id": "900173/general",            // <expediente>/<carpeta de visita de Gravi>
      "expediente": "900173", "visita": "general",
      "cliente": "…", "tipo": "no_anunciada", "tipoTexto": "No anunciada",
      "modo": "individual",                // o "grupo"
      "desde": "2026-10-23", "hasta": "2026-10-23",   // fechas de VISITA (no el periodo evaluado)
      "numADT": "700001",                  // "" si aún no hay
      "unidades": [
        {"clave": "PRD 100974", "codigo": "PRD 100974", "productor": "", "finca": "FINCA EJEMPLO",
         "hoja": "F-01", "cultivos": ["Banano"], "ha": 9.97, "estatus": "organico",
         "adicion": null, "coord": null}
      ]
    }
  ]
}
```
- Solo unidades de **campo** incluidas en la visita (`inspectionFacts.campo`).
- En **grupo**, una unidad por socio visitado con finca: `clave = "<PRD>|<socio>|<finca>"`,
  `codigo` = PRD del grupo, `productor` = socio, `finca` = finca del socio.
- `coord` opcional `{lat, lon}` solo para centrar el mapa.
- Entran las visitas con `hasta >= hoy − 1 día`; las pasadas se caen.

### Página
- «Traer de Gravi»: importa ese archivo. Crea o actualiza visitas por `id`
  (`origen: "gravi"`, `graviId`). Al actualizar: agrega unidades nuevas,
  actualiza datos de las existentes (por `clave`), **nunca** borra unidades
  que ya tienen muestras ni toca muestras/puntos/precintos; una unidad que
  Gravi ya no trae y no tiene muestras se quita, con muestras se marca «ya no
  está en Gravi».
- Inicio = **agenda**: visitas ordenadas por fecha (Hoy, Mañana, fecha),
  luego las pasadas/sin fecha.
- **ADT por visita**: `visita.adt` (de Gravi `numADT` o tecleado una vez en
  la Visita). Las muestras ya no llevan ADT. Migración de visitas guardadas:
  si todas las muestras tienen el mismo ADT (o vacío), pasa a la visita; si
  difieren, se toma el más repetido y «Revisar» avisa. «Revisar» exige ADT de
  visita (error si falta).

### Vuelta: el JSON exportado (formato `muestras-campo`, versión 2)
Igual que la v1 más: `visita.origen`, `visita.graviId`, `visita.adt`, y en
cada unidad `codigo` (PRD) y, en grupo, `productor`/`finca` del socio. Las
muestras: `{id, clave, cultivo, numero, puntos[{n,lat,lon,alt,precision,hora}],
precintos{laboratorio,cu,contramuestra}, nota}`. Gravi importa en Mapas.
