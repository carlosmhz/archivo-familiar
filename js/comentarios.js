// ─── COMENTARIOS Y "ME GUSTA" ─────────────────────────────────────────────────
// Panel debajo del vídeo (#player-comentarios). Solo para vídeos caseros, no en la tele.
// Bajo el vídeo hay dos pestañas (#player-pestanas): "Escenas" (por defecto, si el vídeo
// tiene escenas) y "Comentarios", más el botón de "me gusta". La vista se marca con la
// clase vista-escenas / vista-comentarios en .player-box (ver css/comentarios.css).
// Cada dispositivo tiene un identificador aleatorio y un nombre que se pide una vez
// (localStorage + cookie, como la sesión, por el WebView de la app Android).
// Lo llama player.js: comentariosAbrir(url) al abrir y comentariosCerrar() al cerrar.

const COM_MAX = 1000;
// Reacciones a un comentario: la misma lista que COM_REACCIONES en lib/comentarios.php
const COM_REACS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const COM_RESP_VISIBLES = 2;   // respuestas que se ven antes de "Ver N respuestas más"
function comNuevoEstado(caseroId) {
  // resp: respuesta en curso { raiz, a: id al que se responde, texto }; abiertos: hilos desplegados
  return { caseroId, datos: null, todos: false, cargando: 0, resp: null, abiertos: new Set() };
}
let _com = comNuevoEstado(null);
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
  if (/ya no existe/i.test(m || '')) return 'El comentario al que respondes ya no existe.';
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
// Quien entra con un PIN que le deja ver solo una escena no ve la marca de escena (ni en el
// formulario ni en los comentarios) y sus comentarios no la llevan: no tiene sentido para él.
// La marca queda para quien ve el vídeo entero (familia, PIN de vídeo completo).
function comEscenaOculta() { return !!(_escenaActiva && _escenaActiva.compartido); }
function comEscenaActual() {
  if (!_escenaActiva || comEscenaOculta()) return null;
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
    comPintarEscena();
    comPintarLista();   // en una selección, el fragmento nuevo puede ser escena o vídeo completo
    return;
  }
  _com = comNuevoEstado(c.id);
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
  _com = comNuevoEstado(null);
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
  // Lo que se está escribiendo en una respuesta no se pierde al repintar
  const ta = box.querySelector('.pc-resp-form textarea');
  if (ta && _com.resp) _com.resp.texto = ta.value;
  const principales = lista.filter(c => !c.padre);
  const ver = _com.todos ? principales : principales.slice(0, 3);
  box.querySelector('.pc-lista').innerHTML = ver.length ? ver.map(comItem).join('')
    : '<li class="pc-vacio">Aún no hay comentarios. ¡Sé el primero!</li>';
  const mas = box.querySelector('.pc-mas');
  mas.hidden = _com.todos || principales.length <= 3;
  mas.textContent = 'Ver los ' + principales.length + ' comentarios';
  const nuevo = box.querySelector('.pc-resp-form textarea');
  if (nuevo) comAjustar(nuevo);
}

// Un comentario principal con sus reacciones, sus respuestas y, si toca, el formulario de respuesta
function comItem(c) {
  const resps = _com.datos.comentarios.filter(r => r.padre === c.id);
  const abierto = _com.abiertos.has(c.id) || resps.length <= COM_RESP_VISIBLES + 1;
  const verResps = abierto ? resps : resps.slice(0, COM_RESP_VISIBLES);
  const r = _com.resp && _com.resp.raiz === c.id ? _com.resp : null;
  return `
    <li class="pc-item${c.mio ? ' mio' : ''}" data-id="${c.id}">
      ${comCuerpo(c, c.id)}
      ${resps.length || r ? `<ul class="pc-respuestas">
        ${verResps.map(x => `<li class="pc-item pc-resp${x.mio ? ' mio' : ''}" data-id="${x.id}">${comCuerpo(x, c.id)}</li>`).join('')}
        ${abierto ? '' : `<li><button type="button" class="pc-ver-resp" onclick="comAbrirHilo(${c.id})">Ver ${resps.length - COM_RESP_VISIBLES} respuestas más</button></li>`}
      </ul>` : ''}
      ${r ? comFormRespuesta(r) : ''}
    </li>`;
}

function comCuerpo(c, raiz) {
  return `
    <div class="pc-meta"><b>${comEsc(c.nombre)}</b><span>${comHace(c.creado)}</span>
      ${c.mio ? `<button type="button" class="pc-borrar" onclick="comBorrar(${c.id})" aria-label="Borrar mi comentario">Borrar</button>` : ''}</div>
    ${c.escena && !comEscenaOculta() ? `<button type="button" class="pc-escena" onclick="comIrA(${c.escena.t})">Escena «${comEsc(c.escena.titulo)}» · ${comTiempo(c.escena.t)}</button>` : ''}
    <p class="pc-texto">${comEsc(c.texto)}</p>
    <div class="pc-acciones">
      ${(c.reacciones || []).map(x => {
        const i = COM_REACS.indexOf(x.emoji);
        return i < 0 ? '' : `<button type="button" class="pc-reac${x.mio ? ' mio' : ''}" onclick="comReaccionar(${c.id}, ${i})"
          title="${comEsc(comQuienReac(x))}" aria-pressed="${x.mio ? 'true' : 'false'}"><span class="pc-reac-e">${x.emoji}</span><span class="pc-reac-n">${x.n}</span></button>`;
      }).join('')}
      <span class="pc-reac-caja">
        <button type="button" class="pc-reac-add" onclick="comSelector(event, ${c.id})" aria-label="Reaccionar" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="12" r="8"/><path d="M8 14.2c.8 1.1 1.8 1.7 3 1.7s2.2-.6 3-1.7"/><circle cx="8.4" cy="10" r=".6"/><circle cx="13.6" cy="10" r=".6"/><path d="M20 3v5M17.5 5.5h5"/></svg>
        </button>
      </span>
      <button type="button" class="pc-responder" onclick="comResponder(${raiz}, ${c.id})">Responder</button>
    </div>`;
}

function comQuienReac(x) {
  const n = x.nombres.slice(0, 3), resto = x.n - n.length;
  return x.emoji + ' ' + (resto > 0 ? n.join(', ') + ' y ' + resto + ' más'
    : n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n[0] || '');
}

function comFormRespuesta(r) {
  const a = _com.datos.comentarios.find(x => x.id === r.a);
  return `
    <form class="pc-resp-form" onsubmit="comPublicarRespuesta(event)">
      <p class="pc-resp-a">Respondiendo a <b>${comEsc(a ? a.nombre : '')}</b></p>
      <textarea rows="1" maxlength="${COM_MAX}" placeholder="Escribe tu respuesta…" oninput="comAjustar(this)">${comEsc(r.texto || '')}</textarea>
      <div class="pc-fila">
        <button type="button" class="pc-btn ghost" onclick="comCancelarRespuesta()">Cancelar</button>
        <button type="submit" class="pc-btn">Responder</button>
      </div>
    </form>`;
}

// ── Acciones ─────────────────────────────────────────────────────────────────
function comAjustar(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
function comVerTodos() { _com.todos = true; comPintarLista(); }
function comAbrirHilo(id) { _com.abiertos.add(id); comPintarLista(); }

// ── Reacciones ───────────────────────────────────────────────────────────────
function comCerrarSelector() {
  document.querySelectorAll('#player-comentarios .pc-selector').forEach(el => {
    const b = el.parentNode.querySelector('.pc-reac-add');
    if (b) b.setAttribute('aria-expanded', 'false');
    el.remove();
  });
}
function comSelector(ev, id) {
  ev.stopPropagation();
  const caja = ev.currentTarget.parentNode;
  const yaAbierto = caja.querySelector('.pc-selector');
  comCerrarSelector();
  if (yaAbierto) return;
  if (!COM_DISP.nombre) { comPedirNombre(); return; }
  const c = _com.datos.comentarios.find(x => x.id === id);
  const mia = c && (c.reacciones || []).find(x => x.mio);
  const sel = document.createElement('div');
  sel.className = 'pc-selector';
  sel.setAttribute('role', 'menu');
  sel.innerHTML = COM_REACS.map((e, i) => `<button type="button" role="menuitem" class="${mia && mia.emoji === e ? 'mio' : ''}"
    onclick="comCerrarSelector(); comReaccionar(${id}, ${i})" aria-label="Reaccionar con ${e}">${e}</button>`).join('');
  caja.appendChild(sel);
  ev.currentTarget.setAttribute('aria-expanded', 'true');
  // Si no cabe a la derecha (móvil estrecho), se abre hacia la izquierda
  const r = sel.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) sel.classList.add('izq');
}
document.addEventListener('click', ev => {
  if (!ev.target.closest || !ev.target.closest('.pc-selector')) comCerrarSelector();
});

// Pulsar el mismo emoji quita la reacción; otro la cambia (una por persona y comentario)
async function comReaccionar(id, i) {
  if (!_com.datos) return;
  if (!COM_DISP.nombre) { comPedirNombre(); return; }
  const emoji = COM_REACS[i];
  const c = _com.datos.comentarios.find(x => x.id === id);
  if (!c || !emoji) return;
  const antes = JSON.parse(JSON.stringify(c.reacciones || []));
  // Respuesta inmediata en pantalla
  let rs = antes.map(x => Object.assign({}, x, { nombres: x.nombres.slice() }));
  const mia = rs.find(x => x.mio);
  const quita = mia && mia.emoji === emoji;
  if (mia) { mia.n--; mia.mio = false; mia.nombres = mia.nombres.filter(n => n !== COM_DISP.nombre); }
  if (!quita) {
    let x = rs.find(y => y.emoji === emoji);
    if (!x) { x = { emoji, n: 0, mio: false, nombres: [] }; rs.push(x); }
    x.n++; x.mio = true; x.nombres.unshift(COM_DISP.nombre);
  }
  c.reacciones = rs.filter(x => x.n > 0).sort((a, b) => COM_REACS.indexOf(a.emoji) - COM_REACS.indexOf(b.emoji));
  comPintarLista();
  const caso = _com.caseroId;
  const d = await comApi('comentarios-reaccion', '', { dispositivo: COM_DISP.id, id, emoji });
  if (caso !== _com.caseroId) return;
  if (d.ok) c.reacciones = d.data;
  else {
    c.reacciones = antes;
    if (/falta el nombre/i.test(d.msg || '')) { COM_DISP.nombre = ''; comGuardarDispositivo(COM_DISP); comPedirNombre(); }
    else if (/no encontrado/i.test(d.msg || '')) { avisar('Ese comentario ya no existe.'); comCargar(); }
    else avisar(comMsg(d.msg));
  }
  comPintarLista();
}

// ── Respuestas ───────────────────────────────────────────────────────────────
function comResponder(raiz, a) {
  if (!COM_DISP.nombre) { comPedirNombre(); return; }
  const dest = _com.datos.comentarios.find(x => x.id === a);
  // A una respuesta se contesta en el mismo hilo, mencionando a quien la escribió
  const texto = a !== raiz && dest && !dest.mio ? '@' + dest.nombre + ' ' : '';
  _com.resp = { raiz, a, texto };
  _com.abiertos.add(raiz);
  comPintarLista();
  const ta = document.querySelector('#player-comentarios .pc-resp-form textarea');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.closest('form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
function comCancelarRespuesta() { _com.resp = null; comPintarLista(); }

async function comPublicarRespuesta(ev) {
  ev.preventDefault();
  const ta = ev.target.querySelector('textarea');
  const texto = ta.value.trim();
  if (!texto) { ta.focus(); return; }
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const id = _com.caseroId, r = _com.resp;
  const d = await comApi('comentarios-anadir', '', { dispositivo: COM_DISP.id, caseroId: id, texto, padreId: r.a });
  btn.disabled = false;
  if (id !== _com.caseroId) return;
  if (!d.ok) {
    if (/falta el nombre/i.test(d.msg || '')) { COM_DISP.nombre = ''; comGuardarDispositivo(COM_DISP); comPedirNombre(); return; }
    avisar(comMsg(d.msg));
    if (/ya no existe/i.test(d.msg || '')) { _com.resp = null; comCargar(); }
    return;
  }
  _com.resp = null;
  _com.datos.comentarios.push(d.data);
  _com.abiertos.add(d.data.padre);
  comPintarLista();
}

function comIrA(t) {
  const v = document.getElementById('player-video');
  if (!v || v.style.display === 'none') return;
  if (_escenaActiva && _escenaActiva.compartido && t < _escenaActiva.inicioT) t = _escenaActiva.inicioT;
  if (typeof irA === 'function') irA(v, t); else v.currentTime = t;
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
  const c = _com.datos.comentarios.find(x => x.id === idCom);
  const nResp = c && !c.padre ? _com.datos.comentarios.filter(x => x.padre === idCom).length : 0;
  const texto = 'Se borrará para todos los que ven este vídeo' + (nResp ? (nResp === 1 ? ', con su respuesta.' : ', con sus ' + nResp + ' respuestas.') : '.');
  if (!await confirmar(texto, { titulo: '¿Borrar tu comentario?', aceptar: 'Borrar', peligro: true })) return;
  const d = await comApi('comentarios-borrar', '', { dispositivo: COM_DISP.id, id: idCom });
  if (!d.ok) { avisar(comMsg(d.msg)); return; }
  if (_com.resp && (_com.resp.raiz === idCom || _com.resp.a === idCom)) _com.resp = null;
  _com.datos.comentarios = _com.datos.comentarios.filter(c => c.id !== idCom && c.padre !== idCom);
  comPintarLista();
}
