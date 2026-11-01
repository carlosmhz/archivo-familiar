// ─── PLAYER ───────────────────────────────────────────────────────────────────
function buildEmbedUrl(url, min) {
  if (!url) return null;
  let videoId = '', listId = '';
  const listMatch = url.match(/[?&]list=([^&]+)/);
  if (listMatch) listId = listMatch[1];
  const vMatch = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (vMatch) videoId = vMatch[1];
  let embedUrl = '';
  if (listId && videoId) {
    embedUrl = `https://www.youtube.com/embed/${videoId}?list=${listId}&rel=0&modestbranding=1&autoplay=1&enablejsapi=1`;
  } else if (listId) {
    embedUrl = `https://www.youtube.com/embed/videoseries?list=${listId}&rel=0&modestbranding=1&autoplay=1&enablejsapi=1`;
  } else if (videoId) {
    embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1&enablejsapi=1`;
    if (min) embedUrl += `&start=${min}`;
  } else return null;
  return embedUrl;
}

// Modo escena
let _escenaActiva = null;

function abrirPlayerEscena(caseroId, escenaIdx) {
  const c = CASEROS.find(x => x.id === caseroId);
  if (!c || !c.escenas) return;
  const e = c.escenas[escenaIdx];
  const nextE = c.escenas[escenaIdx + 1] || null;
  _escenaActiva = { caseroId, escenaIdx, finT: nextE ? nextE.t : (c.duracion || null) };
  abrirPlayer(c.youtube, e.titulo, e.fecha, e.t);
}

function siguienteEscena() {
  if (!_escenaActiva) return;
  const nextIdx = _escenaActiva.escenaIdx + 1;
  ocultarPanelEscena();
  abrirPlayerEscena(_escenaActiva.caseroId, nextIdx);
}

function ocultarPanelEscena() {
  const p = document.getElementById('escena-end-panel');
  if (p) p.classList.remove('open');
}

// ─── VÍDEO PROTEGIDO (HLS) ────────────────────────────────────────────────────
// El servidor da direcciones firmadas (stream.php). Los archivos no son públicos.
let _hlsInst = null;      // instancia de hls.js activa
let _urlActual = '';      // URL original del vídeo en reproducción (para compartir)
let _playToken = 0;       // evita que una carga lenta pise a una reproducción más nueva

function detenerHls() {
  if (_hlsInst) { try { _hlsInst.destroy(); } catch (e) {} _hlsInst = null; }
}

async function pedirUrlsVideo(url) {
  try {
    const r = await fetch(`${API}?action=video&token=${encodeURIComponent(TOKEN)}&url=${encodeURIComponent(url)}`);
    const d = await r.json();
    return d.ok ? d.data : { error: d.msg || 'Error' };
  } catch (e) {
    return { error: 'Sin conexión' };
  }
}

// "…/video.mp4#t=1755" (o #t=1:02:03) -> segundo de inicio. Con HLS el navegador ya no lo aplica solo.
function tiempoDeUrl(url) {
  const m = String(url || '').match(/#(?:.*&)?t=(?:npt:)?([\d:.]+)/);
  if (!m) return 0;
  const p = m[1].split(':').map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}

function errorVideo(msg) {
  const txt = /caducada/i.test(msg || '') ? 'Tu sesión ha caducado. Vuelve a entrar.' : 'No se pudo cargar el vídeo (' + (msg || 'error') + ').';
  cerrarPlayer();
  alert(txt);
}

// Arranca el vídeo (HLS si existe, MP4 si no). 'min' = segundo de inicio.
async function reproducirVideo(video, url, min, token) {
  detenerHls();
  const info = await pedirUrlsVideo(url);
  if (token !== _playToken) return;   // se cerró o se abrió otro mientras esperábamos
  if (info.error) { errorVideo(info.error); return; }
  min = min || tiempoDeUrl(url);       // escena (min) manda; si no, el #t= de la URL

  const usarMp4 = (src) => {
    video.src = src;
    if (min) video.currentTime = min;
    video.play().catch(() => {});
  };
  if (info.directo) { usarMp4(url); return; }          // vídeo ajeno a este servidor
  if (!info.hls) { usarMp4(info.mp4); return; }        // aún sin convertir a HLS

  if (window.Hls && Hls.isSupported()) {
    // Chrome, Firefox, Android, Safari de escritorio...: hls.js
    const hls = new Hls({ startPosition: min || -1, maxBufferLength: 40 });
    _hlsInst = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (ev, data) => {
      if (data.fatal && _hlsInst === hls) {
        detenerHls();
        if (token !== _playToken) return;
        if (info.mp4) usarMp4(info.mp4);                // si HLS falla, volvemos al MP4
        else errorVideo('Fallo de reproducción');
      }
    });
    hls.loadSource(info.hls);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // iPhone/iPad antiguos: HLS nativo
    video.src = info.hls;
    if (min) video.addEventListener('loadedmetadata', () => { video.currentTime = min; }, { once: true });
    video.play().catch(() => {});
  } else if (info.mp4) {
    usarMp4(info.mp4);                                  // navegador sin HLS (p. ej. TV antigua)
  } else {
    errorVideo('Navegador no compatible');
  }
}

// ─── Tarjeta desde la que se abre el vídeo ───────────────────────────────────
// Al cerrar el reproductor, su foto "se aleja" a su tamaño normal (css/sala.css).
// Se apunta la última tarjeta pulsada; cualquier otro clic fuera de las ventanas la olvida.
const SEL_TARJETA = '.nf-card, .recent-card, .tl-card, .continue-card, .dia-card';
let _tarjetaPulsada = null, _tarjetaVuelta = null;
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest(SEL_TARJETA);
  if (t) _tarjetaPulsada = t;
  else if (!(e.target.closest && e.target.closest('#caseros-modal, #player-overlay'))) _tarjetaPulsada = null;
}, true);
function animarVuelta() {
  const el = _tarjetaVuelta;
  _tarjetaVuelta = null;
  if (!el || !el.isConnected || document.body.classList.contains('modo-tv')) return;
  el.classList.remove('sala-vuelta');
  void el.offsetWidth;            // reinicia la animación si se repite en la misma tarjeta
  el.classList.add('sala-vuelta');
  clearTimeout(el._salaT);
  el._salaT = setTimeout(() => el.classList.remove('sala-vuelta'), 1800);
}

function abrirPlayer(url, titulo, fecha, min) {
  const iframe = document.getElementById('player-iframe');
  const video = document.getElementById('player-video');
  const loading = document.getElementById('player-loading');
  video.removeAttribute('poster');   // el póster solo sirve para la animación de cierre
  document.getElementById('player-titulo').textContent = titulo;
  _urlActual = url || '';
  const token = ++_playToken;
  // Mostrar botón compartir solo para roles con acceso a caseros y solo MP4
  const shareBtn = document.getElementById('player-share-btn');
  const isMp4 = url && !url.includes('youtube.com') && !url.includes('youtu.be');
  shareBtn.style.setProperty('display', (isMp4 && (ROL === 'caseros' || ROL === 'todo')) ? 'inline-flex' : 'none', 'important');
  document.getElementById('player-fecha').textContent = fecha || '';
  const overlay = document.getElementById('player-overlay');
  if (!overlay.classList.contains('open')) {
    _tarjetaVuelta = _tarjetaPulsada;
    _tarjetaPulsada = null;
    // La página de detrás "retrocede" hacia el centro de lo que se está viendo (ver css/sala.css)
    const vis = document.querySelector('#app > .content-screen.active, #search-results-screen.active, #screen-compartir.active') || document.getElementById('home-screen');
    if (vis) document.documentElement.style.setProperty('--sala-origen-y', Math.round(innerHeight / 2 - vis.getBoundingClientRect().top) + 'px');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loading.classList.remove('hidden');

  ocultarPanelEscena();
  renderEscenasPlayer(url);
  registrarUltimo(url, titulo, fecha, min);
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
  if (isYoutube) {
    loading.classList.add('hidden');
    iframe.style.display = 'block';
    video.style.display = 'none';
    detenerHls();
    video.src = '';
    iframe.src = buildEmbedUrl(url, min) || '';
  } else {
    loading.classList.remove('hidden');
    video.style.display = 'block';
    iframe.style.display = 'none';
    iframe.src = '';
    video.oncanplay = () => loading.classList.add('hidden');
    reproducirVideo(video, url, min, token);
    video.ontimeupdate = function() {
      if (!_escenaActiva) return;
      // Restringir seek fuera del rango si es escena compartida
      if (_escenaActiva.compartido) {
        if (video.currentTime < _escenaActiva.inicioT - 0.5) {
          video.currentTime = _escenaActiva.inicioT;
          return;
        }
      }
      if (!_escenaActiva.finT) return;
      if (video.currentTime >= _escenaActiva.finT - 0.5) {
        video.pause();
        video.ontimeupdate = null;
        const c = CASEROS.find(x => x.id === _escenaActiva.caseroId);
        const isLast = _escenaActiva.escenaIdx >= c.escenas.length - 1;
        const isCompartido = !!_escenaActiva.compartido;
        const nextE = (isLast || isCompartido) ? null : c.escenas[_escenaActiva.escenaIdx + 1];
        document.getElementById('escena-end-title').textContent = 'Fin de escena';
        document.getElementById('escena-end-sub').textContent = nextE ? ('Siguiente: ' + nextE.titulo + ' · ' + nextE.fecha) : '';
        const btnNext = document.getElementById('escena-end-next');
        btnNext.style.display = (isLast || isCompartido) ? 'none' : '';
        // Salir de pantalla completa antes de mostrar el panel
        const showPanel = () => document.getElementById('escena-end-panel').classList.add('open');
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
          exitFs.call(document).then(showPanel).catch(showPanel);
        } else {
          showPanel();
        }
      }
    };
  }
}

function abrirEscenasCasero(id) {
  const c = CASEROS.find(c => c.id === id);
  if (!c || !c.escenas) return;
  function fmt(s) {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    if(h>0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${m}m ${String(sec).padStart(2,'0')}s`;
  }
  const year = parseInt(extraerAnio(c.fecha))||0;
  const tipo = c.tipo === 'cotidiano' ? 'cotidiano' : 'evento';
  document.getElementById('caseros-modal-title').textContent = c.titulo;
  document.getElementById('caseros-modal-sub').textContent = `${c.escenas.length} escenas · Pulsa una para ir a ese momento`;
  document.getElementById('caseros-modal-grid').style.display = '';
  document.getElementById('caseros-modal-grid').style.padding = '12px 16px';
  document.getElementById('caseros-modal-grid').style.display = 'block';
  document.getElementById('caseros-modal-grid').innerHTML =
    `<div style="padding:4px 0 8px;"><button onclick="abrirModalCaseros(${year},'${tipo}')" style="background:none;border:none;color:var(--blue);font-size:13px;font-weight:600;cursor:pointer;padding:6px 0;display:flex;align-items:center;gap:4px;">← Volver</button></div>` +
    `<div style="display:flex;flex-direction:column;gap:0;width:100%;">` +
    c.escenas.map((e, i) => {
      const nextT = i < c.escenas.length - 1 ? c.escenas[i+1].t : null;
      const durStr = nextT !== null ? fmt(nextT - e.t) : (c.duracion ? fmt(c.duracion - e.t) : 'hasta el final');
      return `
      <div onclick="cerrarModalCaseros();abrirPlayerEscena(${c.id},${i})"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--line);width:100%;min-height:52px;"
        onmouseover="this.style.background='var(--row-hover)'" onmouseout="this.style.background=''">
        ${e.miniatura
          ? `<div class="pe-mini"><img src="${e.miniatura}" alt="" loading="lazy" onerror="this.parentNode.classList.add('sin')"><span class="pe-num">${i+1}</span></div>`
          : `<div style="width:26px;height:26px;border-radius:50%;background:var(--row-num);color:var(--sepia);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--dark);margin-bottom:2px;line-height:1.3;">${e.titulo}</div>
          <div style="font-size:11px;color:var(--text-light);">${e.fecha} · ${durStr}</div>
        </div>
        <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${svgIcon('i-play')}</div>
      </div>`;
    }).join('') + '</div>';
  document.getElementById('caseros-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function abrirModalCaseros(year, tipo) {
  const items = CASEROS.filter(c => {
    const y = parseInt(extraerAnio(c.fecha))||0;
    const t = c.tipo === 'cotidiano' ? 'cotidiano' : 'evento';
    return y === year && t === tipo;
  });
  document.getElementById('caseros-modal-title').textContent = `${year} · ${tipo==='cotidiano'?'Vídeos cotidianos':'Eventos'}`;
  document.getElementById('caseros-modal-sub').textContent = `${items.length} vídeos disponibles`;
  document.getElementById('caseros-modal-grid').style.display = '';
  document.getElementById('caseros-modal-grid').style.padding = '';
  const BG = { boda:'var(--th-boda)', comunion:'var(--th-comunion)', cotidiano:'var(--th-cotidiano)', vacaciones:'var(--th-vacaciones)', navidad:'var(--th-navidad)', otros:'var(--th-otros)' };
  document.getElementById('caseros-modal-grid').innerHTML = items.map(c => {
    const tc = thumbClass(c.tipo, c.categoria);
    const ti = thumbIcon(c.tipo, c.categoria);
    const bg = BG[tc] || BG.otros;
    const btn = c.escenas
      ? `<div style="display:flex;gap:6px;margin-top:6px;">
          <div class="mc-btn" style="flex:1;" onclick="cerrarModalCaseros();abrirPlayer('${c.youtube.replace(/'/g,"\\'")}','${c.titulo.replace(/'/g,"\\'")}','${c.fecha||''}',0)">${svgIcon('i-play')}</div>
          <div class="mc-btn" style="flex:1;" onclick="abrirEscenasCasero(${c.id})">${svgIcon('i-list')}</div>
         </div>`
      : c.youtube
        ? `<div class="mc-btn" onclick="cerrarModalCaseros();abrirPlayer('${c.youtube.replace(/'/g,"\\'")}','${c.titulo.replace(/'/g,"\\'")}','${c.fecha||''}',0)">${svgIcon('i-play')} Ver</div>`
        : `<div class="mc-btn" style="background:var(--surface-3);color:var(--text-light);">Próximamente</div>`;
    return `<div class="caseros-modal-card">
      <div class="mc-thumb" style="background:${bg};position:relative;overflow:hidden;">
        ${c.miniatura?`<img src="${c.miniatura}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`:''}
        ${c.miniatura?'':'<span>'+ti+'</span>'}
      </div>
      <div class="mc-body">
        ${c.categoria?`<div class="mc-cat">${c.categoria}</div>`:''}
        <div class="mc-title">${c.titulo}</div>
        <div class="mc-date">${c.fecha||''}</div>
        ${btn}
      </div>
    </div>`;
  }).join('');
  document.getElementById('caseros-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarModalCaseros(e) {
  if (e && e.target !== document.getElementById('caseros-modal')) return;
  document.getElementById('caseros-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function prepararPantallaCompartir(c, escenaIdx) {
  const thumbWrap = document.getElementById('compartir-thumb-wrap');
  const escena = escenaIdx >= 0 && c.escenas ? c.escenas[escenaIdx] : null;
  document.getElementById('compartir-titulo').textContent = c.titulo;
  document.getElementById('compartir-sub').textContent = escena
    ? `Escena: ${escena.titulo} · ${escena.fecha}`
    : (c.fecha || '');
  if (c.miniatura) {
    thumbWrap.innerHTML = `<img class="compartir-thumb" src="${c.miniatura}" alt="${c.titulo}">`;
  } else {
    thumbWrap.innerHTML = `<div class="compartir-thumb-placeholder">${svgIcon('i-film')}</div>`;
  }
}

function mostrarPantallaCompartir() {
  document.getElementById('screen-compartir').classList.add('active');
}

function verDeNuevo() {
  const d = window._compartirData;
  if (!d) return;
  document.getElementById('screen-compartir').classList.remove('active');
  if (d.escenaIdx >= 0 && d.casero.escenas && d.casero.escenas[d.escenaIdx]) {
    _escenaActiva = { caseroId: d.caseroId, escenaIdx: d.escenaIdx, inicioT: d.t,
      finT: d.escenaIdx < d.casero.escenas.length-1 ? d.casero.escenas[d.escenaIdx+1].t : (d.casero.duracion||null), compartido: true };
    abrirPlayer(d.casero.youtube, d.casero.escenas[d.escenaIdx].titulo, d.casero.escenas[d.escenaIdx].fecha, d.t);
  } else {
    abrirPlayer(d.casero.youtube, d.casero.titulo, d.casero.fecha||'', 0);
  }
}

function abrirShareModal() {
  // Pausar vídeo
  const video = document.getElementById('player-video');
  if (video) video.pause();
  const modal = document.getElementById('share-modal');
  const btns = document.getElementById('share-btns');
  const sub = document.getElementById('share-modal-sub');
  // Determinar si hay escena activa
  const c = _escenaActiva ? CASEROS.find(x => x.id === _escenaActiva.caseroId) : null;
  const escena = c && _escenaActiva ? c.escenas[_escenaActiva.escenaIdx] : null;
  if (escena) {
    sub.textContent = `"${c.titulo}" · Escena: ${escena.titulo}`;
    btns.innerHTML = `
      <button class="share-btn escena" onclick="generarYCompartir(${c.id},${_escenaActiva.escenaIdx},${escena.t},false)">Esta escena · 24 h</button>
      <button class="share-btn escena perm" onclick="generarYCompartir(${c.id},${_escenaActiva.escenaIdx},${escena.t},true)">Esta escena · Permanente</button>
      <button class="share-btn full" onclick="generarYCompartir(${c.id},-1,0,false)">Vídeo completo · 24 h</button>
      <button class="share-btn full perm" onclick="generarYCompartir(${c.id},-1,0,true)">Vídeo completo · Permanente</button>
      <button class="share-btn cancel" onclick="cerrarShareModal()">Cancelar</button>`;
  } else {
    // Buscar casero por URL actual
    const videoEl = document.getElementById('player-video');
    const url = _urlActual || (videoEl ? videoEl.src : '');
    const casero = CASEROS.find(c => c.youtube && url.includes(c.youtube.split('#')[0].split('/').pop()));
    if (casero) {
      sub.textContent = `"${casero.titulo}"`;
      btns.innerHTML = `
        <button class="share-btn full" onclick="generarYCompartir(${casero.id},-1,0,false)">Vídeo completo · 24 h</button>
        <button class="share-btn full perm" onclick="generarYCompartir(${casero.id},-1,0,true)">Vídeo completo · Permanente</button>
        <button class="share-btn cancel" onclick="cerrarShareModal()">Cancelar</button>`;
    }
  }
  modal.classList.add('open');
}

function cerrarShareModal() {
  document.getElementById('share-modal').classList.remove('open');
  const video = document.getElementById('player-video');
  if (video && video.src) video.play();
}

async function generarYCompartir(caseroId, escenaIdx, t, permanente = false) {
  cerrarShareModal();
  const r = await fetch(`${API}?action=compartir-generar`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pass: PASS, token: TOKEN, caseroId, escenaIdx, t, permanente })
  });
  const d = await r.json();
  if (!d.ok) { alert('Error al generar el código'); return; }
  const pin = d.data.pin;
  const c = CASEROS.find(x => x.id === caseroId);
  const escena = escenaIdx >= 0 && c && c.escenas ? c.escenas[escenaIdx] : null;
  const detalle = escena ? `la escena "${escena.titulo}" de "${c.titulo}"` : `"${c ? c.titulo : 'un vídeo'}"`;
  const caducidad = permanente ? 'Sin fecha de caducidad' : 'Válido durante 24 horas';
  const msg = `Hola! Te comparto ${detalle} del Archivo Familiar.\n\n🔑 Código de acceso: *${pin}*\n⏱ ${caducidad}\n\n🔗 tinyurl.com/archivo-familiar`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// Al cerrar, el vídeo se aleja (css/sala.css). Para que no se aleje un recuadro negro,
// se deja como póster el último fotograma. Si el navegador no lo permite, no pasa nada.
function congelarFotograma(vid) {
  try {
    if (vid.style.display === 'none' || vid.readyState < 2 || !vid.videoWidth) return;
    const cv = document.createElement('canvas');
    cv.width = Math.min(vid.videoWidth, 960);
    cv.height = Math.round(cv.width * vid.videoHeight / vid.videoWidth);
    cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height);
    vid.poster = cv.toDataURL('image/jpeg', 0.7);
  } catch (err) {}
}

function cerrarPlayer(e) {
  if (e && e.target !== document.getElementById('player-overlay')) return;
  document.getElementById('player-overlay').classList.remove('open');
  document.getElementById('player-iframe').src = '';
  const vid = document.getElementById('player-video');
  congelarFotograma(vid);
  _playToken++;
  detenerHls();
  vid.pause();
  vid.ontimeupdate = null;
  vid.src = '';
  _urlActual = '';
  document.getElementById('player-loading').classList.add('hidden');
  ocultarPanelEscena();
  _escenaActiva = null;
  document.body.style.overflow = '';
  animarVuelta();
  // Si es modo compartir, mostrar pantalla de "ver de nuevo"
  if (window._compartirData) mostrarPantallaCompartir();
}

let searchTimeout;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  if (!val.trim()) { clearSearch(); return; }
  searchTimeout = setTimeout(() => doSearch(val.trim()), 250);
}

function normStr(s) {
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}
function doSearch(q) {
  const lower = normStr(q);
  let results, renderFn, emptyMsg;
  if (currentSection === 'caseros') {
    results = CASEROS.filter(c =>
      normStr(c.titulo).includes(lower) ||
      normStr(c.fecha).includes(lower) ||
      normStr(c.notas).includes(lower) ||
      (c.escenas && c.escenas.some(e => normStr(e.titulo).includes(lower)))
    );
    renderFn = c => `<div class="act-row" onclick="abrirPlayer('${(c.youtube||'').replace(/'/g,"\'")}','${c.titulo.replace(/'/g,"\'")}','${c.fecha||''}',0)" style="cursor:${c.youtube?'pointer':'default'};opacity:${c.youtube?1:0.5}">
      <div class="act-info"><span class="act-name">${c.titulo}</span><span class="act-fecha">${c.fecha||''}</span></div>
      ${c.youtube?'<button class="act-link" aria-label="Ver"><svg class="ico"><use href="#i-play"/></svg></button>':'<span style="font-size:11px;color:var(--text-light)">Próximamente</span>'}
    </div>`;
    emptyMsg = 'No se encontró ningún vídeo.';
  } else {
    results = ACTUACIONES.filter(a =>
      normStr(a.act).includes(lower) ||
      (a.kw && normStr(a.kw).includes(lower)) ||
      (a.fecha && normStr(a.fecha).includes(lower))
    );
    renderFn = a => renderActRow(a, true);
    emptyMsg = 'No se encontró ninguna actuación.';
  }
  document.getElementById('home-screen').style.display = 'none';
  document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
  const sr = document.getElementById('search-results-screen');
  sr.classList.add('active');
  document.getElementById('result-count').textContent = `${results.length} resultado${results.length!==1?'s':''} para "${q}"`;
  document.getElementById('search-results-list').innerHTML = results.length
    ? results.map(renderFn).join('')
    : `<p style="color:var(--text-light);font-size:14px">${emptyMsg}</p>`;
}

function clearSearch() {
  document.getElementById('search-box').value = '';
  document.getElementById('search-results-screen').classList.remove('active');
  if (currentSection === 'home') document.getElementById('home-screen').style.display = '';
  else document.getElementById('screen-'+currentSection).classList.add('active');
}

