// Lógica pura de Muestras de campo: sin DOM, cargable en Node para las pruebas.
(function (raiz) {
  'use strict';

  var R_TIERRA = 6371008.8; // metros
  var UMBRAL_CERCA_M = 20;
  var UMBRAL_PRECISION_M = 15;
  var MIN_PUNTOS = 3;
  var UMBRAL_MISMO_PUNTO_M = 2;

  // ---------- Utilidades ----------
  function nuevoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function rad(g) { return g * Math.PI / 180; }

  // Distancia haversine en metros entre dos {lat, lon}.
  function distanciaM(a, b) {
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Grados decimales a GMS con una décima de segundo. eje: 'lat' o 'lon'.
  function aGMS(valor, eje) {
    var hem = eje === 'lat' ? (valor < 0 ? 'S' : 'N') : (valor < 0 ? 'W' : 'E');
    var decimas = Math.round(Math.abs(valor) * 3600 * 10); // décimas de segundo, redondeo sin arrastre erróneo
    var g = Math.floor(decimas / 36000);
    var m = Math.floor((decimas % 36000) / 600);
    var s = (decimas % 600) / 10;
    return g + '°' + m + "'" + s.toFixed(1) + '"' + hem;
  }

  function gmsPar(lat, lon) { return aGMS(lat, 'lat') + ' ' + aGMS(lon, 'lon'); }
  function decimal(v) { return Number(v).toFixed(6); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fechaDMA(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function horaHM(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function aaaammdd(fecha) {
    var d = fecha instanceof Date ? fecha : new Date(fecha);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  // ---------- Unidades y muestras ----------
  // La identidad de una unidad es su `clave` (hoja|cód. agricultor|cód. campo|fila Excel), nunca el nombre ni el PRD:
  // la Lista no trae un PRD por finca, y en un grupo un solo PRD cubre a muchos productores.
  function claveUnidad(u) { return u.clave; }
  function claveMuestra(m) { return m.clave; }

  // PRD de la hoja tal como se enseña: nunca se inventa ni se hereda de otra hoja.
  function textoPRD(u) {
    if (u.origen === 'a_mano') return 'a mano · sin código';
    if (u.origen === 'gravi') return u.codigo ? String(u.codigo) : 'sin código PRD';
    if (u.prd) return 'PRD ' + u.prd;
    if (u.prdVarios && u.prdVarios.length) return 'varios PRD: ' + u.prdVarios.join(', ');
    return 'sin código PRD' + (u.prdHoja ? ' (la hoja dice: ' + u.prdHoja + ')' : '');
  }

  // ¿Tiene código de Control Union? Las de Gravi lo traen en `codigo`; las de la Lista, en `prd` de la hoja.
  function tieneCodigo(u) { return u.origen === 'gravi' ? !!u.codigo : (u.origen !== 'a_mano' && !!u.prd); }
  // Nombre corto para avisos: el productor, o la finca cuando es un individual sin productor aparte.
  function nombreUnidad(u) { return u.productor || u.finca || '(sin nombre)'; }

  function normCultivo(c) { return String(c || '').trim().toLowerCase(); }

  function crearUnidadAMano(datos) {
    return {
      clave: 'a_mano|' + nuevoId(), hoja: '', filaExcel: null, prd: null, prdVarios: [], prdHoja: '',
      codAgricultor: '', codCampo: '',
      productor: String(datos.productor || '').trim(),
      finca: String(datos.finca || '').trim(),
      cultivos: (datos.cultivos || []).map(normCultivo).filter(Boolean),
      haCultivo: datos.ha == null || datos.ha === '' ? null : Number(datos.ha),
      haTotal: datos.ha == null || datos.ha === '' ? null : Number(datos.ha), bufferHa: 0,
      origen: 'a_mano'
    };
  }

  // "Muestra 1, 2…" cuenta por finca (unidad) y cultivo.
  function numeroSiguiente(muestras, unidad, cultivo) {
    var k = claveUnidad(unidad), c = normCultivo(cultivo), max = 0;
    (muestras || []).forEach(function (m) {
      if (claveMuestra(m) === k && normCultivo(m.cultivo) === c && m.numero > max) max = m.numero;
    });
    return max + 1;
  }

  // Un número ya usado no se reutiliza aunque se borre la muestra (puede haberse exportado):
  // visita.contadores guarda el último número entregado por unidad y cultivo.
  function siguienteNumero(visita, unidad, cultivo) {
    var k = claveUnidad(unidad) + '|' + normCultivo(cultivo);
    visita.contadores = visita.contadores || {};
    var n = Math.max(numeroSiguiente(visita.muestras, unidad, cultivo), (visita.contadores[k] || 0) + 1);
    visita.contadores[k] = n;
    return n;
  }

  function crearMuestra(visita, unidad, cultivo) {
    var m = {
      id: nuevoId(), clave: unidad.clave, cultivo: normCultivo(cultivo),
      numero: siguienteNumero(visita, unidad, cultivo),
      puntos: [],
      precintos: { laboratorio: '', cu: '', contramuestra: 'NA' },
      nota: ''
    };
    return m;
  }

  // Cambia el cultivo de una muestra; recibe el número siguiente del cultivo nuevo (no reutiliza números).
  function cambiarCultivo(visita, m, cultivo) {
    var c = normCultivo(cultivo);
    if (!c || c === normCultivo(m.cultivo)) return false;
    var u = unidadDeMuestra(visita, m);
    if (!u) return false;
    m.numero = siguienteNumero(visita, u, c); // antes de asignar: la propia muestra no cuenta en el cultivo nuevo
    m.cultivo = c;
    return true;
  }
  function borrarMuestra(visita, m) {
    visita.muestras = visita.muestras.filter(function (x) { return x !== m; });
    return m.puntos.length;
  }
  // Quita una unidad y sus muestras; devuelve lo que se pierde.
  function quitarUnidad(visita, clave) {
    var ms = visita.muestras.filter(function (m) { return claveMuestra(m) === clave; });
    var puntos = ms.reduce(function (a, m) { return a + m.puntos.length; }, 0);
    visita.muestras = visita.muestras.filter(function (m) { return claveMuestra(m) !== clave; });
    visita.unidades = visita.unidades.filter(function (u) { return claveUnidad(u) !== clave; });
    return { muestras: ms.length, puntos: puntos };
  }

  // Al cargar otra Lista: la unidad que coincide en hoja+codAgricultor+codCampo+productor+finca es la misma aunque
  // cambie la fila (conserva la clave vieja). Una clave nueva que choque con otra unidad distinta se desambigua.
  function tuplaUnidad(u) {
    return [u.hoja, u.codAgricultor, u.codCampo, u.productor, u.finca].map(normNombre).join('|');
  }
  function conciliarUnidades(existentes, nuevas) {
    var usadas = {}, porTupla = {}, claves = {};
    existentes.forEach(function (e) { (porTupla[tuplaUnidad(e)] = porTupla[tuplaUnidad(e)] || []).push(e); claves[e.clave] = true; });
    var yaIncluidas = 0;
    nuevas.forEach(function (u) {
      var cand = (porTupla[tuplaUnidad(u)] || []).filter(function (e) { return !usadas[e.clave]; })[0];
      if (cand) { usadas[cand.clave] = true; u.clave = cand.clave; yaIncluidas++; return; }
      var base = u.clave, i = 1;
      while (claves[u.clave]) { i++; u.clave = base + '#' + i; }
      claves[u.clave] = true;
    });
    return yaIncluidas;
  }

  function unidadDeMuestra(visita, m) {
    var k = claveMuestra(m);
    for (var i = 0; i < visita.unidades.length; i++) if (claveUnidad(visita.unidades[i]) === k) return visita.unidades[i];
    return null;
  }

  function nuevaVisita(expediente, cliente) {
    return {
      id: nuevoId(), expediente: String(expediente || '').trim(), cliente: String(cliente || '').trim(),
      creada: new Date().toISOString(), origen: 'a_mano', adt: '', unidades: [], muestras: []
    };
  }

  // Siguiente número de punto: el primer entero libre desde 1 (así «volver a marcar» rellena el hueco).
  function numeroPunto(muestra) {
    var usados = {};
    muestra.puntos.forEach(function (p) { usados[p.n] = true; });
    var n = 1;
    while (usados[n]) n++;
    return n;
  }

  // Punto más cercano al nuevo, entre los que ya hay (para el aviso instantáneo de <20 m).
  function puntoCercano(muestra, pos) {
    var mejor = null;
    muestra.puntos.forEach(function (p) {
      var d = distanciaM(p, pos);
      if (d < UMBRAL_CERCA_M && (!mejor || d < mejor.dist)) mejor = { n: p.n, dist: d };
    });
    return mejor;
  }

  function ordenarPuntos(muestra) {
    return muestra.puntos.slice().sort(function (a, b) { return a.n - b.n; });
  }

  // Resumen de visita: «3/5 productores con muestra».
  function resumenVisita(visita) {
    var con = {};
    visita.muestras.forEach(function (m) { con[claveMuestra(m)] = true; });
    var n = 0;
    visita.unidades.forEach(function (u) { if (con[claveUnidad(u)]) n++; });
    return { conMuestra: n, total: visita.unidades.length };
  }

  // Avance de la visita: unidades, unidades con muestra y muestras completas (≥3 puntos + laboratorio + CU).
  function avance(visita) {
    var r = resumenVisita(visita);
    var completas = visita.muestras.filter(function (m) { var e = estadoMuestra(m); return e.puntosOk && e.precintosOk; }).length;
    return { unidades: r.total, conMuestra: r.conMuestra, completas: completas };
  }

  function contarVisita(v) {
    return { muestras: v.muestras.length, puntos: v.muestras.reduce(function (a, m) { return a + m.puntos.length; }, 0) };
  }
  // Compara dos copias de una visita (la del teléfono y la de un archivo) para decidir con información.
  function compararVisitas(a, b) {
    var fa = a.modificada || a.creada, fb = b.modificada || b.creada;
    return { a: Object.assign({ fecha: fa }, contarVisita(a)), b: Object.assign({ fecha: fb }, contarVisita(b)),
      masNueva: fa === fb ? 'igual' : (new Date(fa) > new Date(fb) ? 'a' : 'b') };
  }

  // Estado del GPS según la edad de la última lectura. pos.t = epoch ms de la lectura.
  var GPS_VIEJO_S = 10;
  function estadoGPS(pos, ahora) {
    if (!pos) return { nivel: 'nada', edadS: null };
    var edad = Math.max(0, Math.round(((ahora == null ? Date.now() : ahora) - pos.t) / 1000));
    if (edad > GPS_VIEJO_S) return { nivel: 'viejo', edadS: edad };
    var p = pos.precision;
    return { nivel: p <= 10 ? 'verde' : p <= 25 ? 'ambar' : 'rojo', edadS: edad };
  }

  // Tesela de satélite «sin datos» de Esri: imagen gris de pocos bytes (200 OK). No se guarda.
  function teselaSinDatos(bytes, z, capa) {
    return capa === 'satelite' && z >= 15 && bytes < 3000;
  }

  function precintoLimpio(v) { return String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase(); }
  function precintoVacio(v) { var p = precintoLimpio(v); return p === '' || p === 'NA'; }

  function estadoMuestra(m) {
    var p = m.precintos || {};
    return {
      puntos: m.puntos.length,
      puntosOk: m.puntos.length >= MIN_PUNTOS,
      precintosOk: !precintoVacio(p.laboratorio) && !precintoVacio(p.cu) // el ADT es de la visita, no de la muestra
    };
  }

  // Dos unidades que comparten nombre de finca o de productor (nunca se elige por nombre; solo se alerta).
  function normNombre(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function nombresRepetidos(unidades) {
    var porFinca = {}, porProd = {}, salida = {};
    unidades.forEach(function (u, i) {
      var f = normNombre(u.finca), p = normNombre(u.productor);
      if (f) (porFinca[f] = porFinca[f] || []).push(i);
      if (p) (porProd[p] = porProd[p] || []).push(i);
    });
    function marcar(mapa, tipo) {
      Object.keys(mapa).forEach(function (k) {
        if (mapa[k].length > 1) mapa[k].forEach(function (i) { (salida[i] = salida[i] || []).push(tipo); });
      });
    }
    marcar(porFinca, 'finca');
    marcar(porProd, 'productor');
    return salida; // índice de unidad -> ['finca','productor']
  }

  // ---------- Revisar antes de salir ----------
  function etiquetaMuestra(visita, m) {
    var u = unidadDeMuestra(visita, m);
    var nombre = u ? [u.productor, u.finca, u.codCampo ? 'campo ' + u.codCampo : '', textoPRD(u)].filter(Boolean).join(' · ') : '';
    return (nombre ? nombre + ' / ' : '') + 'Muestra ' + m.numero + ' ' + m.cultivo;
  }

  function mayuscula(c) { c = String(c || ''); return c.charAt(0).toUpperCase() + c.slice(1); }
  function unirY(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]; }
  // «Adición · 2.5 ha» (adicion puede traer las ha, o ser un texto; si no, las ha de la unidad).
  function textoAdicion(u) {
    if (u.adicion == null) return '';
    var a = u.adicion, ha = typeof a === 'number' ? a : (a && typeof a === 'object' ? (a.ha != null ? a.ha : a.area) : null);
    if (ha == null || ha === '') ha = u.haCultivo;
    return 'Adición' + (ha != null && ha !== '' ? ' · ' + ha + ' ha' : (typeof a === 'string' && a ? ' · ' + a : ''));
  }

  var CAMPOS_PRECINTO = [
    ['laboratorio', 'precinto de laboratorio'], ['cu', 'precinto de CU'],
    ['contramuestra', 'precinto de contramuestra']
  ];

  // Devuelve {errores:[…], avisos:[…]}; cada línea: {nivel, muestraId, texto}. muestraId null si no lleva a una muestra.
  function revisar(visita) {
    var errores = [], avisos = [];
    function err(m, t) { errores.push({ nivel: 'error', muestraId: m.id, texto: etiquetaMuestra(visita, m) + ': ' + t }); }
    function avi(m, t) { avisos.push({ nivel: 'aviso', muestraId: m.id, texto: etiquetaMuestra(visita, m) + ': ' + t }); }

    // El ADT es uno por visita: sin él no se sale de la finca.
    if (String(visita.adt == null ? '' : visita.adt).trim() === '') {
      errores.push({ nivel: 'error', muestraId: null, texto: 'Falta el ADT de la visita (escríbelo arriba en la pantalla de la visita)' });
    }
    if (visita.avisoMigracion) avisos.push({ nivel: 'aviso', muestraId: null, texto: visita.avisoMigracion + ' Confirma el ADT de la visita.' });

    visita.muestras.forEach(function (m) {
      var p = m.precintos || {};
      if (m.puntos.length < MIN_PUNTOS) {
        err(m, 'tiene ' + m.puntos.length + (m.puntos.length === 1 ? ' punto' : ' puntos') + ' (mínimo ' + MIN_PUNTOS + ')');
      }
      if (precintoVacio(p.laboratorio)) err(m, 'falta el precinto de laboratorio');
      if (precintoVacio(p.cu)) err(m, 'falta el precinto de CU');
      if (String(p.contramuestra == null ? '' : p.contramuestra).trim() === '') avi(m, 'contramuestra vacía: escribe NA si no hubo');

      var ps = ordenarPuntos(m);
      for (var i = 0; i < ps.length; i++) {
        for (var j = i + 1; j < ps.length; j++) {
          var d = distanciaM(ps[i], ps[j]);
          if (d < UMBRAL_CERCA_M) avi(m, 'los puntos ' + ps[i].n + ' y ' + ps[j].n + ' están a ' + Math.round(d) + ' m (menos de ' + UMBRAL_CERCA_M + ' m)');
        }
      }
      ps.forEach(function (q) {
        if (q.precision > UMBRAL_PRECISION_M) avi(m, 'el punto ' + q.n + ' tiene precisión ±' + Math.round(q.precision) + ' m');
      });
    });

    // Mismo precinto en dos sitios: cualquier campo, entre todas las muestras, ignorando NA, espacios y mayúsculas.
    var usos = {};
    visita.muestras.forEach(function (m) {
      CAMPOS_PRECINTO.forEach(function (c) {
        var v = (m.precintos || {})[c[0]];
        if (precintoVacio(v)) return;
        var k = precintoLimpio(v);
        (usos[k] = usos[k] || []).push({ m: m, campo: c[1], valor: String(v).trim() });
      });
    });
    Object.keys(usos).forEach(function (k) {
      var lista = usos[k];
      if (lista.length < 2) return;
      lista.forEach(function (u) {
        var otros = lista.filter(function (o) { return o !== u; }).map(function (o) {
          var uo = unidadDeMuestra(visita, o.m) || {};
          return [uo.productor, uo.finca].filter(Boolean).join(' · ') + ' Muestra ' + o.m.numero + ' ' + o.m.cultivo + ' (' + o.campo + ')';
        });
        err(u.m, 'el precinto «' + u.valor + '» (' + u.campo + ') está repetido en ' + otros.join('; '));
      });
    });

    // El mismo punto en dos muestras distintas (<2 m): una muestra se tomó dos veces o se marcó en la equivocada.
    for (var a = 0; a < visita.muestras.length; a++) {
      for (var b = a + 1; b < visita.muestras.length; b++) {
        var ma = visita.muestras[a], mb = visita.muestras[b], hallado = null;
        ma.puntos.forEach(function (pa) {
          mb.puntos.forEach(function (pb) {
            var d = distanciaM(pa, pb);
            if (d < UMBRAL_MISMO_PUNTO_M && (!hallado || d < hallado.d)) hallado = { d: d, pa: pa, pb: pb };
          });
        });
        if (hallado) avi(ma, 'el punto ' + hallado.pa.n + ' coincide (a ' + hallado.d.toFixed(1) + ' m) con el punto ' + hallado.pb.n + ' de ' + etiquetaMuestra(visita, mb) + ': ¿se marcó dos veces?');
      }
    }

    // Cultivos: una muestra de un cultivo que la unidad no trae, y cultivos de la unidad sin muestra.
    visita.muestras.forEach(function (m) {
      var u = unidadDeMuestra(visita, m);
      if (!u || !(u.cultivos || []).length) return;
      var c = normNombre(m.cultivo);
      if (!u.cultivos.some(function (x) { return normNombre(x) === c; })) avi(m, 'el cultivo no está entre los de la unidad (' + u.cultivos.map(mayuscula).join(', ') + ')');
    });
    visita.unidades.forEach(function (u) {
      var ms = visita.muestras.filter(function (m) { return claveMuestra(m) === claveUnidad(u); });
      var cult = u.cultivos || [];
      var cuando = [u.productor, u.finca].filter(Boolean).join(' · ');
      if (u.adicion != null && !ms.length) {
        errores.push({ nivel: 'error', muestraId: null, unidad: claveUnidad(u), texto: [cuando, textoPRD(u)].filter(Boolean).join(' · ') + ': Adición sin muestra: toda adición lleva muestra' });
      }
      if (cult.length > 1 && ms.length) {
        var falta = cult.filter(function (x) { return !ms.some(function (m) { return normNombre(m.cultivo) === normNombre(x); }); });
        if (falta.length) avisos.push({ nivel: 'aviso', muestraId: null, unidad: claveUnidad(u),
          texto: [cuando, textoPRD(u)].filter(Boolean).join(' · ') + ': ' + unirY(cult.map(mayuscula)) + ': falta' + (falta.length > 1 ? 'n muestras' : ' muestra') + ' de ' + unirY(falta.map(mayuscula)) });
      }
    });

    var conMuestra = {};
    visita.muestras.forEach(function (m) { conMuestra[claveMuestra(m)] = true; });
    visita.unidades.forEach(function (u) {
      if (!conMuestra[claveUnidad(u)]) {
        avisos.push({ nivel: 'aviso', muestraId: null, unidad: claveUnidad(u),
          texto: [u.productor, u.finca, u.codCampo ? 'campo ' + u.codCampo : '', textoPRD(u)].filter(Boolean).join(' · ') + ': no tiene ninguna muestra (puede ser correcto)' });
      }
    });
    return { errores: errores, avisos: avisos, sinMuestras: !visita.muestras.length };
  }

  // ---------- Exportación ----------
  function nombreArchivo(visita, ext, fecha) {
    var exp = String(visita.expediente || 'sin-expediente').replace(/[^A-Za-z0-9_-]+/g, '-');
    return 'muestras-' + exp + '-' + aaaammdd(fecha || new Date()) + '.' + (ext || 'json');
  }

  // Código de la unidad para el archivo: el de Gravi, o «PRD n» cuando la hoja de la Lista trae uno solo.
  function codigoExportado(u) {
    if (u.codigo) return String(u.codigo);
    return u.prd ? 'PRD ' + u.prd : '';
  }

  // Formato v2: ADT y origen en la visita; unidades con `codigo`; muestras sin ADT.
  function aJSON(visita) {
    var o = JSON.parse(JSON.stringify(visita));
    o.origen = o.origen || 'a_mano';
    o.adt = String(o.adt == null ? '' : o.adt).trim();
    o.unidades.forEach(function (u) { u.codigo = codigoExportado(u); });
    o.muestras.forEach(function (m) { if (m.precintos) delete m.precintos.adt; });
    return JSON.stringify({ formato: 'muestras-campo', version: 2, visita: o }, null, 2);
  }

  // ADT por visita. Pasa el ADT de las muestras (v1 y visitas guardadas) a la visita: si comparten uno (o están vacíos),
  // ese; si difieren, el más repetido (a igualdad, el primero) y `avisoMigracion` para que «Revisar» lo diga.
  // Idempotente; devuelve true si cambió algo.
  function migrarVisita(v) {
    var cambio = false, vistos = [], cuenta = {};
    (v.muestras || []).forEach(function (m) {
      var p = m.precintos;
      if (!p || !('adt' in p)) return;
      var a = String(p.adt == null ? '' : p.adt).trim();
      if (a) { if (!(a in cuenta)) { cuenta[a] = 0; vistos.push(a); } cuenta[a]++; }
      delete p.adt; cambio = true;
    });
    if (v.adt == null) { v.adt = ''; cambio = true; }
    var actual = String(v.adt).trim();
    if (!actual && vistos.length) {
      actual = vistos.reduce(function (mejor, a) { return cuenta[a] > cuenta[mejor] ? a : mejor; }, vistos[0]);
      v.adt = actual; cambio = true;
    }
    if (vistos.some(function (a) { return a !== actual; })) {
      v.avisoMigracion = 'Había ADT distintos por muestra: ' + vistos.join(', ') + '.'; cambio = true;
    }
    return cambio;
  }

  // Valida un archivo importado; devuelve {visita} o {error}.
  function leerArchivo(texto) {
    var o;
    try { o = JSON.parse(texto); } catch (e) { return { error: 'El archivo no es un JSON válido.' }; }
    if (!o || o.formato !== 'muestras-campo') return { error: 'No es un archivo de Muestras de campo.' };
    if (o.version !== 1 && o.version !== 2) return { error: 'Versión de formato no soportada: ' + o.version + '.' };
    var v = o.visita;
    if (!v || !v.id || !Array.isArray(v.unidades) || !Array.isArray(v.muestras)) return { error: 'El archivo no trae una visita completa.' };
    var fin = function (x) { return typeof x === 'number' && isFinite(x); };
    for (var i = 0; i < v.muestras.length; i++) {
      var mm = v.muestras[i];
      if (!mm || typeof mm.clave !== 'string' || !mm.clave) return { error: 'La muestra ' + (i + 1) + ' no trae la clave de su unidad.' };
      var ps = mm.puntos == null ? [] : mm.puntos;
      if (!Array.isArray(ps)) return { error: 'La muestra ' + (i + 1) + ' trae puntos mal formados.' };
      for (var j = 0; j < ps.length; j++) {
        var q = ps[j];
        if (!q || !fin(q.n) || !fin(q.lat) || !fin(q.lon) || Math.abs(q.lat) > 90 || Math.abs(q.lon) > 180 || (q.precision != null && !fin(q.precision)))
          return { error: 'Archivo rechazado: el punto ' + (j + 1) + ' de la muestra ' + (i + 1) + ' tiene números inválidos.' };
      }
    }
    v.muestras.forEach(function (m) {
      m.puntos = m.puntos || [];
      m.precintos = Object.assign({ laboratorio: '', cu: '', contramuestra: 'NA' }, m.precintos || {}); // un `adt` de v1 lo recoge migrarVisita
      m.nota = m.nota || '';
    });
    migrarVisita(v);
    return { visita: v };
  }

  function celdaCSV(v) {
    var s = v == null ? '' : String(v);
    // Neutraliza fórmulas de hoja de cálculo en texto (los números, aunque negativos, pasan tal cual).
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // CSV de puntos: separador «;», punto decimal.
  function csvPuntos(visita) {
    var cab = ['expediente', 'cliente', 'adt', 'prd', 'cod_campo', 'productor', 'finca', 'cultivo', 'muestra', 'punto', 'lat', 'lon', 'alt', 'precision', 'hora'];
    var filas = [cab];
    visita.muestras.forEach(function (m) {
      var u = unidadDeMuestra(visita, m) || {};
      ordenarPuntos(m).forEach(function (p) {
        filas.push([visita.expediente, visita.cliente, visita.adt || '', u.prd || (u.prdVarios && u.prdVarios.length ? u.prdVarios.join('+') : String(u.codigo || '').replace(/^PRD\s*/i, '')), u.codCampo || '', u.productor || '', u.finca || '', m.cultivo, m.numero, p.n,
          decimal(p.lat), decimal(p.lon), p.alt == null ? '' : p.alt, p.precision == null ? '' : p.precision, p.hora || '']);
      });
    });
    return '\ufeff' + filas.map(function (f) { return f.map(celdaCSV).join(';'); }).join('\r\n') + '\r\n';
  }

  // Resumen en texto para Notas/WhatsApp.
  function resumenTexto(visita) {
    var L = ['Muestras de campo · Expediente ' + visita.expediente + ' · ' + visita.cliente, 'Visita ' + (isoDMA(visita.desde) || fechaDMA(visita.creada)), 'ADT: ' + (visita.adt || '—'), ''];
    visita.muestras.forEach(function (m) {
      var u = unidadDeMuestra(visita, m) || {};
      var p = m.precintos || {};
      L.push('Muestra ' + m.numero + ' · ' + m.cultivo);
      L.push([u.productor, u.finca, u.codCampo ? 'campo ' + u.codCampo : '', u.clave ? textoPRD(u) : ''].filter(Boolean).join(' · '));
      ordenarPuntos(m).forEach(function (q) {
        L.push('  Punto ' + q.n + ' (' + horaHM(q.hora) + '): ' + gmsPar(q.lat, q.lon) +
          (q.precision != null ? ' ±' + Math.round(q.precision) + ' m' : '') +
          ' https://maps.apple.com/?ll=' + q.lat.toFixed(6) + ',' + q.lon.toFixed(6));
      });
      if (!m.puntos.length) L.push('  (sin puntos)');
      L.push('  Precinto laboratorio: ' + (p.laboratorio || '—'));
      L.push('  Precinto CU: ' + (p.cu || '—'));
      L.push('  Precinto contramuestra: ' + (p.contramuestra || '—'));
      if (m.nota) L.push('  Nota: ' + m.nota);
      L.push('');
    });
    return L.join('\n');
  }

  // ---------- Fechas de la agenda (fechas de visita en aaaa-mm-dd) ----------
  function hoyISO(fecha) {
    var d = fecha instanceof Date ? fecha : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fechaISOValida(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function isoDMA(s) { return fechaISOValida(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function sumarDias(iso, n) {
    var p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // {desde, hasta} válidos de una visita, o null si no tiene fecha de visita.
  function fechasVisita(v) {
    if (!fechaISOValida(v.desde)) return null;
    var h = fechaISOValida(v.hasta) && v.hasta >= v.desde ? v.hasta : v.desde;
    return { desde: v.desde, hasta: h };
  }
  // «Hoy», «Mañana», dd/mm/aaaa o, si dura varios días, el rango.
  function etiquetaFecha(v, hoy) {
    var f = fechasVisita(v);
    if (!f) return '';
    var manana = sumarDias(hoy, 1);
    if (f.desde === f.hasta) return f.desde === hoy ? 'Hoy' : f.desde === manana ? 'Mañana' : isoDMA(f.desde);
    var rango = isoDMA(f.desde) + ' – ' + isoDMA(f.hasta);
    if (f.desde <= hoy && hoy <= f.hasta) return 'Hoy · ' + rango;
    return f.desde === manana ? 'Mañana · ' + rango : rango;
  }
  // Agenda: próximas (por fecha de visita), luego pasadas (la más reciente primero) y sin fecha (la más nueva primero).
  function agenda(visitas, hoy) {
    var prox = [], pas = [], sin = [];
    visitas.forEach(function (v) {
      var f = fechasVisita(v);
      if (!f) sin.push(v); else if (f.hasta >= hoy) prox.push(v); else pas.push(v);
    });
    var por = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
    prox.sort(function (a, b) { var x = fechasVisita(a), y = fechasVisita(b); return por(x.desde, y.desde) || por(x.hasta, y.hasta) || por(String(a.expediente), String(b.expediente)); });
    pas.sort(function (a, b) { return por(fechasVisita(b).hasta, fechasVisita(a).hasta) || por(String(a.expediente), String(b.expediente)); });
    sin.sort(function (a, b) { return por(b.creada || '', a.creada || ''); });
    return [{ clave: 'proximas', titulo: 'Próximas', visitas: prox }, { clave: 'pasadas', titulo: 'Pasadas', visitas: pas },
      { clave: 'sin-fecha', titulo: 'Sin fecha', visitas: sin }].filter(function (g) { return g.visitas.length; });
  }

  // ---------- Traer de Gravi (visitas-de-campo.json, formato gravi-visitas-campo) ----------
  function textoNoVacio(x) { return (typeof x === 'string' || typeof x === 'number') && String(x).trim() !== ''; }

  // Errores de formato global rechazan el archivo; una visita mal formada se aparta con su motivo y el resto entra.
  function motivoVisitaGravi(g, ids) {
    if (!g || typeof g !== 'object' || !textoNoVacio(g.id)) return 'no trae id';
    if (ids[g.id]) return 'repite el id «' + g.id + '»';
    var fin = function (x) { return typeof x === 'number' && isFinite(x); };
    if (!textoNoVacio(g.expediente)) return 'no trae expediente';
    var fechas = [g.desde, g.hasta];
    for (var f = 0; f < 2; f++) if (fechas[f] != null && fechas[f] !== '' && !fechaISOValida(fechas[f])) return 'tiene una fecha inválida: «' + fechas[f] + '»';
    if (g.numADT != null && typeof g.numADT !== 'string' && typeof g.numADT !== 'number') return 'trae un ADT mal formado';
    if (!Array.isArray(g.unidades)) return 'no trae la lista de unidades';
    var claves = {};
    for (var j = 0; j < g.unidades.length; j++) {
      var u = g.unidades[j], nu = 'unidad ' + (j + 1) + ': ';
      if (!u || typeof u !== 'object' || !textoNoVacio(u.clave)) return nu + 'no trae clave';
      if (claves[u.clave]) return nu + 'repite la clave «' + u.clave + '»';
      claves[u.clave] = true;
      if (u.cultivos != null && !Array.isArray(u.cultivos)) return nu + 'cultivos mal formados';
      if (u.ha != null && !fin(u.ha)) return nu + 'hectáreas inválidas';
      if (u.coord != null && (typeof u.coord !== 'object' || !fin(u.coord.lat) || !fin(u.coord.lon) || Math.abs(u.coord.lat) > 90 || Math.abs(u.coord.lon) > 180)) return nu + 'coordenada inválida';
    }
    return null;
  }
  function validarGravi(texto) {
    var o;
    try { o = JSON.parse(texto); } catch (e) { return { error: 'El archivo no es un JSON válido.' }; }
    if (!o || o.formato !== 'gravi-visitas-campo') return { error: 'No es un archivo de visitas de Gravi (visitas-de-campo.json).' };
    if (o.version !== 1) return { error: 'Versión del archivo de Gravi no soportada: ' + o.version + '.' };
    if (!Array.isArray(o.visitas)) return { error: 'El archivo de Gravi no trae la lista de visitas.' };
    var ids = {}, validas = [], rechazadas = [];
    o.visitas.forEach(function (g, i) {
      var m = motivoVisitaGravi(g, ids);
      if (m) { rechazadas.push({ visita: g && textoNoVacio(g.id) ? String(g.id) : 'visita ' + (i + 1), motivo: m }); return; }
      ids[g.id] = true; validas.push(g);
    });
    return { gravi: Object.assign({}, o, { visitas: validas }), rechazadas: rechazadas };
  }

  function unidadDeGravi(u) {
    var cult = [];
    (u.cultivos || []).forEach(function (c) { c = normCultivo(c); if (c && cult.indexOf(c) < 0) cult.push(c); });
    return {
      clave: String(u.clave), codigo: String(u.codigo == null ? '' : u.codigo).trim(),
      productor: String(u.productor || '').trim(), finca: String(u.finca || '').trim(), hoja: String(u.hoja || '').trim(),
      cultivos: cult, haCultivo: u.ha == null ? null : u.ha, haTotal: u.ha == null ? null : u.ha,
      estatus: u.estatus || '', adicion: u.adicion == null ? null : u.adicion,
      coord: u.coord ? { lat: u.coord.lat, lon: u.coord.lon } : null, origen: 'gravi'
    };
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function textoResumenGravi(r) {
    var p = [];
    if (r.nuevas) p.push(plural(r.nuevas, 'visita nueva', 'visitas nuevas'));
    if (r.actualizadas) p.push(plural(r.actualizadas, 'actualizada', 'actualizadas'));
    if (r.iguales) p.push(plural(r.iguales, 'sin cambios', 'sin cambios'));
    if (r.rechazadas && r.rechazadas.length) p.push(plural(r.rechazadas.length, 'rechazada', 'rechazadas'));
    return p.length ? p.join(', ') : 'El archivo no trae visitas.';
  }

  // Crea o actualiza visitas por `graviId`. Nunca borra ni toca muestras, puntos ni precintos.
  // Devuelve {visitas (solo las que cambian y hay que guardar), resumen, texto} o {error}.
  function importarGravi(texto, existentes, ahora) {
    var val = validarGravi(texto);
    if (val.error) return val;
    ahora = ahora || new Date().toISOString();
    var porGravi = {}, ids = {};
    (existentes || []).forEach(function (e) { ids[e.id] = true; if (e.graviId) porGravi[e.graviId] = e; });
    var res = { nuevas: 0, actualizadas: 0, iguales: 0, unidadesNuevas: 0, unidadesQuitadas: 0, unidadesMarcadas: 0, avisos: [], rechazadas: val.rechazadas };
    var cambiadas = [];
    val.gravi.visitas.forEach(function (g) {
      var ex = porGravi[g.id], vis, antes = null;
      if (ex) { vis = JSON.parse(JSON.stringify(ex)); antes = JSON.stringify(ex); }
      else {
        var base = 'gravi-' + String(g.id).replace(/[^A-Za-z0-9_-]+/g, '-'), id = base, k = 1;
        while (ids[id]) id = base + '-' + (++k);
        ids[id] = true;
        vis = { id: id, creada: ahora, adt: '', unidades: [], muestras: [] };
      }
      vis.origen = 'gravi'; vis.graviId = g.id;
      vis.expediente = String(g.expediente).trim();
      vis.cliente = String(g.cliente || vis.cliente || '').trim();
      vis.tipo = g.tipo || ''; vis.tipoTexto = g.tipoTexto || ''; vis.modo = g.modo || '';
      vis.desde = g.desde || null; vis.hasta = g.hasta || null;
      var adtG = String(g.numADT == null ? '' : g.numADT).trim(), adtV = String(vis.adt == null ? '' : vis.adt).trim();
      if (adtG && !adtV) vis.adt = adtG;
      else if (adtG && adtV && adtG !== adtV) res.avisos.push('Visita ' + vis.expediente + ': Gravi trae el ADT ' + adtG + ' y el teléfono tiene ' + adtV + '; se dejó el del teléfono.');
      else if (vis.adt == null) vis.adt = '';

      var porClave = {}, vistas = {};
      vis.unidades.forEach(function (u) { porClave[u.clave] = u; });
      g.unidades.forEach(function (gu) {
        var datos = unidadDeGravi(gu), u = porClave[datos.clave];
        vistas[datos.clave] = true;
        if (u) {
          // Un cultivo que el inspector añadió a mano y ya tiene muestra no se pierde.
          vis.muestras.forEach(function (m) {
            var c = normCultivo(m.cultivo);
            if (m.clave === u.clave && c && datos.cultivos.indexOf(c) < 0) datos.cultivos.push(c);
          });
          delete u.yaNoEstaEnGravi;
          Object.assign(u, datos);
        } else { vis.unidades.push(datos); res.unidadesNuevas++; }
      });
      vis.unidades = vis.unidades.filter(function (u) {
        if (u.origen !== 'gravi' || vistas[u.clave]) return true;
        var tiene = vis.muestras.some(function (m) { return m.clave === u.clave; });
        if (!tiene) { res.unidadesQuitadas++; return false; }
        if (!u.yaNoEstaEnGravi) { u.yaNoEstaEnGravi = true; res.unidadesMarcadas++; }
        return true;
      });
      if (!ex) { res.nuevas++; vis.modificada = ahora; cambiadas.push(vis); }
      else if (JSON.stringify(vis) !== antes) { res.actualizadas++; vis.modificada = ahora; cambiadas.push(vis); }
      else res.iguales++;
    });
    return { visitas: cambiadas, resumen: res, texto: textoResumenGravi(res) };
  }

  // ---------- Teselas ----------
  function lonLatATesela(lat, lon, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lon + 180) / 360 * n);
    var latR = rad(lat);
    var y = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
  }

  // Caja alrededor de puntos {lat, lon} con margen en metros; sin puntos, radio alrededor de `centro`.
  function cajaZona(coords, margenM, centro, radioM) {
    var base = coords && coords.length ? coords : (centro ? [centro] : []);
    if (!base.length) return null;
    var m = coords && coords.length ? margenM : radioM;
    var s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
    base.forEach(function (c) {
      var dLat = m / 111320, dLon = m / (111320 * Math.cos(rad(c.lat)));
      s = Math.min(s, c.lat - dLat); n = Math.max(n, c.lat + dLat);
      w = Math.min(w, c.lon - dLon); e = Math.max(e, c.lon + dLon);
    });
    return { sur: s, norte: n, oeste: w, este: e };
  }

  function listarTeselas(caja, zMin, zMax) {
    var lista = [];
    for (var z = zMin; z <= zMax; z++) {
      var a = lonLatATesela(caja.norte, caja.oeste, z), b = lonLatATesela(caja.sur, caja.este, z);
      for (var x = a.x; x <= b.x; x++) for (var y = a.y; y <= b.y; y++) lista.push({ z: z, x: x, y: y });
    }
    return lista;
  }

  var API = {
    UMBRAL_CERCA_M: UMBRAL_CERCA_M, UMBRAL_PRECISION_M: UMBRAL_PRECISION_M, MIN_PUNTOS: MIN_PUNTOS,
    nuevoId: nuevoId, distanciaM: distanciaM, aGMS: aGMS, gmsPar: gmsPar, decimal: decimal,
    fechaDMA: fechaDMA, horaHM: horaHM, aaaammdd: aaaammdd,
    textoPRD: textoPRD, textoAdicion: textoAdicion, tieneCodigo: tieneCodigo, nombreUnidad: nombreUnidad, migrarVisita: migrarVisita,
    hoyISO: hoyISO, fechaISOValida: fechaISOValida, isoDMA: isoDMA, sumarDias: sumarDias, etiquetaFecha: etiquetaFecha, agenda: agenda,
    validarGravi: validarGravi, importarGravi: importarGravi, textoResumenGravi: textoResumenGravi, claveUnidad: claveUnidad, claveMuestra: claveMuestra, normCultivo: normCultivo,
    crearUnidadAMano: crearUnidadAMano, numeroSiguiente: numeroSiguiente, cambiarCultivo: cambiarCultivo, borrarMuestra: borrarMuestra, quitarUnidad: quitarUnidad, conciliarUnidades: conciliarUnidades, contarVisita: contarVisita, compararVisitas: compararVisitas, estadoGPS: estadoGPS, teselaSinDatos: teselaSinDatos, GPS_VIEJO_S: GPS_VIEJO_S, crearMuestra: crearMuestra,
    unidadDeMuestra: unidadDeMuestra, nuevaVisita: nuevaVisita, numeroPunto: numeroPunto,
    puntoCercano: puntoCercano, ordenarPuntos: ordenarPuntos, resumenVisita: resumenVisita, avance: avance,
    precintoLimpio: precintoLimpio, precintoVacio: precintoVacio, estadoMuestra: estadoMuestra,
    nombresRepetidos: nombresRepetidos, etiquetaMuestra: etiquetaMuestra, revisar: revisar,
    nombreArchivo: nombreArchivo, aJSON: aJSON, leerArchivo: leerArchivo, csvPuntos: csvPuntos,
    resumenTexto: resumenTexto, lonLatATesela: lonLatATesela, cajaZona: cajaZona, listarTeselas: listarTeselas
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Nucleo = API;
})(typeof self !== 'undefined' ? self : this);
