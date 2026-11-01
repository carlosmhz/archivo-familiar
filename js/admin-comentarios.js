// ─── COMENTARIOS (pestaña del panel de administración) ───────────────────────
// Lista los últimos comentarios de todos los vídeos y permite borrarlos.
function escAdm(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function cargarComentariosAdmin() {
  const el = document.getElementById('com-admin-lista');
  const elMg = document.getElementById('com-admin-megusta');
  el.innerHTML = '<div class="loading">Cargando...</div>';
  let d;
  try {
    const r = await fetch(`${API}?action=comentarios-recientes&pass=${encodeURIComponent(PASS)}`);
    d = await r.json();
  } catch (e) { d = { ok: false, msg: 'Sin conexión' }; }
  if (!d.ok) { el.innerHTML = `<p style="font-size:13px;color:#c0392b;">${escAdm(d.msg || 'Error')}</p>`; elMg.innerHTML = ''; return; }
  const roles = { todo: 'Familia', caseros: 'Familia', compartir: 'Invitado', admin: 'Admin' };
  el.innerHTML = d.data.comentarios.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tbody>${d.data.comentarios.map(c => `
      <tr style="border-bottom:1px solid #eef2f8;vertical-align:top;">
        <td style="padding:10px 4px;">
          <div style="font-size:11px;color:#5a7299;margin-bottom:3px;">
            <b style="color:#1a2a4a;">${escAdm(c.nombre)}</b> · ${escAdm(roles[c.rol] || c.rol || '')} · ${new Date(c.creado * 1000).toLocaleString('es-ES')}
          </div>
          <div style="font-size:11px;color:#2056a8;margin-bottom:4px;">${escAdm(c.video)}${c.escena ? ' · Escena «' + escAdm(c.escena.titulo) + '»' : ''}</div>
          <div style="white-space:pre-wrap;overflow-wrap:anywhere;color:#1a2a4a;">${escAdm(c.texto)}</div>
        </td>
        <td style="padding:10px 4px;width:44px;"><button onclick="borrarComentarioAdmin(${c.id})" class="btn btn-danger" title="Borrar">✕</button></td>
      </tr>`).join('')}</tbody></table>`
    : '<p style="font-size:13px;color:#aab;">Aún no hay comentarios</p>';
  elMg.innerHTML = d.data.megusta.length
    ? d.data.megusta.map(m => `<div style="display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #eef2f8;font-size:13px;">
        <span>${escAdm(m.video)}</span><b>♥ ${m.total}</b></div>`).join('')
    : '<p style="font-size:13px;color:#aab;">Aún no hay me gusta</p>';
}

async function borrarComentarioAdmin(id) {
  if (!await confirmar('El comentario se borrará para todos.', { titulo: '¿Borrar este comentario?', aceptar: 'Borrar', peligro: true })) return;
  const r = await fetch(`${API}?action=comentarios-borrar&pass=${encodeURIComponent(PASS)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
  });
  const d = await r.json();
  if (!d.ok) await avisar(d.msg || 'Error', { titulo: 'No se pudo borrar' });
  cargarComentariosAdmin();
}
