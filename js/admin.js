const API = 'api.php';
let PASS = '';
let todosActuaciones = [];

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function doLogin() {
  const p = document.getElementById('pwd').value;
  const r = await fetch(`${API}?action=login&pass=${encodeURIComponent(p)}`);
  const d = await r.json();
  if (d.ok && d.data.rol === 'admin') {
    PASS = p;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    setTimeout(() => document.getElementById('login-screen').style.display='none', 600);
    cargarDatos();
  } else {
    document.getElementById('login-error').textContent = d.msg || 'Contraseña incorrecta';
    document.getElementById('pwd').value = '';
  }
}
document.getElementById('pwd').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

function logout() { location.reload(); }

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  if (name === 'otp') cargarOTPs();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
  if (name === 'lista') renderLista();
  if (name === 'urls') renderUrls();
  if (name === 'caseros') filtrarCaseros();
  if (name === 'comentarios') cargarComentariosAdmin();   // js/admin-comentarios.js
}

// ─── DATOS ────────────────────────────────────────────────────────────────────
async function cargarDatos() {
  const r = await fetch(`${API}?action=listar&pass=${encodeURIComponent(PASS)}`);
  const d = await r.json();
  if (d.ok) {
    todosActuaciones = d.data;
    poblarFiltros();
  }
  await cargarCaseros();
}

function poblarFiltros() {
  const years = [...new Set(todosActuaciones.map(a => a.fecha ? String(a.fecha).slice(0,4) : null).filter(Boolean))].sort((a,b) => b-a);
  const sel = document.getElementById('lista-year');
  sel.innerHTML = '<option value="">Todos los años</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
}

// ─── LISTA ────────────────────────────────────────────────────────────────────
function filtrarLista() {
  const q = document.getElementById('lista-search').value.toLowerCase();
  const y = document.getElementById('lista-year').value;
  const yt = document.getElementById('lista-yt').value;
  const filtered = todosActuaciones.filter(a => {
    if (q && !a.act.toLowerCase().includes(q) && !(a.kw||'').toLowerCase().includes(q)) return false;
    if (y && !(a.fecha||'').toString().startsWith(y)) return false;
    if (yt === 'si' && !a.youtube) return false;
    if (yt === 'no' && a.youtube) return false;
    return true;
  });
  renderListaFiltered(filtered);
}

function renderLista() {
  filtrarLista();
}

function renderListaFiltered(lista) {
  const body = document.getElementById('lista-body');
  if (!lista.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#5a7299">Sin resultados</td></tr>';
    document.getElementById('lista-count').textContent = '';
    return;
  }
  body.innerHTML = lista.map(a => `
    <tr>
      <td><span class="tag-yt ${a.youtube?'':'off'}" title="${a.youtube?'Con YouTube':'Sin YouTube'}"></span></td>
      <td style="font-weight:700;color:#2056a8">${a.archivo}</td>
      <td style="color:#5a7299;font-size:12px">${formatFecha(a.fecha)}</td>
      <td>${a.act}</td>
      <td style="font-family:monospace;font-size:12px">${a.min!=null?formatTiempo(a.min):'-'}</td>
      <td class="tag-kw">${a.kw||''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-edit" onclick="abrirEditar(${a.id})">✏️</button>
        <button class="btn btn-danger" onclick="eliminar(${a.id},'${a.act.replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    </tr>`).join('');
  document.getElementById('lista-count').textContent = `${lista.length} actuación${lista.length!==1?'es':''}`;
}

// ─── URLs ─────────────────────────────────────────────────────────────────────
function renderUrls() {
  const archivos = [...new Set(todosActuaciones.map(a => a.archivo))].sort((a,b)=>a-b);
  // Para cada archivo, tomamos la youtube de la primera actuación con youtube
  const urlMap = {};
  todosActuaciones.forEach(a => { if(a.youtube && !urlMap[a.archivo]) urlMap[a.archivo] = a.youtube; });

  document.getElementById('urls-list').innerHTML = archivos.map(n => `
    <div class="url-row">
      <span class="url-num">Archivo ${n}</span>
      <input type="text" class="url-input" id="url-${n}" value="${urlMap[n]||''}" placeholder="https://www.youtube.com/watch?v=...">
      <span class="url-status ${urlMap[n]?'linked':''}" id="url-status-${n}">${urlMap[n]?'✓ Enlazado':'Sin URL'}</span>
      <button class="btn btn-primary" style="font-size:11px;padding:6px 12px" onclick="guardarUrl(${n})">Guardar</button>
    </div>`).join('');
}

async function guardarUrl(archivo) {
  const url = document.getElementById('url-'+archivo).value.trim();
  const r = await fetch(`${API}?action=youtube`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({pass:PASS, archivo, url})
  });
  const d = await r.json();
  if (d.ok) {
    const st = document.getElementById('url-status-'+archivo);
    st.textContent = url ? '✓ Enlazado' : 'Sin URL';
    st.className = 'url-status ' + (url?'linked':'');
    mostrarMsg('msg-urls', 'Guardado correctamente', true);
    await cargarDatos();
  } else {
    mostrarMsg('msg-urls', d.msg, false);
  }
}

// ─── AÑADIR ───────────────────────────────────────────────────────────────────
async function añadirActuacion() {
  const datos = {
    pass: PASS,
    archivo: document.getElementById('f-archivo').value,
    fecha: document.getElementById('f-fecha').value,
    act: document.getElementById('f-act').value,
    min: document.getElementById('f-min').value,
    kw: document.getElementById('f-kw').value,
    youtube: document.getElementById('f-youtube').value,
  };
  if (!datos.act.trim()) { mostrarMsg('msg-nueva','El nombre es obligatorio',false); return; }
  const r = await fetch(`${API}?action=anadir`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos)
  });
  const d = await r.json();
  if (d.ok) {
    mostrarMsg('msg-nueva','Actuación añadida correctamente',true);
    ['f-archivo','f-fecha','f-act','f-min','f-kw','f-youtube'].forEach(id => document.getElementById(id).value='');
    await cargarDatos();
  } else {
    mostrarMsg('msg-nueva', d.msg, false);
  }
}

// ─── EDITAR ───────────────────────────────────────────────────────────────────
function abrirEditar(id) {
  const a = todosActuaciones.find(x => x.id===id);
  if (!a) return;
  document.getElementById('edit-id').value = a.id;
  document.getElementById('edit-archivo').value = a.archivo;
  document.getElementById('edit-fecha').value = a.fecha||'';
  document.getElementById('edit-act').value = a.act;
  document.getElementById('edit-min').value = a.min!=null?a.min:'';
  document.getElementById('edit-kw').value = a.kw||'';
  document.getElementById('edit-youtube').value = a.youtube||'';
  document.getElementById('msg-edit').className = 'form-msg';
  document.getElementById('modal-editar').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal-editar').classList.remove('open');
}

async function guardarEdicion() {
  const datos = {
    pass: PASS,
    id: parseInt(document.getElementById('edit-id').value),
    archivo: document.getElementById('edit-archivo').value,
    fecha: document.getElementById('edit-fecha').value,
    act: document.getElementById('edit-act').value,
    min: document.getElementById('edit-min').value,
    kw: document.getElementById('edit-kw').value,
    youtube: document.getElementById('edit-youtube').value,
  };
  const r = await fetch(`${API}?action=editar`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos)
  });
  const d = await r.json();
  if (d.ok) {
    mostrarMsg('msg-edit','Guardado correctamente',true);
    await cargarDatos();
    setTimeout(cerrarModal, 1000);
  } else {
    mostrarMsg('msg-edit', d.msg, false);
  }
}

// ─── ELIMINAR ─────────────────────────────────────────────────────────────────
async function eliminar(id, nombre) {
  if (!await confirmar(`Vas a eliminar "${nombre}". Esta acción no se puede deshacer.`, { titulo: '¿Eliminar actuación?', aceptar: 'Eliminar', peligro: true })) return;
  const r = await fetch(`${API}?action=eliminar`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pass:PASS, id})
  });
  const d = await r.json();
  if (d.ok) {
    await cargarDatos();
    filtrarLista();
  }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function formatFecha(f) {
  if (!f) return '—';
  if (/^\d{4}$/.test(String(f))) return f;
  const p = String(f).split('-');
  if (p.length < 3) return f;
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(p[2])} ${m[parseInt(p[1])-1]} ${p[0]}`;
}

function formatTiempo(s) {
  if (s==null) return '-';
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function mostrarMsg(id, texto, ok) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = 'form-msg ' + (ok?'ok':'err');
  setTimeout(() => el.className='form-msg', 3500);
}

// Cerrar modal al clicar fuera
document.getElementById('modal-editar').addEventListener('click', function(e) {
  if (e.target === this) cerrarModal();
});

// ─── CASEROS ──────────────────────────────────────────────────────────────────
let todosCaseros = [];

async function cargarCaseros() {
  const r = await fetch(`${API}?action=caseros-listar&pass=${encodeURIComponent(PASS)}`);
  const d = await r.json();
  if (d.ok) { todosCaseros = d.data; filtrarCaseros(); }
}

function toggleCaseroTipo() {
  const tipo = document.getElementById('c-tipo').value;
  document.getElementById('c-grupo-categoria').style.display = tipo === 'evento' ? '' : 'none';
}

function filtrarCaseros() {
  const tipo = document.getElementById('c-filtro-tipo').value;
  const lista = tipo ? todosCaseros.filter(c => c.tipo === tipo) : todosCaseros;
  const body = document.getElementById('caseros-body');
  if (!lista.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#5a7299">Sin vídeos aún</td></tr>';
    document.getElementById('caseros-count').textContent = '';
    return;
  }
  body.innerHTML = lista.map(c => `
    <tr>
      <td><span class="tag-yt ${c.youtube?'':'off'}"></span></td>
      <td style="font-size:11px;font-weight:700;color:#5a7299;text-transform:uppercase">${c.tipo}</td>
      <td>${c.titulo}</td>
      <td style="color:#5a7299;font-size:12px">${c.fecha||'—'}</td>
      <td style="font-size:12px">${c.categoria||'—'}</td>
      <td class="tag-kw">${c.notas||''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-edit" onclick="abrirEditarCasero(${c.id})">✏️</button>
        <button class="btn btn-danger" onclick="eliminarCasero(${c.id},'${c.titulo.replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    </tr>`).join('');
  document.getElementById('caseros-count').textContent = `${lista.length} vídeo${lista.length!==1?'s':''}`;
}

async function añadirCasero() {
  const datos = {
    pass: PASS,
    tipo: document.getElementById('c-tipo').value,
    titulo: document.getElementById('c-titulo').value,
    fecha: document.getElementById('c-fecha').value,
    categoria: document.getElementById('c-categoria').value,
    youtube: document.getElementById('c-youtube').value,
    notas: document.getElementById('c-notas').value,
  };
  if (!datos.titulo.trim()) { mostrarMsg('msg-casero-nueva','El título es obligatorio',false); return; }
  const r = await fetch(`${API}?action=caseros-anadir`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos)
  });
  const d = await r.json();
  if (d.ok) {
    mostrarMsg('msg-casero-nueva','Vídeo añadido correctamente',true);
    ['c-titulo','c-fecha','c-youtube','c-notas'].forEach(id => document.getElementById(id).value='');
    await cargarCaseros();
  } else {
    mostrarMsg('msg-casero-nueva', d.msg, false);
  }
}

function abrirEditarCasero(id) {
  const c = todosCaseros.find(x => x.id===id);
  if (!c) return;
  document.getElementById('ec-id').value = c.id;
  document.getElementById('ec-tipo').value = c.tipo;
  document.getElementById('ec-titulo').value = c.titulo;
  document.getElementById('ec-fecha').value = c.fecha||'';
  document.getElementById('ec-categoria').value = c.categoria||'Boda';
  document.getElementById('ec-youtube').value = c.youtube||'';
  document.getElementById('ec-notas').value = c.notas||'';
  toggleEditCaseroTipo();
  const dur = c.duracion || 0;
  const dh = Math.floor(dur/3600), dm = Math.floor((dur%3600)/60), ds = dur%60;
  document.getElementById('ec-duracion').value = dur ? `${dh}:${String(dm).padStart(2,'0')}:${String(ds).padStart(2,'0')}` : '';
  renderEscenas(c.escenas || []);
  document.getElementById('msg-edit-casero').className = 'form-msg';
  document.getElementById('modal-casero').classList.add('open');
}

function renderEscenas(escenas) {
  const list = document.getElementById('ec-escenas-list');
  if (!escenas.length) {
    list.innerHTML = '<p style="font-size:12px;color:#aab;font-style:italic;margin-bottom:8px;">Sin escenas definidas</p>';
    return;
  }
  list.innerHTML = escenas.map((e, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;" id="escena-row-${i}">
      <input type="text" value="${e.titulo}" placeholder="Título"
        style="flex:2;padding:6px 10px;border:1px solid #dce9fb;border-radius:4px;font-size:12px;font-family:'Lato',sans-serif;"
        id="es-titulo-${i}">
      <input type="text" value="${e.fecha}" placeholder="Fecha"
        style="flex:1;padding:6px 10px;border:1px solid #dce9fb;border-radius:4px;font-size:12px;font-family:'Lato',sans-serif;"
        id="es-fecha-${i}">
      <input type="text" value="${secsToHMS(e.t)}" placeholder="0:00:00"
        style="width:80px;padding:6px 10px;border:1px solid #dce9fb;border-radius:4px;font-size:12px;font-family:'Lato',sans-serif;text-align:center;"
        id="es-tiempo-${i}">
      <button onclick="removeEscena(${i})" style="background:#8b2020;color:white;border:none;border-radius:4px;padding:5px 8px;cursor:pointer;font-size:11px;flex-shrink:0;">✕</button>
    </div>`).join('');
}

function secsToHMS(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function hmsToSecs(str) {
  const p = str.split(':').map(Number);
  if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
  if (p.length === 2) return p[0]*60 + p[1];
  return parseInt(str)||0;
}

function getEscenasFromForm() {
  const rows = document.querySelectorAll('[id^="escena-row-"]');
  return Array.from(rows).map((row, i) => ({
    titulo: document.getElementById(`es-titulo-${i}`).value.trim(),
    fecha: document.getElementById(`es-fecha-${i}`).value.trim(),
    t: hmsToSecs(document.getElementById(`es-tiempo-${i}`).value.trim())
  })).filter(e => e.titulo);
}

function addEscena() {
  const current = getEscenasFromForm();
  current.push({ titulo:'', fecha:'', t:0 });
  renderEscenas(current);
  setTimeout(() => document.getElementById(`es-titulo-${current.length-1}`)?.focus(), 50);
}

function removeEscena(idx) {
  const current = getEscenasFromForm();
  current.splice(idx, 1);
  renderEscenas(current);
}

function toggleEditCaseroTipo() {
  const tipo = document.getElementById('ec-tipo').value;
  document.getElementById('ec-grupo-categoria').style.display = tipo === 'evento' ? '' : 'none';
}

function cerrarModalCasero() {
  document.getElementById('modal-casero').classList.remove('open');
}

async function guardarEdicionCasero() {
  const datos = {
    pass: PASS,
    id: parseInt(document.getElementById('ec-id').value),
    tipo: document.getElementById('ec-tipo').value,
    titulo: document.getElementById('ec-titulo').value,
    fecha: document.getElementById('ec-fecha').value,
    categoria: document.getElementById('ec-categoria').value,
    youtube: document.getElementById('ec-youtube').value,
    notas: document.getElementById('ec-notas').value,
    duracion: hmsToSecs(document.getElementById('ec-duracion').value) || null,
    escenas: getEscenasFromForm().length > 0 ? getEscenasFromForm() : null,
  };
  const r = await fetch(`${API}?action=caseros-editar`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos)
  });
  const d = await r.json();
  if (d.ok) {
    mostrarMsg('msg-edit-casero','Guardado correctamente',true);
    await cargarCaseros();
    setTimeout(cerrarModalCasero, 1000);
    // Miniaturas de las escenas nuevas o cambiadas (en segundo plano)
    const editado = todosCaseros.find(x => x.id === datos.id);
    if (editado && editado.escenas && editado.escenas.some(e => !e.miniatura)) generarMinisDe([editado], false);
  } else {
    mostrarMsg('msg-edit-casero', d.msg, false);
  }
}


// ─── MINIATURAS DE ESCENAS ────────────────────────────────────────────────────
// Se abre el vídeo en un <video> oculto, se salta al segundo elegido, se captura el
// fotograma en un <canvas> y se sube a api.php (action=miniatura-escena).
let _miniOcupado = false;
function miniMsg(txt, ok) {
  const el = document.getElementById('mini-msg');
  if (!el) return;
  el.textContent = txt;
  el.className = 'form-msg' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  el.style.display = 'inline-block';
}
function cargarHlsJs() {
  if (window.Hls) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/hls.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('No se pudo cargar hls.min.js'));
    document.head.appendChild(sc);
  });
}
function esperar(el, ev, ms) {
  return new Promise((res, rej) => {
    const ok = () => { clearTimeout(tm); el.removeEventListener(ev, ok); el.removeEventListener('error', ko); res(); };
    const ko = () => { clearTimeout(tm); el.removeEventListener(ev, ok); el.removeEventListener('error', ko); rej(new Error('Error al leer el vídeo')); };
    const tm = setTimeout(() => { el.removeEventListener(ev, ok); el.removeEventListener('error', ko); rej(new Error('El vídeo tarda demasiado')); }, ms);
    el.addEventListener(ev, ok); el.addEventListener('error', ko);
  });
}
async function abrirVideoOculto(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) throw new Error('Los vídeos de YouTube no permiten sacar fotogramas');
  const r = await fetch(`${API}?action=video&pass=${encodeURIComponent(PASS)}&url=${encodeURIComponent(url)}`);
  const d = await r.json();
  if (!d.ok) throw new Error(d.msg || 'Sin acceso al vídeo');
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;';
  document.body.appendChild(v);
  let hls = null;
  const info = d.data || {};
  if (info.directo) { v.src = url; }
  else if (info.mp4) { v.src = info.mp4; }
  else if (info.hls) {
    if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = info.hls;
    else { await cargarHlsJs(); hls = new Hls({ maxBufferLength: 8 }); hls.loadSource(info.hls); hls.attachMedia(v); }
  } else throw new Error('Vídeo no encontrado en el servidor');
  await esperar(v, 'loadedmetadata', 30000);
  return { v, cerrar: () => { try { hls && hls.destroy(); } catch (e) {} v.removeAttribute('src'); v.load(); v.remove(); } };
}
async function capturar(v, seg) {
  v.currentTime = Math.max(0, Math.min(seg, (v.duration || seg + 2) - 1));
  await esperar(v, 'seeked', 30000);
  await new Promise(r => setTimeout(r, 250));
  const w = 640, h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(v, 0, 0, w, h);
  // brillo medio para descartar fotogramas negros
  const px = ctx.getImageData(0, 0, w, h).data;
  let suma = 0, n = 0;
  for (let i = 0; i < px.length; i += 4 * 97) { suma += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; n++; }
  return { dataUrl: cv.toDataURL('image/jpeg', 0.82), brillo: suma / n };
}
async function generarMinisDe(lista, rehacer) {
  if (_miniOcupado) { miniMsg('Ya se están generando miniaturas, espera a que termine.'); return; }
  _miniOcupado = true;
  const btn = document.getElementById('mini-btn'); if (btn) btn.disabled = true;
  const prev = document.getElementById('mini-preview');
  const offset = Math.max(0, parseInt(document.getElementById('mini-offset')?.value) || 30);
  let hechas = 0, fallos = 0, total = 0;
  lista.forEach(c => (c.escenas || []).forEach(e => { if (rehacer || !e.miniatura) total++; }));
  if (!total) { miniMsg('Todas las escenas ya tienen miniatura.', true); _miniOcupado = false; if (btn) btn.disabled = false; return; }
  for (const c of lista) {
    const pend = (c.escenas || []).map((e, i) => ({ e, i })).filter(x => rehacer || !x.e.miniatura);
    if (!pend.length || !c.youtube) continue;
    let vid = null;
    try {
      miniMsg(`Abriendo «${c.titulo}»… (${hechas + fallos}/${total})`);
      vid = await abrirVideoOculto(c.youtube);
      for (const { e, i } of pend) {
        miniMsg(`«${c.titulo}» · ${e.titulo} (${hechas + fallos + 1}/${total})`);
        try {
          const sig = c.escenas[i + 1];
          const fin = sig ? sig.t : (c.duracion || vid.v.duration || e.t + offset * 2);
          const largo = Math.max(1, fin - e.t);
          let seg = e.t + Math.min(offset, Math.floor(largo / 2));
          let cap = await capturar(vid.v, seg);
          for (let intento = 0; intento < 3 && cap.brillo < 18 && seg + 10 < fin; intento++) {   // muy oscuro: probar un poco después
            seg += 10; cap = await capturar(vid.v, seg);
          }
          const r = await fetch(`${API}?action=miniatura-escena`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pass: PASS, caseroId: c.id, t: e.t, imagen: cap.dataUrl })
          });
          const d = await r.json();
          if (!d.ok) throw new Error(d.msg);
          e.miniatura = d.data.miniatura;
          hechas++;
          if (prev) prev.insertAdjacentHTML('afterbegin', `<img src="${d.data.miniatura}" title="${c.titulo} · ${e.titulo}" style="width:120px;height:68px;object-fit:cover;border-radius:6px">`);
        } catch (err) {
          fallos++;
          if (/SecurityError|tainted/i.test(String(err))) throw new Error('El navegador no deja capturar este vídeo');
        }
      }
    } catch (err) {
      fallos += pend.filter(x => !x.e.miniatura).length;
      miniMsg(`«${c.titulo}»: ${err.message}`, false);
      await new Promise(r => setTimeout(r, 1500));
    } finally {
      if (vid) vid.cerrar();
    }
  }
  miniMsg(`Listo: ${hechas} miniatura${hechas !== 1 ? 's' : ''} generada${hechas !== 1 ? 's' : ''}` + (fallos ? `, ${fallos} con error` : '') + '.', fallos ? false : true);
  _miniOcupado = false; if (btn) btn.disabled = false;
}
function generarMinisTodas() {
  const rehacer = document.getElementById('mini-rehacer').checked;
  generarMinisDe(todosCaseros.filter(c => c.escenas && c.escenas.length), rehacer);
}

async function eliminarCasero(id, titulo) {
  if (!await confirmar(`Vas a eliminar "${titulo}". Esta acción no se puede deshacer.`, { titulo: '¿Eliminar vídeo?', aceptar: 'Eliminar', peligro: true })) return;
  const r = await fetch(`${API}?action=caseros-eliminar`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pass:PASS, id})
  });
  const d = await r.json();
  if (d.ok) { await cargarCaseros(); }
}


// Auto-login desde URL
window.addEventListener('load', async () => {
  const urlPass = new URLSearchParams(window.location.search).get('pass');
  if (!urlPass) return;
  history.replaceState({}, '', 'admin.html');
  const r = await fetch(`${API}?action=login&pass=${encodeURIComponent(urlPass)}`);
  const d = await r.json();
  if (d.ok && d.data.rol === 'admin') {
    PASS = urlPass;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    setTimeout(() => document.getElementById('login-screen').style.display='none', 700);
    await cargarDatos();
  }
});

function compartirWA() {
  const url = 'https://wa.me/?text=' + encodeURIComponent(window._otpMsg || '');
  window.open(url, '_blank');
}

document.getElementById('modal-casero').addEventListener('click', function(e) {
  if (e.target === this) cerrarModalCasero();
});

// ─── OTP ──────────────────────────────────────────────────────────────────────
async function crearOTP() {
  const rol = document.getElementById('otp-rol').value;
  const r = await fetch(`${API}?action=otp-crear`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pass: PASS, rol })
  });
  const d = await r.json();
  if (d.ok) {
    document.getElementById('otp-pass').textContent = d.data.otp;
    document.getElementById('otp-resultado').style.display = 'block';
    const roles = { caseros: 'vídeos caseros', actuaciones: 'actuaciones de sevillanas', todo: 'vídeos y actuaciones' };
    window._otpMsg = `Hola! Te comparto acceso al Archivo Familiar de vídeos.\n\n🔑 Contraseña: *${d.data.otp}*\n📂 Acceso: ${roles[d.data.rol]||d.data.rol}\n⏱ Válida 24 horas (un solo uso)\n\n🔗 tinyurl.com/archivo-familiar`;
    cargarOTPs();
  }
}

function copiarOTP() {
  const txt = document.getElementById('otp-pass').textContent;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = event.target;
    btn.textContent = '¡Copiado!';
    setTimeout(() => btn.textContent = 'Copiar', 2000);
  });
}

async function cargarOTPs() {
  const r = await fetch(`${API}?action=otp-listar&pass=${encodeURIComponent(PASS)}`);
  const d = await r.json();
  const el = document.getElementById('otp-lista');
  if (!d.ok || !d.data.length) {
    el.innerHTML = '<p style="font-size:13px;color:#aab;">No hay contraseñas activas</p>';
    return;
  }
  const roles = { caseros: 'Vídeos caseros', actuaciones: 'Actuaciones', todo: 'Todo' };
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="border-bottom:2px solid #dce9fb;">
      <th style="text-align:left;padding:8px 4px;color:#5a7299;font-weight:700;letter-spacing:1px;font-size:11px;text-transform:uppercase;">Contraseña</th>
      <th style="text-align:left;padding:8px 4px;color:#5a7299;font-weight:700;letter-spacing:1px;font-size:11px;text-transform:uppercase;">Acceso</th>
      <th style="text-align:left;padding:8px 4px;color:#5a7299;font-weight:700;letter-spacing:1px;font-size:11px;text-transform:uppercase;">Caduca</th>
      <th></th>
    </tr></thead>
    <tbody>${d.data.map(o => {
      const fecha = new Date(o.expira * 1000).toLocaleString('es-ES');
      return `<tr style="border-bottom:1px solid #eef2f8;">
        <td style="padding:8px 4px;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:2px;">${o.pass}</td>
        <td style="padding:8px 4px;color:#1a2a4a;">${roles[o.rol]||o.rol}</td>
        <td style="padding:8px 4px;color:#5a7299;font-size:11px;">${fecha}</td>
        <td style="padding:8px 4px;"><button onclick="eliminarOTP('${o.pass}')" class="btn btn-danger">✕</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function eliminarOTP(otp) {
  await fetch(`${API}?action=otp-eliminar`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ pass: PASS, otp })
  });
  cargarOTPs();
}
