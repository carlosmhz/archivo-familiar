// ─── NAV ─────────────────────────────────────────────────────────────────────
function showSection(section) {
  document.getElementById('home-screen').style.display = 'none';
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('search-results-screen').classList.remove('active');
  document.getElementById('screen-'+section).classList.add('active');
  currentSection = section;
  // Si es caseros, asegurar que décadas se renderiza ahora que es visible
  if (section === 'caseros' && typeof renderDecadas === 'function') {
    renderDecadas();
    if (typeof renderCaseros === 'function') renderCaseros();
  }
  // Actualizar placeholder según sección
  const box = document.getElementById('search-box');
  if (section === 'caseros') {
    box.placeholder = 'Buscar vídeo...';
    box.style.display = '';
  } else if (section === 'sevillanas') {
    box.placeholder = 'Buscar actuación...';
    box.style.display = '';
  } else {
    box.style.display = 'none';
  }
  box.value = '';
  marcarNav(section);
}

function goHome() {
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  document.getElementById('search-results-screen').classList.remove('active');
  const box = document.getElementById('search-box');
  box.value = '';
  box.style.display = 'none';
  document.getElementById('home-screen').style.display = '';
  currentSection = 'home';
  marcarNav('home');
  if (tieneInicio()) renderInicioExtras();
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  if (tab === 'decadas') renderDecadas();
  if (tab === 'anos' && typeof renderCaseros === 'function') renderCaseros();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function getYear(fecha) {
  if (!fecha) return 'Sin fecha';
  const m = String(fecha).match(/(\d{4})/);
  return m ? m[1] : 'Sin fecha';
}

function formatDate(f) {
  if (!f) return '—';
  if (/^\d{4}$/.test(String(f))) return f;
  const p = String(f).split('-');
  if (p.length < 3) return f;
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(p[2])} ${months[parseInt(p[1])-1]} ${p[0]}`;
}

function formatTime(s) {
  if (s == null) return '';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function buildLink(a) {
  if (!a.youtube) return null;
  const t = a.min > 0 ? `&t=${a.min}s` : '';
  const base = a.youtube.includes('?') ? a.youtube : a.youtube + '?';
  return a.min > 0 ? a.youtube + (a.youtube.includes('?') ? '&' : '?') + `t=${a.min}s` : a.youtube;
}

function partesFecha(f) {
  const s = String(f || '');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { d: parseInt(m[3]), m: months[parseInt(m[2]) - 1] || '', y: m[1] };
  const y = s.match(/\d{4}/);
  return { d: '', m: '', y: y ? y[0] : '' };
}

function renderActRow(a, conAnio) {
  const link = buildLink(a);
  const timeStr = a.min > 0 ? formatTime(a.min) : '';
  const p = partesFecha(a.fecha);
  const fechaHtml = p.d
    ? `<span class="act-day">${p.d}</span><span class="act-mon">${p.m}</span>${conAnio ? `<span class="act-year">${p.y}</span>` : ''}`
    : `<span class="act-mon">${p.y || '—'}</span>`;
  const abrir = link ? `abrirPlayer('${link.replace(/'/g,"\\'")}','${a.act.replace(/'/g,"\\'")}','${formatDate(a.fecha)}',${a.min||0})` : '';
  const mini = link ? `<button class="act-mini" tabindex="-1" aria-hidden="true" ${datosMini(a)} onclick="${abrir}">${ICO_MINI}</button>`
                    : `<span class="act-mini" aria-hidden="true">${ICO_MINI}</span>`;
  const meta = [a.kw ? `<span class="act-kw">${a.kw}</span>` : '', timeStr ? `Empieza en ${timeStr}` : ''].filter(Boolean).join(' · ');
  return `
    <div class="actuacion-row">
      <span class="act-date">${fechaHtml}</span>
      ${mini}
      <span class="act-info"><span class="act-name">${a.act}</span>${meta ? `<span class="act-meta">${meta}</span>` : ''}</span>
      ${link
        ? `<button class="act-link" aria-label="Ver ${a.act.replace(/"/g, '&quot;')}" onclick="${abrir}"><svg class="ico"><use href="#i-play"/></svg></button>`
        : `<span class="act-link pending">Próximamente</span>`}
    </div>`;
}

// ── Miniaturas de las actuaciones (7 nov 2026) ──
// Cada fila lleva data-v (vídeo) y data-t (segundo de inicio) o data-lista (lista de YouTube).
// - Vídeo que empieza al principio: su portada de YouTube.
// - Vídeo que empieza a mitad (varias actuaciones en la misma cinta): la foto de ese minuto,
//   recortada del "storyboard" de YouTube (las fotos de la barra de progreso). Si no hay, la portada.
// - Lista de YouTube: la portada de su primer vídeo.
// El servidor (action=actuaciones-minis) da las listas y los storyboards, con caché.
const ICO_MINI = '<svg class="ico"><use href="#i-music"/></svg>';
var _minisAct = null;          // { l: {lista: vídeo}, s: {vídeo: storyboard} } cuando llega
let _minisPidiendo = false;

function datosMini(a) {
  const u = String(a.youtube || '');
  const v = typeof idYoutube === 'function' ? idYoutube(u) : null;
  if (v) return `data-v="${v}" data-t="${parseInt(a.min) || 0}"`;
  const l = (u.match(/[?&]list=([\w-]+)/) || [])[1];
  return l ? `data-lista="${l}"` : '';
}

function ponerPortada(el, v) {
  if (!v || el.querySelector('img')) return;
  el.insertAdjacentHTML('beforeend', `<img src="https://i.ytimg.com/vi/${v}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">`);
}

// Recorta el cuadro del segundo t de un storyboard sb = {u, w, h, n, c, r, i}
function ponerCuadro(el, v, t, sb) {
  const porHoja = sb.c * sb.r;
  const idx = Math.min(sb.n - 1, Math.floor((t + 3) * 1000 / sb.i));   // +3 s: evita el cuadro del corte
  const hoja = Math.floor(idx / porHoja), pos = idx % porHoja;
  const resto = sb.n - hoja * porHoja;                                // la última hoja puede ser más pequeña
  const cols = Math.min(sb.c, resto), filas = Math.min(sb.r, Math.ceil(resto / sb.c));
  const col = pos % sb.c, fila = Math.floor(pos / sb.c);
  const url = sb.u.replace('{p}', hoja);
  const span = document.createElement('span');
  span.className = 'act-cuadro';
  span.style.backgroundImage = `url("${url}")`;
  span.style.backgroundSize = `${cols * 100}% ${filas * 100}%`;
  span.style.backgroundPosition = `${cols > 1 ? col / (cols - 1) * 100 : 0}% ${filas > 1 ? fila / (filas - 1) * 100 : 0}%`;
  const prueba = new Image();
  prueba.onload = () => { if (!el.querySelector('.act-cuadro, img')) el.appendChild(span); };
  prueba.onerror = () => ponerPortada(el, v);
  prueba.src = url;
}

function pintarMinisAct(raiz) {
  (raiz || document).querySelectorAll('.act-mini[data-v], .act-mini[data-lista]').forEach(el => {
    if (el.dataset.pintada) return;
    const v = el.dataset.v, t = parseInt(el.dataset.t) || 0;
    if (v && t <= 0) { el.dataset.pintada = 1; ponerPortada(el, v); return; }
    if (!_minisAct) return;                                            // falta la respuesta del servidor
    el.dataset.pintada = 1;
    if (v) { const sb = _minisAct.s && _minisAct.s[v]; sb ? ponerCuadro(el, v, t, sb) : ponerPortada(el, v); }
    else ponerPortada(el, _minisAct.l && _minisAct.l[el.dataset.lista]);
  });
  if (!_minisAct) cargarMinisAct();
}

async function cargarMinisAct() {
  if (_minisAct || _minisPidiendo || document.body.classList.contains('modo-tv')) return;
  if (!document.querySelector('.act-mini[data-lista], .act-mini[data-v]:not([data-t="0"])')) return;
  _minisPidiendo = true;
  try {
    const r = await fetch(`${API}?action=actuaciones-minis&token=${encodeURIComponent(TOKEN)}`);
    const d = await r.json();
    _minisAct = (d.ok && d.data) ? d.data : { l: {}, s: {} };
  } catch (e) { _minisAct = { l: {}, s: {} }; }
  _minisPidiendo = false;
  pintarMinisAct();
}

function filtrarAnio(y, btn) {
  document.querySelectorAll('#year-chips .chip').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('#sevillanas-list .year-group').forEach(g => {
    const ok = !y || g.dataset.year === y;
    g.style.display = ok ? '' : 'none';
    if (ok && y) g.classList.add('open');
  });
}

function renderSevillanas() {
  const grouped = {};
  ACTUACIONES.forEach(a => {
    const y = getYear(a.fecha);
    if (!grouped[y]) grouped[y] = [];
    grouped[y].push(a);
  });
  const years = Object.keys(grouped).sort((a,b) => b - a);
  const chips = document.getElementById('year-chips');
  if (chips) chips.innerHTML = years.length > 1
    ? ['Todas', ...years].map((y, i) => `<button class="chip${i === 0 ? ' active' : ''}" onclick="filtrarAnio('${i === 0 ? '' : y}', this)">${y}</button>`).join('')
    : '';
  document.getElementById('sevillanas-list').innerHTML = years.map(year => `
    <div class="year-group open" data-year="${year}">
      <div class="year-header" onclick="this.closest('.year-group').classList.toggle('open')">
        <span>${year}</span>
        <span style="display:flex;align-items:center;gap:10px">
          <span class="count-badge">${grouped[year].length} ${grouped[year].length>1?'actuaciones':'actuación'}</span>
          <span class="chevron">▼</span>
        </span>
      </div>
      <div class="year-body">${grouped[year].map(a => renderActRow(a)).join('')}</div>
    </div>`).join('');
  pintarMinisAct(document.getElementById('sevillanas-list'));
}

