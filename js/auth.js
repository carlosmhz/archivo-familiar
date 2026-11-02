// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function checkLogin() {
  const p = document.getElementById('pwd-input').value;
  const r = await fetch(`${API}?action=login&pass=${encodeURIComponent(p)}`);
  const d = await r.json();
  if (d.ok) {
    PASS = p;
    ROL = d.data.rol;
    TOKEN = d.data.token || '';
    // Admin → redirigir a admin.html
    if (ROL === 'admin') { window.location.href = 'admin.html?pass=' + encodeURIComponent(p); return; }
    // Invitado con PIN (un vídeo o una selección): también se recuerda, para que recargar no lo saque
    if (ROL === 'compartir-lista' || ROL.startsWith('compartir:')) {
      LISTA_COMPARTIDA = d.data.lista || { items: [] };
      guardarSesion();
      await entrarCompartido();
      return;
    }
    guardarSesion();
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    setTimeout(() => document.getElementById('login-screen').style.display='none', 700);
    await cargarDatos();
    aplicarRol();
  } else {
    document.getElementById('login-error').textContent = 'Contraseña incorrecta';
    document.getElementById('pwd-input').value = '';
    setTimeout(() => document.getElementById('login-error').textContent='', 2500);
  }
}

// Entrada del invitado (PIN de compartir). La usan el login y restaurarSesion().
let LISTA_COMPARTIDA = null;
async function entrarCompartido() {
  document.body.classList.add('rol-compartir');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.add('visible');
  setTimeout(() => document.getElementById('login-screen').style.display='none', 700);
  await cargarDatos();
  // Selección compartida → pantalla con sus fragmentos
  if (ROL === 'compartir-lista') {
    iniciarListaCompartida(LISTA_COMPARTIDA || { items: [] });
    return;
  }
  // Un vídeo o una escena → directo al reproductor
  const parts = ROL.split(':');
  const caseroId = parseInt(parts[1]);
  const escenaIdx = parseInt(parts[2]);
  const t = parseInt(parts[3]);
  const c = CASEROS.find(x => x.id === caseroId);
  if (c) {
    // Guardar datos para pantalla de "ver de nuevo"
    window._compartirData = { caseroId, escenaIdx, t, casero: c };
    prepararPantallaCompartir(c, escenaIdx);
    if (escenaIdx >= 0 && c.escenas && c.escenas[escenaIdx]) {
      _escenaActiva = { caseroId, escenaIdx, inicioT: t, finT: escenaIdx < c.escenas.length-1 ? c.escenas[escenaIdx+1].t : (c.duracion||null), compartido: true };
      abrirPlayer(c.youtube, c.escenas[escenaIdx].titulo, c.escenas[escenaIdx].fecha, t);
    } else {
      abrirPlayer(c.youtube, c.titulo, c.fecha||'', 0);
    }
    document.getElementById('home-screen').style.display = 'none';
  }
}

// ─── SESIÓN RECORDADA ─────────────────────────────────────────────────────────
// Se guarda solo el token firmado (24 h), nunca la contraseña. "Salir" lo borra.
// Se guarda en localStorage y además en una cookie: el navegador interno de algunas
// apps Android trae el almacenamiento local desactivado, pero sí acepta cookies.
// Los invitados con PIN también se recuerdan (mismo token de 24 h); en una selección se guarda
// además la lista de fragmentos, que solo llega en el login.
function rutaCookie() { return location.pathname.replace(/[^/]*$/, '') || '/'; }
function leerCookie(n) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function guardarSesion() {
  const s = { rol: ROL, token: TOKEN, hasta: Date.now() + 23 * 3600 * 1000 };
  if (ROL === 'compartir-lista') s.lista = LISTA_COMPARTIDA;
  const v = JSON.stringify(s);
  try { localStorage.setItem('af_sesion', v); } catch (e) {}
  try {
    document.cookie = 'af_sesion=' + encodeURIComponent(v) + '; max-age=' + (23 * 3600) + '; path=' + rutaCookie() +
      '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {}
}
function borrarSesion() {
  try { localStorage.removeItem('af_sesion'); } catch (e) {}
  try { document.cookie = 'af_sesion=; max-age=0; path=' + rutaCookie(); } catch (e) {}
}
async function restaurarSesion() {
  let s = null, raw = null;
  try { raw = localStorage.getItem('af_sesion'); } catch (e) {}
  if (!raw) { try { raw = leerCookie('af_sesion'); } catch (e) {} }
  try { s = JSON.parse(raw || 'null'); } catch (e) {}
  if (!s || !s.token || !s.rol || !(s.hasta > Date.now())) { if (s) borrarSesion(); return; }
  try {
    const r = await fetch(`${API}?action=caseros-listar&token=${encodeURIComponent(s.token)}`);
    const d = await r.json();
    if (!d.ok) { borrarSesion(); return; }          // caducada o no válida: pantalla de entrada
  } catch (e) { return; }                            // sin conexión: pantalla de entrada
  ROL = s.rol; TOKEN = s.token;
  if (String(ROL).startsWith('compartir')) { LISTA_COMPARTIDA = s.lista || null; await entrarCompartido(); return; }
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.add('visible');
  setTimeout(() => document.getElementById('login-screen').style.display = 'none', 700);
  await cargarDatos();
  aplicarRol();
}
window.addEventListener('DOMContentLoaded', restaurarSesion);

// Todos los roles entran por el inicio. Quien solo ve una parte (caseros o actuaciones)
// tiene un inicio adaptado: solo su colección, y en el menú solo Inicio y su sección.
// En la tele (?tv=1) se mantiene lo de siempre: quien solo ve una parte entra directo en ella.
function aplicarRol() {
  document.body.classList.remove('rol-todo', 'rol-caseros', 'rol-actuaciones');
  document.body.classList.add(ROL === 'caseros' ? 'rol-caseros' : ROL === 'actuaciones' ? 'rol-actuaciones' : 'rol-todo');
  const cardSev = document.querySelector('.section-card[onclick*="sevillanas"]');
  const cardCas = document.querySelector('.section-card[onclick*="caseros"]');
  if (cardSev) cardSev.style.display = ROL === 'caseros' ? 'none' : '';
  if (cardCas) cardCas.style.display = ROL === 'actuaciones' ? 'none' : '';
  const solo = ROL === 'caseros' ? 'caseros' : ROL === 'actuaciones' ? 'sevillanas' : null;
  if (typeof selPintarBarra === 'function') selPintarBarra();   // barra de la selección (js/seleccion.js)
  if (solo && document.body.classList.contains('modo-tv')) { showSection(solo); return; }
  goHome();
}
document.getElementById('pwd-input').addEventListener('keydown', e => { if(e.key==='Enter') checkLogin(); });

// Bloquear menú contextual en el reproductor de vídeo
document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('player-video');
  if (video) {
    video.addEventListener('contextmenu', e => e.preventDefault());
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/videos/sw.js')
      .catch(err => console.log('SW error:', err));
  });
}
function logout() { borrarSesion(); location.reload(); }


