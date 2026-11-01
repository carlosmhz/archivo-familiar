// ─── NUEVO DISEÑO: navegación, inicio, escenas, continuar viendo ──────────────
function marcarNav(sec) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === sec));
  const box = document.getElementById('search-box');
  const wrap = document.getElementById('search-wrap');
  if (box && wrap) wrap.classList.toggle('oculto', box.style.display === 'none');
  window.scrollTo(0, 0);
}
function irInicio() {
  if (document.body.classList.contains('rol-todo')) goHome();
}
function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}
function escAttr(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

const ULT_KEY = 'af_ultimo';
let _ultimoGuardado = 0;
function leerUltimo() { try { return JSON.parse(localStorage.getItem(ULT_KEY) || 'null'); } catch (e) { return null; } }
function registrarUltimo(url, titulo, fecha, min) {
  if (!url || String(ROL).startsWith('compartir') || document.body.classList.contains('modo-tv')) return;
  const d = { url, titulo, fecha: fecha || '', t: min || 0, pct: 0, caseroId: null, escenaIdx: null, cuando: Date.now() };
  if (_escenaActiva && !_escenaActiva.compartido) { d.caseroId = _escenaActiva.caseroId; d.escenaIdx = _escenaActiva.escenaIdx; }
  else { const c = CASEROS.find(x => x.youtube === url); if (c) d.caseroId = c.id; }
  try { localStorage.setItem(ULT_KEY, JSON.stringify(d)); } catch (e) {}
}
function actualizarUltimo(video) {
  if (String(ROL).startsWith('compartir') || !video.duration || !isFinite(video.duration)) return;
  const ahora = Date.now();
  if (ahora - _ultimoGuardado < 4000) return;
  _ultimoGuardado = ahora;
  const d = leerUltimo();
  if (!d) return;
  const pct = video.currentTime / video.duration;
  if (pct > 0.97) { try { localStorage.removeItem(ULT_KEY); } catch (e) {} return; }
  d.t = Math.floor(video.currentTime); d.pct = pct;
  try { localStorage.setItem(ULT_KEY, JSON.stringify(d)); } catch (e) {}
}
function continuarViendo() {
  const d = leerUltimo();
  if (!d) return;
  const c = d.caseroId != null ? CASEROS.find(x => x.id === d.caseroId) : null;
  if (c && d.escenaIdx != null && c.escenas && c.escenas[d.escenaIdx]) {
    const e = c.escenas[d.escenaIdx], nextE = c.escenas[d.escenaIdx + 1] || null;
    _escenaActiva = { caseroId: c.id, escenaIdx: d.escenaIdx, finT: nextE ? nextE.t : (c.duracion || null) };
    abrirPlayer(c.youtube, e.titulo, e.fecha, d.t);
  } else {
    abrirPlayer(d.url, d.titulo, d.fecha, d.t);
  }
}

function miniHtml(c) {
  const tc = thumbClass(c.tipo, c.categoria);
  return `<div class="recent-thumb t-${tc}">${thumbIcon(c.tipo, c.categoria)}${c.miniatura ? `<img src="${c.miniatura}" alt="" onerror="this.remove()">` : ''}</div>`;
}
function renderInicioExtras() {
  const hola = document.getElementById('home-hello');
  if (hola) hola.textContent = saludo();
  // Continuar viendo
  const card = document.getElementById('continue-card');
  const d = leerUltimo();
  const existe = d && (CASEROS.some(c => c.youtube && d.url && d.url.split('#')[0] === c.youtube.split('#')[0]) ||
                       ACTUACIONES.some(a => a.youtube && d.url && d.url.split('#')[0].split('?')[0] === a.youtube.split('#')[0].split('?')[0]));
  if (card) {
    if (existe) {
      const c = d.caseroId != null ? CASEROS.find(x => x.id === d.caseroId) : null;
      document.getElementById('cc-title').textContent = c ? c.titulo : d.titulo;
      document.getElementById('cc-sub').textContent = (c && d.escenaIdx != null && c.escenas && c.escenas[d.escenaIdx])
        ? `Escena ${d.escenaIdx + 1} de ${c.escenas.length} · ${c.escenas[d.escenaIdx].titulo}`
        : (d.fecha || '');
      document.getElementById('cc-progress').style.width = Math.round((d.pct || 0) * 100) + '%';
      card.style.background = '';
      card.className = 'continue-card visible' + (c ? ' t-' + thumbClass(c.tipo, c.categoria) : '');
      const esc = c && d.escenaIdx != null && c.escenas ? c.escenas[d.escenaIdx] : null;
      const mini = (esc && esc.miniatura) || (c && c.miniatura);
      document.getElementById('cc-img').innerHTML = mini ? `<img src="${mini}" alt="" onerror="this.remove()">` : '';
    } else {
      card.className = 'continue-card';
    }
  }
  renderRecuerdoDia();
  // Añadidos recientemente: solo lo subido en los últimos DIAS_RECIENTE días
  const wrap = document.getElementById('home-recientes');
  const row = document.getElementById('recent-row');
  const lista = videosRecientes();
  if (wrap && row) {
    wrap.classList.toggle('visible', lista.length > 0);
    row.innerHTML = lista.map(c => `<button class="recent-card" onclick="abrirPlayer('${escAttr(c.youtube)}','${escAttr(c.titulo)}','${escAttr(c.fecha)}',0)">
        <div style="position:relative"><span class="recent-new">Nuevo</span>${miniHtml(c)}</div>
        <div class="recent-title">${c.titulo}</div>
        <div class="recent-date">${c.fecha || ''}</div>
      </button>`).join('');
  }
}

// ─── RECIENTES ────────────────────────────────────────────────────────────────
// Si el servidor manda la fecha de subida (campo 'subido', 'creado' o 'fecha_alta'), se usa.
// Si no, cada dispositivo apunta cuándo vio cada vídeo por primera vez. La primera vez que
// se abre la app se apuntan todos como "antiguos", así no sale nada hasta que subas algo nuevo.
const DIAS_RECIENTE = 30;
function fechaSubida(c) {
  const v = c.subido || c.creado || c.fecha_alta || c.created_at || null;
  if (!v) return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v).replace(' ', 'T'));
  return isNaN(t) ? null : t;
}
function videosRecientes() {
  let vistos = null;
  try { vistos = JSON.parse(localStorage.getItem('af_vistos') || 'null'); } catch (e) {}
  const primeraVez = !vistos;
  if (!vistos) vistos = {};
  const ahora = Date.now();
  let cambios = false;
  CASEROS.forEach(c => {
    if (c.id == null) return;
    if (!(c.id in vistos)) { vistos[c.id] = primeraVez ? 0 : ahora; cambios = true; }
  });
  if (cambios) { try { localStorage.setItem('af_vistos', JSON.stringify(vistos)); } catch (e) {} }
  const limite = ahora - DIAS_RECIENTE * 86400000;
  return CASEROS
    .filter(c => c.youtube)
    .map(c => ({ c, t: fechaSubida(c) ?? (vistos[c.id] || 0) }))
    .filter(x => x.t > limite)
    .sort((a, b) => b.t - a.t || (b.c.id || 0) - (a.c.id || 0))
    .slice(0, 10)
    .map(x => x.c);
}

// ─── RECUERDO DEL DÍA ─────────────────────────────────────────────────────────
// 1) un vídeo grabado tal día como hoy en otro año; 2) si no hay, uno del mismo mes;
// 3) si tampoco, uno al azar. Solo vídeos caseros. Es el mismo para toda la familia durante el día.
const MESES_ES = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
function fechaDMY(f) {
  const s = String(f || '').trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return { y: +m[1], m: +m[2], d: m[3] ? +m[3] : 0 };
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  const y = s.match(/\d{4}/);
  for (const [nom, num] of Object.entries(MESES_ES)) {
    if (s.includes(nom)) { const d = s.match(/^(\d{1,2})\s/); return { y: y ? +y[0] : 0, m: num, d: d ? +d[1] : 0 }; }
  }
  return { y: y ? +y[0] : 0, m: 0, d: 0 };
}
function semillaDia(extra) {
  const h = new Date();
  const txt = `${h.getFullYear()}-${h.getMonth() + 1}-${h.getDate()}${extra || ''}`;
  let x = 2166136261;
  for (let i = 0; i < txt.length; i++) { x ^= txt.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x;
}
let _recuerdo = null;
function elegirRecuerdo() {
  const hoy = new Date(), d = hoy.getDate(), m = hoy.getMonth() + 1, y = hoy.getFullYear();
  const pool = [];
  CASEROS.forEach(c => {
    if (!c.youtube) return;
    if (c.escenas && c.escenas.length) {
      c.escenas.forEach((e, idx) => { if (e && e.fecha) pool.push({ tipo: 'escena', c, idx, e, f: fechaDMY(e.fecha) }); });
    } else {
      pool.push({ tipo: 'casero', c, f: fechaDMY(c.fecha) });
    }
  });
  if (!pool.length) return null;
  const elegir = (lista, extra) => lista[semillaDia(extra) % lista.length];
  const dia = pool.filter(x => x.f.d === d && x.f.m === m && x.f.y && x.f.y < y);
  if (dia.length) { const x = elegir(dia, 'd'); return { ...x, motivo: 'dia', anios: y - x.f.y }; }
  const mes = pool.filter(x => x.f.m === m && x.f.y && x.f.y < y);
  if (mes.length) { const x = elegir(mes, 'm'); return { ...x, motivo: 'mes', anios: y - x.f.y }; }
  return { ...elegir(pool, 'r'), motivo: 'azar' };
}
function renderRecuerdoDia() {
  const card = document.getElementById('dia-card');
  if (!card) return;
  _recuerdo = elegirRecuerdo();
  if (!_recuerdo) { card.classList.remove('visible'); return; }
  const r = _recuerdo;
  const titulo = r.tipo === 'escena' ? r.e.titulo : r.tipo === 'casero' ? r.c.titulo : r.a.act;
  const fecha = r.tipo === 'escena' ? (r.e.fecha || '') : r.tipo === 'casero' ? (r.c.fecha || '') : formatDate(r.a.fecha);
  const hace = r.anios ? ` · hace ${r.anios} año${r.anios !== 1 ? 's' : ''}` : '';
  document.getElementById('dia-kicker').textContent =
    r.motivo === 'dia' ? 'Tal día como hoy' : r.motivo === 'mes' ? 'Un mes como este' : 'Recuerdo del día';
  document.getElementById('dia-title').textContent = titulo;
  document.getElementById('dia-sub').textContent = (r.tipo === 'escena' ? `Escena de «${r.c.titulo}» · ` : '') + fecha + hace;
  const th = document.getElementById('dia-thumb');
  if (r.tipo === 'casero' || r.tipo === 'escena') {
    th.className = 'dia-thumb t-' + thumbClass(r.c.tipo, r.c.categoria);
    const mini = (r.tipo === 'escena' && r.e.miniatura) || r.c.miniatura;
    th.innerHTML = thumbIcon(r.c.tipo, r.c.categoria) + (mini ? `<img src="${mini}" alt="" onerror="this.remove()">` : '');
  } else {
    th.className = 'dia-thumb t-otros';
    th.innerHTML = svgIcon('i-music');
  }
  card.classList.add('visible');
}
function verRecuerdo() {
  const r = _recuerdo;
  if (!r) return;
  if (r.tipo === 'escena') abrirPlayerEscena(r.c.id, r.idx);
  else if (r.tipo === 'casero') abrirPlayer(r.c.youtube, r.c.titulo, r.c.fecha || '', 0);
  else abrirPlayer(buildLink(r.a), r.a.act, formatDate(r.a.fecha), r.a.min || 0);
}

function renderEscenasPlayer(url) {
  const box = document.getElementById('player-escenas');
  if (!box) return;
  const c = _escenaActiva ? CASEROS.find(x => x.id === _escenaActiva.caseroId) : CASEROS.find(x => x.youtube && x.youtube === url);
  if (!c || !c.escenas || !c.escenas.length || (_escenaActiva && _escenaActiva.compartido) || String(ROL).startsWith('compartir')) {
    box.classList.remove('visible'); box.innerHTML = ''; box.dataset.id = ''; return;
  }
  const act = _escenaActiva ? _escenaActiva.escenaIdx : -1;
  box.dataset.id = c.id;
  box.innerHTML = `<div class="pe-head"><h4>Escenas</h4><span>${c.escenas.length} escenas</span></div><div class="pe-list">` +
    c.escenas.map((e, i) => `<button class="pe-item${i === act ? ' actual' : ''}" data-t="${e.t || 0}" onclick="abrirPlayerEscena(${c.id},${i})">
      ${e.miniatura ? `<span class="pe-mini"><img src="${e.miniatura}" alt="" loading="lazy" onerror="this.parentNode.classList.add('sin')"><span class="pe-num">${i + 1}</span></span>` : `<span class="pe-num">${i + 1}</span>`}
      <span class="pe-txt"><span class="pe-tit" style="display:block">${e.titulo}</span><span class="pe-sub" style="display:block">${e.fecha || ''}</span></span>
      <span class="pe-t">${formatTime(e.t || 0)}</span></button>`).join('') + '</div>';
  box.classList.add('visible');
}
function marcarEscenaActual(video) {
  const items = document.querySelectorAll('#player-escenas .pe-item');
  if (!items.length) return;
  let idx = -1;
  items.forEach((it, i) => { if (video.currentTime + 0.5 >= parseFloat(it.dataset.t)) idx = i; });
  items.forEach((it, i) => it.classList.toggle('actual', i === idx));
}
document.addEventListener('DOMContentLoaded', () => {
  const v = document.getElementById('player-video');
  if (v) v.addEventListener('timeupdate', () => { actualizarUltimo(v); marcarEscenaActual(v); });
  const hola = document.getElementById('home-hello');
  if (hola) hola.textContent = saludo();
});

// ─── DATOS ────────────────────────────────────────────────────────────────────
async function cargarDatos() {
  const r = await fetch(`${API}?action=listar&token=${encodeURIComponent(TOKEN)}`);
  const d = await r.json();
  if (d.ok) {
    ACTUACIONES = d.data;
    document.getElementById('count-badge').textContent = `${ACTUACIONES.length} ${ACTUACIONES.length === 1 ? 'actuación' : 'actuaciones'}`;
    renderSevillanas();
  }
  await cargarCaseros();
}

