// ─── SELECCIÓN COMPARTIDA ─────────────────────────────────────────────────────
// Varias escenas o vídeos completos (de uno o varios vídeos) con un único PIN.
// · Familia (roles todo/caseros): en "Compartir" del reproductor se añaden fragmentos a la
//   selección, que vive en este dispositivo (localStorage 'af_seleccion'). Una barra abajo
//   abre la ventana de la selección: título, orden (↑ ↓), quitar y compartir por WhatsApp.
// · Invitado (PIN de selección): entra en #screen-seleccion, con los fragmentos como tarjetas
//   y "Ver todo", que los encadena (al acabar uno pasa al siguiente en 5 s).
const SEL_MAX = 30;
const SEL_ESPERA = 5;   // segundos antes de pasar solo al siguiente en "Ver todo"

function escSel(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function selFmtDur(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min${x && m < 10 ? ' ' + x + ' s' : ''}` : `${x} s`;
}

// Datos de un fragmento {caseroId, escenaIdx} para pintarlo
function selInfo(it) {
  const c = (typeof CASEROS !== 'undefined' ? CASEROS : []).find(x => x.id === it.caseroId);
  if (!c) return null;
  const esc = it.escenaIdx >= 0 && c.escenas ? c.escenas[it.escenaIdx] : null;
  let dur = null;
  if (esc) {
    const sig = c.escenas[it.escenaIdx + 1];
    dur = sig ? sig.t - esc.t : (c.duracion ? c.duracion - esc.t : null);
  } else if (c.duracion) dur = c.duracion;
  return {
    c, esc,
    titulo: esc ? esc.titulo : c.titulo,
    sub: esc ? `${c.titulo}${esc.fecha ? ' · ' + esc.fecha : ''}` : `Vídeo completo${c.fecha ? ' · ' + c.fecha : ''}`,
    mini: (esc && esc.miniatura) || c.miniatura || '',
    dur
  };
}
function selMiniHtml(inf) {
  return inf && inf.mini
    ? `<span class="sel-mini"><img src="${escSel(inf.mini)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('sin')"></span>`
    : `<span class="sel-mini sin"></span>`;
}

// ── Selección en preparación (familia) ───────────────────────────────────────
function selLeer() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('af_seleccion') || 'null'); } catch (e) {}
  if (!s || !Array.isArray(s.items)) s = { titulo: '', items: [] };
  s.items = s.items.filter(it => it && Number.isInteger(it.caseroId) && Number.isInteger(it.escenaIdx));
  return s;
}
function selGuardar(s) {
  try { localStorage.setItem('af_seleccion', JSON.stringify(s)); } catch (e) {}
  selPintarBarra();
}
const selPuede = () => (ROL === 'todo' || ROL === 'caseros') && !document.body.classList.contains('modo-tv');

function selAviso(txt) {
  let el = document.getElementById('sel-aviso');
  if (!el) { el = document.createElement('div'); el.id = 'sel-aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = txt;
  el.classList.remove('visible'); void el.offsetWidth; el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 2400);
}

async function selAnadir(caseroId, escenaIdx) {
  const s = selLeer();
  if (s.items.some(it => it.caseroId === caseroId && it.escenaIdx === escenaIdx)) {
    cerrarShareModal(); selAviso('Ya estaba en la selección'); return;
  }
  if (s.items.length >= SEL_MAX) {
    cerrarShareModal();
    await avisar(`La selección admite hasta ${SEL_MAX} fragmentos. Comparte esta o quita alguno.`, { titulo: 'Selección completa' });
    return;
  }
  s.items.push({ caseroId, escenaIdx });
  selGuardar(s);
  cerrarShareModal();
  selAviso(`Añadido · ${s.items.length} en la selección`);
}

// HTML de los botones de selección dentro de la ventana "Compartir" del reproductor
function selBotonesShare(caseroId, escenaIdx) {
  if (!selPuede()) return '';
  const n = selLeer().items.length;
  return `<div class="share-sel">
      <div class="share-sel-tit">Selección${n ? ` · ${n} ${n === 1 ? 'fragmento' : 'fragmentos'}` : ''}</div>
      ${escenaIdx >= 0 ? `<button class="share-btn sel" onclick="selAnadir(${caseroId},${escenaIdx})">＋ Añadir esta escena</button>` : ''}
      <button class="share-btn sel" onclick="selAnadir(${caseroId},-1)">＋ Añadir el vídeo completo</button>
      ${n ? `<button class="share-btn sel ver" onclick="cerrarShareModal();cerrarPlayer();abrirSeleccion()">Ver la selección ›</button>` : ''}
    </div>`;
}

function selPintarBarra() {
  let b = document.getElementById('sel-barra');
  const n = selPuede() ? selLeer().items.length : 0;
  if (!b) {
    if (!n) return;
    b = document.createElement('button');
    b.id = 'sel-barra'; b.type = 'button';
    b.onclick = () => abrirSeleccion();
    document.body.appendChild(b);
  }
  b.innerHTML = `<span class="sel-barra-n">${n}</span><span class="sel-barra-txt">${n === 1 ? 'fragmento' : 'fragmentos'} en la selección</span><span class="sel-barra-ir">Ver ›</span>`;
  b.classList.toggle('visible', n > 0);
}

function abrirSeleccion() {
  const m = document.getElementById('sel-modal');
  if (!m) return;
  selPintarModal();
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function cerrarSeleccion(e) {
  const m = document.getElementById('sel-modal');
  if (e && e.target !== m) return;
  m.classList.remove('open');
  if (!document.getElementById('player-overlay').classList.contains('open')) document.body.style.overflow = '';
}

function selPintarModal() {
  const s = selLeer();
  const lista = document.getElementById('sel-lista');
  document.getElementById('sel-titulo').value = s.titulo || '';
  document.getElementById('sel-cuenta').textContent = s.items.length
    ? `${s.items.length} ${s.items.length === 1 ? 'fragmento' : 'fragmentos'} · se verán en este orden`
    : 'Vacía';
  lista.innerHTML = s.items.length ? s.items.map((it, i) => {
    const inf = selInfo(it);
    return `<div class="sel-item">
      ${selMiniHtml(inf)}
      <span class="sel-txt"><span class="sel-tit">${escSel(inf ? inf.titulo : 'Vídeo que ya no existe')}</span>
        <span class="sel-sub">${escSel(inf ? inf.sub : '')}${inf && inf.dur ? ' · ' + selFmtDur(inf.dur) : ''}</span></span>
      <span class="sel-acc">
        <button onclick="selMover(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button onclick="selMover(${i},1)" ${i === s.items.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
        <button onclick="selQuitar(${i})" aria-label="Quitar">✕</button>
      </span></div>`;
  }).join('') : '<p class="sel-vacia">Abre un vídeo, pulsa «Compartir» y añade escenas o vídeos completos.</p>';
  document.querySelectorAll('#sel-modal .sel-compartir').forEach(b => b.disabled = !s.items.length);
}
function selMover(i, d) {
  const s = selLeer(), j = i + d;
  if (j < 0 || j >= s.items.length) return;
  [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
  selGuardar(s); selPintarModal();
}
function selQuitar(i) {
  const s = selLeer();
  s.items.splice(i, 1);
  selGuardar(s); selPintarModal();
}
function selCambiarTitulo(v) {
  const s = selLeer();
  s.titulo = String(v || '').slice(0, 80);
  selGuardar(s);
}
async function selVaciar() {
  if (!await confirmar('Se quitarán todos los fragmentos de la selección.', { titulo: '¿Vaciar la selección?', aceptar: 'Vaciar', peligro: true })) return;
  selGuardar({ titulo: '', items: [] });
  selPintarModal();
}

async function selCompartir(permanente) {
  const s = selLeer();
  if (!s.items.length) return;
  s.titulo = document.getElementById('sel-titulo').value.trim().slice(0, 80);
  let d;
  try {
    const r = await fetch(`${API}?action=compartir-generar&token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: s.items, titulo: s.titulo, permanente })
    });
    d = await r.json();
  } catch (e) { d = { ok: false, msg: 'Sin conexión' }; }
  if (!d.ok) { avisar(d.msg || 'Inténtalo de nuevo en un momento.', { titulo: 'No se pudo generar el código' }); return; }
  const n = s.items.length;
  const que = s.titulo ? `la selección "${s.titulo}" (${n} ${n === 1 ? 'momento' : 'momentos'})` : `una selección de ${n} ${n === 1 ? 'momento' : 'momentos'}`;
  const caducidad = permanente ? 'Sin fecha de caducidad' : 'Válido durante 24 horas';
  const msg = `Hola! Te comparto ${que} del Archivo Familiar.\n\n🔑 Código de acceso: *${d.data.pin}*\n⏱ ${caducidad}\n\n🔗 tinyurl.com/archivo-familiar`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  // Compartida: se vacía para empezar otra
  selGuardar({ titulo: '', items: [] });
  cerrarSeleccion();
  selAviso(`Selección compartida · código ${d.data.pin}`);
}

// ── Invitado con PIN de selección ────────────────────────────────────────────
// window._compartirLista = { titulo, items:[{caseroId, escenaIdx, t}], actual, todo, vistos:Set }
function listaActiva() { return window._compartirLista || null; }

function iniciarListaCompartida(lista) {
  const items = (lista.items || []).filter(it => CASEROS.some(c => c.id === it.caseroId));
  window._compartirLista = { titulo: lista.titulo || '', items, actual: -1, todo: false, vistos: new Set() };
  document.getElementById('home-screen').style.display = 'none';
  pintarPantallaLista();
  document.getElementById('screen-seleccion').classList.add('active');
}

function pintarPantallaLista() {
  const L = listaActiva();
  if (!L) return;
  const total = L.items.reduce((a, it) => a + ((selInfo(it) || {}).dur || 0), 0);
  document.getElementById('lista-titulo').textContent = L.titulo || 'Momentos del Archivo Familiar';
  document.getElementById('lista-sub').textContent =
    `${L.items.length} ${L.items.length === 1 ? 'momento' : 'momentos'}${total ? ' · ' + selFmtDur(total) : ''}`;
  document.getElementById('lista-items').innerHTML = L.items.map((it, i) => {
    const inf = selInfo(it);
    return `<button class="lista-item${L.vistos.has(i) ? ' visto' : ''}" onclick="verItemLista(${i},false)">
      <span class="lista-num">${i + 1}</span>
      ${selMiniHtml(inf)}
      <span class="sel-txt"><span class="sel-tit">${escSel(inf.titulo)}</span>
        <span class="sel-sub">${escSel(inf.sub)}${inf.dur ? ' · ' + selFmtDur(inf.dur) : ''}</span></span>
      <span class="lista-play">${L.vistos.has(i) ? '✓' : svgIcon('i-play')}</span>
    </button>`;
  }).join('');
}

// Reproduce el fragmento i. 'todo' = encadenar con los siguientes ("Ver todo").
function verItemLista(i, todo) {
  const L = listaActiva();
  if (!L || !L.items[i]) return;
  if (todo !== undefined) L.todo = !!todo;
  L.actual = i;
  L.vistos.add(i);
  // Se marca como visto sin volver a pintar la lista (la tarjeta hace el efecto de vuelta al cerrar)
  const card = document.querySelectorAll('#lista-items .lista-item')[i];
  if (card) { card.classList.add('visto'); card.querySelector('.lista-play').textContent = '✓'; }
  ocultarPanelEscena();
  const it = L.items[i], inf = selInfo(it), c = inf.c;
  if (inf.esc) {
    const sig = c.escenas[it.escenaIdx + 1];
    _escenaActiva = { caseroId: c.id, escenaIdx: it.escenaIdx, inicioT: inf.esc.t || 0,
      finT: sig ? sig.t : (c.duracion || null), compartido: true };
    abrirPlayer(c.youtube, inf.esc.titulo, inf.esc.fecha || '', inf.esc.t || 0);
  } else {
    _escenaActiva = null;
    abrirPlayer(c.youtube, c.titulo, c.fecha || '', 0);
  }
  const pf = document.getElementById('player-fecha');
  if (pf && L.items.length > 1) pf.textContent = `${i + 1} de ${L.items.length}${pf.textContent ? ' · ' + pf.textContent : ''}`;
}
function listaSiguienteInfo() {
  const L = listaActiva();
  if (!L || L.actual < 0 || L.actual >= L.items.length - 1) return null;
  return selInfo(L.items[L.actual + 1]);
}
function listaAvanzar() {
  const L = listaActiva();
  if (L) verItemLista(L.actual + 1);
}
function verListaTodo() { verItemLista(0, true); }

// Cuenta atrás del panel de fin en "Ver todo"
let _listaCuenta = null;
function listaCuentaAtras(btn) {
  listaCuentaParar();
  const L = listaActiva();
  if (!L || !L.todo || !btn) return;
  let n = SEL_ESPERA;
  const txt = () => { btn.textContent = `Siguiente en ${n} s ›`; };
  txt();
  _listaCuenta = setInterval(() => {
    n--;
    if (n <= 0) { listaCuentaParar(); listaAvanzar(); } else txt();
  }, 1000);
}
function listaCuentaParar() { if (_listaCuenta) { clearInterval(_listaCuenta); _listaCuenta = null; } }

window.addEventListener('DOMContentLoaded', () => setTimeout(selPintarBarra, 0));
