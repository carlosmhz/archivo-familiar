// ─── COMPARTIDOS (pestaña del panel de administración) ───────────────────────
// Lista los PIN de compartir con su vídeo y escena, y permite borrarlos. Usa escAdm() de admin-comentarios.js.
function compFmtT(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

async function cargarCompartidosAdmin() {
  const el = document.getElementById('comp-admin-lista');
  el.innerHTML = '<div class="loading">Cargando...</div>';
  let d;
  try {
    const r = await fetch(`${API}?action=compartir-listar&pass=${encodeURIComponent(PASS)}`);
    d = await r.json();
  } catch (e) { d = { ok: false, msg: 'Sin conexión' }; }
  if (!d.ok) { el.innerHTML = `<p style="font-size:13px;color:#c0392b;">${escAdm(d.msg || 'Error')}</p>`; return; }
  if (!d.data.length) { el.innerHTML = '<p style="font-size:13px;color:#aab;">No hay PIN de compartir</p>'; return; }
  const th = 'text-align:left;padding:8px 4px;color:#5a7299;font-weight:700;letter-spacing:1px;font-size:11px;text-transform:uppercase;';
  el.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="border-bottom:2px solid #dce9fb;">
      <th style="${th}">PIN</th><th style="${th}">Vídeo</th><th style="${th}">Qué comparte</th><th style="${th}">Caduca</th><th></th>
    </tr></thead>
    <tbody>${d.data.map(c => {
      const video = c.video === null ? `<span style="color:#c0392b;">Vídeo borrado (id ${escAdm(c.caseroId)})</span>` : escAdm(c.video);
      const que = c.escenaIdx < 0
        ? 'Vídeo completo'
        : `Escena ${c.escenaIdx + 1}${c.escena ? ' «' + escAdm(c.escena) + '»' : ' (ya no existe)'} · desde ${compFmtT(c.t)}`;
      const cad = c.permanente ? 'Permanente'
        : c.caducado ? '<span style="color:#c0392b;">Caducado</span>'
        : new Date(c.expira * 1000).toLocaleString('es-ES');
      const aviso = c.pin.length < 6 ? ' <span title="PIN antiguo de 4 cifras" style="font-size:10px;color:#b07000;">(4 cifras)</span>' : '';
      return `<tr style="border-bottom:1px solid #eef2f8;vertical-align:top;">
        <td style="padding:8px 4px;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:2px;white-space:nowrap;">${escAdm(c.pin)}${aviso}</td>
        <td style="padding:8px 4px;color:#1a2a4a;">${video}</td>
        <td style="padding:8px 4px;color:#1a2a4a;">${que}</td>
        <td style="padding:8px 4px;color:#5a7299;font-size:11px;">${cad}</td>
        <td style="padding:8px 4px;"><button onclick="eliminarCompartido('${escAdm(c.pin)}')" class="btn btn-danger" title="Borrar">✕</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

async function eliminarCompartido(pin) {
  if (!await confirmar(`El PIN ${pin} dejará de funcionar al instante. A quien se lo diste ya no podrá entrar con él.`,
      { titulo: '¿Borrar este PIN?', aceptar: 'Borrar', peligro: true })) return;
  let d;
  try {
    const r = await fetch(`${API}?action=compartir-eliminar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: PASS, pin })
    });
    d = await r.json();
  } catch (e) { d = { ok: false, msg: 'Sin conexión' }; }
  if (!d.ok) await avisar(d.msg || 'Error', { titulo: 'No se pudo borrar' });
  cargarCompartidosAdmin();
}
