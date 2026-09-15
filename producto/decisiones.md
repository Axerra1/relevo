# Decisiones · Paso 0
Fecha: 2026-09-12. Contexto: hackathon AI Tinkerers "Agents, Everywhere", cierre 16:30 -05.
**Cuando este archivo y el PVB o el PRD discrepen, manda este archivo.**

---

## D1 · Comportamiento del agente → Proactivo con presupuesto de interrupción
**Conflicto:** `validacion.md` pide agente proactivo que avisa a los 60s. `critica.md` demuestra
que el proactivo ciego genera fatiga de alerta y silenciamiento deliberado de los equipos, y
recomienda migrar a Push-to-Query.

**Decidido:** proactivo, con techo duro. Nadie invoca al agente. Pero: ráfagas ≤3s, solo sobre
canal en silencio, corte inmediato del TTS si cualquier humano aprieta PTT, y máximo 2
transmisiones por hora de canal.

**Por qué:** Push-to-Query puro convierte el producto en un chatbot al que le hablas por voz, y
ahí se pierde lo único irreproducible en un chatbox (que el valor no nazca de una petición).
La crítica tiene razón en el daño, no en el remedio: el remedio es acotar la interrupción, no
eliminarla.

**Abierto:** el umbral de 2/hora es **Estimado**, sin evidencia. Vía para cerrarlo: medir en
un canal real cuántos avisos por hora tolera una cuadrilla antes de pedir que se apague.

## D2 · Vertical y comprador → Obra / construcción
Usa el trabajador de campo (sin cambiar nada de su trabajo). Paga el jefe de operaciones o el
coordinador HSE. El valor legible lo recibe el supervisor, en la bitácora y el handover.
**Por qué:** es la vertical con casos catastróficos de handover documentados oficialmente y
donde "manos y ojos ocupados" es evidente sin explicación.

## D3 · Entorno → Zello Channel API, con caja de 25 minutos
Se intenta la red PTT real (`ts-zello`, github.com/zelloptt/zello-channel-api, BETA). **Al
minuto 25 se decide:** si el audio fluye en ambas direcciones, ese es el demo. Si no, se cae a
PWA propia de hold-to-talk y no se vuelve a tocar Zello hoy.
**Por qué:** correr sobre una red en producción elimina la objeción de "el entorno lo inventaste
tú", que es la más peligrosa contra el criterio de Theme Alignment. Con caja de tiempo para
que el riesgo no se coma el build.

## D4 · Identidad → Sin biometría de voz. Nunca
La identidad del hablante se toma de la **metadata del remitente que la red PTT ya entrega**,
no de huella vocal. El audio original se destruye tras la extracción semántica; se retiene
únicamente texto con identidad disociada.
**Por qué:** la objeción más letal de `critica.md` (voiceprint = dato sensible, Ley 1581, riesgo
penal Art. 192) se neutraliza por arquitectura. En PTT la diarización es gratis y no biométrica
porque cada transmisión ya viene firmada por la red. Esto deja de ser un problema legal y pasa
a ser una ventaja de diseño.
**Prohibido explícitamente:** extraer, almacenar o comparar embeddings de voz; usar el sistema
para métricas de desempeño individual.

## D5 · Alcance de red → PoC / banda ancha primero. LMR después
El camino LMR/DMR con vocoder AMBE+2 queda fuera del MVP por alcance declarado, no por
optimismo. `critica.md` presenta la destrucción espectral de AMBE+2 como barrera general del
concepto; es barrera solo del camino de banda estrecha. Sobre IP no existe.
LMR entra en fase posterior vía gateway RoIP.

## D6 · Métricas de éxito (ningún documento las definía — vacío crítico)
1. **% de peticiones que se cierran** en vez de evaporarse. Baseline: desconocido, hoy no se
   puede medir porque no hay registro. Ese es justamente el problema.
2. **Transmisiones del agente por hora de canal.** Métrica que se mide hacia abajo: un agente
   que habla más no está trabajando más.

## D7 · Nombre → Relevo
Entrega de turno en español, y "relay" es vocabulario de radio.

---

## D8 · En una red PTT real, el agente termina y después habla el humano
*Decidido el 2026-09-12, 15:15 -05, tras la primera prueba sobre Zello Work.*

**Medido:** sobre Zello, mientras el agente transmite, el celular de un usuario normal **no
puede tomar el canal**. El servidor arbitra el turno y rechaza el PTT. El corte a mitad de
palabra que diseñamos (M7) y el veredicto de interrupción (M7b) nunca se disparan, porque la
transmisión humana nunca llega.

**Decidido:** se acepta. El agente completa su transmisión y la persona habla después. Es la
etiqueta normal de radio: no se pisa una transmisión en curso.

**Consecuencias, y lo que NO resuelve:**
1. M7 y M7b siguen construidos y probados, pero solo aplican donde Relevo controla el turno
   (el canal propio). En una red PTT real el turno no es de Relevo.
2. La brevedad del texto pasa a ser **la única** protección contra acaparar el canal. Cada
   aviso medido dura entre 4,6 y 5,1 segundos (ver commit del mismo día).
3. **La objeción de seguridad de `critica.md` queda abierta sobre redes reales:** si alguien
   necesita pedir auxilio durante esos ~5 segundos, no puede. No está resuelta, está
   acotada por la duración del aviso.
4. **TBD:** si Zello Work permite dar prioridad o interrupción a roles de despacho o
   emergencia, eso cerraría el punto 3. Vía: revisar la configuración de prioridad de
   canal en la consola de Zello Work. No verificado.

---

## D9 · Comercializar sin entrevistas de descubrimiento
*Decidido por Santiago el 2026-09-15, después del MVP.*

**Decidido:** se da por hecho que constructoras, empresas de eventos y de seguridad privada
tienen el dolor y pagarían por resolverlo. No se hacen las entrevistas E1 del segmento 13.

**Consecuencias:**
1. D2 se amplía: el ICP pasa de solo obra a **obra + eventos + seguridad privada**. Queda por
   decidir cuál va primero en el mensaje de marca: una landing no puede hablarle a los tres.
2. Los TBD de verbatims (PRD §3) y del precio (PVB §7) siguen abiertos. La primera evidencia
   real ya no viene de entrevistas sino de **las primeras conversaciones de venta y del primer
   piloto**. Cada conversación comercial registra tres cosas: ¿contó una historia real de una
   petición perdida?, ¿aceptó un piloto?, ¿a qué precio dijo que no?
3. La puerta del segmento 13 *"día 90 sin un solo canal piloto firmado"* pasa a ser la señal
   principal de que la tesis falla.

**Lo que NO se salta:** el concepto legal (E3). No es validación de mercado, es la condición
para operar: Relevo trata datos personales de los trabajadores del cliente, y un comprador HSE
no firma sin él.

---

## D10 · Marca: Relevo Radio
*Decidido por Santiago el 2026-09-15.*

El producto sigue llamándose **Relevo**; la marca comercial es **Relevo Radio**, con
**relevoradio.com** y **@relevoradio**. Motivo: los dominios de "relevo" están tomados (M10), y
el nombre compuesto es más distintivo frente al riesgo de marca descriptiva.
**Abierto:** comprar el dominio, reservar handles, y la consulta de marca con abogado (clases
9, 38, 42; marca mixta).

## D11 · Tres industrias al mismo tiempo
*Decidido por Santiago el 2026-09-15.*

Seguridad privada, construcción y eventos arrancan en paralelo. Se recomendó una sola primero;
se decidió así. **Cómo se ejecuta:** un mensaje central que no nombra industria ("la radio de
trabajo que recuerda") y un mensaje propio por industria — secciones separadas en la landing,
pilares rotativos en Instagram, y una versión del one-pager de venta por industria.
**Riesgo registrado:** tres mensajes diluyen la señal; se revisa cuál industria responde
primero y se decide si concentrar.

---

## Conflictos registrados pero no resueltos hoy
- **Dolor atribuible al handover:** TBD. La cifra de USD 50.000 millones de los dos researches
  está mal atribuida (ver `medicion.md` M2). Sin número defendible hasta medir en un piloto.
- **Reloj regulatorio de investigación de accidentes en Colombia:** plazo exacto TBD. Vía:
  verificar Resolución 1401 de 2007 y lo que exige la ARL como trazabilidad de comunicaciones.
  Importa porque probablemente es el reloj que fuerza la compra, no el ahorro de eficiencia.
- **Umbral de criticidad** que separa una petición que merece aviso de una que no: sin datos.
