/**
 * Bitacora en modo demo: un turno de obra completo donde cada funcion de Relevo aparece al
 * menos una vez, etiquetada. Es una HISTORIA ILUSTRATIVA para mostrar como se ve el sistema
 * y que hace; no es un registro real, y la pagina lo dice.
 *
 * La historia respeta el comportamiento real del codigo: el presupuesto de 2 avisos por hora
 * cuadra con los horarios, el aviso suprimido o silenciado se pierde y el pendiente sigue
 * abierto, una respuesta sin pendiente claro no se registra como item, y el corte por PTT va
 * marcado como canal propio porque en Zello la red no deja interrumpir al agente.
 */
(() => {
  // ------------------------------------------------------------------- funciones
  const FN = {
    identidad:   ['Identidad de red', 'Quién habla lo firma la red PTT (el campo from de Zello). Relevo nunca analiza la voz de nadie: no hay huella vocal.'],
    privacidad:  ['Audio descartado', 'El audio se borra en cuanto se transcribe. En la bitácora solo queda texto.'],
    clasif:      ['Clasificación', 'Cada transmisión se etiqueta como petición, respuesta, cierre o reporte, con su nivel de confianza.'],
    reporte:     ['Reporte', 'Un parte de estado queda escrito en la bitácora, pero no arranca reloj ni dispara avisos.'],
    aviso:       ['Aviso', 'Si una petición pasa el umbral sin respuesta y el canal está en silencio, el agente la transmite por voz. Una sola vez, corto.'],
    cierre:      ['Cierre por respuesta', 'Una respuesta se empareja con su pendiente por lo que significa, no por palabras exactas. Funciona aunque la transcripción no salga perfecta.'],
    conservador: ['Cierre conservador', 'Si una respuesta no corresponde claramente a un pendiente, no se cierra nada. Cerrar el equivocado es peor que no cerrar.'],
    corte:       ['Corte ante PTT', 'Si un humano aprieta mientras el agente habla, el agente se calla en el acto. Solo en canal propio: en Zello la red no deja interrumpir.'],
    respondia:   ['Veredicto: respondía', 'Si la interrupción respondía el pendiente que se estaba anunciando, se cierra y el agente no repite.'],
    reintento:   ['Veredicto: reintento', 'Si la interrupción era de otro tema, el agente repite el mensaje completo en el siguiente silencio. Una sola vez.'],
    noentendido: ['No entendido', 'Con confianza baja no se adivina: el ítem va a revisión humana citando lo poco que se oyó.'],
    presupuesto: ['Presupuesto', 'Máximo 2 avisos no solicitados por hora de canal. El silencio es el estado por defecto.'],
    killswitch:  ['Kill switch', '«Relevo, silencio» lo apaga desde el canal y «Relevo, activo» lo reactiva. Se detecta antes de clasificar.'],
    sordo:       ['Modo sordo', 'Silenciado, sigue escuchando y registrando. Los avisos de ese rato se pierden a propósito; los pendientes no.'],
    manual:      ['Cierre manual', 'El supervisor cierra un pendiente desde la bitácora.'],
    relevo:      ['Relevo de turno', 'Por voz: transmite hasta 3 pendientes en ráfagas y el resto queda escrito. Es solicitado, así que no gasta presupuesto.'],
  };

  // -------------------------------------------------------------------- historia
  // [hora, quién, tipo, texto, detalle, funciones]
  // tipo: tx (humano) · agente (habla Relevo) · ok · revision · aviso (sistema)
  const E = [
    ['06:02:05', 'central', 'tx', 'Buenos días, arranca turno, cuadrillas reporten novedades.', 'reporte · conf 0.88 · identidad firmada por la red · audio descartado tras transcribir', ['identidad', 'privacidad', 'reporte']],
    ['06:04:10', 'torre3', 'tx', 'Central, necesito material en el piso 8, me copian.', 'petición · conf 0.90 · pendiente abierto, arranca el reloj', ['clasif']],
    ['06:04:31', 'grua', 'tx', 'Pluma libre, bajando el balde.', 'reporte · conf 0.91 · se registra, no arranca reloj', ['reporte']],
    ['06:04:44', 'central', 'tx', 'Grúa, QAP un minuto que estamos vaciando la placa.', 'reporte · conf 0.87', ['reporte']],
    ['06:05:12', 'RELEVO', 'agente', 'Pendiente. Material en el piso 8. Sin respuesta.', 'sin respuesta pasado el umbral · canal en silencio · 4,9 s', ['aviso']],
    ['06:05:19', 'central', 'ok', 'Estaba subiendo el material al ocho.', 'reporte · empareja con «Material en el piso 8» · conf 0.90 → cerrado · se dijo «ya va», se transcribió «estaba»', ['cierre']],

    ['07:20:33', 'torre3', 'tx', 'Central, falta el mixer en la torre 3, el vaciado se está secando.', 'petición · conf 0.92 · pendiente abierto', ['clasif']],
    ['07:21:08', 'RELEVO', 'agente', 'Pendiente. Falta el mixer en la torre 3. Sin respuesta.', '4,7 s', ['aviso']],
    ['07:21:10', 'sistema', 'aviso', 'grúa aprieta PTT → Relevo cortado a los 2,1 s', 'canal propio · en Zello la red no deja interrumpir', ['corte']],
    ['07:21:12', 'grua', 'tx', 'Confirmo pluma parada por viento.', 'veredicto: otro tema · conf 0.88 → reintento único · queda registrado como reporte', ['reintento']],
    ['07:21:17', 'RELEVO', 'agente', 'Pendiente. Falta el mixer en la torre 3. Sin respuesta.', 'repite el mensaje completo · último intento', ['reintento']],
    ['07:22:30', 'central', 'ok', 'Mixer saliendo de planta, llega en diez.', 'respuesta · empareja con «Falta el mixer en la torre 3» · conf 0.86 → cerrado', ['cierre']],

    ['08:25:05', 'torre2', 'tx', 'Central, necesito el arnés de repuesto en el 6.', 'petición · conf 0.91 · pendiente abierto', ['clasif']],
    ['08:25:40', 'RELEVO', 'agente', 'Pendiente. Arnés de repuesto en el 6. Sin respuesta.', '4,6 s', ['aviso']],
    ['08:25:42', 'sistema', 'aviso', 'central aprieta PTT → Relevo cortado a los 1,8 s', 'canal propio', ['corte']],
    ['08:25:44', 'central', 'ok', 'Ya va HSE con el arnés al 6.', 'veredicto: respondía · conf 0.93 → cerrado por interrupción · no repite', ['respondia']],
    ['08:50:17', 'grua', 'revision', 'Central… la… kshh… en el sótano… kshh.', 'confianza 0.31 · no se adivina → revisión humana', ['noentendido']],

    ['09:39:50', 'torre2', 'tx', 'Central, necesito figurado de doce en el 7.', 'petición · conf 0.90 · pendiente abierto', ['clasif']],
    ['09:40:25', 'RELEVO', 'agente', 'Pendiente. Figurado de doce en el 7. Sin respuesta.', 'aviso 1 de 2 en la última hora', ['aviso', 'presupuesto']],
    ['09:40:40', 'central', 'ok', 'Copiado, mando figurado de doce al 7.', 'respuesta · conf 0.94 → cerrado', ['cierre']],
    ['09:57:40', 'central', 'tx', 'Almacén, confirmen si llegó el acero de tres octavos.', 'petición · conf 0.89 · pendiente abierto', ['clasif']],
    ['09:58:15', 'RELEVO', 'agente', 'Pendiente. Confirmar llegada del acero de tres octavos. Sin respuesta.', 'aviso 2 de 2 en la última hora', ['aviso', 'presupuesto']],
    ['10:14:50', 'torre3', 'tx', 'Central, hay que revisar el arnés de la cuadrilla 2, está rozado.', 'petición · conf 0.92 · pendiente abierto', ['clasif']],
    ['10:15:25', 'sistema', 'aviso', 'Aviso suprimido: 2 de 2 avisos usados en la última hora', 'el aviso se pierde · el pendiente sigue abierto', ['presupuesto']],
    ['10:20:02', 'grua', 'tx', 'Copiado, ya quedó listo el balde.', 'respuesta · no corresponde a ningún pendiente · conf 0.18 → no cierra nada', ['conservador']],

    ['11:30:00', 'central', 'aviso', 'Relevo, silencio.', 'SILENCIADO · detectado antes de clasificar', ['killswitch']],
    ['11:42:36', 'torre3', 'tx', 'Central, necesito la bomba de achique en el sótano 1.', 'petición · conf 0.90 · pendiente abierto', ['clasif', 'sordo']],
    ['11:43:11', 'sistema', 'aviso', 'Aviso omitido: Relevo está silenciado', 'sigue escuchando y registrando', ['sordo']],
    ['12:05:00', 'central', 'tx', 'Relevo, activo.', 'reactivado', ['killswitch']],
    ['12:20:14', 'supervisor', 'ok', 'Cierra a mano «Confirmar llegada del acero de tres octavos»', 'desde la bitácora · razón: supervisor', ['manual']],

    ['13:58:10', 'central', 'tx', 'Relevo, relevo de turno.', 'solicitado · no gasta presupuesto', ['relevo']],
    ['13:58:12', 'RELEVO', 'agente', 'Abierto 1. Revisar arnés de la cuadrilla 2, está rozado.', 'ráfaga 1', ['relevo']],
    ['13:58:17', 'RELEVO', 'agente', 'Abierto 2. Bomba de achique en el sótano 1.', 'ráfaga 2', ['relevo']],
    ['13:58:21', 'sistema', 'aviso', 'Relevo de turno: 2 de 2 al aire · 1 audio sin entender queda en revisión', 'todo lo demás queda escrito en la bitácora', ['relevo']],
  ].map(([hora, quien, tipo, texto, detalle, fns]) => ({ hora, quien, tipo, texto, detalle, fns }));

  // Estado de la bitacora al terminar el turno, coherente con la historia.
  const ABIERTOS = [
    ['Revisar arnés de la cuadrilla 2, está rozado', 'petición · torre3 · 10:14 · conf 0.92', 'Central, hay que revisar el arnés de la cuadrilla 2, está rozado.', 'aviso suprimido por presupuesto'],
    ['Bomba de achique en el sótano 1', 'petición · torre3 · 11:42 · conf 0.90', 'Central, necesito la bomba de achique en el sótano 1.', 'aviso omitido: estaba silenciado'],
  ];
  const REVISION = [
    ['(audio no entendido)', 'grua · 08:50 · conf 0.31', 'Central… la… kshh… en el sótano… kshh.', 'no se adivinó'],
  ];
  const CERRADOS = [
    ['Material en el piso 8', 'por respuesta · 06:05'],
    ['Falta el mixer en la torre 3', 'por respuesta, tras un reintento · 07:22'],
    ['Arnés de repuesto en el 6', 'por interrupción · 08:25'],
    ['Figurado de doce en el 7', 'por respuesta · 09:40'],
    ['Confirmar llegada del acero de tres octavos', 'a mano, por el supervisor · 12:20'],
  ];

  // ------------------------------------------------------------------------ estilo
  const css = document.createElement('style');
  css.textContent = `
    main { max-width: 1320px !important; }
    .d-banner { display:flex; gap:12px; align-items:center; background:#1b1508; border:1px solid #5a4210;
      color:#e9c46a; border-radius:9px; padding:10px 14px; font-size:13px; margin-bottom:16px; }
    .d-banner b { letter-spacing:.12em; font-size:11px; background:#5a4210; color:#ffe2a0; padding:2px 8px; border-radius:4px; }
    .d-stats { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
    .d-stat { background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:10px 14px; min-width:120px; }
    .d-stat .n { font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.1; }
    .d-stat .l { font-size:11px; color:var(--dim); letter-spacing:.06em; margin-top:2px; }
    .d-chips { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:10px; }
    .d-chip { background:var(--panel); border:1px solid var(--line); color:var(--fg); border-radius:999px;
      padding:5px 11px; font:12px ui-sans-serif,system-ui,sans-serif; cursor:pointer; white-space:nowrap; }
    .d-chip span { color:var(--dim); margin-left:5px; font-variant-numeric:tabular-nums; }
    .d-chip.on { background:#12263d; border-color:var(--agent); color:#cfe6ff; }
    .d-desc { min-height:40px; font-size:13px; color:var(--dim); margin:0 0 16px; padding:9px 12px;
      border-left:3px solid var(--agent); background:rgba(88,166,255,.06); border-radius:0 7px 7px 0; }
    .d-desc b { color:var(--fg); }
    .d-grid { display:grid; grid-template-columns:1.45fr .85fr; gap:20px; align-items:start; }
    @media (max-width:980px){ .d-grid { grid-template-columns:1fr; } }
    .d-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .d-head h2 { margin:0; }
    .d-play { margin-left:auto; background:var(--panel); border:1px solid var(--line); color:var(--fg);
      border-radius:7px; padding:5px 12px; font:12px ui-sans-serif,system-ui,sans-serif; cursor:pointer; }
    .d-row { display:grid; grid-template-columns:70px 92px 1fr; gap:10px; padding:9px 12px; margin-bottom:6px;
      background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line); border-radius:8px; }
    .d-row.agente { border-left-color:var(--agent); background:linear-gradient(90deg,rgba(88,166,255,.09),var(--panel) 45%); }
    .d-row.ok { border-left-color:var(--ok); }
    .d-row.revision { border-left-color:var(--live); }
    .d-row.aviso { border-left-color:var(--warn); }
    .d-row.oculto { display:none; }
    .d-row.entra { animation:d-in .35s ease-out; }
    @keyframes d-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
    .d-t { font:12px ui-monospace,Consolas,monospace; color:var(--dim); padding-top:2px; }
    .d-who { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding-top:2px; color:var(--dim); }
    .d-row.agente .d-who { color:var(--agent); }
    .d-txt { font-size:14px; }
    .d-row.agente .d-txt { font-weight:600; color:#dbeaff; }
    .d-det { font-size:12px; color:var(--dim); margin-top:3px; }
    .d-tags { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
    .d-tag { font-size:10.5px; letter-spacing:.03em; padding:1px 7px; border-radius:999px; border:1px solid var(--line); color:var(--dim); }
    .d-side .item { margin-bottom:8px; }
    .d-small { font-size:12px; color:var(--dim); }
  `;
  document.head.appendChild(css);

  // --------------------------------------------------------------------- render
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cuenta = {};
  E.forEach((e) => e.fns.forEach((f) => (cuenta[f] = (cuenta[f] || 0) + 1)));

  const humanas = E.filter((e) => !['RELEVO', 'sistema', 'supervisor'].includes(e.quien)).length;
  const hablo = E.filter((e) => e.tipo === 'agente').length;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="d-banner"><b>DEMO</b> Historia ilustrativa de un turno de obra. Cada evento muestra una función del sistema; no es un registro real.</div>

    <div class="d-stats">
      <div class="d-stat"><div class="n">${humanas}</div><div class="l">transmisiones</div></div>
      <div class="d-stat"><div class="n" style="color:var(--agent)">${hablo}</div><div class="l">veces habló Relevo</div></div>
      <div class="d-stat"><div class="n" style="color:var(--ok)">${CERRADOS.length}</div><div class="l">pendientes cerrados</div></div>
      <div class="d-stat"><div class="n" style="color:var(--warn)">${ABIERTOS.length}</div><div class="l">abiertos al relevo</div></div>
      <div class="d-stat"><div class="n" style="color:var(--live)">${REVISION.length}</div><div class="l">en revisión humana</div></div>
      <div class="d-stat"><div class="n">${Object.keys(FN).length}</div><div class="l">funciones en esta historia</div></div>
    </div>

    <h2>Funciones · toca una para filtrar</h2>
    <div class="d-chips" id="d-chips">
      <button class="d-chip on" data-fn="">Todas<span>${E.length}</span></button>
      ${Object.entries(FN).map(([k, [nombre]]) => `<button class="d-chip" data-fn="${k}">${esc(nombre)}<span>${cuenta[k] || 0}</span></button>`).join('')}
    </div>
    <div class="d-desc" id="d-desc">Un turno de 06:00 a 14:00 en una obra. Toca una función para ver solo los eventos donde aparece y qué hace.</div>

    <div class="d-grid">
      <div>
        <div class="d-head"><h2>Registro del turno</h2><button class="d-play" id="d-play">▶ Reproducir turno</button></div>
        <div id="d-log">${E.map((e, i) => fila(e, i)).join('')}</div>
      </div>
      <div class="d-side">
        <h2>Abierto al relevo</h2>
        ${ABIERTOS.map(([s, m, c, n]) => tarjeta('abierto', s, m, c, n)).join('')}
        <h2 style="margin-top:20px">Requiere revisión humana</h2>
        ${REVISION.map(([s, m, c, n]) => tarjeta('requiere_revision', s, m, c, n)).join('')}
        <h2 style="margin-top:20px">Cerrados</h2>
        ${CERRADOS.map(([s, m]) => `<div class="item cerrado"><div class="subj">${esc(s)}</div><div class="meta">${esc(m)}</div></div>`).join('')}
      </div>
    </div>`;

  function fila(e, i) {
    return `<div class="d-row ${e.tipo}" data-i="${i}" data-fns="${e.fns.join(' ')}">
      <div class="d-t">${esc(e.hora)}</div>
      <div class="d-who">${esc(e.quien)}</div>
      <div>
        <div class="d-txt">${e.tipo === 'agente' ? '🔊 ' : ''}${esc(e.texto)}</div>
        <div class="d-det">${esc(e.detalle)}</div>
        <div class="d-tags">${e.fns.map((f) => `<span class="d-tag">${esc(FN[f][0])}</span>`).join('')}</div>
      </div>
    </div>`;
  }

  function tarjeta(estado, s, m, c, nota) {
    return `<div class="item ${estado}">
      <div class="subj">${esc(s)}</div>
      <div class="meta">${esc(m)}</div>
      <div class="cite">&ldquo;${esc(c)}&rdquo;</div>
      <div class="d-small" style="margin-top:6px">${esc(nota)}</div>
    </div>`;
  }

  // --------------------------------------------------------------------- filtro
  const filas = [...document.querySelectorAll('.d-row')];
  const desc = document.getElementById('d-desc');
  const textoInicial = desc.innerHTML;
  document.getElementById('d-chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.d-chip');
    if (!chip) return;
    document.querySelectorAll('.d-chip').forEach((c) => c.classList.toggle('on', c === chip));
    const fn = chip.dataset.fn;
    filas.forEach((r) => r.classList.toggle('oculto', !!fn && !r.dataset.fns.split(' ').includes(fn)));
    desc.innerHTML = fn ? `<b>${esc(FN[fn][0])}.</b> ${esc(FN[fn][1])}` : textoInicial;
  });

  // ------------------------------------------------------------------ reproducir
  let timer = null;
  document.getElementById('d-play').addEventListener('click', (ev) => {
    clearTimeout(timer);
    document.querySelector('.d-chip[data-fn=""]').click();
    filas.forEach((r) => { r.classList.add('oculto'); r.classList.remove('entra'); });
    let i = 0;
    const paso = () => {
      if (i >= filas.length) { ev.target.textContent = '▶ Reproducir turno'; return; }
      filas[i].classList.remove('oculto');
      filas[i].classList.add('entra');
      filas[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      i++;
      timer = setTimeout(paso, filas[i - 1].classList.contains('agente') ? 1400 : 750);
    };
    ev.target.textContent = '■ Reproduciendo…';
    paso();
  });
})();
