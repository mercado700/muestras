// Lector de la Lista integrada (ORG.PMOREV.F11 v1.1). Función pura sobre el objeto de SheetJS (no usa XLSX).
// Medido contra 129 Listas reales: la Lista NO trae un PRD por finca; el PRD es de la hoja (línea de cabecera).
// Identidad de unidad: clave = hoja|cód. agricultor|cód. campo|fila Excel. Nunca se leen cédulas.
(function (raiz) {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Celdas de una hoja como matriz de texto/número; usa .v si es número, si no .w, si no .v.
  function filasDeHoja(ws) {
    var filas = [];
    Object.keys(ws).forEach(function (k) {
      var m = /^([A-Z]+)(\d+)$/.exec(k);
      if (!m) return;
      var c = 0;
      for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
      var r = parseInt(m[2], 10) - 1, cel = ws[k];
      (filas[r] = filas[r] || [])[c - 1] = typeof cel.v === 'number' ? cel.v : (cel.w != null ? cel.w : cel.v);
    });
    for (var r = 0; r < filas.length; r++) filas[r] = filas[r] || [];
    return filas;
  }

  function txt(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function num(v) {
    if (typeof v === 'number') return v;
    var s = txt(v).replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  // ---------- Coordenadas ----------
  var LAT_MIN = -5.1, LAT_MAX = 1.7, LON_MIN = -81.2, LON_MAX = -75.1;

  // UTM WGS84 zona 17 Sur -> {lat, lon} (fórmulas inversas de Snyder).
  function utmALatLon(este, norte) {
    var a = 6378137, e2 = 0.00669437999014, ep2 = e2 / (1 - e2), k0 = 0.9996;
    var x = este - 500000, y = norte - 10000000;
    var mu = (y / k0) / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
    var N1 = a / Math.sqrt(1 - e2 * s * s), T1 = t * t, C1 = ep2 * c * c;
    var R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = x / (N1 * k0);
    var lat = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c;
    return { lat: lat * 180 / Math.PI, lon: -81 + lon * 180 / Math.PI };
  }

  function enEcuador(lat, lon) { return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX; }

  // Devuelve {coord:{lat,lon}|null, motivo:''}. Texto vacío: sin coord y sin motivo.
  function parseCoordDetalle(entrada) {
    var s = txt(entrada);
    if (!s) return { coord: null, motivo: '' };
    function fallo(m) { return { coord: null, motivo: m }; }
    function validar(lat, lon) {
      return enEcuador(lat, lon) ? { coord: { lat: lat, lon: lon }, motivo: '' } : fallo('fuera de Ecuador (' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ')');
    }
    s = s.replace(/[’′´`‘]/g, "'").replace(/[″”“]/g, '"').replace(/''/g, '"').replace(/[º˚]/g, '°');

    var u = /^(\d{5,7}(?:[.,]\d+)?)\s*[\/;\s]\s*(\d{6,8}(?:[.,]\d+)?)$/.exec(s);
    if (u) {
      var p = utmALatLon(parseFloat(u[1].replace(',', '.')), parseFloat(u[2].replace(',', '.')));
      return validar(p.lat, p.lon);
    }

    // Con hemisferios (N S E W O), antes o después de cada grupo.
    var letras = s.match(/(^|[^A-Za-z])[NSEWOnsewo](?![A-Za-z])/g);
    if (letras && letras.length >= 2) {
      var segs = [];
      var delante = /^\s*[NSEWO]\b/i.test(s);
      // Sin lookbehind (Safari viejo): letra delante -> cortar antes de cada letra; detrás -> hasta cada letra.
      var trozos = delante ? s.split(/(?=\b[NSEWO]\b)/i) : (s.match(/[^NSEWO]+?\b[NSEWO]\b/gi) || []);
      trozos.forEach(function (t) { if (t.replace(/[\s,;]/g, '')) segs.push(t); });
      if (segs.length !== 2) return fallo('no se entienden las dos coordenadas');
      var lat = null, lon = null;
      for (var i = 0; i < 2; i++) {
        var L = /\b([NSEWO])\b/i.exec(segs[i]);
        if (!L) return fallo('falta el hemisferio');
        var h = L[1].toUpperCase();
        var nums = (segs[i].replace(/\b[NSEWO]\b/i, '').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) { return parseFloat(n.replace(',', '.')); });
        if (!nums.length) return fallo('falta un número');
        if (nums.length > 3) return fallo('demasiados números en una coordenada');
        if (nums[1] != null && nums[1] >= 60) return fallo('minutos fuera de rango (' + nums[1] + ')');
        if (nums[2] != null && nums[2] >= 60) return fallo('segundos fuera de rango (' + nums[2] + ')');
        var v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
        if (h === 'S' || h === 'W' || h === 'O') v = -v;
        if (h === 'N' || h === 'S') { if (lat != null) return fallo('dos latitudes'); lat = v; }
        else { if (lon != null) return fallo('dos longitudes'); lon = v; }
      }
      if (lat == null || lon == null) return fallo('falta latitud o longitud');
      return validar(lat, lon);
    }

    // Decimal sin hemisferio: «-3.25, -79.95» (el signo manda).
    var d = /^(-?\d+(?:[.,]\d+)?)\s*°?\s*[;,\/\s]\s*(-?\d+(?:[.,]\d+)?)\s*°?$/.exec(s);
    if (d) return validar(parseFloat(d[1].replace(',', '.')), parseFloat(d[2].replace(',', '.')));
    if (/\d/.test(s)) return fallo('formato de coordenada no reconocido');
    return { coord: null, motivo: '' };
  }
  function parseCoord(s) { return parseCoordDetalle(s).coord; }

  // ---------- Hojas ----------
  var HOJA_IGNORADA = /instrucc|instructivo|ejemplo|registro del sic|retirados|glosario|portada|indice/;

  function filaEncabezado(grid, tope) {
    for (var r = 0; r < Math.min(grid.length, tope); r++) {
      for (var c = 0; c < grid[r].length; c++) {
        var t = norm(grid[r][c]);
        if (!t) continue;
        if (/^id\.?$/.test(t)) return r;
        if (/cod/.test(t) && /agricultor/.test(t) && !/nombre|cedula/.test(t)) return r;
      }
    }
    return -1;
  }

  // Primera columna cuyo título normalizado contiene todas las palabras de `con` y ninguna de `sin`.
  function col(titulos, con, sin) {
    for (var c = 0; c < titulos.length; c++) {
      var t = titulos[c];
      if (!t) continue;
      if (con.every(function (w) { return t.indexOf(w) >= 0; }) && !(sin || []).some(function (w) { return t.indexOf(w) >= 0; })) return c;
    }
    return -1;
  }

  function textoDeFilas(grid, hasta) {
    var out = [];
    for (var r = 0; r <= hasta && r < grid.length; r++) out.push(grid[r].map(txt).join(' '));
    return out.join('\n');
  }

  // Texto que la hoja pone junto a «Licensee-unit no.:» (para «la hoja dice: F01»).
  function textoPrdHoja(grid, hasta) {
    for (var r = 0; r <= hasta && r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (!/licensee|unit no|unidad no/.test(norm(grid[r][c]))) continue;
        var celda = txt(grid[r][c]), i = celda.indexOf(':');
        if (i >= 0 && txt(celda.slice(i + 1))) return txt(celda.slice(i + 1));
        for (var k = c + 1; k < grid[r].length; k++) if (txt(grid[r][k])) return txt(grid[r][k]);
      }
    }
    return '';
  }

  var BUFFER = /amortiguamiento|buffer|proteccion/;
  function esAux(finca, codCampo) { return BUFFER.test(norm(finca)) || /\(?ZB\)?$|^ZA$/i.test(txt(codCampo)); }
  function baseNombre(finca) {
    return norm(finca).replace(/zona de amortiguamiento|zona buffer|zona de proteccion|amortiguamiento|buffer|proteccion|\bzb\b|\bza\b|[()\-_.]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function esBarbecho(c) { var n = norm(c); return /barbecho|sin cultivo/.test(n); }

  function leerLista(workbook) {
    var unidades = [], avisos = [], hojasDatos = 0;
    (workbook.SheetNames || []).forEach(function (nombre) {
      if (HOJA_IGNORADA.test(norm(nombre))) return;
      var grid = filasDeHoja(workbook.Sheets[nombre] || {});
      var h = filaEncabezado(grid, 20);
      if (h < 0) return;
      hojasDatos++;

      var cab = textoDeFilas(grid, h), prd = [], prc = [], m, re = /PRD\s*(\d+)/g;
      while ((m = re.exec(cab))) if (prd.indexOf(m[1]) < 0) prd.push(m[1]);
      re = /PRC\s*(\d+)/g;
      while ((m = re.exec(cab))) if (prc.indexOf(m[1]) < 0) prc.push(m[1]);
      var prdUnico = prd.length === 1 ? prd[0] : null, prdVarios = prd.length > 1 ? prd : [];
      var prdHoja = prd.length ? '' : textoPrdHoja(grid, h);

      // Títulos de la fila h y, para APELLIDOS/NOMBRES, también de h+1.
      var tit = [], sub = [];
      for (var c = 0; c < Math.max(grid[h].length, (grid[h + 1] || []).length); c++) { tit[c] = norm(grid[h][c]); sub[c] = norm((grid[h + 1] || [])[c]); }
      var ci = {
        codAgr: col(tit, ['cod', 'agricultor'], ['nombre', 'cedula']),
        codCampo: col(tit, ['cod', 'campo'], ['nombre']),
        finca: col(tit, ['nombre del campo']),
        haCultivo: col(tit, ['area de cultivo']),
        haTotal: col(tit, ['area total']),
        cultivo: col(tit, ['cultivo'], ['area', 'sistema']),
        coord: col(tit, ['coordenadas']),
        ape: -1, nom: -1
      };
      if (ci.codAgr < 0) ci.codAgr = col(tit, ['id']); // «ID.» solo si no hay otro título de agricultor
      for (c = 0; c < sub.length; c++) {
        if (ci.ape < 0 && sub[c] === 'apellidos') ci.ape = c;
        if (ci.nom < 0 && sub[c] === 'nombres') ci.nom = c;
      }
      if (ci.ape < 0) ci.ape = col(tit, ['apellidos']);
      if (ci.nom < 0) ci.nom = col(tit, ['nombres']);
      ['finca', 'haCultivo', 'cultivo'].forEach(function (k) {
        if (ci[k] < 0) avisos.push('Hoja «' + nombre + '»: no se encontró el título de «' + k + '»; ese dato queda vacío.');
      });
      if (ci.ape < 0 && ci.nom < 0) { avisos.push('Hoja «' + nombre + '»: no se encontraron las columnas de productor (APELLIDOS / NOMBRES); hoja omitida.'); return; }

      var get = function (f, k) { return ci[k] < 0 ? '' : txt(f[ci[k]]); };
      var filas = [];
      for (var r = h + 1; r < grid.length; r++) {
        var f = grid[r], primera = '';
        for (c = 0; c < f.length; c++) if (txt(f[c])) { primera = txt(f[c]); break; }
        if (/^(NOTA|TOTAL|RESUMEN|COLUMNAS|RENDIMIENTO)/i.test(primera)) break;
        var productor = [ci.ape < 0 ? '' : txt(f[ci.ape]), ci.nom < 0 ? '' : txt(f[ci.nom])].filter(Boolean).join(' ');
        if (!productor || /^(apellidos|nan)$/i.test(productor) || (/\d/.test(productor) && productor.length < 10)) continue;
        var haC = ci.haCultivo < 0 ? NaN : num(f[ci.haCultivo]);
        if (isNaN(haC)) continue;
        filas.push({ fila: r + 1, productor: productor, codAgr: get(f, 'codAgr'), codCampo: get(f, 'codCampo'), finca: get(f, 'finca'),
          cultivo: get(f, 'cultivo').toLowerCase(), haC: haC, haT: ci.haTotal < 0 ? NaN : num(f[ci.haTotal]), coordTxt: get(f, 'coord') });
      }

      var deHoja = [], auxiliares = [];
      filas.forEach(function (x) {
        if (esAux(x.finca, x.codCampo)) { auxiliares.push(x); return; }
        if (esBarbecho(x.cultivo) || x.haC <= 0) return; // barbecho: fuera
        // Mismo predio = misma hoja + mismo codCampo + misma finca: se funden cultivos.
        var u = deHoja.filter(function (y) { return y.productor === x.productor && y.codCampo === x.codCampo && norm(y.finca) === norm(x.finca) && y.codAgricultor === x.codAgr; })[0];
        if (u) {
          if (x.cultivo && u.cultivos.indexOf(x.cultivo) < 0) u.cultivos.push(x.cultivo);
          u.haCultivo += x.haC;
          return;
        }
        var cd = parseCoordDetalle(x.coordTxt);
        if (cd.motivo) avisos.push('Hoja «' + nombre + '», fila ' + x.fila + ' (' + x.finca + '): coordenada «' + x.coordTxt + '» descartada: ' + cd.motivo + '.');
        u = {
          clave: [nombre, x.codAgr, x.codCampo, x.fila].join('|'), hoja: nombre, filaExcel: x.fila,
          prd: prdUnico, prdVarios: prdVarios, prdHoja: prdHoja,
          codAgricultor: x.codAgr, codCampo: x.codCampo, productor: x.productor, finca: x.finca,
          cultivos: x.cultivo ? [x.cultivo] : [], haCultivo: x.haC, haTotal: isNaN(x.haT) ? null : x.haT, bufferHa: 0, origen: 'lista'
        };
        if (cd.coord) u.coord = cd.coord; // solo sirve para centrar el mapa
        deHoja.push(u);
      });
      // La zona buffer es parte de la unidad que la nombra: se suma a su predio y nunca es unidad propia.
      auxiliares.forEach(function (a) {
        var dueno = deHoja.filter(function (u) { return a.codCampo && u.codCampo === a.codCampo.replace(/\s*\(?ZB\)?$/i, '') && u.productor === a.productor; })[0] ||
          deHoja.filter(function (u) { return u.productor === a.productor && baseNombre(u.finca) && baseNombre(u.finca) === baseNombre(a.finca); })[0] ||
          deHoja.filter(function (u) { return a.codCampo && u.codCampo === a.codCampo && u.productor === a.productor; })[0];
        if (dueno) dueno.bufferHa += a.haC;
        else avisos.push('Hoja «' + nombre + '», fila ' + a.fila + ': zona buffer «' + a.finca + '» sin predio al que pertenezca; no se incluyó.');
      });
      if (!prd.length) avisos.push('Hoja «' + nombre + '»: sin código PRD' + (prdHoja ? ' (la hoja dice: ' + prdHoja + ')' : '') + '.');
      if (prd.length > 1) avisos.push('Hoja «' + nombre + '»: varios PRD (' + prd.join(', ') + '); no se asigna ninguno a las unidades.');
      deHoja.forEach(function (u) { unidades.push(u); });
    });
    if (!hojasDatos) avisos.push('No se encontró ninguna hoja con tabla de agricultores (formato F11); revisa que sea la Lista integrada.');
    return { unidades: unidades, avisos: avisos };
  }

  var API = { leerLista: leerLista, parseCoord: parseCoord, parseCoordDetalle: parseCoordDetalle };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.Lista = API;
})(typeof self !== 'undefined' ? self : this);
