// ─── CASEROS ──────────────────────────────────────────────────────────────────
let CASEROS = [];

async function cargarCaseros() {
  const r = await fetch(`${API}?action=caseros-listar&token=${encodeURIComponent(TOKEN)}`);
  const d = await r.json();
  if (d.ok) {
    CASEROS = d.data;
    document.getElementById('count-caseros').textContent = 
      CASEROS.length ? `${CASEROS.length} vídeo${CASEROS.length!==1?'s':''}` : 'Sin vídeos aún';
    renderCaseros();
    if (document.body.classList.contains('rol-todo')) renderInicioExtras();
  }
}

function extraerAnio(fecha) {
  if (!fecha) return 'Sin fecha';
  const f = String(fecha);
  // Formato AAAA-MM-DD o AAAA
  let m = f.match(/^(\d{4})/);
  if (m) return m[1];
  // Formato DD/MM/AAAA
  m = f.match(/(\d{4})$/);
  if (m) return m[1];
  // Periodo tipo 1993-1995
  m = f.match(/(\d{4})/);
  if (m) return m[1];
  return 'Sin fecha';
}

function iconoCategoria(cat) {
  const map = { 'Boda':'💍','Cumpleaños':'🎂','Comunión':'⛪','Vacaciones':'🌍','Navidad':'🎄','Otros':'📽️' };
  return map[cat] || '🎞️';
}

function renderCaseroCard(c) {
  const link = c.youtube
    ? `<button class="c-link" onclick="abrirPlayer('${c.youtube.replace(/'/g,"\\'")}','${c.titulo.replace(/'/g,"\\'")}','${c.fecha||''}',0)">▶ Ver</button>`
    : `<span class="c-link pending">Próximamente</span>`;
  const icon = c.tipo === 'evento' ? iconoCategoria(c.categoria) : '📼';
  return `
    <div class="casero-card">
      <div class="c-icon">${icon}</div>
      ${c.categoria ? `<span class="c-cat">${c.categoria}</span>` : ''}
      <div class="c-titulo">${c.titulo}</div>
      <div class="c-fecha">${c.fecha||''}</div>
      ${c.notas ? `<div class="c-notas">${c.notas}</div>` : ''}
      ${link}
    </div>`;
}

function thumbClass(tipo, categoria) {
  if (tipo === 'cotidiano') return 'cotidiano';
  const map = {'Boda':'boda','Comunión':'comunion','Vacaciones':'vacaciones','Navidad':'navidad'};
  return map[categoria] || 'otros';
}

function svgIcon(id) { return `<svg class="ico"><use href="#${id}"/></svg>`; }
function thumbIcon(tipo, categoria) {
  if (tipo === 'cotidiano') return svgIcon('i-tape');
  const map = {'Boda':'i-rings','Comunión':'i-church','Vacaciones':'i-sun','Navidad':'i-tree','Cumpleaños':'i-cake'};
  return svgIcon(map[categoria] || 'i-video');
}

function renderCaseros() {
  const cardsEl = document.getElementById('tl-cards');
  const rulerEl = document.getElementById('tl-ruler-marks');

  if (!CASEROS.length) {
    cardsEl.innerHTML = '<p class="caseros-empty" style="padding:20px">Próximamente...</p>';
    rulerEl.innerHTML = '';
    document.getElementById('caseros-eventos-list').innerHTML = '<p class="caseros-empty">Próximamente...</p>';
    return;
  }

  const PX_PER_YEAR = 80;
  const MAX_GAP_YEARS = 4;
  const GAP_PX = 280;      // ancho del gap comprimido
  const CARD_W = 155;
  const CARD_H = 215;
  const CONN_H = 24;
  const LINE_H = 3;
  const DOT = 10;

  const years = CASEROS.map(c => parseInt(extraerAnio(c.fecha))||0).filter(y=>y>0);
  const sortedVideoYears = [...new Set(years)].sort((a,b)=>a-b);
  const minY = Math.min(...years) - 1;
  const maxY = Math.max(...years) + 2;

  // Construir posMap: para cada año con vídeo, calcular X acumulando segmentos
  // Segmentos normales: PX_PER_YEAR por año
  // Segmentos de gap grande: GAP_PX fijo total independiente de cuántos años
  const posMap = {};
  let cursor = CARD_W / 2 + PX_PER_YEAR; // empezar con margen izquierdo
  posMap[minY] = CARD_W / 2;

  for (let i = 0; i < sortedVideoYears.length; i++) {
    const y = sortedVideoYears[i];
    const prevY = i === 0 ? minY : sortedVideoYears[i-1];
    const gap = y - prevY;
    if (gap > MAX_GAP_YEARS) {
      cursor = posMap[prevY] + GAP_PX;
    } else {
      cursor = posMap[prevY] + gap * PX_PER_YEAR;
    }
    posMap[y] = cursor;
  }
  posMap[maxY] = posMap[sortedVideoYears[sortedVideoYears.length-1]] + PX_PER_YEAR * 2;

  // Para años intermedios, interpolar linealmente entre los conocidos
  const xOf = y => {
    if (posMap[y] !== undefined) return posMap[y];
    // Encontrar vecinos conocidos
    const keys = Object.keys(posMap).map(Number).sort((a,b)=>a-b);
    const before = keys.filter(k=>k<=y).pop();
    const after = keys.find(k=>k>=y);
    if (before === undefined) return posMap[keys[0]];
    if (after === undefined) return posMap[keys[keys.length-1]];
    if (before === after) return posMap[before];
    const t = (y-before)/(after-before);
    return posMap[before] + t*(posMap[after]-posMap[before]);
  };

  const totalW = posMap[maxY] + CARD_W;
  const lineY = CARD_H + CONN_H + DOT/2;
  const totalH = lineY + DOT/2 + CONN_H + CARD_H + 8;

  const byYear = {};
  CASEROS.forEach(c => {
    const y = parseInt(extraerAnio(c.fecha))||0;
    if (!byYear[y]) byYear[y] = { evento:[], cotidiano:[] };
    byYear[y][c.tipo === 'cotidiano' ? 'cotidiano' : 'evento'].push(c);
  });

  let html = `<div style="position:relative;width:${totalW}px;height:${totalH}px;">`;

  // Línea central
  html += `<div style="position:absolute;left:0;right:0;top:${lineY}px;height:${LINE_H}px;background:linear-gradient(90deg,transparent,var(--blue) 2%,var(--blue) 98%,transparent);border-radius:2px;z-index:1;"></div>`;

  // Años sobre la línea
  const yearsSet = new Set(years);

  // Calcular rangos de gap (años a ocultar)
  const gapRanges = [];
  for (let i = 0; i < sortedVideoYears.length - 1; i++) {
    const ya = sortedVideoYears[i];
    const yb = sortedVideoYears[i+1];
    if (yb - ya > MAX_GAP_YEARS) gapRanges.push([ya+1, yb-1]);
  }
  const inGap = y => gapRanges.some(([a,b]) => y >= a && y <= b);

  // Indicadores de gap entre años con vídeo
  for (let i = 0; i < sortedVideoYears.length - 1; i++) {
    const ya = sortedVideoYears[i];
    const yb = sortedVideoYears[i+1];
    if (yb - ya > MAX_GAP_YEARS) {
      const gapX = (xOf(ya) + xOf(yb)) / 2;
      html += `<div style="position:absolute;left:${gapX}px;transform:translateX(-50%);top:${lineY - 14}px;font-size:18px;color:var(--tl-label);letter-spacing:4px;z-index:2;font-weight:300;">···</div>`;
    }
  }

  for (let y = minY; y <= maxY; y++) {
    if (inGap(y)) continue;
    const isHl = yearsSet.has(y);
    const xPos = xOf(y);
    const tickH = isHl ? 14 : 6;
    const color = isHl ? 'var(--blue)' : 'var(--tl-tick)';
    const labelColor = isHl ? 'var(--dark)' : 'var(--tl-label)';
    const fontW = isHl ? 700 : 300;
    html += `<div style="position:absolute;left:${xPos}px;transform:translateX(-50%);top:${lineY - tickH - 18}px;display:flex;flex-direction:column;align-items:center;z-index:2;">
      <div style="font-size:${isHl?10:9}px;font-weight:${fontW};color:${labelColor};white-space:nowrap;margin-bottom:2px;">${y}</div>
      <div style="width:${isHl?2:1}px;height:${tickH}px;background:${color};"></div>
    </div>`;
  }

  // Etiqueta EVENTOS: flecha arriba, texto debajo
  html += `<div style="position:absolute;left:6px;top:${lineY - 38}px;display:flex;flex-direction:column;align-items:center;z-index:3;background:var(--tl-label-bg);padding:2px 6px;border-radius:4px;">
    <div style="font-size:13px;color:var(--blue);line-height:1;">↑</div>
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--sepia);text-transform:uppercase;">EVENTOS</div>
  </div>`;

  // Etiqueta COTIDIANOS: texto arriba, flecha abajo
  html += `<div style="position:absolute;left:6px;top:${lineY + LINE_H + 4}px;display:flex;flex-direction:column;align-items:center;z-index:3;background:var(--tl-label-bg);padding:2px 6px;border-radius:4px;">
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--sepia);text-transform:uppercase;">COTIDIANOS</div>
    <div style="font-size:13px;color:var(--blue);line-height:1;">↓</div>
  </div>`;

  // Tarjetas — UNA por año+tipo, con modal si hay varios
  Object.entries(byYear).forEach(([yearStr, grupos]) => {
    const year = parseInt(yearStr);
    const cx = xOf(year);

    // EVENTOS
    if (grupos.evento.length > 0) {
      const items = grupos.evento;
      const multi = items.length > 1;
      const tc = multi ? 'multi' : thumbClass(items[0].tipo, items[0].categoria);
      const ti = multi ? svgIcon('i-film') : thumbIcon(items[0].tipo, items[0].categoria);
      const label = multi ? `${items.length} vídeos` : (items[0].categoria || '');
      const titulo = multi ? `${year} · ${items.length} vídeos` : items[0].titulo;
      const badge = multi ? `<span style="position:absolute;top:8px;right:8px;background:rgba(10,12,16,0.8);color:#ECEDEF;font-size:9px;font-weight:700;padding:3px 7px;border-radius:10px;pointer-events:none;">${items.length} vídeos</span>` : '';
      const playBtn = multi
        ? `<button class="tl-play" onclick="abrirModalCaseros(${year},'evento')">Abrir</button>`
        : (items[0].escenas && items[0].youtube
            ? `<div style="display:flex;gap:6px;margin-top:7px;">
                <button class="tl-play" style="flex:1;" onclick="abrirPlayer('${items[0].youtube.replace(/'/g,"\\'")}','${items[0].titulo.replace(/'/g,"\\'")}','${items[0].fecha||''}',0)" aria-label="Ver">${svgIcon('i-play')}</button>
                <button class="tl-play" style="flex:1;" onclick="abrirEscenasCasero(${items[0].id})" aria-label="Escenas">${svgIcon('i-list')}</button>
               </div>`
            : items[0].youtube
              ? `<button class="tl-play" onclick="abrirPlayer('${items[0].youtube.replace(/'/g,"\\'")}','${items[0].titulo.replace(/'/g,"\\'")}','${items[0].fecha||''}',0)">${svgIcon('i-play')} Ver</button>`
              : `<button class="tl-play" style="background:var(--surface-3);color:var(--text-light);cursor:default">Próximamente</button>`);
      const wrapH = CARD_H + CONN_H + DOT;
      html += `<div class="tl-item-wrap" style="left:${cx-CARD_W/2}px;top:${lineY-wrapH}px;z-index:6;height:${wrapH}px;justify-content:flex-end;">
          <div class="tl-card" style="position:relative;">
            ${badge}
            <div class="tl-thumb ${multi?'multi':tc}">${multi?'':items[0].miniatura?`<img src="${items[0].miniatura}" alt="" onerror="this.style.display='none'">`:''}${multi?svgIcon('i-film'):ti}</div>
            <div class="tl-card-body">
              ${label?`<span class="tl-cat">${label}</span>`:''}
              <div class="tl-title">${titulo}</div>
              <div class="tl-date">${items[0].fecha||year}</div>
              ${playBtn}
            </div>
            <div class="tl-year-bar">${year}</div>
          </div>
          <div style="width:2px;height:${CONN_H}px;background:linear-gradient(to bottom,#3a3f4b,var(--blue));flex-shrink:0;"></div>
          <div class="tl-dot" style="flex-shrink:0;"></div>
        </div>`;
    }

    // COTIDIANOS
    if (grupos.cotidiano.length > 0) {
      const items = grupos.cotidiano;
      const multi = items.length > 1;
      const tc = multi ? 'multi' : thumbClass(items[0].tipo, items[0].categoria);
      const ti = multi ? svgIcon('i-film') : thumbIcon(items[0].tipo, items[0].categoria);
      const titulo = multi ? `${year} · ${items.length} vídeos` : items[0].titulo;
      const badge = multi ? `<span style="position:absolute;top:8px;right:8px;background:rgba(10,12,16,0.8);color:#ECEDEF;font-size:9px;font-weight:700;padding:3px 7px;border-radius:10px;pointer-events:none;">${items.length} vídeos</span>` : '';
      const playBtn = multi
        ? `<button class="tl-play" onclick="abrirModalCaseros(${year},'cotidiano')">Abrir</button>`
        : (items[0].escenas && items[0].youtube
            ? `<div style="display:flex;gap:6px;margin-top:7px;">
                <button class="tl-play" style="flex:1;" onclick="abrirPlayer('${items[0].youtube.replace(/'/g,"\\'")}','${items[0].titulo.replace(/'/g,"\\'")}','${items[0].fecha||''}',0)" aria-label="Ver">${svgIcon('i-play')}</button>
                <button class="tl-play" style="flex:1;" onclick="abrirEscenasCasero(${items[0].id})" aria-label="Escenas">${svgIcon('i-list')}</button>
               </div>`
            : items[0].youtube
              ? `<button class="tl-play" onclick="abrirPlayer('${items[0].youtube.replace(/'/g,"\\'")}','${items[0].titulo.replace(/'/g,"\\'")}','${items[0].fecha||''}',0)">${svgIcon('i-play')} Ver</button>`
              : `<button class="tl-play" style="background:var(--surface-3);color:var(--text-light);cursor:default">Próximamente</button>`);
      html += `<div class="tl-item-wrap" style="left:${cx-CARD_W/2}px;top:${lineY-DOT/2+LINE_H/2}px;z-index:6;">
          <div class="tl-dot"></div>
          <div style="width:2px;height:${CONN_H}px;background:linear-gradient(to bottom,var(--blue),#3a3f4b);"></div>
          <div class="tl-card" style="position:relative;">
            ${badge}
            <div class="tl-thumb ${multi?'multi':tc}">${multi?'':items[0].miniatura?`<img src="${items[0].miniatura}" alt="" onerror="this.style.display='none'">`:''}${multi?svgIcon('i-film'):ti}</div>
            <div class="tl-card-body">
              <div class="tl-title">${titulo}</div>
              <div class="tl-date">${items[0].fecha||year}</div>
              ${playBtn}
            </div>
            <div class="tl-year-bar">${year}</div>
          </div>
        </div>`;
    }
  });

  html += '</div>';
  cardsEl.innerHTML = html;
  rulerEl.innerHTML = '';

  // Drag to scroll
  const scroll = document.getElementById('tl-scroll');
  if (scroll && !scroll._dragInit) {
    scroll._dragInit = true;
    let isDown=false, startX, scrollLeft;
    scroll.addEventListener('mousedown', e => { isDown=true; scroll.style.cursor='grabbing'; startX=e.pageX-scroll.offsetLeft; scrollLeft=scroll.scrollLeft; });
    scroll.addEventListener('mouseleave', ()=>{ isDown=false; scroll.style.cursor='grab'; });
    scroll.addEventListener('mouseup', ()=>{ isDown=false; scroll.style.cursor='grab'; });
    scroll.addEventListener('mousemove', e=>{ if(!isDown)return; e.preventDefault(); scroll.scrollLeft=scrollLeft-(e.pageX-scroll.offsetLeft-startX)*1.5; });
  }

    // Flecha de scroll — se oculta al llegar al final
    const arrow = document.getElementById('tl-arrow');
    if (scroll && arrow) {
      const updateArrow = () => {
        const atEnd = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 20;
        arrow.classList.toggle('hidden', atEnd);
      };
      scroll.addEventListener('scroll', updateArrow);
      updateArrow();
    }
  // Render décadas tab
  renderDecadas();
}

function renderDecadas() {
  const el = document.getElementById('caseros-decadas-list');
  if (!el) return;

  const BG = { boda:'var(--th-boda)', comunion:'var(--th-comunion)', cotidiano:'var(--th-cotidiano)', vacaciones:'var(--th-vacaciones)', navidad:'var(--th-navidad)', otros:'var(--th-otros)', multi:'var(--th-multi)' };

  // Agrupar por década
  const decadas = {};
  CASEROS.forEach(c => {
    const y = parseInt(extraerAnio(c.fecha)) || 0;
    if (!y) return;
    const dec = Math.floor(y / 10) * 10;
    if (!decadas[dec]) decadas[dec] = [];
    decadas[dec].push(c);
  });

  // Ordenar por fecha completa (año + mes)
  function fechaADecimal(fecha) {
    if (!fecha) return 0;
    const s = String(fecha);
    const p = s.split('/');
    if (p.length === 3) {
      const anio = parseInt(p[2])||0;
      const mes = parseInt(p[1])||1;
      return anio + (mes - 1) / 12;
    }
    if (p.length === 2) {
      const anio = parseInt(p[1])||0;
      const mes = parseInt(p[0])||1;
      return anio + (mes - 1) / 12;
    }
    const meses = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
    const lower = s.toLowerCase();
    for (const [nombre, num] of Object.entries(meses)) {
      if (lower.includes(nombre)) {
        const m2 = lower.match(/[0-9]{4}/);
        const anio = m2 ? parseInt(m2[0]) : 0;
        return anio + (num - 1) / 12;
      }
    }
    const m3 = s.match(/[0-9]{4}/);
    return m3 ? parseInt(m3[0]) : 0;
  }

  Object.keys(decadas).forEach(dec => {
    decadas[dec].sort((a, b) => fechaADecimal(a.fecha) - fechaADecimal(b.fecha));
  });

  el.innerHTML = Object.keys(decadas).sort((a,b)=>a-b).map(dec => {
    const items = decadas[dec];
    const cards = items.map(c => {
      const tc = thumbClass(c.tipo, c.categoria);
      const ti = thumbIcon(c.tipo, c.categoria);
      const bg = BG[tc] || BG.otros;
      const hasVideo = !!c.youtube;
      const multi = c.escenas && c.escenas.length > 0;
      const badge = multi ? `<div class="nf-badge">${c.escenas.length} escenas</div>` : '';

      const thumb = c.miniatura
        ? `<img class="nf-thumb" src="${c.miniatura}" alt="${c.titulo}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
        + `<div class="nf-thumb-placeholder" style="display:none;background:${bg}">${ti}</div>`
        : `<div class="nf-thumb-placeholder" style="background:${bg}">${ti}</div>`;

      let btns = '';
      if (!hasVideo) {
        btns = `<button class="nf-btn primary" disabled style="opacity:0.4;cursor:default;flex:1">Próximamente</button>`;
      } else if (multi) {
        btns = `<button class="nf-btn primary" onclick="abrirPlayer('${c.youtube.replace(/'/g,"\\'")}','${c.titulo.replace(/'/g,"\\'")}','${c.fecha||''}',0)" aria-label="Ver">${svgIcon('i-play')}</button>`
             + `<button class="nf-btn secondary" onclick="abrirEscenasCasero(${c.id})" aria-label="Escenas">${svgIcon('i-list')} Escenas</button>`;
      } else {
        btns = `<button class="nf-btn primary" onclick="abrirPlayer('${c.youtube.replace(/'/g,"\\'")}','${c.titulo.replace(/'/g,"\\'")}','${c.fecha||''}',0)" style="flex:1">${svgIcon('i-play')} Ver</button>`;
      }

      return `<div class="nf-card ${hasVideo?'':'nf-proximamente'}">
        ${badge}
        ${thumb}
        <div class="nf-info">
          ${c.categoria?`<div class="nf-cat">${c.categoria}</div>`:''}
          <div class="nf-titulo">${c.titulo}</div>
          <div class="nf-fecha">${c.fecha||''}</div>
          <div class="nf-btns">${btns}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="decada-section">
      <div class="decada-title">Años ${dec < 2000 ? String(dec).slice(2) : dec}<small>${items.length} vídeo${items.length !== 1 ? 's' : ''}</small></div>
      <div class="decada-row" id="decada-row-${dec}">${cards}</div>
    </div>`;
  }).join('');

  // Drag to scroll each row
  el.querySelectorAll('.decada-row').forEach(row => {
    let isDown=false, startX, scrollLeft;
    row.addEventListener('mousedown', e=>{isDown=true;row.style.cursor='grabbing';startX=e.pageX-row.offsetLeft;scrollLeft=row.scrollLeft;});
    row.addEventListener('mouseleave',()=>{isDown=false;row.style.cursor='grab';});
    row.addEventListener('mouseup',()=>{isDown=false;row.style.cursor='grab';});
    row.addEventListener('mousemove',e=>{if(!isDown)return;e.preventDefault();row.scrollLeft=scrollLeft-(e.pageX-row.offsetLeft-startX)*1.5;});
  });
}

