// ─── NUEVO DISEÑO: navegación, inicio, escenas, continuar viendo ──────────────
function marcarNav(sec) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === sec));
  const box = document.getElementById('search-box');
  const wrap = document.getElementById('search-wrap');
  if (box && wrap) wrap.classList.toggle('oculto', box.style.display === 'none');
  window.scrollTo(0, 0);
}
function tieneInicio() {
  const b = document.body.classList;
  return b.contains('rol-todo') || b.contains('rol-caseros') || b.contains('rol-actuaciones');
}
function irInicio() {
  if (tieneInicio()) goHome();
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
  if (typeof listaActiva === 'function' && listaActiva()) { continuarLista(); return; }   // invitado con selección
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
// ─── Mosaicos de las tarjetas de colección ───────────────────────────────────
// Cada tarjeta lleva de fondo hasta 5 miniaturas de su colección (caseros) o 3 (actuaciones,
// con la miniatura pública de YouTube). La selección cambia cada día pero es la misma
// durante todo el día, así no parpadea al volver al inicio.
function escogerDelDia(lista, n, extra) {
  const u = [...new Set(lista)];
  const orden = u.map((x, i) => ({ x, k: semillaDia(extra + i) })).sort((a, b) => a.k - b.k);
  return orden.slice(0, n).map(o => o.x);
}
function pintarMosaico(id, urls) {
  const el = document.getElementById(id);
  if (!el) return;
  const clave = urls.join('|');
  if (el.dataset.clave === clave) return;
  el.dataset.clave = clave;
  el.className = 'card-mos n' + Math.min(urls.length, 3);
  el.innerHTML = urls.map(u => `<img src="${escAttr(u)}" alt="" loading="lazy" onerror="this.remove()">`).join('');
}
function renderMosaicos() {
  const cas = CASEROS.map(c => c.miniatura).filter(Boolean);
  const act = ACTUACIONES.map(a => idYoutube(a.youtube)).filter(Boolean).map(id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  const fc = escogerDelDia(cas, 5, 'mc'), fa = escogerDelDia(act, 3, 'ma');
  pintarMosaico('mos-caseros', fc);   pintarMosaico('cabmos-caseros', fc);   // misma foto en la tarjeta y en la cabecera
  pintarMosaico('mos-sev', fa);       pintarMosaico('cabmos-sev', fa);
}

function renderInicioExtras() {
  renderMosaicos();
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
// ─── Portada: carrusel de recuerdos (2 nov 2026) ─────────────────────────────
// Hasta MAX_RECUERDOS diapositivas que pasan solas cada DIA_SEG segundos (barra de progreso
// bajo la portada; la barra es la que manda el ritmo: al terminar su animación, avanza).
// La lista es fija todo el día (semillaDia), así que volver al inicio no la cambia.
const MAX_RECUERDOS = 5;
let _recuerdos = [], _recuerdo = null, _diaIdx = 0, _diaClave = '', _diaIniciado = false, _diaSwipe = 0;
function vidRecuerdo(x) { return x.tipo === 'actuacion' ? 'a' + x.a.id : 'c' + x.c.id; }
function claveRecuerdo(x) { return x.tipo === 'frag' ? 'f' + x.i : vidRecuerdo(x) + (x.tipo === 'escena' ? ':' + x.idx : ''); }
function elegirRecuerdos() {
  const hoy = new Date(), d = hoy.getDate(), m = hoy.getMonth() + 1, y = hoy.getFullYear();
  const pool = [];
  // Invitado con PIN de selección: la portada solo usa sus fragmentos (con 2 o más; con uno ya lo tiene en la lista)
  const L = typeof listaActiva === 'function' ? listaActiva() : null;
  if (L) {
    if (L.items.length >= 2) L.items.forEach((it, i) => {
      const inf = selInfo(it);
      if (inf) pool.push({ tipo: 'frag', i, c: inf.c, e: inf.esc, f: fechaDMY((inf.esc && inf.esc.fecha) || inf.c.fecha) });
    });
  } else CASEROS.forEach(c => {
    if (!c.youtube) return;
    if (c.escenas && c.escenas.length) {
      c.escenas.forEach((e, idx) => { if (e && e.fecha) pool.push({ tipo: 'escena', c, idx, e, f: fechaDMY(e.fecha) }); });
    } else {
      pool.push({ tipo: 'casero', c, f: fechaDMY(c.fecha) });
    }
  });
  if (!pool.length && !L) {
    // Sin vídeos caseros (rol de solo actuaciones): actuaciones del día
    ACTUACIONES.forEach(a => { if (a.youtube) pool.push({ tipo: 'actuacion', a, f: fechaDMY(a.fecha) }); });
  }
  if (!pool.length) return [];
  const orden = (lista, extra) => lista.map((x, i) => ({ x, k: semillaDia(extra + i) })).sort((p, q) => p.k - q.k).map(o => o.x);
  const res = [], usados = new Set(), videos = new Set();
  // Toma hasta n de la lista, sin repetir ficha y (salvo repetirVideo) sin dos del mismo vídeo
  const tomar = (lista, n, motivo, extra, repetirVideo) => {
    for (const x of orden(lista, extra)) {
      if (res.length >= MAX_RECUERDOS || n <= 0) break;
      if (usados.has(claveRecuerdo(x)) || (!repetirVideo && videos.has(vidRecuerdo(x)))) continue;
      usados.add(claveRecuerdo(x)); videos.add(vidRecuerdo(x)); n--;
      res.push({ ...x, motivo, anios: motivo === 'azar' ? 0 : y - x.f.y });
    }
  };
  const antes = x => x.f.y && x.f.y < y;
  tomar(pool.filter(x => antes(x) && x.f.d === d && x.f.m === m), 3, 'dia', 'd');          // tal día como hoy
  const redondo = x => antes(x) && (y - x.f.y) % 10 === 0;                                   // hace 10, 20, 30… años
  const n0 = res.length;
  tomar(pool.filter(x => redondo(x) && x.f.m === m), 1, 'aniv', 'a');
  if (res.length === n0) tomar(pool.filter(redondo), 1, 'aniv', 'a2');
  tomar(pool.filter(x => antes(x) && x.f.m === m), 1, 'mes', 'm');                           // un mes como este
  tomar(pool, MAX_RECUERDOS, 'azar', 'r');                                                   // el resto, al azar
  tomar(pool, MAX_RECUERDOS, 'azar', 'r', true);                                             // pocos vídeos: se admiten escenas del mismo
  return res;
}
function textoRecuerdo(r) {
  const conE = r.tipo === 'escena' || (r.tipo === 'frag' && r.e);   // fragmento de una selección: escena o vídeo completo
  const titulo = conE ? r.e.titulo : r.tipo === 'actuacion' ? r.a.act : r.c.titulo;
  const fecha = conE ? (r.e.fecha || '') : r.tipo === 'actuacion' ? formatDate(r.a.fecha) : (r.c.fecha || '');
  const hace = r.motivo === 'aniv' || !r.anios ? '' : ` · hace ${r.anios} año${r.anios !== 1 ? 's' : ''}`;
  const kick = r.motivo === 'dia' ? 'Tal día como hoy' : r.motivo === 'mes' ? 'Un mes como este'
    : r.motivo === 'aniv' ? `Hace ${r.anios} años` : 'Recuerdo del día';
  return {
    titulo,
    kicker: (r.tipo === 'actuacion' ? 'Actuación · ' : '') + kick,
    sub: (conE ? `Escena de «${r.c.titulo}» · ` : r.tipo === 'frag' ? 'Vídeo completo · ' : '') + fecha + hace
  };
}
function fondoRecuerdo(r) {
  if (r.tipo === 'actuacion') {
    const yt = idYoutube(r.a.youtube);
    return `<span class="dia-fondo t-otros">${svgIcon('i-music')}${yt ? `<img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" onerror="this.remove()">` : ''}</span>`;
  }
  const mini = (r.e && r.e.miniatura) || r.c.miniatura;
  return `<span class="dia-fondo t-${thumbClass(r.c.tipo, r.c.categoria)}">${thumbIcon(r.c.tipo, r.c.categoria)}${mini ? `<img src="${mini}" alt="" onerror="this.remove()">` : ''}</span>`;
}
function renderRecuerdoDia() {
  const card = document.getElementById('dia-card');
  if (!card) return;
  const hero = card.parentElement, puntos = document.getElementById('dia-puntos');
  const lista = elegirRecuerdos();
  if (!lista.length) {
    _recuerdos = []; _recuerdo = null; _diaClave = '';
    card.classList.remove('visible'); hero.classList.remove('dia-multi');
    return;
  }
  const clave = lista.map(claveRecuerdo).join('|');
  if (clave === _diaClave && card.classList.contains('visible')) return;   // la misma portada: no se toca, no parpadea
  _diaClave = clave; _recuerdos = lista;
  iniciarCarruselDia(card, hero, puntos);
  document.getElementById('dia-thumb').innerHTML = lista.map(fondoRecuerdo).join('');
  puntos.innerHTML = lista.map((_, i) => `<button class="dia-punto" data-i="${i}" aria-label="Recuerdo ${i + 1} de ${lista.length}"><i></i></button>`).join('');
  hero.classList.toggle('dia-multi', lista.length > 1);
  card.classList.add('visible');
  mostrarRecuerdo(0, true);
}
function mostrarRecuerdo(i, inicial) {
  const n = _recuerdos.length;
  if (!n) return;
  i = ((i % n) + n) % n;
  const card = document.getElementById('dia-card'), th = document.getElementById('dia-thumb');
  const puntos = document.getElementById('dia-puntos'), txt = card.querySelector('.dia-txt');
  // Fondo: el anterior se desvanece (sigue con su zoom hasta apagarse) y el nuevo entra con el suyo
  const prev = th.querySelector('.dia-fondo.activo'), nuevo = th.children[i];
  if (prev && prev !== nuevo) {
    prev.classList.remove('activo'); prev.classList.add('saliendo');
    setTimeout(() => prev.classList.remove('saliendo'), 1000);
  }
  if (nuevo) { nuevo.classList.remove('saliendo'); nuevo.classList.add('activo'); }
  // Texto: se apaga, cambia y vuelve
  _diaIdx = i; _recuerdo = _recuerdos[i];
  const t = textoRecuerdo(_recuerdo);
  const poner = () => {
    document.getElementById('dia-kicker').textContent = t.kicker;
    document.getElementById('dia-title').textContent = t.titulo;
    document.getElementById('dia-sub').textContent = t.sub;
    txt.classList.remove('cambia');
  };
  clearTimeout(txt._t);
  if (inicial) poner(); else { txt.classList.add('cambia'); txt._t = setTimeout(poner, 280); }
  reiniciarBarraDia();
}
// La barra activa corre 7 s (CSS); las anteriores quedan llenas, las siguientes vacías
function reiniciarBarraDia() {
  const puntos = document.getElementById('dia-puntos');
  const bs = [...puntos.children];
  bs.forEach(b => b.classList.remove('activo', 'hecho'));
  void puntos.offsetWidth;                         // para que la animación vuelva a empezar
  bs.forEach((b, k) => { if (k < _diaIdx) b.classList.add('hecho'); else if (k === _diaIdx) b.classList.add('activo'); });
}
function diaIr(delta) { mostrarRecuerdo(_diaIdx + delta); }
function iniciarCarruselDia(card, hero, puntos) {
  if (_diaIniciado) return;
  _diaIniciado = true;
  // Al terminar la barra, siguiente. Si hay un vídeo abierto (o la foto está volviendo), espera
  puntos.addEventListener('animationend', e => {
    if (e.animationName !== 'dia-prog') return;
    if (document.querySelector('.player-overlay.open') || card.classList.contains('sala-vuelta')) { reiniciarBarraDia(); return; }
    diaIr(1);
  });
  puntos.addEventListener('click', e => {
    const b = e.target.closest('.dia-punto');
    if (b) mostrarRecuerdo(+b.dataset.i);
  });
  // Pausa: ratón encima o dedo apoyado
  hero.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hero.classList.add('dia-pausa'); });
  hero.addEventListener('pointerleave', () => hero.classList.remove('dia-pausa'));
  // Deslizar con el dedo cambia de recuerdo; el toque que lo sigue no abre el vídeo
  let x0 = 0, y0 = 0;
  card.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; hero.classList.add('dia-pausa'); }, { passive: true });
  card.addEventListener('touchend', e => {
    hero.classList.remove('dia-pausa');
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { _diaSwipe = Date.now(); diaIr(dx < 0 ? 1 : -1); }
  }, { passive: true });
  card.addEventListener('touchcancel', () => hero.classList.remove('dia-pausa'), { passive: true });
  card.addEventListener('click', e => {
    if (Date.now() - _diaSwipe < 450) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
}
// Id de un vídeo de YouTube (watch?v=, youtu.be/, embed/, shorts/), para su miniatura pública
function idYoutube(url) {
  const m = String(url || '').match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function verRecuerdo() {
  const r = _recuerdo;
  if (!r) return;
  if (r.tipo === 'frag') verItemLista(r.i, false);
  else if (r.tipo === 'escena') abrirPlayerEscena(r.c.id, r.idx);
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
  if (v) v.addEventListener('timeupdate', () => { actualizarUltimo(v); actualizarUltimoLista(v); marcarEscenaActual(v); });
  const hola = document.getElementById('home-hello');
  if (hola) hola.textContent = saludo();
});

// ─── DATOS ────────────────────────────────────────────────────────────────────
async function cargarDatos() {
  const r = await fetch(`${API}?action=listar&token=${encodeURIComponent(TOKEN)}`);
  const d = await r.json();
  if (d.ok) {
    ACTUACIONES = d.data;
    const n = ACTUACIONES.length, tv = document.body.classList.contains('modo-tv');
    document.getElementById('count-badge').textContent = !n ? 'Sin actuaciones aún'
      : tv ? `${n} ${n === 1 ? 'actuación' : 'actuaciones'}` : (n === 1 ? 'Ver la actuación' : `Ver las ${n} actuaciones`);
    renderSevillanas();
  }
  await cargarCaseros();
}

