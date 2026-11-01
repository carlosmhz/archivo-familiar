// ─── COMENTARIOS Y "ME GUSTA" ─────────────────────────────────────────────────
// Panel debajo del vídeo (#player-comentarios). Solo para vídeos caseros, no en la tele.
// Bajo el vídeo hay dos pestañas (#player-pestanas): "Escenas" (por defecto, si el vídeo
// tiene escenas) y "Comentarios", más el botón de "me gusta". La vista se marca con la
// clase vista-escenas / vista-comentarios en .player-box (ver css/comentarios.css).
// Cada dispositivo tiene un identificador aleatorio y un nombre que se pide una vez
// (localStorage + cookie, como la sesión, por el WebView de la app Android).
// Lo llama player.js: comentariosAbrir(url) al abrir y comentariosCerrar() al cerrar.

const COM_MAX = 1000;
let _com = { caseroId: null, datos: null, todos: false, cargando: 0 };
let _comVista = 'escenas';

// ── Dispositivo ──────────────────────────────────────────────────────────────
function comLeerDispositivo() {
  let raw = null, d = null;
  try { raw = localStorage.getItem('af_dispositivo'); } catch (e) {}
  if (!raw) { try { raw = leerCookie('af_dispositivo'); } catch (e) {} }
  try { d = JSON.parse(raw || 'null'); } catch (e) {}
  if (!d || !/^[a-f0-9]{32}$/.test(d.id || '')) {
    const b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    d = { id: Array.from(b, x => x.toString(16).padStart(2, '0')).join(''), nombre: '' };
    comGuardarDispositivo(d);
  }
  return d;
}
function comGuardarDispositivo(d) {
  const v = JSON.stringify({ id: d.id, nombre: d.nombre || '' });
  try { localStorage.setItem('af_dispositivo', v); } catch (e) {}
  try {
    document.cookie = 'af_dispositivo=' + encodeURIComponent(v) + '; max-age=' + (2 * 365 * 86400) + '; path=' + rutaCookie() +
      '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {}
}
const COM_DISP = comLeerDispositivo();

// ── Utilidades ───────────────────────────────────────────────────────────────
function comEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function comHace(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return 'ahora';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
  if (s < 172800) return 'ayer';
  const f = new Date(ts * 1000), hoy = new Date();
  const o = { day: 'numeric', month: 'short' };
  if (f.getFullYear() !== hoy.getFullYear()) o.year = 'numeric';
  return f.toLocaleDateString('es-ES', o);
}
function comTiempo(t) {
  t = Math.max(0, t | 0);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
async function comApi(action, query, body) {
  const url = `${API}?action=${action}&token=${encodeURIComponent(TOKEN)}` + (query || '');
  try {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return await r.json();
  } catch (e) { return { ok: false, msg: 'Sin conexión' }; }
}
function comMsg(m) {
  if (/caducada/i.test(m || '')) return 'Tu sesión ha caducado. Vuelve a entrar.';
  if (/demasiados/i.test(m || '')) return 'Demasiados comentarios seguidos. Espera un poco.';
  if (/vacio|largo/i.test(m || '')) return 'El comentario está vacío o es demasiado largo.';
  if (/nombre/i.test(m || '')) return 'Escribe un nombre (máximo 40 letras).';
  return 'No se pudo completar (' + (m || 'error') + ').';
}

// Vídeo casero que está en el reproductor (o null si es una actuación)
function comCaseroDeUrl(url) {
  if (typeof CASEROS === 'undefined') return null;
  if (_escenaActiva) return CASEROS.find(x => x.id === _escenaActiva.caseroId) || null;
  return CASEROS.find(x => x.youtube && x.youtube === url)
    || (window._compartirData ? window._compartirData.casero : null);
}
function comEscenaActual() {
  if (!_escenaActiva) return null;
  const c = CASEROS.find(x => x.id === _escenaActiva.caseroId);
  const e = c && c.escenas ? c.escenas[_escenaActiva.escenaIdx] : null;
  return e ? { idx: _escenaActiva.escenaIdx, titulo: e.titulo } : null;
}

// ── Abrir / cerrar ───────────────────────────────────────────────────────────
function comentariosAbrir(url) {
  const box = document.getElementById('player-comentarios');
  if (!box) return;
  const c = document.body.classList.contains('modo-tv') ? null : comCaseroDeUrl(url);
  if (!c) { comentariosCerrar(); return; }
  box.classList.add('visible');
  const hayEscenas = document.getElementById('player-escenas').classList.contains('visible');
  if (_com.caseroId === c.id && _com.datos) {          // otra escena del mismo vídeo: se queda la pestaña
    comPestanas(hayEscenas);
    comVista(hayEscenas ? _comVista : 'comentarios');
    comPintarEscena(); return;
  }
  _com = { caseroId: c.id, datos: null, todos: false, cargando: 0 };
  box.innerHTML = comEsqueleto();
  comPestanas(hayEscenas);
  comVista(hayEscenas ? 'escenas' : 'comentarios');    // Escenas, por defecto
  comPintarEscena();
  comCargar();
}
function comentariosCerrar() {
  const box = document.getElementById('player-comentarios');
  if (box) { box.classList.remove('visible'); box.innerHTML = ''; }
  const bar = document.getElementById('player-pestanas');
  if (bar) { bar.classList.remove('visible'); bar.innerHTML = ''; }
  const pb = document.querySelector('.player-box');
  if (pb) pb.classList.remove('vista-escenas', 'vista-comentarios');
  _com = { caseroId: null, datos: null, todos: false, cargando: 0 };
}

// Pestañas Escenas / Comentarios y botón de "me gusta"
function comPestanas(hayEscenas) {
  const bar = document.getElementById('player-pestanas');
  if (!bar) return;
  const nEsc = document.querySelectorAll('#player-escenas .pe-item').length;
  const nCom = _com.datos ? _com.datos.comentarios.length : '';
  bar.innerHTML = `
    <div class="pp-tabs" role="tablist">
      ${hayEscenas ? `<button type="button" role="tab" class="pp-tab" data-v="escenas" onclick="comVista('escenas')">Escenas <span class="pp-n">${nEsc}</span></button>` : ''}
      <button type="button" role="tab" class="pp-tab" data-v="comentarios" onclick="comVista('comentarios')">Comentarios <span class="pp-n pp-n-com">${nCom}</span></button>
    </div>
    <button class="pc-like" type="button" onclick="comMeGusta()" aria-pressed="false" aria-label="Me gusta">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>
      <span class="pc-like-n">${_com.datos ? _com.datos.megusta.total : 0}</span>
    </button>`;
  bar.classList.add('visible');
  if (_com.datos) comPintarMeGusta();
}
function comVista(v) {
  const pb = document.querySelector('.player-box');
  if (!pb) return;
  if (v === 'escenas' && !document.querySelector('#player-pestanas .pp-tab[data-v="escenas"]')) v = 'comentarios';
  if (document.querySelector('#player-pestanas .pp-tab[data-v="escenas"]')) _comVista = v;
  pb.classList.toggle('vista-escenas', v === 'escenas');
  pb.classList.toggle('vista-comentarios', v === 'comentarios');
  document.querySelectorAll('#player-pestanas .pp-tab').forEach(t => {
    const sel = t.dataset.v === v;
    t.classList.toggle('activa', sel);
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
}

async function comCargar() {
  const id = _com.caseroId, n = ++_com.cargando;
  const d = await comApi('comentarios-listar', `&caseroId=${id}&dispositivo=${COM_DISP.id}`);
  if (id !== _com.caseroId || n !== _com.cargando) return;
  const box = document.getElementById('player-comentarios');
  if (!d.ok) {
    if (/no disponibles/i.test(d.msg || '')) { comentariosCerrar(); return; }
    box.querySelector('.pc-lista').innerHTML = `<li class="pc-vacio">${comEsc(comMsg(d.msg))}</li>`;
    return;
  }
  _com.datos = d.data;
  // El servidor manda: si este dispositivo ya tenía nombre allí, se usa ese
  if (d.data.nombre && d.data.nombre !== COM_DISP.nombre) { COM_DISP.nombre = d.data.nombre; comGuardarDispositivo(COM_DISP); }
  comPintar();
}

// ── Pintar ───────────────────────────────────────────────────────────────────
function comEsqueleto() {
  return `
    <p class="pc-quien-like"></p>
    <div class="pc-zona-form"></div>
    <ul class="pc-lista"><li class="pc-vacio">Cargando…</li></ul>
    <button class="pc-mas" type="button" onclick="comVerTodos()" hidden></button>`;
}

function comPintar() {
  const box = document.getElementById('player-comentarios');
  if (!box || !_com.datos) return;
  comPintarMeGusta();
  comPintarForm();
  comPintarLista();
}

function comPintarMeGusta() {
  const m = _com.datos.megusta;
  const btn = document.querySelector('#player-pestanas .pc-like');
  if (btn) {
    btn.classList.toggle('activo', !!m.mio);
    btn.setAttribute('aria-pressed', m.mio ? 'true' : 'false');
    btn.querySelector('.pc-like-n').textContent = m.total;
  }
  let quien = '';
  if (m.total > 0) {
    const n = m.nombres.slice(0, 3);
    const resto = m.total - n.length;
    quien = 'A ' + (resto > 0 ? n.join(', ') + ' y ' + resto + (resto === 1 ? ' persona más' : ' personas más')
      : n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0]) + (m.total === 1 ? ' le gusta' : ' les gusta');
  }
  const q = document.querySelector('#player-comentarios .pc-quien-like');
  if (q) { q.textContent = quien; q.hidden = !quien; }
  if (btn) btn.title = quien || 'Me gusta';
}

function comPintarForm(editarNombre) {
  const zona = document.querySelector('#player-comentarios .pc-zona-form');
  if (!zona) return;
  if (!COM_DISP.nombre || editarNombre) {
    zona.innerHTML = `
      <form class="pc-nombre" onsubmit="comGuardarNombre(event)">
        <label for="pc-nombre-in">${COM_DISP.nombre ? 'Cambia tu nombre' : '¿Cómo te llamas? Así sabremos quién comenta.'}</label>
        <div class="pc-fila">
          <input id="pc-nombre-in" maxlength="40" autocomplete="name" placeholder="Tu nombre" value="${comEsc(COM_DISP.nombre)}">
          <button type="submit" class="pc-btn">Guardar</button>
          ${COM_DISP.nombre ? '<button type="button" class="pc-btn ghost" onclick="comPintarForm()">Cancelar</button>' : ''}
        </div>
        <p class="pc-aviso">Se guarda en este dispositivo.</p>
      </form>`;
    if (editarNombre) zona.querySelector('input').focus();
    return;
  }
  const borrador = (zona.querySelector('textarea') || {}).value || '';
  zona.innerHTML = `
    <form class="pc-form" onsubmit="comPublicar(event)">
      <textarea id="pc-texto" rows="2" maxlength="${COM_MAX}" placeholder="Escribe un comentario…" oninput="comAjustar(this)">${comEsc(borrador)}</textarea>
      <div class="pc-fila">
        <span class="pc-escena-chip" hidden></span>
        <span class="pc-como">Como <b>${comEsc(COM_DISP.nombre)}</b> · <button type="button" onclick="comPintarForm(true)">cambiar</button></span>
        <button type="submit" class="pc-btn">Publicar</button>
      </div>
    </form>`;
  comPintarEscena();
}

function comPintarEscena() {
  const chip = document.querySelector('#player-comentarios .pc-escena-chip');
  if (!chip) return;
  const e = comEscenaActual();
  chip.hidden = !e;
  chip.textContent = e ? 'Sobre la escena «' + e.titulo + '»' : '';
}

function comPintarLista() {
  const box = document.getElementById('player-comentarios');
  const lista = _com.datos.comentarios;
  const n = document.querySelector('#player-pestanas .pp-n-com');
  if (n) n.textContent = lista.length;
  const ver = _com.todos ? lista : lista.slice(0, 3);
  box.querySelector('.pc-lista').innerHTML = ver.length ? ver.map(c => `
    <li class="pc-item${c.mio ? ' mio' : ''}">
      <div class="pc-meta"><b>${comEsc(c.nombre)}</b><span>${comHace(c.creado)}</span>
        ${c.mio ? `<button type="button" class="pc-borrar" onclick="comBorrar(${c.id})" aria-label="Borrar mi comentario">Borrar</button>` : ''}</div>
      ${c.escena ? `<button type="button" class="pc-escena" onclick="comIrA(${c.escena.t})">Escena «${comEsc(c.escena.titulo)}» · ${comTiempo(c.escena.t)}</button>` : ''}
      <p class="pc-texto">${comEsc(c.texto)}</p>
    </li>`).join('') : '<li class="pc-vacio">Aún no hay comentarios. ¡Sé el primero!</li>';
  const mas = box.querySelector('.pc-mas');
  mas.hidden = _com.todos || lista.length <= 3;
  mas.textContent = 'Ver los ' + lista.length + ' comentarios';
}

// ── Acciones ─────────────────────────────────────────────────────────────────
function comAjustar(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
function comVerTodos() { _com.todos = true; comPintarLista(); }

function comIrA(t) {
  const v = document.getElementById('player-video');
  if (!v || v.style.display === 'none') return;
  if (_escenaActiva && _escenaActiva.compartido && t < _escenaActiva.inicioT) t = _escenaActiva.inicioT;
  v.currentTime = t;
  v.play().catch(() => {});
  document.getElementById('player-embed').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function comGuardarNombre(ev) {
  ev.preventDefault();
  const inp = document.getElementById('pc-nombre-in');
  const nombre = inp.value.trim();
  if (!nombre) { inp.focus(); return; }
  const d = await comApi('comentarios-nombre', '', { dispositivo: COM_DISP.id, nombre });
  if (!d.ok) { avisar(comMsg(d.msg)); return; }
  COM_DISP.nombre = d.data.nombre;
  comGuardarDispositivo(COM_DISP);
  comCargar();          // los comentarios propios ya salen con el nombre nuevo
  comPintarForm();
}

function comPedirNombre() {
  comVista('comentarios');
  comPintarForm(true);
  const z = document.querySelector('#player-comentarios .pc-zona-form');
  if (z) z.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function comMeGusta() {
  if (!_com.datos) return;
  if (!COM_DISP.nombre) { comPedirNombre(); return; }
  const m = _com.datos.megusta;          // respuesta inmediata en pantalla
  m.mio = !m.mio; m.total += m.mio ? 1 : -1;
  comPintarMeGusta();
  const id = _com.caseroId;
  const d = await comApi('comentarios-megusta', '', { dispositivo: COM_DISP.id, caseroId: id });
  if (id !== _com.caseroId) return;
  if (d.ok) _com.datos.megusta = d.data;
  else { m.mio = !m.mio; m.total += m.mio ? 1 : -1; if (/nombre/i.test(d.msg || '')) comPedirNombre(); else avisar(comMsg(d.msg)); }
  comPintarMeGusta();
}

async function comPublicar(ev) {
  ev.preventDefault();
  const ta = document.getElementById('pc-texto');
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const e = comEscenaActual();
  const id = _com.caseroId;
  const d = await comApi('comentarios-anadir', '', { dispositivo: COM_DISP.id, caseroId: id, texto, escenaIdx: e ? e.idx : null });
  btn.disabled = false;
  if (id !== _com.caseroId) return;
  if (!d.ok) {
    if (/falta el nombre/i.test(d.msg || '')) { COM_DISP.nombre = ''; comGuardarDispositivo(COM_DISP); comPedirNombre(); return; }
    avisar(comMsg(d.msg)); return;
  }
  ta.value = ''; ta.style.height = '';
  _com.datos.comentarios.unshift(d.data);
  comPintarLista();
}

async function comBorrar(idCom) {
  if (!await confirmar('Se borrará para todos los que ven este vídeo.', { titulo: '¿Borrar tu comentario?', aceptar: 'Borrar', peligro: true })) return;
  const d = await comApi('comentarios-borrar', '', { dispositivo: COM_DISP.id, id: idCom });
  if (!d.ok) { avisar(comMsg(d.msg)); return; }
  _com.datos.comentarios = _com.datos.comentarios.filter(c => c.id !== idCom);
  comPintarLista();
}
