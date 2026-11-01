// Ventanas propias de aviso y confirmación, en lugar de alert() y confirm() del navegador.
//   await avisar('Texto', { titulo })                       -> se cierra con "Aceptar"
//   if (!await confirmar('¿Borrar?', { aceptar: 'Borrar', peligro: true })) return;
// Escape o pulsar fuera = cancelar. Si ya hay una abierta, la nueva espera su turno.
(function () {
  let cola = Promise.resolve();

  function abrir({ titulo, texto, botones }) {
    return new Promise(resolve => {
      const previo = document.activeElement;
      const velo = document.createElement('div');
      velo.className = 'dlg-velo';
      velo.innerHTML = '<div class="dlg-caja" role="alertdialog" aria-modal="true">' +
        (titulo ? '<h3 class="dlg-titulo"></h3>' : '') + '<p class="dlg-texto"></p><div class="dlg-botones"></div></div>';
      const caja = velo.firstChild;
      if (titulo) { caja.querySelector('.dlg-titulo').textContent = titulo; caja.setAttribute('aria-label', titulo); }
      caja.querySelector('.dlg-texto').textContent = texto || '';
      const zona = caja.querySelector('.dlg-botones');
      let hecho = false;
      const cerrar = valor => {
        if (hecho) return;
        hecho = true;
        document.removeEventListener('keydown', teclas, true);
        velo.classList.remove('open');
        setTimeout(() => velo.remove(), 220);
        if (previo && previo.focus) try { previo.focus({ preventScroll: true }); } catch (e) {}
        resolve(valor);
      };
      const els = botones.map(b => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'dlg-btn' + (b.clase ? ' ' + b.clase : '');
        el.textContent = b.texto;
        el.addEventListener('click', ev => { ev.stopPropagation(); cerrar(b.valor); });
        zona.appendChild(el);
        return el;
      });
      function teclas(ev) {
        if (ev.key === 'Escape' || ev.key === 'GoBack' || ev.keyCode === 461) {   // 461 = Atrás del mando LG
          ev.preventDefault(); ev.stopPropagation(); cerrar(false);
        } else if (ev.key === 'Tab') {                                             // el foco no sale de la ventana
          const i = els.indexOf(document.activeElement);
          const j = ev.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length;
          ev.preventDefault(); els[j].focus();
        }
      }
      velo.addEventListener('click', ev => { if (ev.target === velo) cerrar(false); });
      document.addEventListener('keydown', teclas, true);
      document.body.appendChild(velo);
      requestAnimationFrame(() => velo.classList.add('open'));
      const f = botones.findIndex(b => b.foco);            // en borrados, el foco empieza en Cancelar
      els[f >= 0 ? f : els.length - 1].focus({ preventScroll: true });
    });
  }

  function enCola(op) {
    const p = cola.then(() => abrir(op));
    cola = p.catch(() => {});
    return p;
  }

  window.avisar = (texto, o = {}) =>
    enCola({ titulo: o.titulo || '', texto, botones: [{ texto: o.aceptar || 'Aceptar', valor: true }] }).then(() => undefined);

  window.confirmar = (texto, o = {}) =>
    enCola({
      titulo: o.titulo || '', texto,
      botones: [
        { texto: o.cancelar || 'Cancelar', valor: false, clase: 'sec', foco: !!o.peligro },
        { texto: o.aceptar || 'Aceptar', valor: true, clase: o.peligro ? 'peligro' : '' }
      ]
    });
})();
