(function() {
  const IS_TV = new URLSearchParams(window.location.search).get('tv') === '1';
  if (!IS_TV) return;

  // ── Estado navegación actuaciones ──
  let sevRowIdx  = 0;
  let sevCardIdx = 0;
  let sevModalOpen = false;
  let sevModalIdx  = 0;
  let sevModalItems = []; // actuaciones del año abierto

  // ── Inyectar contenedor de décadas en la pantalla de sevillanas ──
  function inyectarContenedorSev() {
    const screen = document.getElementById('screen-sevillanas');
    if (!screen || document.getElementById('tv-sev-decadas')) return;
    const div = document.createElement('div');
    div.id = 'tv-sev-decadas';
    screen.appendChild(div);
  }

  // ── Renderizar vista por décadas de actuaciones ──
  function renderSevDecadas() {
    inyectarContenedorSev();
    const el = document.getElementById('tv-sev-decadas');
    if (!el) return;
    if (!window.ACTUACIONES || !ACTUACIONES.length) {
    el.innerHTML = '<p style="color:#ECEDEF;padding:40px 48px">Cargando actuaciones...</p>';
     return;
    }

    // Agrupar por año y luego por década
    const porAnio = {};
    ACTUACIONES.forEach(a => {
      const y = parseInt(String(a.fecha || '').match(/\d{4}/)?.[0]) || 0;
      if (!y) return;
      if (!porAnio[y]) porAnio[y] = [];
      porAnio[y].push(a);
    });

    const porDecada = {};
    Object.keys(porAnio).forEach(y => {
      const dec = Math.floor(y / 10) * 10;
      if (!porDecada[dec]) porDecada[dec] = [];
      porDecada[dec].push(parseInt(y));
    });

    el.innerHTML = Object.keys(porDecada).sort((a,b) => b-a).map(dec => {
      const años = porDecada[dec].sort((a,b) => b-a);
      const cards = años.map(y => {
        const acts = porAnio[y];
        const preview = acts.slice(0, 3).map(a =>
          `<div class="sev-preview-item">· ${a.act}</div>`
        ).join('');
        const total = acts.length;
        return `<div class="sev-year-card" onclick="tvAbrirSevModal(${y})" data-sev-year="${y}">
          <div class="sev-card-header">
            <div class="sev-card-year">${y}</div>
            <div class="sev-card-count">${total} actuación${total !== 1 ? 'es' : ''}</div>
          </div>
          <div class="sev-card-preview">${preview}</div>
        </div>`;
      }).join('');

      return `<div class="sev-decada-section">
        <div class="sev-decada-title">💃 Años ${dec}</div>
        <div class="sev-decada-row" id="sev-decada-row-${dec}">${cards}</div>
      </div>`;
    }).join('');
  }

  // ── Abrir modal de un año ──
  window.tvAbrirSevModal = function(year) {
    const acts = (ACTUACIONES || []).filter(a => {
      const y = parseInt(String(a.fecha || '').match(/\d{4}/)?.[0]) || 0;
      return y === year;
    });
    sevModalItems = acts;
    sevModalIdx   = 0;
    sevModalOpen  = true;

    document.getElementById('tv-sev-modal-year').textContent = year;
    document.getElementById('tv-sev-modal-sub').textContent =
      `${acts.length} actuación${acts.length !== 1 ? 'es' : ''}`;

    document.getElementById('tv-sev-modal-list').innerHTML = acts.map((a, i) => {
      const hasVideo = !!a.youtube;
      const fecha = (() => {
        if (!a.fecha) return '—';
        const p = String(a.fecha).split('-');
        if (p.length < 3) return a.fecha;
        const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return `${parseInt(p[2])} ${m[parseInt(p[1])-1]}`;
      })();
      return `<div class="tv-sev-act-row${hasVideo ? '' : ' no-video'}"
        data-sev-idx="${i}"
        onclick="${hasVideo ? `tvReproducirSev(${i})` : ''}">
        <div class="tv-sev-fecha">${fecha}</div>
        <div class="tv-sev-nombre">${a.act}</div>
        ${a.kw ? `<div class="tv-sev-kw">✦ ${a.kw}</div>` : ''}
        <div class="tv-sev-play">${hasVideo ? '▶' : '—'}</div>
      </div>`;
    }).join('');

    document.getElementById('tv-sev-modal').classList.add('open');

    // Foco en primera actuación con vídeo
    setTimeout(() => {
      const rows = getSevModalRows();
      const firstVideo = rows.find(r => !r.classList.contains('no-video'));
      if (firstVideo) {
        sevModalIdx = parseInt(firstVideo.dataset.sevIdx);
        tvFocusSev(firstVideo);
      } else if (rows.length) {
        tvFocusSev(rows[0]);
      }
    }, 80);
  };

  function tvReproducirSev(idx) {
    const a = sevModalItems[idx];
    if (!a || !a.youtube) return;
    // Cerrar modal antes de abrir player
    document.getElementById('tv-sev-modal').classList.remove('open');
    sevModalOpen = false;
    const link = a.youtube + (a.min > 0 ? (a.youtube.includes('?') ? '&' : '?') + `t=${a.min}s` : '');
    abrirPlayer(link, a.act, a.fecha || '', a.min || 0);
  }

  function getSevModalRows() {
    return Array.from(document.querySelectorAll('#tv-sev-modal-list .tv-sev-act-row'));
  }

  function getSevRows() {
    return Array.from(document.querySelectorAll('.sev-decada-row'));
  }

  function getSevCards(row) {
    return Array.from(row.querySelectorAll('.sev-year-card'));
  }

  // Foco en elementos de actuaciones (reutiliza el sistema global de foco)
  // Necesitamos acceder a tvFocus — lo buscamos en el scope global
  function tvFocusSev(el) {
    // Quitar foco de cualquier elemento previo
    document.querySelectorAll('.tv-focused').forEach(e => e.classList.remove('tv-focused'));
    if (!el) return;
    el.classList.add('tv-focused');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  function cerrarSevModal() {
    document.getElementById('tv-sev-modal').classList.remove('open');
    sevModalOpen = false;
    // Restaurar foco en la card del año
    setTimeout(() => {
      const rows  = getSevRows();
      const row   = rows[sevRowIdx] || rows[0];
      const cards = row ? getSevCards(row) : [];
      const card  = cards[sevCardIdx] || cards[0];
      if (card) tvFocusSev(card);
    }, 150);
  }

// Observar cuando screen-sevillanas se hace active
const sevScreen = document.getElementById('screen-sevillanas');
if (sevScreen) {
  const sevObs = new MutationObserver(() => {
    if (sevScreen.classList.contains('active')) {
      function intentar(veces) {
        if (window.ACTUACIONES && ACTUACIONES.length) {
          renderSevDecadas();
          setTimeout(() => {
            sevRowIdx = 0; sevCardIdx = 0;
            const rows = getSevRows();
            if (rows.length) {
              const cards = getSevCards(rows[0]);
              if (cards.length) tvFocusSev(cards[0]);
            }
          }, 150);
        } else if (veces > 0) {
          setTimeout(() => intentar(veces - 1), 300);
        }
      }
      intentar(20);
    }
  });
  sevObs.observe(sevScreen, { attributes: true, attributeFilter: ['class'] });
}

  // ── Teclado para actuaciones ──
  document.addEventListener('keydown', function(e) {
    const IS_SEV = document.getElementById('screen-sevillanas')?.classList.contains('active');
    if (!IS_SEV) return;

    const key  = e.key;
    const code = e.keyCode;

   // Player abierto
    const playerOverlay = document.getElementById('player-overlay');
    if (playerOverlay && playerOverlay.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
        // Detener vídeo YouTube via postMessage antes de cerrar
        const iframe = document.getElementById('player-iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
        cerrarPlayer();
        return;
      }
      // Controlar YouTube via postMessage (no necesita foco en iframe)
      const iframe = document.getElementById('player-iframe');
      if (iframe && iframe.contentWindow) {
        if (key === 'Enter' || code === 13) {
          // Toggle play/pause
          iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        }
      }
      return;
    }

    // ── Modal año abierto ──
    if (sevModalOpen) {
      e.preventDefault();
      e.stopPropagation();
      const rows = getSevModalRows();
      let idx = rows.findIndex(r => r.classList.contains('tv-focused'));
      if (idx === -1) idx = 0;

      if (key === 'ArrowDown') {
        idx = Math.min(idx + 1, rows.length - 1);
        sevModalIdx = parseInt(rows[idx]?.dataset.sevIdx ?? idx);
        tvFocusSev(rows[idx]);
        rows[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      else if (key === 'ArrowUp') {
        idx = Math.max(idx - 1, 0);
        sevModalIdx = parseInt(rows[idx]?.dataset.sevIdx ?? idx);
        tvFocusSev(rows[idx]);
        rows[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      else if (key === 'Enter' || code === 13) {
        const row = rows[idx];
        if (row && !row.classList.contains('no-video')) {
          tvReproducirSev(parseInt(row.dataset.sevIdx));
        }
      }
      else if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
        cerrarSevModal();
      }
      return;
    }

    // ── Navegación por filas de décadas ──
    e.preventDefault();
    const rows = getSevRows();
    if (!rows.length) return;

    if (key === 'ArrowUp') {
      if (sevRowIdx > 0) {
        sevRowIdx--;
        const cards = getSevCards(rows[sevRowIdx]);
        sevCardIdx = Math.min(sevCardIdx, Math.max(0, cards.length - 1));
        tvFocusSev(cards[sevCardIdx] || null);
        const section = rows[sevRowIdx].closest('.sev-decada-section') || rows[sevRowIdx];
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        const backBtn = document.getElementById('screen-sevillanas')?.querySelector('.back-btn');
        if (backBtn) tvFocusSev(backBtn);
      }
    }
    else if (key === 'ArrowDown') {
      const focused = document.querySelector('.tv-focused');
      if (focused && focused.classList.contains('back-btn')) {
        sevRowIdx = 0; sevCardIdx = 0;
        const cards = getSevCards(rows[0]);
        if (cards.length) tvFocusSev(cards[0]);
        return;
      }
      if (sevRowIdx < rows.length - 1) {
        sevRowIdx++;
        const cards = getSevCards(rows[sevRowIdx]);
        sevCardIdx = Math.min(sevCardIdx, Math.max(0, cards.length - 1));
        tvFocusSev(cards[sevCardIdx] || null);
        const section = rows[sevRowIdx].closest('.sev-decada-section') || rows[sevRowIdx];
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    else if (key === 'ArrowRight') {
      const focused = document.querySelector('.tv-focused');
      if (focused && focused.classList.contains('back-btn')) return;
      const cards = getSevCards(rows[sevRowIdx]);
      if (sevCardIdx < cards.length - 1) {
        sevCardIdx++;
        tvFocusSev(cards[sevCardIdx]);
        rows[sevRowIdx].scrollBy({ left: 220, behavior: 'smooth' });
      }
    }
    else if (key === 'ArrowLeft') {
      const focused = document.querySelector('.tv-focused');
      if (focused && focused.classList.contains('back-btn')) return;
      if (sevCardIdx > 0) {
        sevCardIdx--;
        const cards = getSevCards(rows[sevRowIdx]);
        tvFocusSev(cards[sevCardIdx]);
        rows[sevRowIdx].scrollBy({ left: -220, behavior: 'smooth' });
      }
    }
    else if (key === 'Enter' || code === 13) {
      const focused = document.querySelector('.tv-focused');
      if (!focused) return;
      if (focused.classList.contains('back-btn')) { focused.click(); return; }
      if (focused.classList.contains('sev-year-card')) { focused.click(); return; }
    }
    else if (key === 'Escape' || key === 'GoBack' || code === 461 || code === 8) {
      const screen = document.getElementById('screen-sevillanas');
      const backBtn = screen?.querySelector('.back-btn');
      const focused = document.querySelector('.tv-focused');
      if (focused && focused.classList.contains('back-btn')) {
        goHome();
      } else if (backBtn) {
        tvFocusSev(backBtn);
      }
    }

  }, true);

})();
