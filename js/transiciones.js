// ─── TRANSICIONES ─────────────────────────────────────────────────────────────
// Cómo se mueven las pantallas. Todo es "decoración" sobre la navegación de siempre
// (showSection / goHome de navegacion.js, y el historial de ui.js): si algo falla o el
// sistema pide "reducir animaciones", se navega igual, sin animar.
//
//  1. Deslizamiento lateral. En el móvil, la pantalla nueva entra desde la derecha mientras
//     la anterior se retira un poco hacia la izquierda (paralaje). Con "Atrás" va al revés, y
//     el inicio vuelve exactamente al punto en el que se había dejado. En pantallas anchas
//     es un fundido con un pequeño ascenso.
//  2. La tarjeta se convierte en la pantalla. Al pulsar una colección del inicio, su tarjeta
//     se expande hasta ser la cabecera de la sección; al volver, la cabecera se encoge hasta
//     su tarjeta.
//  3. Hojas desde abajo. El reproductor y la ventana de escenas suben desde el borde inferior
//     (CSS en sala.css) y se cierran arrastrando la cabecera hacia abajo (hojaArrastrable).
//  5. Cascada. Las tarjetas y filas de una pantalla recién abierta entran una a una.
//
// En el modo TV (?tv=1) no se hace nada de esto.

(function () {
  if (new URLSearchParams(location.search).get('tv') === '1') return;

  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const sinMovimiento = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esMovil = () => window.innerWidth <= 760;
  const K = () => (window.__transK > 0 ? window.__transK : 1);   // solo para grabar demostraciones a cámara lenta
  const $ = s => document.querySelector(s);

  // ── Pantallas ──
  const ORDEN = ['home', 'sevillanas', 'caseros'];                  // el mismo orden que el menú
  function pantalla(nombre) { return nombre === 'home' ? $('#home-screen') : $('#screen-' + nombre); }
  function nombreDe(el) { return !el ? null : el.id === 'home-screen' ? 'home' : el.id.replace('screen-', ''); }
  function visible() {
    for (const n of ORDEN) {
      const el = pantalla(n);
      if (!el) continue;
      if (n === 'home' ? el.style.display !== 'none' : el.classList.contains('active')) return el;
    }
    return null;
  }
  const posiciones = {};        // dónde estaba el scroll de cada pantalla al irse
  // El navegador restaura por su cuenta el scroll al cerrar entradas del historial (y lo dejaba en 0);
  // aquí se restaura a mano, justo donde estaba cada pantalla.
  try { history.scrollRestoration = 'manual'; } catch (e) {}

  // ── Colección pulsada (para expandir su tarjeta) ──
  let tarjetaPulsada = null, tarjetaT = 0;
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.section-card');
    if (t) { tarjetaPulsada = t; tarjetaT = Date.now(); }
  }, true);
  const tarjetaDe = nombre => document.querySelector(`.section-card[onclick*="${nombre}"]`);

  // ── Limpieza de lo que queda de una transición anterior ──
  let limpiar = null;
  function terminarAnterior() { if (limpiar) { const f = limpiar; limpiar = null; f(); } }

  function fantasma(el, rect) {
    const g = el.cloneNode(true);       // se conservan los id: los estilos de varias pantallas dependen de ellos;
    // (al ir después del original en el DOM, getElementById sigue encontrando el original).
    // navegacion.js quita 'active' a todas las .content-screen al cambiar de pantalla, y eso ocultaría la copia:
    // por eso la copia deja de ser .content-screen y lleva su propia clase con el mismo aspecto.
    if (g.classList.contains('content-screen')) { g.classList.remove('content-screen', 'active'); g.classList.add('fantasma-contenido'); }
    g.classList.add('fantasma-pantalla');
    g.setAttribute('aria-hidden', 'true'); g.setAttribute('inert', '');
    Object.assign(g.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: '0', maxWidth: 'none', animation: 'none', zIndex: 60, pointerEvents: 'none' });
    el.parentNode.appendChild(g);
    return g;
  }

  function vuelo(tarjeta, rect) {
    const v = tarjeta.cloneNode(true);
    v.removeAttribute('id'); v.removeAttribute('onclick'); v.removeAttribute('onkeydown'); v.removeAttribute('tabindex');
    v.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    v.setAttribute('aria-hidden', 'true'); v.setAttribute('inert', '');
    Object.assign(v.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', minHeight: '0', margin: '0', zIndex: 90, pointerEvents: 'none', transition: 'none', transform: 'none', animation: 'none' });
    document.body.appendChild(v);
    return v;
  }
  const textoDe = v => [...v.querySelectorAll('.card-icon, .section-card > div, .card-pie')];

  // ── Cascada ──
  const CASCADA = {
    home: '.section-card, .continue-card.visible, #home-recientes.visible .recent-card',
    caseros: '.subcategory-tabs, .decada-section',
    sevillanas: '.year-chips, .year-group',
  };
  function cascada(el, base) {
    if (sinMovimiento() || !el) return;
    const n = nombreDe(el);
    const sel = CASCADA[n];
    if (!sel) return;
    el.querySelectorAll(sel).forEach((x, i) => {
      x.style.setProperty('--d', Math.round(Math.min((base || 140) + i * 55, 800) * K()) + 'ms');
      x.classList.remove('sala-casc'); void x.offsetWidth; x.classList.add('sala-casc');
      clearTimeout(x._cascT); x._cascT = setTimeout(() => x.classList.remove('sala-casc'), 2200 * K());
    });
  }
  window.salaCascada = cascada;

  // ── Núcleo: cambia de pantalla animando ──
  function navegar(destinoNombre, orig, args, ctx) {
    terminarAnterior();
    const old = visible();
    const destino = pantalla(destinoNombre);
    if (!old || !destino || old === destino || sinMovimiento() || document.body.classList.contains('modo-tv')) {
      const r = orig.apply(ctx, args);
      if (old === destino && destinoNombre === 'home' && !window._cascadaInicial) { window._cascadaInicial = true; cascada(destino, 520); }
      return r;
    }
    const oldNombre = nombreDe(old);
    const dir = ORDEN.indexOf(destinoNombre) > ORDEN.indexOf(oldNombre) ? 'adelante' : 'atras';
    const rectOld = old.getBoundingClientRect();
    posiciones[oldNombre] = window.scrollY;
    const ghost = fantasma(old, rectOld);          // copia de la pantalla que se va (antes de cambiar nada)
    const claveTarjeta = tarjetaPulsada && Date.now() - tarjetaT < 700 ? tarjetaPulsada : null;
    tarjetaPulsada = null;

    let r;
    try { r = orig.apply(ctx, args); } catch (e) { ghost.remove(); throw e; }
    const nueva = visible() || destino;
    if (dir === 'atras' && posiciones[destinoNombre] != null) {
      const y = posiciones[destinoNombre];
      window.scrollTo(0, y);
      requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); });
    }
    const duracion = (esMovil() ? 380 : 320) * K();
    const anims = [];
    const extras = [];

    // ¿Se puede expandir / encoger una tarjeta de colección?
    let tarjetaIda = null, cab = null;
    if (oldNombre === 'home' && destinoNombre !== 'home' && claveTarjeta && claveTarjeta.isConnected) {
      tarjetaIda = claveTarjeta; cab = nueva.querySelector('.seccion-cab');
    } else if (destinoNombre === 'home' && oldNombre !== 'home') {
      const tj = tarjetaDe(oldNombre); const c = ghost.querySelector('.seccion-cab');   // la cabecera original ya está oculta: se mide la copia
      if (tj && tj.offsetParent !== null && c) { tarjetaIda = tj; cab = c; }
    }

    let hecho = false;
    const fin = () => {
      if (hecho) return; hecho = true; limpiar = null;
      anims.forEach(a => { try { a.cancel(); } catch (e) {} });
      extras.forEach(f => f());
      ghost.remove();
      nueva.style.position = nueva.style.zIndex = nueva.style.background = nueva.style.boxShadow = '';
    };
    limpiar = fin;

    if (tarjetaIda && cab && cab.getBoundingClientRect().width > 0) {
      // ── 2. La tarjeta se convierte en la cabecera (y al revés) ──
      const adelante = dir === 'adelante';
      const rCab = cab.getBoundingClientRect();
      // Al ir: la tarjeta está en el inicio que se va (ya oculto), así que se mide su copia en el fantasma
      const origen = adelante ? ghost.querySelector(`.section-card[onclick*="${destinoNombre}"]`) : null;
      const rIni = adelante ? (origen ? origen.getBoundingClientRect() : tarjetaIda.getBoundingClientRect()) : rCab;
      const rFin = adelante ? rCab : tarjetaIda.getBoundingClientRect();
      const v = vuelo(tarjetaIda, rIni);
      const ocultar = adelante ? cab : tarjetaIda;          // lo real se oculta mientras vuela la copia
      const prevVis = ocultar.style.visibility; ocultar.style.visibility = 'hidden';
      if (adelante && origen) origen.style.visibility = 'hidden';
      if (!adelante) { const c2 = ghost.querySelector('.seccion-cab'); if (c2) c2.style.visibility = 'hidden'; }
      extras.push(() => { ocultar.style.visibility = prevVis; v.remove(); });
      const t = textoDe(v);
      const geom = [{ left: rIni.left + 'px', top: rIni.top + 'px', width: rIni.width + 'px', height: rIni.height + 'px' },
                    { left: rFin.left + 'px', top: rFin.top + 'px', width: rFin.width + 'px', height: rFin.height + 'px' }];
      anims.push(v.animate(geom, { duration: duracion * 1.25, easing: EASE, fill: 'both' }));
      t.forEach(x => anims.push(x.animate(adelante ? [{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
                                          { duration: duracion * 1.25, easing: 'linear', fill: 'both' })));
      // La pantalla que se va se desvanece; la nueva aparece (salvo la cabecera, que es el vuelo)
      anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duracion * 0.8, easing: 'ease-out', fill: 'both' }));
      anims.push(nueva.animate([{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1 }], { duration: duracion * 1.25, easing: 'ease-out', fill: 'backwards' }));
      const ultima = anims[0];
      ultima.finished.then(() => { if (!hecho) { ocultar.style.visibility = prevVis; v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120 * K(), fill: 'forwards' }).finished.then(fin, fin); } }).catch(fin);
      if (adelante) setTimeout(() => cascada(nueva, 260), 0);
    } else if (esMovil()) {
      // ── 1. Deslizamiento lateral ──
      const adelante = dir === 'adelante';
      const sombra = adelante ? '-14px 0 32px rgba(0,0,0,0.5)' : '14px 0 32px rgba(0,0,0,0.5)';
      if (adelante) {
        nueva.style.position = 'relative'; nueva.style.zIndex = 61; nueva.style.background = 'var(--bg)'; nueva.style.boxShadow = sombra;
        anims.push(nueva.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: duracion, easing: EASE, fill: 'backwards' }));
        anims.push(ghost.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-24%)', opacity: 0.3 }], { duration: duracion, easing: EASE, fill: 'both' }));
      } else {
        ghost.style.background = 'var(--bg)'; ghost.style.boxShadow = sombra;
        anims.push(ghost.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: duracion, easing: EASE, fill: 'both' }));
        anims.push(nueva.animate([{ transform: 'translateX(-24%)', opacity: 0.3 }, { transform: 'translateX(0)', opacity: 1 }], { duration: duracion, easing: EASE, fill: 'backwards' }));
      }
      anims[0].finished.then(fin, fin);
      if (adelante) setTimeout(() => cascada(nueva, 200), 0);
    } else {
      // ── 1 (pantallas anchas). Fundido con un pequeño ascenso ──
      anims.push(nueva.animate([{ opacity: 0, transform: dir === 'adelante' ? 'translateY(16px)' : 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: duracion, easing: EASE, fill: 'backwards' }));
      anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duracion * 0.7, easing: 'ease-out', fill: 'both' }));
      anims[0].finished.then(fin, fin);
      if (dir === 'adelante') setTimeout(() => cascada(nueva, 120), 0);
    }
    setTimeout(fin, duracion * 2 + 800);        // red de seguridad
    return r;
  }

  const origShow = window.showSection, origHome = window.goHome;
  window.showSection = function (s) { return navegar(s, origShow, arguments, this); };
  window.goHome = function () { return navegar('home', origHome, arguments, this); };

  // ── 3. Hojas que se cierran arrastrando ───────────────────────────────────────
  // Solo con el dedo (o lápiz): con el ratón no se arrastran. Se arrastra desde la cabecera,
  // nunca desde sus botones, para no chocar con el vídeo ni con el desplazamiento.
  function hojaArrastrable(hoja, asa, cerrar, abierta) {
    if (!hoja || !asa) return;
    let activo = false, id = null, y0 = 0, dy = 0, vel = 0, ultY = 0, ultT = 0;
    asa.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !abierta() || (e.target.closest && e.target.closest('button, a, input, select, textarea'))) return;
      activo = true; id = e.pointerId; y0 = ultY = e.clientY; ultT = performance.now(); dy = 0; vel = 0;
      try { asa.setPointerCapture(id); } catch (err) {}
      hoja.style.transition = 'none';
    });
    asa.addEventListener('pointermove', e => {
      if (!activo || e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      hoja.style.transform = `translateY(${dy}px)`;
      const t = performance.now();
      vel = vel * 0.6 + ((e.clientY - ultY) / Math.max(1, t - ultT)) * 0.4;
      ultY = e.clientY; ultT = t;
    });
    const soltar = e => {
      if (!activo || (e && e.pointerId !== id)) return;
      activo = false;
      hoja.style.transition = '';
      hoja.style.transform = '';
      if (dy > 110 || (vel > 0.6 && dy > 24)) cerrar();
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  }
  window.hojaArrastrable = hojaArrastrable;

  function iniciarHojas() {
    const po = document.getElementById('player-overlay');
    hojaArrastrable(po && po.querySelector('.player-box'), po && po.querySelector('.player-header'),
      () => window.cerrarPlayer(), () => po.classList.contains('open'));
    const mo = document.getElementById('caseros-modal');
    hojaArrastrable(mo && mo.querySelector('.caseros-modal-box'), mo && mo.querySelector('.caseros-modal-header'),
      () => window.cerrarModalCaseros(), () => mo.classList.contains('open'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarHojas); else iniciarHojas();
})();
