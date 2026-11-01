// ─── TEMA CLARO / OSCURO ──────────────────────────────────────────────────────
function cambiarTema() {
  const claro = document.body.classList.toggle('tema-claro');
  try { localStorage.setItem('af_tema', claro ? 'claro' : 'oscuro'); } catch (e) {}
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.content = claro ? '#F4EFE6' : '#12110E');
  document.querySelectorAll('.tema-btn').forEach(b => b.setAttribute('aria-label', claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'));
}

// ─── BOTÓN ATRÁS DEL MÓVIL ────────────────────────────────────────────────────
// Cada cosa que se abre (sección, búsqueda, vídeo, escenas, compartir) deja un paso
// en el historial, así "Atrás" cierra lo último abierto en vez de salir de la app.
(function () {
  if (new URLSearchParams(location.search).get('tv') === '1') return;   // la TV tiene su propio manejo
  let desdeAtras = false, ignorar = 0, atrasPendiente = null;
  const estado = () => (history.state && history.state.af) || null;
  function apilar(tag) {
    if (atrasPendiente) { clearTimeout(atrasPendiente); atrasPendiente = null; history.replaceState({ af: tag }, ''); return; }
    history.pushState({ af: tag }, '');
  }
  function sustituirOApilar(tag, sustituibles) {
    if (sustituibles.includes(estado()) && !atrasPendiente) history.replaceState({ af: tag }, '');
    else apilar(tag);
  }
  function consumir() {
    if (desdeAtras || !estado()) return;
    clearTimeout(atrasPendiente);
    atrasPendiente = setTimeout(() => { atrasPendiente = null; ignorar++; history.back(); }, 0);
  }
  const abierto = id => { const el = document.getElementById(id); return !!el && el.classList.contains('open'); };

  const o = {};
  ['abrirPlayer', 'cerrarPlayer', 'abrirEscenasCasero', 'abrirModalCaseros', 'cerrarModalCaseros',
   'abrirShareModal', 'cerrarShareModal', 'showSection', 'goHome', 'doSearch', 'clearSearch'].forEach(n => o[n] = window[n]);

  window.abrirPlayer = function () { const ya = abierto('player-overlay'); const r = o.abrirPlayer.apply(this, arguments); if (!ya) apilar('player'); return r; };
  window.cerrarPlayer = function () { const ya = abierto('player-overlay'); const r = o.cerrarPlayer.apply(this, arguments); if (ya && !abierto('player-overlay')) consumir(); return r; };
  window.abrirEscenasCasero = function () { const ya = abierto('caseros-modal'); const r = o.abrirEscenasCasero.apply(this, arguments); if (!ya && abierto('caseros-modal')) apilar('modal'); return r; };
  window.abrirModalCaseros = function () { const ya = abierto('caseros-modal'); const r = o.abrirModalCaseros.apply(this, arguments); if (!ya && abierto('caseros-modal')) apilar('modal'); return r; };
  window.cerrarModalCaseros = function () { const ya = abierto('caseros-modal'); const r = o.cerrarModalCaseros.apply(this, arguments); if (ya && !abierto('caseros-modal')) consumir(); return r; };
  window.abrirShareModal = function () { const r = o.abrirShareModal.apply(this, arguments); if (estado() !== 'share') apilar('share'); return r; };
  window.cerrarShareModal = function () { const ya = abierto('share-modal'); const r = o.cerrarShareModal.apply(this, arguments); if (ya) consumir(); return r; };
  window.showSection = function (sec) {
    const r = o.showSection.apply(this, arguments);
    if (tieneInicio()) sustituirOApilar('sec', ['sec', 'search']);
    return r;
  };
  window.goHome = function () { const st = estado(); const r = o.goHome.apply(this, arguments); if (st === 'sec' || st === 'search') consumir(); return r; };
  window.doSearch = function () { const r = o.doSearch.apply(this, arguments); if (estado() !== 'search') apilar('search'); return r; };
  window.clearSearch = function () { const st = estado(); const r = o.clearSearch.apply(this, arguments); if (st === 'search') consumir(); return r; };

  window.addEventListener('popstate', () => {
    if (ignorar) { ignorar--; return; }
    desdeAtras = true;
    try {
      if (abierto('share-modal')) o.cerrarShareModal();
      else if (abierto('player-overlay')) o.cerrarPlayer();
      else if (abierto('caseros-modal')) o.cerrarModalCaseros();
      else if (document.getElementById('search-results-screen').classList.contains('active')) o.clearSearch();
      else if (tieneInicio() && currentSection !== 'home') o.goHome();
    } finally { desdeAtras = false; }
  });
})();
