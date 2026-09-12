# Relevo

### La radio push-to-talk es el único canal de trabajo que todavía no tiene memoria.

En obra, seguridad, logística y eventos todo lo importante se dice en voz alta y **se evapora
al soltar el botón**. Las peticiones caen en el silencio sin que nadie sepa qué quedó
pendiente, y ocho horas de operación se transfieren de memoria en una entrega de turno de dos
minutos.

Relevo mete un agente **como un participante más dentro del canal de radio**. Escucha todas
las transmisiones, sostiene el estado que ningún humano alcanza a tener completo, y transmite
con voz solo en dos momentos: cuando una petición lleva demasiado tiempo sin respuesta, y
cuando cambia el turno.

Nadie tiene que escribir, abrir una app ni cambiar cómo trabaja. La información ya se está
diciendo; el problema es que ningún humano la está escuchando completa.

**Eso es lo que no se puede reproducir en un chatbox:** el valor no nace de una conversación
uno a uno, sino de oír a todos a la vez y sostener el estado en el tiempo.

---

## Las tres decisiones que lo separan de un chatbot con voz

**1 · El canal es de los humanos.** En una radio PTT solo puede hablar uno a la vez. Un agente
que transmite 60 segundos bloquea el canal 60 segundos para todos, incluido quien necesite
pedir auxilio. Ráfagas de máximo 3 segundos, solo sobre silencio, corte del audio a mitad de
palabra si alguien aprieta PTT, y techo de 2 transmisiones por hora.

**2 · Si lo interrumpen, averigua si le respondieron.** Cuando alguien lo corta, clasifica esa
transmisión: si respondía el pendiente, lo cierra y no repite nunca; si era de otro tema,
reintenta el mensaje completo una sola vez; si no se puede determinar, no reintenta y lo manda
a revisión humana.

**3 · Sin huella vocal. Nunca.** La identidad del hablante no se deduce analizando la voz: se
toma del id de remitente que la red PTT ya entrega. En PTT la diarización es gratis y no
biométrica, porque el botón ya firmó y segmentó el audio. El audio original se descarta en
cuanto se transcribe.

Y cualquiera puede apagarlo hablando: *"Relevo, silencio"*.

---

## Cómo correr

```bash
cd relevo
npm install
cp .env.example .env    # pon tu OPENAI_API_KEY
npm run dev
```

Radio en `http://localhost:8787/?user=torre3`, bitácora en `?board=1`.
Se puede probar el ciclo completo **sin micrófono** desde la bitácora — ver
[`relevo/README.md`](relevo/README.md).

Las pruebas del árbitro corren sin API key:

```bash
cd relevo && node scripts/test-arbiter.js
```

---

## Qué hay en este repo

| Carpeta | Qué |
|---|---|
| [`relevo/`](relevo) | El código. Documentación técnica, arquitectura y alcance honesto en su README |
| [`producto/`](producto) | El expediente de producto: Product Vision Board, PRD de 13 segmentos, la medición de qué afirmaciones de la investigación resultaron falsas, y las decisiones de diseño con su razón |

`producto/medicion.md` es el que vale la pena abrir si tienes tiempo para uno: ahí está qué se
verificó de la investigación de partida y qué no resistió la verificación, incluida una cifra
de mercado mal atribuida que estuvo a punto de entrar al pitch.

---

Construido en el hackathon **AI Tinkerers "Agents, Everywhere"**, Bogotá, 12 de septiembre de
2026. El alcance real, lo que quedó sin verificar y lo que se excluyó a propósito está escrito
en [`relevo/README.md`](relevo/README.md); nada de este repo describe en presente algo que no
funcione.
