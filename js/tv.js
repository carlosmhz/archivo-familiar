(function() {
  const IS_TV = new URLSearchParams(window.location.search).get('tv') === '1';
  if (!IS_TV) return;

  document.body.classList.add('modo-tv');

  let focusedEl      = null;
  let currentRowIdx  = 0;
  let currentCardIdx = 0;

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getDecadaRows() {
    return Array.from(document.querySelectorAll('.decada-row'));
  }

  function getRowCards(row) {
    if (!row) return [];
    return Array.from(row.querySelectorAll('.nf-card:not(.nf-proximamente)'));
  }

  function tvFocus(el) {
    if (focusedEl) focusedEl.classList.remove('tv-focused');
    focusedEl = el;
    if (!el) return;
    el.classList.add('tv-focused');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  // FIX 1: scroll vertical — mueve la sección de década completa a la vista
  function scrollRowIntoView(rowIdx) {
    const rows = getDecadaRows();
    const row  = rows[rowIdx];
    if (!row) return;
    const section = row.closest('.decada-section') || row;
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function tvSetInitialFocus() {
    currentRowIdx  = 0;
    currentCardIdx = 0;
    const rows = getDecadaRows();
    if (rows.length) {
      const cards = getRowCards(rows[0]);
      if (cards.length) { tvFocus(cards[0]); return; }
    }
    const el = document.querySelector('.section-card, .login-input');
    if (el) tvFocus(el);
  }

  // FIX 2: en TV, abrirModalCaseros (modal de "varios del mismo año") se ignora.
  // Las cards ya están todas expandidas en la fila de décadas.
  window.abrirModalCaseros = function(year, tipo) {
    // No hacer nada — en TV no existe este modal
    // Si se llega aquí desde el botón "← Volver" dentro de abrirEscenasCasero,
    // simplemente cerramos el modal de escenas.
    const modal = document.getElementById('caseros-modal');
    if (modal && modal.classList.contains('open')) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => {
        const rows = getDecadaRows();
        const cards = getRowCards(rows[currentRowIdx] || rows[0]);
        tvFocus(cards[currentCardIdx] || cards[0] || null);
      }, 150);
    }
  };

  // FIX 3: pantalla completa automática al abrir player
  const origAbrirPlayer = window.abrirPlayer;
  window.abrirPlayer = function(url, titulo, fecha, min) {
    origAbrirPlayer && origAbrirPlayer(url, titulo, fecha, min);
    setTimeout(() => {
      const overlay = document.getElementById('player-overlay');
      if (!overlay) return;
      const requestFS = overlay.requestFullscreen
        || overlay.webkitRequestFullscreen
        || overlay.mozRequestFullScreen;
      if (requestFS) requestFS.call(overlay).catch(() => {});
    }, 250);
  };

  // ── Teclado ──
  document.addEventListener('keydown', function(e) {
    const key  = e.key;
    const code = e.keyCode;

    // LOGIN
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen && !loginScreen.classList.contains('hidden')) {
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        const els = Array.from(loginScreen.querySelectorAll('input, button')).filter(isVisible);
        let idx = els.indexOf(focusedEl);
        if (idx === -1) idx = 0;
        idx = key === 'ArrowDown' ? Math.min(idx + 1, els.length - 1) : Math.max(idx - 1, 0);
        tvFocus(els[idx]);
        if (els[idx].tagName === 'INPUT') els[idx].focus();
      }
     if (key === 'Enter' || code === 13) {
  e.preventDefault();
  if (focusedEl && focusedEl.tagName === 'INPUT') {
    focusedEl.focus();
    focusedEl.click();
  } else if (focusedEl) {
    focusedEl.click();
  }
}
      return;
    }

    // PLAYER ABIERTO — controles con mando
    const playerOverlay = document.getElementById('player-overlay');
    if (playerOverlay && playerOverlay.classList.contains('open')) {
      const video = document.getElementById('player-video');
      const isVideo = video && video.style.display !== 'none' && video.src;

      if (isVideo) {
        if (key === 'ArrowLeft')  { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); return; }
        if (key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(video.duration || 9e9, video.currentTime + 10); return; }
        if (key === 'ArrowUp')    { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); return; }
        if (key === 'ArrowDown')  { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); return; }
        if (key === 'Enter' || code === 13) { e.preventDefault(); video.paused ? video.play() : video.pause(); return; }
      }

      if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().then(() => cerrarPlayer()).catch(() => cerrarPlayer());
        } else {
          cerrarPlayer();
        }
      }
      return;
    }

    // MODAL DE ESCENAS
    const modal = document.getElementById('caseros-modal');
    if (modal && modal.classList.contains('open')) {
      e.preventDefault();
      const els = Array.from(modal.querySelectorAll(
        '[onclick*="abrirPlayerEscena"], .caseros-modal-close'
      )).filter(isVisible);
      if (!els.length) return;
      let idx = els.indexOf(focusedEl);
      if (idx === -1) idx = 0;

      if (key === 'ArrowDown') idx = Math.min(idx + 1, els.length - 1);
      else if (key === 'ArrowUp') idx = Math.max(idx - 1, 0);
      else if (key === 'Enter' || code === 13) { els[idx].click(); return; }
      else if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
        cerrarModalCaseros(); return;
      }
      tvFocus(els[idx]);
      els[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // HOME
    const homeScreen = document.getElementById('home-screen');
    if (homeScreen && homeScreen.style.display !== 'none') {
      e.preventDefault();
      const cards = Array.from(document.querySelectorAll('.section-card')).filter(isVisible);
      if (!cards.length) return;
      let idx = cards.indexOf(focusedEl);
      if (idx === -1) { tvFocus(cards[0]); return; }
      if (key === 'ArrowRight') idx = Math.min(idx + 1, cards.length - 1);
      else if (key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
      else if (key === 'Enter' || code === 13) { cards[idx].click(); return; }
      tvFocus(cards[idx]);
      return;
    }

    // PANTALLA CASEROS
    const screenCaseros = document.getElementById('screen-caseros');
    if (screenCaseros && screenCaseros.classList.contains('active')) {
      e.preventDefault();
      const rows = getDecadaRows();
      if (!rows.length) return;

      if (key === 'ArrowUp') {
        if (currentRowIdx > 0) {
          currentRowIdx--;
          const cards = getRowCards(rows[currentRowIdx]);
          currentCardIdx = Math.min(currentCardIdx, Math.max(0, cards.length - 1));
          tvFocus(cards[currentCardIdx] || null);
          scrollRowIntoView(currentRowIdx); // FIX 1
        } else {
          const backBtn = screenCaseros.querySelector('.back-btn');
          if (backBtn) tvFocus(backBtn);
        }
      }
      else if (key === 'ArrowDown') {
        if (focusedEl && focusedEl.classList.contains('back-btn')) {
          currentRowIdx = 0; currentCardIdx = 0;
          const cards = getRowCards(rows[0]);
          if (cards.length) tvFocus(cards[0]);
          return;
        }
        if (currentRowIdx < rows.length - 1) {
          currentRowIdx++;
          const cards = getRowCards(rows[currentRowIdx]);
          currentCardIdx = Math.min(currentCardIdx, Math.max(0, cards.length - 1));
          tvFocus(cards[currentCardIdx] || null);
          scrollRowIntoView(currentRowIdx); // FIX 1
        }
      }
      else if (key === 'ArrowRight') {
        if (focusedEl && focusedEl.classList.contains('back-btn')) return;
        const cards = getRowCards(rows[currentRowIdx]);
        if (currentCardIdx < cards.length - 1) {
          currentCardIdx++;
          tvFocus(cards[currentCardIdx]);
          rows[currentRowIdx].scrollBy({ left: 240, behavior: 'smooth' });
        }
      }
      else if (key === 'ArrowLeft') {
        if (focusedEl && focusedEl.classList.contains('back-btn')) return;
        if (currentCardIdx > 0) {
          currentCardIdx--;
          const cards = getRowCards(rows[currentRowIdx]);
          tvFocus(cards[currentCardIdx]);
          rows[currentRowIdx].scrollBy({ left: -240, behavior: 'smooth' });
        }
      }
      else if (key === 'Enter' || code === 13) {
        if (!focusedEl) return;
        if (focusedEl.classList.contains('back-btn')) { focusedEl.click(); return; }
        const card = focusedEl.classList.contains('nf-card')
          ? focusedEl : focusedEl.closest('.nf-card');
        if (card) {
          const btnEscenas = card.querySelector('.nf-btn.secondary');
          const btnPlay    = card.querySelector('.nf-btn.primary');
          if (btnEscenas) btnEscenas.click();
          else if (btnPlay) btnPlay.click();
        } else {
          focusedEl.click();
        }
      }
      else if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
        const backBtn = screenCaseros.querySelector('.back-btn');
        if (focusedEl && focusedEl.classList.contains('back-btn')) {
          goHome();
        } else if (backBtn) {
          tvFocus(backBtn);
        }
      }
    }

  }, true);

  // Restaurar foco tras cerrar modal
  const origCerrarModalCaseros = window.cerrarModalCaseros;
  window.cerrarModalCaseros = function(e) {
    origCerrarModalCaseros && origCerrarModalCaseros(e);
    setTimeout(() => {
      const rows  = getDecadaRows();
      const cards = getRowCards(rows[currentRowIdx] || rows[0]);
      tvFocus(cards[currentCardIdx] || cards[0] || null);
    }, 150);
  };

  // Restaurar foco tras cerrar player
  const origCerrarPlayer = window.cerrarPlayer;
  window.cerrarPlayer = function(e) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    origCerrarPlayer && origCerrarPlayer(e);
    setTimeout(() => {
      const rows  = getDecadaRows();
      const cards = getRowCards(rows[currentRowIdx] || rows[0]);
      tvFocus(cards[currentCardIdx] || cards[0] || null);
    }, 300);
  };

  // Tab décadas al entrar en caseros
  const origShowSection = window.showSection;
  window.showSection = function(section) {
    origShowSection && origShowSection(section);
    if (section === 'caseros') {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      const td = document.getElementById('tab-decadas');
      if (td) td.classList.add('active');
      setTimeout(() => {
        if (typeof renderDecadas === 'function') renderDecadas();
        setTimeout(tvSetInitialFocus, 150);
      }, 50);
    } else {
      setTimeout(tvSetInitialFocus, 150);
    }
  };

  // Foco inicial tras login
  const loginObs = new MutationObserver(() => {
    const ls = document.getElementById('login-screen');
    if (ls && ls.classList.contains('hidden')) setTimeout(tvSetInitialFocus, 600);
  });
  const ls = document.getElementById('login-screen');
  if (ls) loginObs.observe(ls, { attributes: true, attributeFilter: ['class'] });

  setTimeout(() => {
    const input = document.querySelector('.login-input');
    if (input) { tvFocus(input); input.focus(); }
  }, 300);

  console.log('[TV] Modo TV v1.1 activado');
})();

