// node pruebas.cjs
const assert = require('assert');
const N = require('./nucleo.js');
const Lista = require('./lista.js');
const { leerLista, parseCoord } = Lista;
let ok = 0, fallos = 0;
function prueba(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('FALLA ' + nombre + '\n      ' + e.message); }
}
const cerca = (a, b, t) => assert.ok(Math.abs(a - b) <= t, `${a} no está a ${t} de ${b}`);

// Punto a ~dM metros al este de (lat, lon)
const este = (p, dM) => ({ lat: p.lat, lon: p.lon + dM / (111320 * Math.cos(p.lat * Math.PI / 180)) });
const A = { lat: -3.2578, lon: -79.9541 };
const pt = (n, pos, precision = 5) => ({ n, lat: pos.lat, lon: pos.lon, alt: 10, precision, hora: '2026-11-03T14:05:00.000Z' });

function visitaBase() {
  const v = N.nuevaVisita('900110', 'ASOCIACIÓN X');
  v.unidades.push({ clave: 'F01|A1|C1|7', hoja: 'F01', filaExcel: 7, prd: '100017', prdVarios: [], prdHoja: '', codAgricultor: 'A1', codCampo: 'C1', productor: 'Juan Pérez', finca: 'La Gloria', cultivos: ['banano'], haCultivo: 5, haTotal: 5, bufferHa: 0, origen: 'lista' });
  v.unidades.push({ clave: 'F01|A2|C2|8', hoja: 'F01', filaExcel: 8, prd: '100017', prdVarios: [], prdHoja: '', codAgricultor: 'A2', codCampo: 'C2', productor: 'Ana Mora', finca: 'El Rosal', cultivos: ['banano', 'plátano'], haCultivo: 3, haTotal: 3, bufferHa: 0, origen: 'lista' });
  return v;
}
function muestraCompleta(v, u, cultivo, pre) {
  const m = N.crearMuestra(v, u, cultivo);
  m.puntos = [pt(1, A), pt(2, este(A, 300)), pt(3, este(A, 600))];
  Object.assign(m.precintos, pre);
  v.muestras.push(m);
  return m;
}

console.log('nucleo.js');
prueba('haversine: 1 grado de latitud ~ 111.19 km', () => cerca(N.distanciaM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111195, 50));
prueba('haversine: 300 m al este', () => cerca(N.distanciaM(A, este(A, 300)), 300, 0.5));
prueba('haversine: mismo punto = 0', () => assert.strictEqual(N.distanciaM(A, A), 0));
prueba('GMS sur/oeste', () => assert.strictEqual(N.gmsPar(-3.2578, -79.9541), `3°15'28.1"S 79°57'14.8"W`));
prueba('GMS norte/este', () => assert.strictEqual(N.aGMS(10.5, 'lat'), `10°30'0.0"N`));
prueba('GMS sin 60 en segundos al redondear', () => assert.strictEqual(N.aGMS(-3.99999999, 'lat'), `4°0'0.0"S`));
prueba('fechas dd/mm/aaaa y HH:mm', () => {
  const d = new Date(2026, 10, 3, 7, 5);
  assert.strictEqual(N.fechaDMA(d.toISOString()), '03/11/2026');
  assert.strictEqual(N.horaHM(d.toISOString()), '07:05');
});

prueba('numeración: por finca y cultivo', () => {
  const v = visitaBase();
  const [u1, u2] = v.unidades;
  const a = N.crearMuestra(v, u1, 'banano'); v.muestras.push(a);
  const b = N.crearMuestra(v, u1, 'banano'); v.muestras.push(b);
  const c = N.crearMuestra(v, u1, 'plátano'); v.muestras.push(c);
  const d = N.crearMuestra(v, u2, 'banano'); v.muestras.push(d);
  assert.deepStrictEqual([a.numero, b.numero, c.numero, d.numero], [1, 2, 1, 1]);
});
prueba('numeración: unidades a mano sin código no se mezclan', () => {
  const v = visitaBase();
  const x = N.crearUnidadAMano({ productor: 'P', finca: 'F', cultivos: ['Banano'] });
  const y = N.crearUnidadAMano({ productor: 'P', finca: 'F', cultivos: ['banano'] });
  v.unidades.push(x, y);
  const m1 = N.crearMuestra(v, x, 'banano'); v.muestras.push(m1);
  const m2 = N.crearMuestra(v, y, 'banano');
  assert.notStrictEqual(m1.clave, m2.clave); assert.ok(!('codigo' in m1));
  assert.strictEqual(m2.numero, 1);
  assert.strictEqual(x.origen, 'a_mano');
  assert.strictEqual(N.revisar(v).avisos.filter(a => a.unidad === N.claveUnidad(y)).length, 1);
});
prueba('muestra nueva: contramuestra NA por defecto', () => {
  const v = visitaBase();
  assert.strictEqual(N.crearMuestra(v, v.unidades[0], 'banano').precintos.contramuestra, 'NA');
});
prueba('número de punto: rellena el hueco', () => {
  assert.strictEqual(N.numeroPunto({ puntos: [{ n: 1 }, { n: 3 }] }), 2);
  assert.strictEqual(N.numeroPunto({ puntos: [] }), 1);
});
prueba('punto cercano <20 m', () => {
  const m = { puntos: [pt(1, A)] };
  assert.strictEqual(N.puntoCercano(m, este(A, 10)).n, 1);
  assert.strictEqual(N.puntoCercano(m, este(A, 40)), null);
});
prueba('nombres repetidos se alertan', () => {
  const r = N.nombresRepetidos([
    { finca: 'La Gloria', productor: 'A' }, { finca: 'la  gloria', productor: 'B' }, { finca: 'Otra', productor: 'b' }]);
  assert.deepStrictEqual(r[0], ['finca']);
  assert.deepStrictEqual(r[1].sort(), ['finca', 'productor']);
  assert.deepStrictEqual(r[2], ['productor']);
});

console.log('Revisar antes de salir');
prueba('muestra completa: sin errores ni avisos', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '123' });
  muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '124' });
  const r = N.revisar(v);
  assert.deepStrictEqual(r.errores, []);
  assert.deepStrictEqual(r.avisos, []);
});
prueba('error: menos de 3 puntos', () => {
  const v = visitaBase();
  const m = muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  m.puntos.pop();
  const r = N.revisar(v);
  assert.strictEqual(r.errores.length, 1);
  assert.match(r.errores[0].texto, /2 puntos/);
  assert.strictEqual(r.errores[0].muestraId, m.id);
});
prueba('error: falta laboratorio, CU y ADT', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', {});
  const t = N.revisar(v).errores.map(e => e.texto).join('|');
  assert.match(t, /laboratorio/); assert.match(t, /CU/); assert.match(t, /ADT/);
});
prueba('error: «NA» en laboratorio o CU no cuenta como precinto', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'na', cu: ' NA ', adt: '1' });
  assert.strictEqual(N.revisar(v).errores.length, 2);
});
prueba('error: mismo precinto en dos muestras (espacios y mayúsculas)', () => {
  const v = visitaBase();
  const a = muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'ab 123', cu: 'C1', adt: '1' });
  const b = muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'AB123', adt: '2' });
  const e = N.revisar(v).errores;
  assert.strictEqual(e.length, 2);
  assert.deepStrictEqual(e.map(x => x.muestraId).sort(), [a.id, b.id].sort());
  assert.match(e[0].texto, /repetido/);
});
prueba('error: mismo precinto en dos campos de la misma muestra', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'X9', cu: 'X9', adt: '1' });
  assert.ok(N.revisar(v).errores.some(e => /repetido/.test(e.texto)));
});
prueba('contramuestra NA repetida NO es duplicado', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '2' });
  assert.deepStrictEqual(N.revisar(v).errores, []);
});
prueba('aviso: dos puntos a <20 m', () => {
  const v = visitaBase();
  const m = muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  m.puntos[1] = pt(2, este(A, 12));
  muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '2' });
  const r = N.revisar(v);
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.avisos.length, 1);
  assert.match(r.avisos[0].texto, /puntos 1 y 2/);
});
prueba('aviso: precisión >15 m', () => {
  const v = visitaBase();
  const m = muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  m.puntos[2].precision = 32;
  muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '2' });
  const r = N.revisar(v);
  assert.strictEqual(r.avisos.length, 1);
  assert.match(r.avisos[0].texto, /punto 3.*±32/);
});
prueba('aviso: unidad sin muestra', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  const r = N.revisar(v);
  assert.strictEqual(r.avisos.length, 1);
  assert.match(r.avisos[0].texto, /Ana Mora.*PRD 100017.*ninguna muestra/);
  assert.strictEqual(r.avisos[0].muestraId, null);
});
prueba('resumen de visita: 1/2 con muestra', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', {});
  assert.deepStrictEqual(N.resumenVisita(v), { conMuestra: 1, total: 2 });
});

prueba('avance: unidades, con muestra y completas', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  const m2 = muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '' });
  assert.deepStrictEqual(N.avance(v), { unidades: 2, conMuestra: 2, completas: 1 });
  m2.precintos.adt = '2'; m2.puntos.pop();
  assert.strictEqual(N.avance(v).completas, 1);
});

console.log('Correcciones de campo');
const VIEJA = (v, clave) => v.unidades.find(u => u.clave === clave);
prueba('GPS: lectura reciente por precisión; >10 s es «viejo»; sin lectura es «nada»', () => {
  const ahora = 1000000;
  assert.strictEqual(N.estadoGPS(null, ahora).nivel, 'nada');
  assert.strictEqual(N.estadoGPS({ t: ahora - 2000, precision: 6 }, ahora).nivel, 'verde');
  assert.strictEqual(N.estadoGPS({ t: ahora - 2000, precision: 20 }, ahora).nivel, 'ambar');
  assert.strictEqual(N.estadoGPS({ t: ahora - 2000, precision: 40 }, ahora).nivel, 'rojo');
  const v = N.estadoGPS({ t: ahora - 40000, precision: 3 }, ahora);
  assert.strictEqual(v.nivel, 'viejo'); assert.strictEqual(v.edadS, 40);
});
prueba('borrar muestra devuelve los puntos perdidos y no reutiliza el número', () => {
  const v = visitaBase();
  const a = muestraCompleta(v, v.unidades[0], 'banano', {});
  const b = muestraCompleta(v, v.unidades[0], 'banano', {});
  assert.deepStrictEqual([a.numero, b.numero], [1, 2]);
  assert.strictEqual(N.borrarMuestra(v, b), 3);
  assert.strictEqual(v.muestras.length, 1);
  assert.strictEqual(N.crearMuestra(v, v.unidades[0], 'banano').numero, 3);
});
prueba('quitar unidad borra sus muestras y dice cuánto se pierde', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', {}); muestraCompleta(v, v.unidades[1], 'banano', {});
  assert.deepStrictEqual(N.quitarUnidad(v, v.unidades[0].clave), { muestras: 1, puntos: 3 });
  assert.strictEqual(v.unidades.length, 1); assert.strictEqual(v.muestras.length, 1);
});
prueba('cambiar cultivo renumera en el cultivo nuevo sin chocar', () => {
  const v = visitaBase();
  const a = muestraCompleta(v, v.unidades[1], 'banano', {});
  const p = muestraCompleta(v, v.unidades[1], 'plátano', {});
  assert.ok(N.cambiarCultivo(v, a, 'Plátano'));
  assert.strictEqual(a.cultivo, 'plátano'); assert.strictEqual(a.numero, 2);
  assert.strictEqual(N.cambiarCultivo(v, a, 'plátano'), false);
  assert.strictEqual(p.numero, 1);
  const solo = muestraCompleta(v, v.unidades[0], 'banano', {});
  assert.ok(N.cambiarCultivo(v, solo, 'cacao'));
  assert.strictEqual(solo.numero, 1);
});
prueba('revisar: visita sin muestras lo marca', () => {
  const v = visitaBase();
  assert.strictEqual(N.revisar(v).sinMuestras, true);
  muestraCompleta(v, v.unidades[0], 'banano', {});
  assert.strictEqual(N.revisar(v).sinMuestras, false);
});
prueba('ADT repetido es aviso; el precinto de laboratorio repetido sigue siendo error', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '77' });
  muestraCompleta(v, v.unidades[1], 'banano', { laboratorio: 'L2', cu: 'C2', adt: '77' });
  let r = N.revisar(v);
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.avisos.filter(a => /ADT repetido/.test(a.texto) && /misma remesa/.test(a.texto)).length, 2);
  v.muestras[1].precintos.laboratorio = 'L1';
  assert.ok(N.revisar(v).errores.some(e => /repetido/.test(e.texto)));
});
prueba('contramuestra vacía es aviso; NA no', () => {
  const v = visitaBase();
  const m = muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  assert.deepStrictEqual(N.revisar(v).avisos.filter(a => /contramuestra/.test(a.texto)), []);
  m.precintos.contramuestra = ' ';
  assert.strictEqual(N.revisar(v).avisos.filter(a => /escribe NA/.test(a.texto)).length, 1);
});
prueba('importar: rechaza números inválidos en puntos', () => {
  const v = visitaBase(); const m = muestraCompleta(v, v.unidades[0], 'banano', {});
  for (const mal of [{ lat: 'x' }, { lon: null }, { n: NaN }, { precision: 'alta' }, { lat: 95 }]) {
    const c = JSON.parse(N.aJSON(v)); Object.assign(c.visita.muestras[0].puntos[0], mal);
    const r = N.leerArchivo(JSON.stringify(c));
    assert.ok(r.error, JSON.stringify(mal));
  }
  assert.ok(N.leerArchivo(N.aJSON(v)).visita);
});
prueba('CSV: BOM y neutraliza fórmulas, sin tocar números negativos', () => {
  const v = visitaBase(); v.cliente = '=HYPERLINK("x")';
  muestraCompleta(v, v.unidades[0], 'banano', {});
  const csv = N.csvPuntos(v);
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes(';-3.257800;-79.954100;'));
});
prueba('comparar visitas: fechas, recuentos y la más nueva', () => {
  const a = visitaBase(); a.modificada = '2026-11-03T10:00:00Z'; muestraCompleta(a, a.unidades[0], 'banano', {});
  const b = JSON.parse(JSON.stringify(a)); b.modificada = '2026-11-03T12:00:00Z'; muestraCompleta(b, b.unidades[1], 'banano', {});
  const c = N.compararVisitas(a, b);
  assert.deepStrictEqual([c.a.muestras, c.a.puntos, c.b.muestras, c.b.puntos, c.masNueva], [1, 3, 2, 6, 'b']);
});
prueba('Lista nueva: misma unidad aunque cambie la fila (conserva la clave vieja)', () => {
  const v = visitaBase();
  const nueva = JSON.parse(JSON.stringify(v.unidades)); nueva[0].clave = 'F01|A1|C1|9'; nueva[0].filaExcel = 9;
  assert.strictEqual(N.conciliarUnidades(v.unidades, nueva), 2);
  assert.strictEqual(nueva[0].clave, 'F01|A1|C1|7');
});
prueba('Lista nueva: sin codAgr ni codCampo no basta la fila; clave que choca se desambigua', () => {
  const v = visitaBase();
  v.unidades[0].codAgricultor = ''; v.unidades[0].codCampo = ''; v.unidades[0].clave = 'F01|||7';
  const otra = { clave: 'F01|||7', hoja: 'F01', codAgricultor: '', codCampo: '', productor: 'Otro Distinto', finca: 'Otra', cultivos: [] };
  assert.strictEqual(N.conciliarUnidades(v.unidades, [otra]), 0);
  assert.notStrictEqual(otra.clave, 'F01|||7');
  const igual = Object.assign({}, v.unidades[0], { clave: 'F01|||12' });
  assert.strictEqual(N.conciliarUnidades(v.unidades, [igual]), 1);
  assert.strictEqual(igual.clave, 'F01|||7');
});
prueba('teselas «sin datos»: pequeñas de satélite en zoom alto no se guardan', () => {
  assert.ok(N.teselaSinDatos(1200, 16, 'satelite'));
  assert.ok(!N.teselaSinDatos(1200, 14, 'satelite'));
  assert.ok(!N.teselaSinDatos(20000, 17, 'satelite'));
  assert.ok(!N.teselaSinDatos(1200, 17, 'mapa'));
});
prueba('sw.js y app.js listan los mismos archivos del shell', () => {
  const fs = require('fs');
  const lista = (f, re) => JSON.parse('[' + re.exec(fs.readFileSync(f, 'utf8'))[1].replace(/'/g, '"') + ']').sort();
  assert.deepStrictEqual(lista('sw.js', /const SHELL = \[([\s\S]*?)\];/), lista('app.js', /var SHELL = \[([\s\S]*?)\];/));
});

console.log('Exportación');
prueba('nombre de archivo', () => assert.strictEqual(N.nombreArchivo({ expediente: '900110' }, 'json', new Date(2026, 10, 3)), 'muestras-900110-20261103.json'));
prueba('JSON: ida y vuelta', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '1' });
  const o = JSON.parse(N.aJSON(v));
  assert.strictEqual(o.formato, 'muestras-campo'); assert.strictEqual(o.version, 1);
  assert.deepStrictEqual(N.leerArchivo(N.aJSON(v)).visita, v);
});
prueba('importar: rechaza lo que no es del formato', () => {
  assert.ok(N.leerArchivo('no json').error);
  assert.ok(N.leerArchivo('{"formato":"otro"}').error);
  assert.ok(N.leerArchivo('{"formato":"muestras-campo","version":2,"visita":{}}').error);
});
prueba('CSV: separador «;», punto decimal, escapado', () => {
  const v = visitaBase();
  v.cliente = 'Coop; "Sur"';
  muestraCompleta(v, v.unidades[0], 'banano', {});
  const filas = N.csvPuntos(v).trim().split('\r\n');
  assert.strictEqual(filas.length, 4);
  assert.strictEqual(filas[0], 'expediente;cliente;prd;cod_campo;productor;finca;cultivo;muestra;punto;lat;lon;alt;precision;hora');
  assert.ok(filas[1].startsWith('900110;"Coop; ""Sur""";100017;C1;Juan Pérez;La Gloria;banano;1;1;-3.257800;-79.954100;10;5;'));
});
prueba('resumen de texto: código, GMS, enlace y precintos', () => {
  const v = visitaBase();
  muestraCompleta(v, v.unidades[0], 'banano', { laboratorio: 'L1', cu: 'C1', adt: '77' });
  const t = N.resumenTexto(v);
  assert.match(t, /PRD 100017/); assert.match(t, /campo C1/); assert.match(t, /3°15'28\.1"S 79°57'14\.8"W/);
  assert.match(t, /https:\/\/maps\.apple\.com\/\?ll=-3\.257800,-79\.954100/);
  assert.match(t, /Precinto laboratorio: L1/); assert.match(t, /ADT: 77/); assert.match(t, /contramuestra: NA/);
});

console.log('Teselas');
prueba('tesela de Greenwich/ecuador en z1', () => assert.deepStrictEqual(N.lonLatATesela(-1, 1, 1), { x: 1, y: 1 }));
prueba('caja y conteo crecen con el zoom', () => {
  const caja = N.cajaZona([A], 500);
  cerca(N.distanciaM({ lat: caja.sur, lon: A.lon }, { lat: caja.norte, lon: A.lon }), 1000, 5);
  assert.ok(N.listarTeselas(caja, 13, 18).length > N.listarTeselas(caja, 13, 16).length);
  assert.ok(N.listarTeselas(caja, 13, 13).length >= 1);
});
prueba('sin coord: radio de 1 km alrededor del centro', () => {
  const caja = N.cajaZona([], 500, A, 1000);
  cerca(N.distanciaM({ lat: caja.sur, lon: A.lon }, { lat: caja.norte, lon: A.lon }), 2000, 10);
  assert.strictEqual(N.cajaZona([], 500, null, 1000), null);
});

console.log('lista.js');
// Libro sintético: hojas = {nombre: filas}; null = celda vacía.
function libro(hojas) {
  const wb = { SheetNames: [], Sheets: {} };
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = {};
    filas.forEach((f, r) => f.forEach((v, c) => {
      if (v == null) return;
      ws[String.fromCharCode(65 + c) + (r + 1)] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v };
    }));
    wb.SheetNames.push(nombre); wb.Sheets[nombre] = ws;
  }
  return wb;
}
const CAB = ['ID.', 'Cód. del Agricultor', 'Cédula', 'Cód. del campo / predio', 'Nombre del campo', 'Cultivo', 'Área de cultivo (ha)', 'Área total (ha)', 'Coordenadas', 'Apellidos y nombres'];
// Columnas: A ID, B cód agricultor, C cédula, D cód campo, E finca, F cultivo, G ha cultivo, H ha total, I coord, J apellidos, K nombres
const TIT = ['ID.', 'Cód. del Agricultor', 'Cédula', 'Cód. del campo / predio', 'Nombre del campo', 'Cultivo', 'Área de cultivo (ha)', 'Área total (ha)', 'Coordenadas', 'Apellidos', 'Nombres'];
const fila = (id, ca, cc, finca, cult, ha, ht, coord, ape, nom) => [id, ca, '0999999999', cc, finca, cult, ha, ht, coord, ape, nom];
function hoja(cabecera, filas) { return [...cabecera, TIT, ['', '', '', '', '', '', '', '', '', 'APELLIDOS', 'NOMBRES'], ...filas]; }

prueba('hoja de instrucciones y glosario se ignoran aunque traigan "ID."', () => {
  const wb = libro({ 'Instrucciones': [['ID.', 'x']], 'Glosario': [TIT, fila(1, 'A1', 'C1', 'F', 'banano', 1, 1, '', 'P', 'Q')],
    'F01': hoja([['Licensee-unit no.: PRD 100017']], [fila(1, 'A1', 'C1', 'La Gloria', 'banano', 4, 5, '', 'Pérez', 'Juan')]) });
  const r = leerLista(wb);
  assert.strictEqual(r.unidades.length, 1);
  assert.strictEqual(r.unidades[0].hoja, 'F01');
});
prueba('una unidad: clave, PRD de la hoja, campos y sin cédula', () => {
  const r = leerLista(libro({ F01: hoja([['ORG.PMOREV.F11'], ['Licensee-unit no.: PRD 100017']],
    [fila(1, 'A-7', 'FTO 481', 'La Gloria', 'Banano', 4, 5.5, "S 03° 14' 15'' W 79° 48' 14''", 'Pérez Mora', 'Juan')]) }));
  const u = r.unidades[0];
  assert.strictEqual(u.clave, 'F01|A-7|FTO 481|5');
  assert.strictEqual(u.filaExcel, 5);
  assert.strictEqual(u.prd, '100017'); assert.deepStrictEqual(u.prdVarios, []);
  assert.strictEqual(u.productor, 'Pérez Mora Juan'); assert.strictEqual(u.finca, 'La Gloria');
  assert.deepStrictEqual(u.cultivos, ['banano']);
  assert.strictEqual(u.haCultivo, 4); assert.strictEqual(u.haTotal, 5.5); assert.strictEqual(u.bufferHa, 0);
  cerca(u.coord.lat, -3.2375, 1e-4); cerca(u.coord.lon, -79.8039, 1e-4);
  assert.ok(!JSON.stringify(u).includes('0999999999'), 'no debe haber cédulas');
  assert.ok(!('cedula' in u));
});
prueba('fila buffer: se suma a su predio y no es unidad', () => {
  const r = leerLista(libro({ F01: hoja([['PRD 1']], [
    fila(1, 'A1', 'C1', 'La Gloria', 'banano', 4, 5, '', 'Pérez', 'Juan'),
    fila(2, 'A1', 'C1 (ZB)', 'La Gloria zona de amortiguamiento', 'banano', 0.8, 5, '', 'Pérez', 'Juan'),
    fila(3, 'A2', 'C2', 'El Rosal', 'banano', 3, 3, '', 'Mora', 'Ana')]) }));
  assert.strictEqual(r.unidades.length, 2);
  assert.strictEqual(r.unidades[0].bufferHa, 0.8);
  assert.strictEqual(r.unidades[1].bufferHa, 0);
});
prueba('buffer sin predio: aviso, no unidad', () => {
  const r = leerLista(libro({ F01: hoja([['PRD 1']], [fila(1, 'A1', 'C9', 'Buffer norte', 'banano', 0.8, 5, '', 'Pérez', 'Juan')]) }));
  assert.strictEqual(r.unidades.length, 0);
  assert.ok(r.avisos.some(a => /buffer/.test(a)));
});
prueba('barbecho y área 0 quedan fuera', () => {
  const r = leerLista(libro({ F01: hoja([['PRD 1']], [
    fila(1, 'A1', 'C1', 'Lote viejo', 'Barbecho', 2, 2, '', 'Pérez', 'Juan'),
    fila(2, 'A1', 'C2', 'Lote cero', 'banano', 0, 2, '', 'Pérez', 'Juan'),
    fila(3, 'A1', 'C3', 'Lote bueno', 'banano', 1, 2, '', 'Pérez', 'Juan')]) }));
  assert.deepStrictEqual(r.unidades.map(u => u.finca), ['Lote bueno']);
});
prueba('hoja sin PRD: prd null y «la hoja dice»', () => {
  const r = leerLista(libro({ '900110 - F01': hoja([['Licensee-unit no.: F01']], [fila(1, 'A1', 'C1', 'La Gloria', 'banano', 4, 5, '', 'Pérez', 'Juan')]) }));
  const u = r.unidades[0];
  assert.strictEqual(u.prd, null); assert.deepStrictEqual(u.prdVarios, []); assert.strictEqual(u.prdHoja, 'F01');
  assert.strictEqual(N.textoPRD(u), 'sin código PRD (la hoja dice: F01)');
  assert.ok(r.avisos.some(a => /sin código PRD/.test(a)));
});
prueba('hoja con dos PRD: prd null, prdVarios, nunca uno elegido', () => {
  const r = leerLista(libro({ F01: hoja([['Licensee-unit no.: PRD 070990;PRC 060539;PRD 070991']], [fila(1, 'A1', 'C1', 'La Gloria', 'banano', 4, 5, '', 'Pérez', 'Juan')]) }));
  const u = r.unidades[0];
  assert.strictEqual(u.prd, null); assert.deepStrictEqual(u.prdVarios, ['070990', '070991']);
  assert.strictEqual(N.textoPRD(u), 'varios PRD: 070990, 070991');
});
prueba('PRD y PRC mezclados: solo cuenta el PRD', () => {
  const r = leerLista(libro({ F01: hoja([['PRD 070990;PRC 060539']], [fila(1, 'A1', 'C1', 'La Gloria', 'banano', 4, 5, '', 'Pérez', 'Juan')]) }));
  assert.strictEqual(r.unidades[0].prd, '070990');
});
prueba('un PRD para muchos productores; nombres de finca repetidos son unidades distintas', () => {
  const r = leerLista(libro({ G: hoja([['PRD 5']], [
    fila(1, 'A1', 'C1', 'La Esperanza', 'banano', 2, 2, '', 'Pérez', 'Juan'),
    fila(2, 'A2', 'C1', 'La Esperanza', 'banano', 3, 3, '', 'Mora', 'Ana')]) }));
  assert.strictEqual(r.unidades.length, 2);
  assert.notStrictEqual(r.unidades[0].clave, r.unidades[1].clave);
  assert.deepStrictEqual(r.unidades.map(u => u.prd), ['5', '5']);
});
prueba('mismo predio con dos cultivos se funde en cultivos[]', () => {
  const r = leerLista(libro({ G: hoja([['PRD 5']], [
    fila(1, 'A1', 'C1', 'Ayalán', 'banano', 2, 3, '', 'Pérez', 'Juan'),
    fila(2, 'A1', 'C1', 'Ayalán', 'plátano', 1, 3, '', 'Pérez', 'Juan')]) }));
  assert.strictEqual(r.unidades.length, 1);
  assert.deepStrictEqual(r.unidades[0].cultivos, ['banano', 'plátano']);
  assert.strictEqual(r.unidades[0].haCultivo, 3);
});
prueba('corta en NOTA/TOTAL y salta filas basura', () => {
  const r = leerLista(libro({ G: hoja([['PRD 5']], [
    fila(1, 'A1', 'C1', 'Uno', 'banano', 2, 2, '', 'Pérez', 'Juan'),
    fila(2, 'A1', 'C2', 'Dos', 'banano', 2, 2, '', 'NAN', ''),
    fila(3, 'A1', 'C3', 'Tres', 'banano', 'x', 2, '', 'Mora', 'Ana'),
    ['TOTAL', null, null, null, null, null, 99],
    fila(4, 'A9', 'C9', 'Después', 'banano', 2, 2, '', 'Mora', 'Ana')]) }));
  assert.deepStrictEqual(r.unidades.map(u => u.finca), ['Uno']);
});
prueba('falta un título: ese dato queda vacío, nunca la columna vecina', () => {
  const t = TIT.map(x => x === 'Nombre del campo' ? 'Predio' : x);
  const r = leerLista(libro({ G: [['PRD 5'], t, ['', '', '', '', '', '', '', '', '', 'APELLIDOS', 'NOMBRES'], fila(1, 'A1', 'C1', 'La Gloria', 'banano', 2, 2, '', 'Pérez', 'Juan')] }));
  assert.strictEqual(r.unidades[0].finca, '');
  assert.ok(r.avisos.some(a => /finca/.test(a)));
});
prueba('coordenada rota se descarta con aviso; la unidad se conserva', () => {
  const r = leerLista(libro({ G: hoja([['PRD 5']], [fila(1, 'A1', 'C1', 'Uno', 'banano', 2, 2, "S 03° 14' W 79°90'", 'Pérez', 'Juan')]) }));
  assert.strictEqual(r.unidades.length, 1);
  assert.strictEqual(r.unidades[0].coord, undefined);
  assert.ok(r.avisos.some(a => /minutos fuera de rango/.test(a)));
});
prueba('libro sin tabla F11: avisa y no inventa', () => {
  const r = leerLista(libro({ A: [['hola', 'mundo']] }));
  assert.deepStrictEqual(r.unidades, []);
  assert.ok(r.avisos.length >= 1);
});

console.log('parseCoord');
prueba('GMS con comillas mezcladas', () => {
  const c = parseCoord("S 03° 14' 15'' W 79° 48' 14''");
  cerca(c.lat, -(3 + 14 / 60 + 15 / 3600), 1e-6); cerca(c.lon, -(79 + 48 / 60 + 14 / 3600), 1e-6);
  const d = parseCoord('S 03° 14\' 15" W 79° 48\' 14"');
  cerca(d.lat, c.lat, 1e-9);
});
prueba('grados con minutos decimales', () => {
  const c = parseCoord("3° 14.5' S 79° 48.25' W");
  cerca(c.lat, -(3 + 14.5 / 60), 1e-6); cerca(c.lon, -(79 + 48.25 / 60), 1e-6);
});
prueba('decimal con coma y S/O', () => {
  const c = parseCoord('2,01012° S, 79,48063° O');
  cerca(c.lat, -2.01012, 1e-9); cerca(c.lon, -79.48063, 1e-9);
});
prueba('decimal con punto y signo', () => {
  const c = parseCoord('-3.25, -79.95');
  cerca(c.lat, -3.25, 1e-9); cerca(c.lon, -79.95, 1e-9);
});
prueba('UTM WGS84 zona 17 Sur', () => {
  const c = parseCoord('620000.000/9630000.000');
  cerca(c.lat, -3.34687, 5e-5); cerca(c.lon, -79.91982, 5e-5); // contrastado con pyproj (EPSG 32717)
});
prueba('rota «79°90\'»: null con motivo', () => {
  const r = Lista.parseCoordDetalle("S 03° 14' W 79°90'");
  assert.strictEqual(r.coord, null); assert.match(r.motivo, /minutos/);
  assert.strictEqual(parseCoord("S 03° 14' W 79°90'"), null);
});
prueba('fuera de Ecuador: null con motivo', () => {
  const r = Lista.parseCoordDetalle('S 3.2 W 120');
  assert.strictEqual(r.coord, null); assert.match(r.motivo, /fuera de Ecuador/);
});
prueba('vacío o texto: null sin inventar', () => {
  assert.strictEqual(parseCoord(''), null); assert.strictEqual(parseCoord(null), null); assert.strictEqual(parseCoord('s/c'), null);
});

console.log(`\n${ok} pasan, ${fallos} fallan`);
process.exit(fallos ? 1 : 0);
