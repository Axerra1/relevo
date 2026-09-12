# Fase 1 · Medición de la realidad

**Escenario:** nada construido. Cero código. Toda capacidad descrita en los dos researches
está en futuro. Por eso "medir la realidad" acá son dos cosas: verificar las afirmaciones
externas que los documentos dan por ciertas, y medir qué es construible en el reloj real
(4 horas, hackathon AI Tinkerers "Agents, Everywhere", cierre 12-sep-2026 16:30 -05).

Procedencias: **Medido** / **Citado** / **Estimado** / **TBD**

---

## M1 · Cita legal errada en la crítica
**Citado.** `critica.md` atribuye a la "Sentencia T-203 de 2022" la taxonomía de espacios
(privado / semiprivado / semipúblico / público) y la clasificación del lugar de trabajo como
semiprivado. La sentencia que efectivamente contiene esa doctrina es la **T-280 de 2022**
(corteconstitucional.gov.co/Relatoria/2022/T-280-22.htm), que `validacion.md` sí cita bien.

**Consecuencia:** el fondo del argumento de la crítica se sostiene (el lugar de trabajo *es*
semiprivado y la expectativa de intimidad no desaparece), pero su cita no. No copies
referencias legales desde `critica.md` al pitch sin verificarlas.

## M2 · La cifra de USD 50.000 millones está mal atribuida
**Citado, con atribución incorrecta.** Ambos documentos usan "USD 50.000 millones anuales en
pérdidas por entregas de turno deficientes". Rastreando la fuente: el número original es de
**Aberdeen Research y corresponde a *downtime no planeado* en manufactura de EE. UU. en
general**, no a entregas de turno. Blogs de proveedores (eviview.com, teamsense.com) lo
reatribuyeron al handover y los researches heredaron la reatribución.

**Consecuencia:** inutilizable como dolor atribuible al handover. Sirve como **techo del
mercado adyacente**, nada más. Dolor real atribuible al handover: **TBD**. Vía para
conseguirlo: medir en un cliente piloto los minutos de downtime cuyo parte de causa raíz
mencione información no transferida entre turnos.

## M3 · El "80% de errores graves involucra fallas de comunicación en el handover"
**Estimado / fuente débil.** Sale de myshyft.com, blog de proveedor, sin estudio primario.
Los casos catastróficos que sí tienen investigación oficial (Texas City 2005, Piper Alpha,
Deepwater Horizon) respaldan que el handover fue **un** factor, no que sea el 80% de todo.
Usa los casos, no el porcentaje.

## M4 · La Zello Channel API existe y es usable — hallazgo que cambia el proyecto
**Citado.** Zello publica una **Channel API basada en WebSocket con protocolo JSON**, SDKs
abiertos (iOS / Android / web) y soporte explícito para enviar audio desde tu propio código y
recibir el audio del canal. Hay librerías de bots de terceros (`ts-zello` en npm).
Repo: github.com/zelloptt/zello-channel-api — marcado **BETA**.

**Consecuencia:** el agente puede entrar a una **red PTT real y en producción**, no a una
maqueta propia. Esto mueve materialmente dos criterios del hackathon (Innovation & Theme
Alignment, Technical Execution) porque el entorno deja de ser inventado por nosotros.
Riesgo: cuenta/token y API en beta. Ver decisión D5.

## M5 · El cuello de botella half-duplex es real. La crítica gana este punto
**Medido por física del medio, no requiere fuente.** En un canal PTT hay un solo hablante a la
vez. Si el agente transmite un resumen de 60 segundos, **el canal queda bloqueado 60 segundos
para todos los humanos, incluido quien necesite pedir auxilio.**

**Consecuencia de diseño, obligatoria y no negociable:** transmisiones del agente en ráfagas
de **≤ 3 segundos**, solo sobre canal en silencio, y **corte inmediato del TTS si cualquier
humano aprieta PTT**. Esto entra al PRD como principio con prohibición explícita.

## M6 · El vocoder AMBE+2 no aplica al alcance del MVP
**Citado, con alcance mal delimitado en la crítica.** La crítica presenta la destrucción
espectral de AMBE+2 (y el salto de WER de ~8-13% a 55-69%) como barrera general del concepto.
Es barrera **solo del camino LMR/DMR analógico-digital de banda estrecha**. Sobre PoC / Zello,
el audio viaja en IP de banda ancha y ese cuello de botella no existe.

**Consecuencia:** si el alcance se declara "PoC primero", el problema sale del MVP por
definición, no por optimismo. El camino LMR vía gateway RoIP queda como fase posterior.

## M7 · Estado del producto: cero
**Medido.** No hay repositorio, no hay código, no hay pipeline. Ninguna de las capacidades
descritas en presente en los dos documentos existe hoy.

## M8 · Los dos documentos se contradicen en el comportamiento central del agente
**Medido por lectura cruzada.** `validacion.md` propone un agente **proactivo** que avisa a
los 60 segundos de una petición sin respuesta. `critica.md` argumenta que eso produce fatiga
de alerta y silenciamiento deliberado de los equipos, y recomienda migrar a **Push-to-Query**
(el humano interroga al agente). Es el conflicto más importante del expediente: define qué se
construye. Ver decisión D1.

## M9 · Techo de tiempo real para el demo
**Estimado.** Con cierre 16:30 y necesidad de repo + video de 2 minutos + post, el tiempo neto
de código es de **~3 horas**, no 4. Cualquier alcance que no quepa ahí no es alcance, es deseo.
