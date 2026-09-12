# Entrega · AI Tinkerers "Agents, Everywhere"

## Título

**Relevo — el canal de radio que recuerda**

---

## Descripción (portal)

La radio push-to-talk es el único canal de trabajo que todavía no tiene memoria. En obra, seguridad, logística y eventos, lo importante se dice en voz alta y se evapora al soltar el botón: las peticiones se caen en el silencio sin que nadie sepa qué quedó pendiente, y ocho horas de operación se entregan de memoria en un relevo de dos minutos.

**Relevo es un agente que participa dentro del canal de radio, como un integrante más.** No tiene pantalla ni app, y nadie tiene que cambiar cómo trabaja. Escucha todas las transmisiones, sostiene el estado que ningún humano alcanza a tener completo, y habla por voz en solo dos momentos: cuando una petición lleva demasiado tiempo sin respuesta, y cuando alguien pide el relevo de turno.

**Lo que no se puede hacer en un chatbox:** el valor no sale de una conversación uno a uno, sale de oír a todos a la vez y sostener el estado en el tiempo.

### Corre sobre una red PTT real

Probado hoy en vivo sobre **Zello Work**, con voz real desde un celular:
- La voz entra como paquetes Opus crudos, se decodifica, se transcribe y se clasifica.
- La voz del agente se sintetiza, se codifica a Opus y sale por el canal al celular.
- **La identidad de quien habla llega firmada por la red.** Relevo nunca analiza la voz de nadie: sin huella vocal, sin dato biométrico.

### Decisiones de diseño que salieron de medir, no de suponer

- **En una radio solo habla uno a la vez**, así que cada segundo que el agente ocupa el canal cuenta. Lo medimos: un aviso mínimo en español dura entre 4,6 y 5,1 segundos. Relevo escribe corto, nunca corta su propia frase, y habla solo dos veces.
- **No afirma lo que no puede citar.** Cada pendiente guarda la frase exacta de la que salió y su nivel de confianza. Lo que no se entendió va a revisión humana, no se inventa.
- **El cierre no depende de una transcripción perfecta.** Una respuesta se empareja con su pendiente por lo que significa: "ya va subiendo el material", transcrito como "estaba subiendo", igual cerró la petición correcta.
- **Cualquiera lo apaga hablando:** "Relevo, silencio".

### Qué es real y qué no

Lo que corre de punta a punta sobre Zello Work: la entrada de voz, la clasificación, la bitácora, el aviso por voz, el cierre por respuesta y el relevo de turno. Hay además 42 pruebas automatizadas del árbitro del canal.

Lo que queda abierto, dicho sin rodeos: en una red PTT real el turno lo arbitra la red, así que mientras el agente habla (~5 s) nadie puede transmitir, tampoco una emergencia. Está acotado por la duración del aviso, no resuelto; la mitigación es la prioridad de roles de la red, que no alcanzamos a verificar. El expediente completo — Product Vision Board, PRD de 13 segmentos y la medición de qué afirmaciones de nuestra propia investigación no resistieron verificación — está en el repositorio.

**Stack:** Node.js · Zello Channel API · Opus · OpenAI (transcripción, clasificación, voz del agente) · ElevenLabs (narración del video)

**Repo:** https://github.com/Axerra1/relevo

---

## Post para redes

> La radio push-to-talk es el único canal de trabajo que todavía no tiene memoria. 📻
>
> En obra, lo importante se dice por radio y se evapora al soltar el botón. Peticiones que nadie contestó. Ocho horas de operación entregadas de memoria en dos minutos.
>
> Construimos **Relevo** en el hackathon **Agents, Everywhere** de AI Tinkerers Bogotá: un agente que vive *dentro* del canal de radio. Sin pantalla, sin app. Escucha a todos a la vez, recuerda lo que nadie alcanza a retener, y habla solo cuando algo se está cayendo.
>
> Corre sobre una red PTT real. Y cualquiera lo apaga diciendo: "Relevo, silencio".
>
> 🔗 github.com/Axerra1/relevo
>
> Gracias a AI Tinkerers y a los partners del evento: OpenAI, CopilotKit, OpenRouter, Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla y Google Cloud Run.
>
> #AgentsEverywhere #AITinkerers #IA #Construcción

**Antes de publicar:** etiqueta las cuentas desde la propia plataforma (LinkedIn y X autocompletan al escribir @). No puse los handles exactos porque no los verifiqué.
