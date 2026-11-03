// Pantallas de Muestras de campo. La lógica está en nucleo.js y lista.js; aquí solo DOM, IndexedDB, GPS y mapa.
(function () {
  'use strict';
  // Mismos archivos que precachea sw.js (una prueba los compara). Sirve para saber si la caché está completa.
  var SHELL = [
    './', 'index.html', 'app.js', 'nucleo.js', 'lista.js', 'estilos.css', 'manifest.webmanifest',
    'icono-192.png', 'icono-512.png', 'icono-maskable-512.png', 'apple-touch-icon.png',
    'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/xlsx.full.min.js',
    'vendor/images/layers.png', 'vendor/images/layers-2x.png', 'vendor/images/marker-icon.png',
    'vendor/images/marker-icon-2x.png', 'vendor/images/marker-shadow.png'
  ];
  var N = window.Nucleo, appEl = document.getElementById('app');

  // ---------- Utilidades de DOM ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) añadir(el, arguments[i]);
    return el;
  }
  function añadir(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { añadir(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  // Vacía el elemento y pone hijos (acepta arrays anidados y null).
  // Nodo con texto (nunca HTML con datos).
  function nodo(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; e.textContent = texto; return e; }
  function pon(el) { el.textContent = ''; for (var i = 1; i < arguments.length; i++) añadir(el, arguments[i]); }
  function boton(texto, fn, clase, extra) { return h('button', Object.assign({ type: 'button', class: clase || '', onclick: fn }, extra || {}), texto); }

  var avisoTimer;
  // Aviso breve; con `persistente` queda en rojo hasta que se toque (para fallos que no deben pasar inadvertidos).
  function aviso(texto, persistente) {
    var a = document.getElementById('aviso');
    a.textContent = texto; a.classList.add('ver'); a.classList.toggle('error', !!persistente);
    a.onclick = persistente ? function () { a.classList.remove('ver', 'error'); } : null;
    clearTimeout(avisoTimer);
    if (!persistente) avisoTimer = setTimeout(function () { a.classList.remove('ver'); }, 2500);
  }

  // Hoja modal propia (sin <dialog>).
  function modal(contenido) {
    var velo = h('div', { class: 'velo', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'hoja' }, contenido));
    velo.addEventListener('click', function (e) { if (e.target === velo) cerrar(); });
    function cerrar() { velo.remove(); }
    document.body.appendChild(velo);
    return cerrar;
  }
  function confirmar(texto, si, no) {
    return new Promise(function (res) {
      var cerrar = modal([h('p', null, texto), h('div', { class: 'acciones' },
        boton(no || 'Cancelar', function () { cerrar(); res(false); }),
        boton(si || 'Aceptar', function () { cerrar(); res(true); }, 'primario'))]);
    });
  }
  function formulario(titulo, campos, textoOk) {
    return new Promise(function (res) {
      var inputs = campos.map(function (c) {
        return h('label', { class: 'campo' }, c.etiqueta, h('input', { type: 'text', name: c.nombre, value: c.valor || '', inputmode: c.inputmode, autocomplete: 'off', autocapitalize: c.mayus ? 'characters' : 'sentences' }));
      });
      var cerrar = modal([h('h2', { style: 'margin-top:0' }, titulo), inputs, h('div', { class: 'acciones' },
        boton('Cancelar', function () { cerrar(); res(null); }),
        boton(textoOk || 'Aceptar', function () {
          var o = {}; inputs.forEach(function (l) { var i = l.querySelector('input'); o[i.name] = i.value.trim(); });
          cerrar(); res(o);
        }, 'primario'))]);
      inputs[0].querySelector('input').focus();
    });
  }

  // ---------- IndexedDB ----------
  var dbP;
  function db() {
    if (!dbP) dbP = new Promise(function (res, rej) {
      var q = indexedDB.open('muestras-campo', 1);
      q.onupgradeneeded = function () {
        var d = q.result;
        d.createObjectStore('visitas', { keyPath: 'id' });
        d.createObjectStore('teselas');
      };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
    return dbP;
  }
  function tx(almacen, modo, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(almacen, modo), r = fn(t.objectStore(almacen));
        t.oncomplete = function () { res(r && r.result); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  // Visitas guardadas antes del ADT por visita: se migran al leerlas y se guardan ya migradas.
  function migrada(v) { if (v && N.migrarVisita(v)) Visitas.guardar(v).catch(function () {}); return v; }
  var Visitas = {
    todas: function () { return tx('visitas', 'readonly', function (s) { return s.getAll(); }).then(function (vs) { return vs.map(migrada); }); },
    leer: function (id) { return tx('visitas', 'readonly', function (s) { return s.get(id); }).then(migrada); },
    guardar: function (v) { return tx('visitas', 'readwrite', function (s) { return s.put(v); }); },
    borrar: function (id) { return tx('visitas', 'readwrite', function (s) { return s.delete(id); }); }
  };
  var Teselas = {
    leer: function (k) { return tx('teselas', 'readonly', function (s) { return s.get(k); }); },
    hay: function (k) { return tx('teselas', 'readonly', function (s) { return s.count(k); }).then(function (n) { return n > 0; }); },
    guardar: function (k, blob) { return tx('teselas', 'readwrite', function (s) { return s.put(blob, k); }); }
  };

  // ---------- Capas de mapa (Esri) ----------
  var CAPAS = {
    satelite: { nombre: 'Satélite', atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics y la comunidad GIS', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    mapa: { nombre: 'Mapa', atribucion: 'Mapa: Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' }
  };
  function capaElegida() { var c = null; try { c = localStorage.getItem('capa'); } catch (e) { /* sin almacenamiento */ } return CAPAS[c] ? c : 'satelite'; }
  function recordarCapa(c) { try { localStorage.setItem('capa', c); } catch (e) { /* sin almacenamiento */ } }
  function urlTesela(capa, z, x, y) { return CAPAS[capa].url.replace('{z}', z).replace('{y}', y).replace('{x}', x); }
  function claveTesela(capa, z, x, y) { return capa + '/' + z + '/' + x + '/' + y; }

  // Esri responde 200 con una imagen gris «Map data not yet available» donde no hay imagen: no se guarda.
  // Por tamaño (satélite, zoom alto) o, si es pequeña, por color casi uniforme en un canvas.
  function esSinDatos(blob, capa, z) {
    if (N.teselaSinDatos(blob.size, z, capa)) return Promise.resolve(true);
    if (capa !== 'satelite' || z < 15 || blob.size > 12000 || typeof createImageBitmap !== 'function') return Promise.resolve(false);
    return createImageBitmap(blob).then(function (bmp) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 8;
      var cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0, 8, 8);
      var d = cx.getImageData(0, 0, 8, 8).data, mn = [255, 255, 255], mx = [0, 0, 0];
      for (var i = 0; i < d.length; i += 4) for (var c = 0; c < 3; c++) { if (d[i + c] < mn[c]) mn[c] = d[i + c]; if (d[i + c] > mx[c]) mx[c] = d[i + c]; }
      if (bmp.close) bmp.close();
      return (mx[0] - mn[0]) < 14 && (mx[1] - mn[1]) < 14 && (mx[2] - mn[2]) < 14;
    }).catch(function () { return false; });
  }

  // Lee de IndexedDB; si no está y hay red, la baja y la guarda; si no, deja el hueco (se ve el fondo neutro).
  function capaLeaflet(capa) {
    var Capa = L.TileLayer.extend({
      createTile: function (c, done) {
        var img = document.createElement('img');
        img.alt = ''; img.setAttribute('role', 'presentation');
        var k = claveTesela(capa, c.z, c.x, c.y), url = urlTesela(capa, c.z, c.x, c.y);
        function terminar() { done(null, img); }
        function mostrar(blob) {
          var u = URL.createObjectURL(blob);
          img.onload = function () { URL.revokeObjectURL(u); terminar(); };
          img.onerror = function () { URL.revokeObjectURL(u); terminar(); };
          img.src = u;
        }
        function directo() { img.onload = terminar; img.onerror = terminar; img.src = url; }
        Teselas.leer(k).then(function (blob) {
          if (blob) { mostrar(blob); return; }
          if (!navigator.onLine) { terminar(); return; }
          fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
            .then(function (b) {
              return esSinDatos(b, capa, c.z).then(function (sin) {
                if (sin) { terminar(); return; } // sin imagen: ni se guarda ni se muestra el gris de Esri
                Teselas.guardar(k, b).catch(function () {}); mostrar(b);
              });
            })
            .catch(directo);
        }).catch(directo);
        return img;
      }
    });
    return new Capa(CAPAS[capa].url, { maxZoom: 19, maxNativeZoom: 18, attribution: CAPAS[capa].atribucion });
  }

  // ---------- GPS ----------
  // pos.t = hora de la lectura. Una lectura de pantalla anterior o de hace >10 s no se usa sin avisar.
  var gps = { pos: null, id: null, oyentes: [], timer: null };
  function gpsAvisar() { gps.oyentes.forEach(function (f) { f(); }); }
  function gpsIniciar() {
    if (gps.id != null || !navigator.geolocation) return;
    gps.pos = null; gps.error = null;
    gps.id = navigator.geolocation.watchPosition(function (p) {
      gps.pos = { lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude, precision: p.coords.accuracy, t: p.timestamp || Date.now() };
      gps.error = null; gpsAvisar();
    }, function (e) {
      gps.error = e.code === 1 ? 'Permiso de ubicación denegado' : 'Sin señal de GPS';
      gpsAvisar();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    gps.timer = setInterval(gpsAvisar, 2000); // la edad de la lectura cambia aunque no lleguen lecturas
  }
  function gpsDetener() {
    if (gps.id != null && navigator.geolocation) navigator.geolocation.clearWatch(gps.id);
    clearInterval(gps.timer); gps.timer = null;
    gps.id = null; gps.pos = null; gps.oyentes = [];
  }
  function pastillaGPS() {
    var el = h('span', { class: 'gps nada' }, 'GPS …');
    function pintar() {
      var e = N.estadoGPS(gps.pos);
      if (e.nivel === 'nada') { el.className = 'gps nada'; el.textContent = gps.error || 'GPS buscando…'; return; }
      if (e.nivel === 'viejo') { el.className = 'gps nada'; el.textContent = 'GPS sin lectura nueva (hace ' + e.edadS + ' s)'; return; }
      el.className = 'gps ' + e.nivel;
      el.textContent = 'GPS ±' + Math.round(gps.pos.precision) + ' m';
    }
    pintar(); gps.oyentes.push(pintar);
    return el;
  }

  // ---------- Estado y ruteo ----------
  var visita = null, pendienteLista = null, mapaActual = null;
  function limpiarMapa() { if (mapaActual) { mapaActual.remove(); mapaActual = null; } }
  // Resuelve true si quedó guardado; si no, avisa en rojo hasta que se toque y resuelve false.
  function guardar() {
    visita.modificada = new Date().toISOString();
    return Visitas.guardar(visita).then(function () { return true; }, function () {
      aviso('NO SE GUARDÓ en el teléfono (¿sin espacio?). Exporta ahora el archivo. Toca para cerrar.', true);
      return false;
    });
  }
  function ir(ruta) { location.hash = ruta; }

  function render() {
    limpiarMapa();
    gps.oyentes = [];
    var partes = location.hash.replace(/^#\/?/, '').split('/');
    appEl.classList.remove('con-barra');
    pon(appEl);
    window.scrollTo(0, 0);
    if (partes[0] !== 'v' || !partes[1]) { gpsDetener(); visitas(); return; }
    Visitas.leer(partes[1]).then(function (v) {
      if (!v) { ir('#/'); return; }
      if (!visita || visita.id !== v.id) visita = v;
      var sub = partes[2], mid = partes[3];
      if (sub === 'm' && mid) { gpsIniciar(); pantallaMuestra(mid); }
      else if (sub === 'seleccion') { pantallaSeleccion(); }
      else if (sub === 'revisar') { gpsDetener(); pantallaRevisar(); }
      else if (sub === 'mapa') { gpsIniciar(); pantallaMapaOffline(); }
      else { gpsDetener(); pantallaVisita(); }
    }).catch(function () { appEl.textContent = 'No se pudo abrir la base del teléfono.'; });
  }
  window.addEventListener('hashchange', render);

  // ---------- 1. Visitas (agenda) ----------
  function visitas() {
    visita = null;
    Visitas.todas().then(function (todas) {
      var hoy = N.hoyISO();
      var archivo = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importar });
      var archivoGravi = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: traerDeGravi });
      var indicadorEl = h('div', { class: 'indicadores' }, h('span', { class: 'suave chico' }, 'Comprobando instalación…'));
      estadoInstalacion().then(function (e) {
        function pastilla(texto, si) { return h('span', { class: 'insignia ' + (si ? 'ok' : 'aviso') }, texto + ': ' + (si ? 'sí' : 'no')); }
        pon(indicadorEl, h('div', { class: 'fila envuelve', style: 'gap:6px' }, pastilla('Instalada', e.instalada), pastilla('Lista sin señal', e.sinSenal), pastilla('Almacenamiento protegido', e.protegido)),
          e.instalada ? null : h('p', { class: 'alerta chico' }, 'Safari y el icono de la pantalla de inicio guardan los datos por separado: trabaja siempre desde el icono, no desde Safari.'),
          e.sinSenal ? null : h('p', { class: 'suave chico' }, 'Abre la página una vez con señal para que quede guardada.'));
      });
      function fila(v) {
        var a = N.avance(v), fecha = N.etiquetaFecha(v, hoy) || ('Creada ' + N.fechaDMA(v.creada));
        return h('div', { class: 'tarjeta' },
          h('div', { class: 'fila sep' },
            h('button', { type: 'button', class: 'visita-ab crece', onclick: function () { ir('#/v/' + v.id); } },
              h('strong', null, 'Exp. ' + (v.expediente || 's/n')), v.origen === 'gravi' ? [' ', h('span', { class: 'insignia gravi' }, 'de Gravi')] : null,
              h('div', null, v.cliente || '(sin cliente)')),
            boton('Borrar', function () {
              var c = N.contarVisita(v);
              confirmar('¿Borrar la visita ' + v.expediente + ' de este teléfono? Se pierden ' + c.muestras + (c.muestras === 1 ? ' muestra' : ' muestras') + ' y ' + c.puntos + (c.puntos === 1 ? ' punto' : ' puntos') + ' que no hayas exportado.', 'Borrar').then(function (si) { if (si) Visitas.borrar(v.id).then(render); });
            }, 'peligro')),
          h('p', { class: 'suave' }, h('strong', null, fecha), ' · ' + a.conMuestra + '/' + a.unidades + ' con muestra · ' + a.completas + (a.completas === 1 ? ' completa' : ' completas')));
      }
      pon(appEl,
        h('h1', null, 'Muestras de campo'),
        indicadorEl,
        h('div', { class: 'fila envuelve' }, boton('Traer de Gravi', function () { archivoGravi.click(); }, 'primario'), boton('Nueva visita', nuevaVisita), boton('Importar archivo', function () { archivo.click(); }), archivo, archivoGravi),
        todas.length ? N.agenda(todas, hoy).map(function (g) { return [h('h2', null, g.titulo), g.visitas.map(fila)]; })
          : h('p', { class: 'suave' }, 'Aún no hay visitas. «Traer de Gravi» carga las de la agenda; «Nueva visita» crea una a mano.'));
    });
  }
  // Lee visitas-de-campo.json (de Gravi) y crea o actualiza visitas; no toca muestras, puntos ni precintos.
  function traerDeGravi(e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    Promise.all([f.text(), Visitas.todas()]).then(function (r) {
      var res = N.importarGravi(r[0], r[1]);
      if (res.error) { aviso(res.error, true); return null; }
      return Promise.all(res.visitas.map(function (v) { return Visitas.guardar(v); })).then(function () {
        var x = res.resumen;
        render();
        var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Traído de Gravi'), h('p', null, h('strong', null, res.texto)),
          x.unidadesNuevas ? h('p', { class: 'suave' }, plural(x.unidadesNuevas, 'unidad nueva', 'unidades nuevas')) : null,
          x.unidadesQuitadas ? h('p', { class: 'suave' }, plural(x.unidadesQuitadas, 'unidad quitada (ya no está en Gravi y no tenía muestras)', 'unidades quitadas (ya no están en Gravi y no tenían muestras)')) : null,
          x.unidadesMarcadas ? h('p', { class: 'alerta' }, plural(x.unidadesMarcadas, 'unidad con muestras ya no está en Gravi: se conserva y queda marcada', 'unidades con muestras ya no están en Gravi: se conservan y quedan marcadas')) : null,
          x.avisos.map(function (t) { return h('p', { class: 'alerta' }, t); }),
          h('div', { class: 'acciones' }, boton('Aceptar', function () { cerrar(); }, 'primario'))]);
      });
    }).catch(function () { aviso('No se pudo guardar lo traído de Gravi', true); });
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  // ¿Está instalada, lista sin señal (SW activo y todo el shell en caché) y con almacenamiento protegido?
  function estadoInstalacion() {
    var instalada = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var sw = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller && typeof caches !== 'undefined'
      ? Promise.all(SHELL.map(function (f) { return caches.match(f); })).then(function (r) { return r.every(Boolean); }).catch(function () { return false; })
      : Promise.resolve(false);
    var prot = navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return false; }) : Promise.resolve(false);
    return Promise.all([sw, prot]).then(function (r) { return { instalada: instalada, sinSenal: r[0], protegido: r[1] }; });
  }
  function nuevaVisita() {
    formulario('Nueva visita', [{ nombre: 'expediente', etiqueta: 'Expediente', inputmode: 'numeric' }, { nombre: 'cliente', etiqueta: 'Cliente' }], 'Crear').then(function (o) {
      if (!o) return;
      if (!o.expediente) { aviso('Falta el expediente'); return; }
      var v = N.nuevaVisita(o.expediente, o.cliente);
      Visitas.guardar(v).then(function () { ir('#/v/' + v.id); });
    });
  }
  function importar(e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    f.text().then(function (t) {
      var r = N.leerArchivo(t);
      if (r.error) { aviso(r.error, true); return; }
      function guardarImportada() { return Visitas.guardar(r.visita).then(function () { aviso('Visita importada'); render(); }, function () { aviso('No se pudo guardar la visita importada', true); }); }
      Visitas.leer(r.visita.id).then(function (ya) {
        if (!ya) { guardarImportada(); return; }
        var c = N.compararVisitas(ya, r.visita);
        function col(t, x) { return h('div', { class: 'tarjeta crece' }, h('strong', null, t), h('div', null, N.fechaDMA(x.fecha) + ' ' + N.horaHM(x.fecha)), h('div', null, x.muestras + ' muestras'), h('div', null, x.puntos + ' puntos')); }
        var recom = c.masNueva === 'b' ? 'El archivo es más nuevo.' : c.masNueva === 'a' ? 'La del teléfono es más nueva.' : 'Tienen la misma fecha.';
        var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Esta visita ya está en el teléfono'),
          h('div', { class: 'fila', style: 'align-items:stretch' }, col('En el teléfono', c.a), col('En el archivo', c.b)),
          h('p', { class: 'alerta' }, recom + ' Si reemplazas, se pierde lo que solo esté en el teléfono.'),
          h('div', { class: 'acciones' }, boton('Conservar la del teléfono', function () { cerrar(); }, c.masNueva === 'b' ? '' : 'primario'),
            boton('Reemplazar con el archivo', function () { cerrar(); guardarImportada(); }, c.masNueva === 'b' ? 'primario' : ''))]);
      });
    });
  }

  // ---------- 2. Visita ----------
  function estadoUnidad(u) {
    var ms = visita.muestras.filter(function (m) { return N.claveMuestra(m) === u.clave; });
    if (!ms.length) return { clase: 'insignia', texto: 'Sin muestra' };
    var todas = ms.every(function (m) { var e = N.estadoMuestra(m); return e.puntosOk && e.precintosOk; });
    return todas ? { clase: 'insignia ok', texto: '● Completa' } : { clase: 'insignia aviso', texto: '● Falta algo' };
  }
  // Identidad de una unidad: titular arriba (productor o, en un individual de Gravi, la finca), finca y campo debajo,
  // código y hoja pequeños (ámbar si no hay código).
  function identidad(u, grande) {
    var hueco = !N.tieneCodigo(u), gravi = u.origen === 'gravi';
    var segunda = gravi ? (u.productor && u.finca ? u.finca : '') : ((u.finca || '(sin finca)') + (u.codCampo ? ' · campo ' + u.codCampo : ''));
    return [
      h('div', { class: grande ? 'titular' : 'titular chico-t' }, gravi ? N.nombreUnidad(u) : (u.productor || '(sin productor)')),
      segunda ? h('div', null, segunda) : null,
      h('div', { class: hueco ? 'prd-hueco' : 'suave chico' }, N.textoPRD(u) + (u.hoja && (gravi || !hueco) ? ' · hoja ' + u.hoja : ''))
    ];
  }
  function masAcciones(archivo) {
    var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Unidades'),
      boton('Cargar otra Lista', function () { cerrar(); archivo.click(); }, '', { style: 'width:100%;margin:6px 0' }),
      boton('Agregar unidad a mano', function () { cerrar(); agregarUnidadAMano(); }, '', { style: 'width:100%;margin:6px 0' }),
      boton('Cerrar', function () { cerrar(); }, '', { style: 'width:100%;margin:6px 0' })]);
  }
  // El ADT es uno por visita: se escribe aquí una vez (o viene de Gravi) y sale en «Revisar» y en la exportación.
  function campoAdt() {
    var i = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: visita.adt || '', 'aria-label': 'ADT de la visita' });
    i.addEventListener('input', function () { visita.adt = i.value; delete visita.avisoMigracion; guardar(); });
    return h('label', { class: 'campo' }, 'ADT de la visita (el mismo para todas las muestras)', i,
      visita.avisoMigracion ? h('span', { class: 'alerta chico', style: 'display:block;font-weight:400' }, visita.avisoMigracion + ' Se tomó el más repetido: confírmalo.') : null);
  }
  function pantallaVisita() {
    appEl.classList.add('con-barra');
    var archivo = h('input', { type: 'file', accept: '.xls,.xlsx,.xlsm', hidden: true, onchange: cargarLista });
    var rep = N.nombresRepetidos(visita.unidades);
    pon(appEl, 
      h('button', { class: 'atras', onclick: function () { ir('#/'); } }, '‹ Visitas'),
      h('h1', null, 'Exp. ' + visita.expediente, visita.origen === 'gravi' ? [' ', h('span', { class: 'insignia gravi' }, 'de Gravi')] : null),
      h('p', { class: 'suave' }, [visita.cliente, visita.tipoTexto, N.etiquetaFecha(visita, N.hoyISO()) || N.fechaDMA(visita.creada)].filter(Boolean).join(' · ')),
      campoAdt(),
      (function () { var a = N.avance(visita); return h('p', { class: 'avance' }, a.unidades + (a.unidades === 1 ? ' unidad' : ' unidades') + ' · ' + a.conMuestra + ' con muestra · ' + a.completas + (a.completas === 1 ? ' muestra completa' : ' muestras completas')); })(),
      h('p', { class: 'suave chico' }, visita.ultimoExportar ? 'Último exportar: ' + N.fechaDMA(visita.ultimoExportar) + ' ' + N.horaHM(visita.ultimoExportar) + '. Exporta al terminar cada finca.' : 'Aún no exportaste esta visita. Exporta al terminar cada finca.'),
      visita.unidades.length
        ? h('div', { class: 'fila' }, boton('Mapa sin señal', function () { ir('#/v/' + visita.id + '/mapa'); }, 'chica'), boton('Más…', function () { masAcciones(archivo); }, 'chica'), archivo)
        : h('div', { class: 'fila envuelve' }, boton('Cargar Lista integrada', function () { archivo.click(); }, 'primario'),
          boton('Agregar unidad a mano', agregarUnidadAMano), boton('Mapa sin señal', function () { ir('#/v/' + visita.id + '/mapa'); }), archivo),
      visita.unidades.length ? null : h('p', { class: 'suave' }, 'Carga la Lista integrada (.xls o .xlsx) y marca las unidades que entran en esta visita.'),
      visita.unidades.map(function (u, i) { return tarjetaUnidad(u, rep[i]); }),
      h('div', { class: 'barra' }, boton('Revisar antes de salir', function () { ir('#/v/' + visita.id + '/revisar'); }, 'primario'), boton('Exportar', pantallaExportar)));
  }
  function tarjetaUnidad(u, repetido) {
    var est = estadoUnidad(u);
    var ms = visita.muestras.filter(function (m) { return N.claveMuestra(m) === u.clave; });
    return h('div', { class: 'tarjeta unidad' },
      h('div', { class: 'cab' },
        h('div', { class: 'fila sep', style: 'align-items:flex-start' }, h('div', { class: 'crece' }, identidad(u, true)), h('span', { class: est.clase }, est.texto)),
        u.yaNoEstaEnGravi ? h('div', { class: 'alerta' }, '⚠ Ya no está en Gravi (tiene muestras: se conserva)') : null,
        repetido ? h('div', { class: 'alerta' }, '⚠ Mismo nombre de ' + repetido.join(' y ') + ' que otra unidad: confirma por código de campo') : null,
        null),
      ms.map(function (m) {
        var e = N.estadoMuestra(m);
        return h('button', { class: 'muestra', onclick: function () { ir('#/v/' + visita.id + '/m/' + m.id); } },
          h('span', { class: 'crece' }, 'Muestra ' + m.numero + ' ' + m.cultivo + ' ',
            h('span', { class: 'insignia ' + (e.puntosOk ? 'ok' : 'error') }, (e.puntosOk ? '✓ ' : '✗ ') + e.puntos + (e.puntos === 1 ? ' punto' : ' puntos')), ' ',
            h('span', { class: 'insignia ' + (e.precintosOk ? 'ok' : 'error') }, (e.precintosOk ? '✓ ' : '✗ ') + 'precintos')), '›');
      }),
      h('div', { class: 'fila envuelve', style: 'margin-top:8px' }, boton('+ Muestra', function () { nuevaMuestra(u); }),
        boton('Quitar unidad', function () { quitarUnidadUI(u, ms); }, 'peligro')));
  }
  function quitarUnidadUI(u, ms) {
    var puntos = ms.reduce(function (a, m) { return a + m.puntos.length; }, 0);
    var txt = ms.length ? '¿Quitar a ' + N.nombreUnidad(u) + ' de la visita? Se borran ' + ms.length + (ms.length === 1 ? ' muestra' : ' muestras') + ' y ' + puntos + (puntos === 1 ? ' punto' : ' puntos') + ' (con sus precintos).'
      : '¿Quitar a ' + [u.productor, u.finca].filter(Boolean).join(' · ') + ' de la visita?';
    confirmar(txt, 'Quitar').then(function (si) { if (si) { N.quitarUnidad(visita, u.clave); guardar().then(render); } });
  }
  function nuevaMuestra(u) {
    function crear(c) {
      var m = N.crearMuestra(visita, u, c);
      visita.muestras.push(m);
      guardar().then(function () { ir('#/v/' + visita.id + '/m/' + m.id); });
    }
    if (u.cultivos.length === 1) { crear(u.cultivos[0]); return; }
    var cerrar = modal([h('h2', { style: 'margin-top:0' }, u.cultivos.length ? 'Cultivo de la muestra' : 'Esta unidad no trae cultivo'),
      u.cultivos.map(function (c) { return boton(c, function () { cerrar(); crear(c); }, '', { style: 'width:100%;margin:6px 0' }); }),
      u.cultivos.length ? null : boton('Escribir el cultivo', function () {
        cerrar();
        formulario('Cultivo', [{ nombre: 'c', etiqueta: 'Cultivo' }]).then(function (o) {
          if (o && o.c) { if (u.cultivos.indexOf(N.normCultivo(o.c)) < 0) u.cultivos.push(N.normCultivo(o.c)); crear(o.c); }
        });
      }, 'primario', { style: 'width:100%' })]);
  }
  function agregarUnidadAMano() {
    formulario('Unidad a mano', [{ nombre: 'productor', etiqueta: 'Productor' }, { nombre: 'finca', etiqueta: 'Finca' },
      { nombre: 'cultivo', etiqueta: 'Cultivo (ej. banano)' }, { nombre: 'ha', etiqueta: 'Hectáreas (opcional)', inputmode: 'decimal' }], 'Agregar').then(function (o) {
      if (!o) return;
      if (!o.productor && !o.finca) { aviso('Falta productor o finca'); return; }
      visita.unidades.push(N.crearUnidadAMano({ productor: o.productor, finca: o.finca, cultivos: o.cultivo ? [o.cultivo] : [], ha: o.ha.replace(',', '.') }));
      guardar().then(render);
    });
  }

  // Selección de unidades tras leer la Lista
  function cargarLista(e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    f.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var r = window.Lista.leerLista(wb);
      var iguales = N.conciliarUnidades(visita.unidades, r.unidades); // la misma unidad conserva su clave aunque cambie la fila
      if (iguales) r.avisos.unshift(iguales + ' unidades ya estaban en la visita (se reconocieron aunque cambió la fila).');
      pendienteLista = { unidades: r.unidades, avisos: r.avisos, sel: {}, filtro: '' };
      ir('#/v/' + visita.id + '/seleccion');
    }).catch(function () { aviso('No se pudo leer el archivo. ¿Es un .xls/.xlsx de la Lista?'); });
  }
  function pantallaSeleccion() {
    if (!pendienteLista) { ir('#/v/' + visita.id); return; }
    appEl.classList.add('con-barra');
    var P = pendienteLista, ya = {};
    visita.unidades.forEach(function (u) { ya[u.clave] = true; });
    var rep = N.nombresRepetidos(P.unidades);
    var lista = h('div'), cuenta = h('strong');
    var buscador = h('input', { type: 'search', placeholder: 'Buscar por productor, finca, campo o PRD', value: P.filtro, 'aria-label': 'Buscar' });
    function visibles() {
      var q = N.normCultivo(P.filtro).normalize('NFD').replace(/[̀-ͯ]/g, '');
      return P.unidades.map(function (u, i) { return { u: u, i: i }; }).filter(function (x) {
        var t = [x.u.productor, x.u.finca, x.u.codCampo, x.u.prd, (x.u.prdVarios || []).join(' '), x.u.hoja].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return !q || t.indexOf(q) >= 0;
      });
    }
    function pintar() {
      var n = Object.keys(P.sel).filter(function (k) { return P.sel[k]; }).length;
      cuenta.textContent = n;
      pon(lista, visibles().map(function (x) {
        var u = x.u, incl = ya[u.clave];
        var cb = h('input', { type: 'checkbox', checked: incl || P.sel[u.clave], disabled: incl, 'aria-label': 'Incluir ' + N.nombreUnidad(u),
          onchange: function () { P.sel[u.clave] = cb.checked; cuenta.textContent = Object.keys(P.sel).filter(function (k) { return P.sel[k]; }).length; } });
        return h('label', { class: 'tarjeta item-sel' }, cb, h('div', { class: 'crece' },
          identidad(u, true),
          h('div', { class: 'suave chico' }, (u.cultivos.join(', ') || 'sin cultivo') + (u.haCultivo != null ? ' · ' + u.haCultivo + ' ha' : '')),
          rep[x.i] ? h('div', { class: 'alerta' }, '⚠ Mismo nombre de ' + rep[x.i].join(' y ') + ' que otra unidad') : null,
          incl ? h('span', { class: 'insignia ok' }, 'ya incluida') : null));
      }));
    }
    buscador.addEventListener('input', function () { P.filtro = buscador.value; pintar(); });
    pon(appEl, 
      h('button', { class: 'atras', onclick: function () { pendienteLista = null; ir('#/v/' + visita.id); } }, '‹ Cancelar'),
      h('h1', null, 'Unidades de la Lista'),
      P.avisos.length ? h('div', { class: 'tarjeta' }, h('strong', null, 'Avisos de lectura (' + P.avisos.length + ')'), h('ul', { class: 'chico' }, P.avisos.slice(0, 30).map(function (a) { return h('li', null, a); }),
        P.avisos.length > 30 ? h('li', null, '… y ' + (P.avisos.length - 30) + ' más') : null)) : null,
      h('p', { class: 'suave' }, P.unidades.length + ' unidades leídas. Marca las que entran en esta visita.'),
      buscador,
      h('div', { class: 'fila envuelve', style: 'margin:8px 0' },
        boton('Marcar las visibles', function () { visibles().forEach(function (x) { if (!ya[x.u.clave]) P.sel[x.u.clave] = true; }); pintar(); }),
        boton('Ninguna', function () { P.sel = {}; pintar(); })),
      lista,
      h('div', { class: 'barra' }, boton('Incluir ', function () {
        var elegidas = P.unidades.filter(function (u) { return P.sel[u.clave] && !ya[u.clave]; });
        if (!elegidas.length) { aviso('No marcaste ninguna unidad'); return; }
        elegidas.forEach(function (u) { visita.unidades.push(u); });
        pendienteLista = null;
        guardar().then(function () { ir('#/v/' + visita.id); });
      }, 'primario', null), null));
    var ok = appEl.querySelector('.barra .primario');
    ok.append(cuenta, ' en la visita');
    pintar();
  }

  function cambiarCultivoUI(m, u) {
    function aplicar(c) {
      if (!c) return;
      if (u.cultivos.indexOf(N.normCultivo(c)) < 0) u.cultivos.push(N.normCultivo(c));
      if (!N.cambiarCultivo(visita, m, c)) { aviso('Ese ya es el cultivo de la muestra'); return; }
      guardar().then(render);
    }
    var otros = u.cultivos.filter(function (c) { return N.normCultivo(c) !== N.normCultivo(m.cultivo); });
    var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Cambiar cultivo'),
      h('p', { class: 'suave' }, 'La muestra pasará a numerarse en el cultivo nuevo.'),
      otros.map(function (c) { return boton(c, function () { cerrar(); aplicar(c); }, '', { style: 'width:100%;margin:6px 0' }); }),
      boton('Escribir otro cultivo', function () {
        cerrar(); formulario('Cultivo', [{ nombre: 'c', etiqueta: 'Cultivo' }]).then(function (o) { if (o && o.c) aplicar(o.c); });
      }, '', { style: 'width:100%;margin:6px 0' }),
      boton('Cancelar', function () { cerrar(); }, '', { style: 'width:100%;margin:6px 0' })]);
  }

  // ---------- 3. Muestra ----------
  function pantallaMuestra(mid) {
    var m = visita.muestras.filter(function (x) { return x.id === mid; })[0];
    if (!m) { ir('#/v/' + visita.id); return; }
    var u = N.unidadDeMuestra(visita, m) || {};
    var avisoCerca = null;
    var capa = capaElegida(), capaLayer = null;

    var mapaEl = h('div', { id: 'mapa' }), listaEl = h('div'), cercaEl = h('div'), gpsEl = pastillaGPS();
    var selector = h('div', { class: 'fila', role: 'group', 'aria-label': 'Capa del mapa' }, Object.keys(CAPAS).map(function (k) {
      return boton(CAPAS[k].nombre, function () { cambiarCapa(k); }, k === capa ? 'primario' : '', { 'data-capa': k, 'aria-pressed': k === capa ? 'true' : 'false' });
    }));
    function cambiarCapa(k) {
      capa = k; recordarCapa(k);
      selector.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-capa') === k; b.className = on ? 'primario' : ''; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      if (capaLayer) mapaActual.removeLayer(capaLayer);
      capaLayer = capaLeaflet(k).addTo(mapaActual); capaLayer.bringToBack();
    }

    var contra = h('input', { type: 'text', value: m.precintos.contramuestra, autocapitalize: 'characters', 'aria-label': 'Precinto de contramuestra' });
    function campoPrecinto(clave, etiqueta, extra) {
      var i = h('input', Object.assign({ type: 'text', value: m.precintos[clave], autocomplete: 'off' }, extra));
      i.addEventListener('input', function () { m.precintos[clave] = i.value; guardar(); });
      return h('label', { class: 'campo' }, etiqueta, i);
    }
    var nota = h('textarea', { rows: 3, 'aria-label': 'Nota' }); nota.value = m.nota;
    nota.addEventListener('input', function () { m.nota = nota.value; guardar(); });

    appEl.classList.add('con-barra');
    pon(appEl, 
      h('button', { class: 'atras', onclick: function () { ir('#/v/' + visita.id); } }, '‹ ' + (visita.expediente || 'Visita')),
      h('h1', null, 'Muestra ' + m.numero + ' · ' + m.cultivo),
      identidad(u, false),
      h('div', { class: 'fila sep', style: 'margin-top:8px' }, gpsEl, selector),
      h('div', { class: 'mapa-caja' }, mapaEl),
      h('button', { type: 'button', class: 'primario marcar', onclick: marcar }, 'Marcar punto'),
      cercaEl,
      h('h2', null, 'Puntos'), listaEl,
      h('h2', null, 'Precintos'),
      campoPrecinto('laboratorio', 'Precinto de laboratorio', { autocapitalize: 'characters' }),
      campoPrecinto('cu', 'Precinto de Control Union', { autocapitalize: 'characters' }),
      campoPrecinto('contramuestra', 'Precinto de contramuestra (NA si no hay)', { autocapitalize: 'characters' }),
      h('label', { class: 'campo' }, 'Nota (opcional)', nota),
      h('div', { class: 'fila envuelve' }, boton('Cambiar cultivo', function () { cambiarCultivoUI(m, u); }), boton('Borrar muestra', function () {
        var np = m.puntos.length;
        confirmar('¿Borrar la Muestra ' + m.numero + ' ' + m.cultivo + '? Se pierden ' + np + (np === 1 ? ' punto' : ' puntos') + ' y los precintos escritos.', 'Borrar').then(function (si) {
          if (si) { N.borrarMuestra(visita, m); guardar().then(function () { ir('#/v/' + visita.id); }); }
        });
      }, 'peligro')),
      h('div', { class: 'barra' }, boton('Revisar antes de salir', function () { ir('#/v/' + visita.id + '/revisar'); }, 'primario'), boton('Volver', function () { ir('#/v/' + visita.id); })));

    // Mapa
    var mapa = mapaActual = L.map(mapaEl, { zoomControl: true, attributionControl: true, maxZoom: 19 }).setView([-3.26, -79.95], 5);
    L.control.scale({ metric: true, imperial: false }).addTo(mapa);
    cambiarCapa(capa);
    var capaPuntos = L.layerGroup().addTo(mapa), posMarker = null, posCirculo = null, centrado = false;

    function pintarMapa() {
      capaPuntos.clearLayers();
      var ps = N.ordenarPuntos(m), ll = [];
      ps.forEach(function (p, i) {
        ll.push([p.lat, p.lon]);
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: nodo('div', 'pin', String(p.n)), iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: false }).addTo(capaPuntos);
        if (i > 0) {
          var a = ps[i - 1];
          L.polyline([[a.lat, a.lon], [p.lat, p.lon]], { color: '#e8a317', weight: 3 }).addTo(capaPuntos);
          L.marker([(a.lat + p.lat) / 2, (a.lon + p.lon) / 2], { interactive: false, icon: L.divIcon({ className: 'dist-etiq', html: nodo('span', '', Math.round(N.distanciaM(a, p)) + ' m'), iconSize: null }) }).addTo(capaPuntos);
        }
      });
      return ll;
    }
    function encuadrar() {
      var ll = pintarMapa();
      if (ll.length) mapa.fitBounds(L.latLngBounds(ll).pad(0.4), { maxZoom: 18 });
      else if (gps.pos) mapa.setView([gps.pos.lat, gps.pos.lon], 17);
      else if (u.coord) mapa.setView([u.coord.lat, u.coord.lon], 15);
    }
    function pintarPosicion() {
      if (N.estadoGPS(gps.pos).nivel === 'viejo' || !gps.pos) {
        if (posMarker) { mapa.removeLayer(posMarker); mapa.removeLayer(posCirculo); posMarker = posCirculo = null; }
        return;
      }
      var ll = [gps.pos.lat, gps.pos.lon];
      if (!posMarker) {
        posCirculo = L.circle(ll, { radius: gps.pos.precision, color: '#1a73e8', weight: 1, fillOpacity: 0.12 }).addTo(mapa);
        posMarker = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(mapa);
      } else { posCirculo.setLatLng(ll).setRadius(gps.pos.precision); posMarker.setLatLng(ll); }
      if (!centrado && !m.puntos.length) { centrado = true; mapa.setView(ll, 17); }
    }
    gps.oyentes.push(pintarPosicion);
    encuadrar(); pintarPosicion();

    function pintarLista() {
      var ps = N.ordenarPuntos(m);
      pon(listaEl, ps.length ? h('div', { class: 'tarjeta' }, ps.map(function (p, i) {
        var prev = i > 0 ? ps[i - 1] : null, cerca = N.puntoCercano({ puntos: ps.filter(function (q) { return q !== p; }) }, p);
        return h('div', { class: 'punto' },
          h('div', { class: 'fila sep' }, h('strong', null, 'Punto ' + p.n + ' · ' + N.horaHM(p.hora)), h('span', { class: p.precision > N.UMBRAL_PRECISION_M ? 'amb' : 'suave' }, '±' + Math.round(p.precision) + ' m')),
          h('div', { class: 'coord' }, N.decimal(p.lat) + ', ' + N.decimal(p.lon)),
          h('div', { class: 'coord suave' }, N.gmsPar(p.lat, p.lon)),
          prev ? h('div', { class: 'suave chico' }, N.distanciaM(prev, p).toFixed(0) + ' m desde el punto ' + prev.n) : null,
          cerca ? h('div', { class: 'alerta' }, '⚠ A ' + Math.round(cerca.dist) + ' m del punto ' + cerca.n + ' (menos de ' + N.UMBRAL_CERCA_M + ' m)') : null,
          h('div', { class: 'fila envuelve', style: 'margin-top:6px' },
            boton('Volver a marcar', function () { marcar(p); }),
            boton('Borrar', function () { confirmar('¿Borrar el punto ' + p.n + '?', 'Borrar').then(function (si) { if (si) { m.puntos = m.puntos.filter(function (q) { return q !== p; }); pon(cercaEl); guardar().then(function () { pintarLista(); encuadrar(); }); } }); }, 'peligro')));
      })) : h('p', { class: 'suave' }, 'Sin puntos todavía. Camina hasta el primer sitio y toca «Marcar punto».'));
    }

    function marcar(reemplazar) {
      var previo = reemplazar && reemplazar.n ? reemplazar : null;
      var est = N.estadoGPS(gps.pos);
      if (est.nivel === 'nada') { aviso(gps.error || 'Esperando señal de GPS…'); return; }
      var pasos = Promise.resolve(true);
      if (est.nivel === 'viejo') pasos = confirmar('La última lectura del GPS es de hace ' + est.edadS + ' s. ¿Marcar con esa posición?', 'Marcar igual');
      pasos.then(function (si) {
        if (!si) return false;
        var p0 = gps.pos; // la lectura pudo cambiar mientras se confirmaba
        if (!p0) return false;
        if (p0.precision > N.UMBRAL_PRECISION_M) return confirmar('La precisión es ±' + Math.ceil(p0.precision) + ' m. ¿Marcar igual?', 'Marcar igual');
        return true;
      }).then(function (si) {
        var pos = gps.pos;
        if (!si || !pos) return;
        var antes = m.puntos.slice();
        var otros = { puntos: m.puntos.filter(function (q) { return q !== previo; }) };
        var cerca = N.puntoCercano(otros, pos);
        // Precisión cruda redondeada hacia arriba: coincide con la que se confirmó y con «Revisar».
        var nuevo = { n: previo ? previo.n : N.numeroPunto(m), lat: pos.lat, lon: pos.lon, alt: pos.alt == null ? null : Math.round(pos.alt), precision: Math.ceil(pos.precision), hora: new Date(pos.t).toISOString() };
        if (previo) m.puntos[m.puntos.indexOf(previo)] = nuevo; else m.puntos.push(nuevo);
        guardar().then(function (ok) {
          if (!ok) { m.puntos = antes; pintarLista(); encuadrar(); return; } // no se muestra como marcado lo que no se guardó
          pon(cercaEl, cerca ? h('div', { class: 'alerta' }, '⚠ El punto ' + nuevo.n + ' quedó a ' + Math.round(cerca.dist) + ' m del punto ' + cerca.n + '. Muévete más lejos o vuelve a marcarlo.') : null);
          pintarLista(); encuadrar(); aviso('Punto ' + nuevo.n + ' marcado (±' + nuevo.precision + ' m)');
        });
      });
    }
    pintarLista();
  }

  // ---------- 4. Revisar antes de salir ----------
  function pantallaRevisar() {
    var r = N.revisar(visita);
    function linea(x) {
      var va = x.muestraId ? '#/v/' + visita.id + '/m/' + x.muestraId : '#/v/' + visita.id;
      return h('button', { class: 'linea-rev', onclick: function () { ir(va); } },
        h('span', { class: 'insignia ' + (x.nivel === 'error' ? 'error' : 'aviso') }, x.nivel === 'error' ? 'Error' : 'Aviso'),
        h('span', { class: 'crece' }, x.texto), '›');
    }
    appEl.classList.add('con-barra');
    pon(appEl, 
      h('button', { class: 'atras', onclick: function () { ir('#/v/' + visita.id); } }, '‹ Visita'),
      h('h1', null, 'Revisar antes de salir'),
      r.sinMuestras ? h('div', { class: 'tarjeta' }, h('strong', { class: 'mal' }, 'No hay ninguna muestra en esta visita.'), ' Agrega una con «+ Muestra» en la unidad.') : null,
      !r.sinMuestras && !r.errores.length && !r.avisos.length ? h('div', { class: 'tarjeta' }, h('strong', { class: 'ok' }, '✓ Todo en orden.'), ' No hay nada que corregir.') : null,
      r.errores.length ? [h('h2', { class: 'mal' }, 'Errores (' + r.errores.length + ')'), r.errores.map(linea)] : (r.sinMuestras ? null : h('p', { class: 'ok' }, '✓ Sin errores')),
      r.avisos.length ? [h('h2', { class: 'amb' }, 'Avisos (' + r.avisos.length + ')'), r.avisos.map(linea)] : null,
      h('div', { class: 'barra' }, boton('Exportar', pantallaExportar, 'primario'), boton('Volver', function () { ir('#/v/' + visita.id); })));
  }

  // ---------- 5. Mapa sin señal ----------
  function pantallaMapaOffline() {
    var coords = visita.unidades.filter(function (u) { return u.coord; }).map(function (u) { return u.coord; });
    var estado = h('div'), resumen = h('div'), barra = h('progress', { class: 'progreso', max: 1, value: 0, hidden: true }), msg = h('p', { class: 'suave' });
    var capasSel = {}, abortar = null;
    var cajas = Object.keys(CAPAS).map(function (k) {
      capasSel[k] = true;
      var cb = h('input', { type: 'checkbox', checked: true, onchange: function () { capasSel[k] = cb.checked; calcular(); } });
      return h('label', { class: 'fila', style: 'min-height:44px' }, cb, CAPAS[k].nombre + (k === 'satelite' ? ' (Esri World Imagery)' : ' (Esri World Street Map)'));
    });
    var plan = null, boton1 = boton('Descargar', descargar, 'primario'), cancelar = boton('Cancelar', function () { if (abortar) abortar(); }, '', { hidden: true });

    function calcular() {
      var activas = Object.keys(CAPAS).filter(function (k) { return capasSel[k]; });
      var caja = N.cajaZona(coords, 500, gps.pos, 1000);
      if (!caja) { plan = null; resumen.textContent = 'Sin coordenadas en la Lista y sin GPS todavía: espera a que el teléfono encuentre tu posición.'; boton1.disabled = true; return; }
      var zMax = 18, lista = N.listarTeselas(caja, 13, zMax);
      while (lista.length * Math.max(1, activas.length) > 3000 && zMax > 13) { zMax--; lista = N.listarTeselas(caja, 13, zMax); }
      var corta = lista.length * Math.max(1, activas.length) > 3000;
      if (corta) lista = lista.slice(0, Math.floor(3000 / Math.max(1, activas.length)));
      plan = { activas: activas, teselas: lista, zMax: zMax };
      var total = lista.length * activas.length;
      pon(resumen, 
        h('p', null, h('strong', null, total + ' teselas'), ' · unos ' + Math.max(0.1, total * 0.02).toFixed(1) + ' MB · zoom 13–' + zMax),
        h('p', { class: 'suave chico' }, (coords.length ? 'Zona: alrededor de las coordenadas de la Lista (margen de 500 m).' : 'Zona: 1 km alrededor de tu posición actual.') +
          (zMax < 18 ? ' Se limitó el zoom para no pasar de 3000 teselas.' : '') + (corta ? ' Aun así se recortó la zona.' : '')));
      boton1.disabled = !activas.length || !total;
    }

    function bajar(capa, t, señal) {
      var k = claveTesela(capa, t.z, t.x, t.y), url = urlTesela(capa, t.z, t.x, t.y);
      return Teselas.hay(k).then(function (hay) {
        if (hay) return;
        function intento(n) {
          return fetch(url, { signal: señal }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
            .then(function (b) {
              if (!b.size) throw new Error('vacía');
              return esSinDatos(b, capa, t.z).then(function (sin) { if (sin) return 'sin'; return Teselas.guardar(k, b).then(function () { return 'ok'; }); });
            })
            .catch(function (e) {
              if (señal.aborted) throw e;
              if (n >= 3) throw e;
              return new Promise(function (r) { setTimeout(r, 500 * n); }).then(function () { return intento(n + 1); });
            });
        }
        return intento(1);
      });
    }
    function descargar() {
      if (!plan) return;
      if (!navigator.onLine) { aviso('Sin conexión: descarga el mapa donde haya señal'); return; }
      var trabajos = [];
      plan.activas.forEach(function (c) { plan.teselas.forEach(function (t) { trabajos.push([c, t]); }); });
      var hechas = 0, fallidas = 0, sinImagen = 0, ctl = new AbortController(), cancelado = false, i = 0;
      abortar = function () { cancelado = true; ctl.abort(); };
      boton1.disabled = true; cancelar.hidden = false; barra.hidden = false; barra.value = 0;
      function trabajador() {
        if (cancelado || i >= trabajos.length) return Promise.resolve();
        var j = trabajos[i++];
        return bajar(j[0], j[1], ctl.signal).then(function (r) { if (r === 'sin') sinImagen++; }, function () { if (!cancelado) fallidas++; }).then(function () {
          hechas++; barra.value = hechas / trabajos.length; msg.textContent = hechas + ' de ' + trabajos.length + (fallidas ? ' · ' + fallidas + ' fallidas' : '') + (sinImagen ? ' · ' + sinImagen + ' sin imagen' : '');
          return trabajador();
        });
      }
      Promise.all([1, 2, 3, 4, 5, 6].map(trabajador)).then(function () {
        cancelar.hidden = true; boton1.disabled = false; abortar = null;
        msg.textContent = cancelado ? 'Descarga cancelada (' + hechas + ' teselas revisadas; lo guardado se queda).'
          : (fallidas ? 'Terminó con ' + fallidas + ' teselas fallidas. Vuelve a pulsar «Descargar» para reintentar solo las que faltan.' : '✓ Mapa guardado para usar sin señal.') +
            (sinImagen ? ' ' + sinImagen + ' teselas sin imagen en Esri (no se guardaron; ahí se verá el fondo neutro).' : '');
      });
    }

    pon(appEl, 
      h('button', { class: 'atras', onclick: function () { if (abortar) abortar(); ir('#/v/' + visita.id); } }, '‹ Visita'),
      h('h1', null, 'Mapa sin señal'),
      h('p', { class: 'suave' }, 'Baja el mapa de la zona ahora, con señal, para verlo en campo sin ella.'),
      h('div', { class: 'tarjeta' }, h('strong', null, 'Capas a descargar'), cajas),
      resumen, barra, msg,
      h('div', { class: 'fila' }, boton1, cancelar),
      h('p', { class: 'suave chico' }, CAPAS.satelite.atribucion + ' · ' + CAPAS.mapa.atribucion));
    gps.oyentes.push(function () { if (!coords.length && !plan) calcular(); });
    calcular();
  }

  // ---------- 6. Exportar ----------
  function descargarBlob(blob, nombre) {
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function marcarExportado() { visita.ultimoExportar = new Date().toISOString(); return guardar(); }
  function compartirArchivo(texto, nombre, tipo) {
    var blob = new Blob([texto], { type: tipo });
    var f = typeof File === 'function' ? new File([blob], nombre, { type: tipo }) : null;
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      return navigator.share({ files: [f], title: nombre }).then(marcarExportado, function (e) { if (e && e.name !== 'AbortError') { descargarBlob(blob, nombre); marcarExportado(); } });
    }
    descargarBlob(blob, nombre); marcarExportado(); return Promise.resolve();
  }
  function pantallaExportar() {
    var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Exportar'),
      h('p', { class: 'suave' }, 'El archivo JSON es la copia completa de la visita; el resumen sirve para Notas o WhatsApp. Exporta al terminar cada finca.'),
      boton('Archivo JSON', function () { compartirArchivo(N.aJSON(visita), N.nombreArchivo(visita, 'json'), 'application/json'); }, 'primario', { style: 'width:100%;margin:6px 0' }),
      boton('CSV de puntos', function () { compartirArchivo(N.csvPuntos(visita), N.nombreArchivo(visita, 'csv'), 'text/csv'); }, '', { style: 'width:100%;margin:6px 0' }),
      boton('Resumen en texto', function () { cerrar(); resumenTexto(); }, '', { style: 'width:100%;margin:6px 0' }),
      boton('Cerrar', function () { cerrar(); }, '', { style: 'width:100%;margin:6px 0' })]);
  }
  function resumenTexto() {
    var t = N.resumenTexto(visita);
    var cerrar = modal([h('h2', { style: 'margin-top:0' }, 'Resumen'), h('pre', null, t), h('div', { class: 'acciones' },
      boton('Copiar', function () { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { marcarExportado(); aviso('Copiado'); }, function () { aviso('No se pudo copiar'); }); }),
      boton(navigator.share ? 'Compartir' : 'Descargar .txt', function () {
        if (navigator.share) navigator.share({ text: t }).then(marcarExportado, function () {});
        else { descargarBlob(new Blob([t], { type: 'text/plain' }), N.nombreArchivo(visita, 'txt')); marcarExportado(); }
      }, 'primario'), boton('Cerrar', function () { cerrar(); }))]);
  }

  // ---------- Arranque ----------
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); // el resultado se lee con persisted()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  render();
})();
