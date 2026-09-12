# Guion de transmisiones · obra, canal de operaciones

Tres voces. Cada transmisión son 3 a 7 segundos: corta, sin cortesía, con protocolo de radio.
Si dura más de una respiración, no suena a radio.

| Voz | Quién es | Tono |
|---|---|---|
| **TORRE 3** | Cuadrilla en la torre 3, pisos altos | Apurado, ruido de fondo |
| **CENTRAL** | Almacén y coordinación en obra | Plano, despachador |
| **GRÚA** | Operador de grúa torre | Pocas palabras, seco |

Jerga que hace que suene real: *me copia · copiado · QAP · cambio · adelante · en la escucha ·
placa · vaciado · formaleta · retro · mixer · figurado · sótano · maestro · residente · arnés*.

---

## Bloque 0 · La siembra, antes de grabar

No se graba. Se inyecta como texto con `npm run seed`, que carga el turno anterior a la bitácora
para que la pantalla no se vea vacía en cámara.

El script apaga a Relevo antes de sembrar y lo reactiva al final. O sea, siembra en **modo
sordo**: escucha y registra, pero no transmite. Así el turno anterior queda escrito sin que
salgan veinte avisos viejos al aire justo cuando empiezas a grabar.

Tarda unos 90 segundos. Córrelo, espera a que diga `listo para grabar`, y recién ahí graba.

---

## Bloque 1 · El canal vivo *(grabar)*

Arranca con el canal ocupado, para que se entienda que aquí no hay silencio ni orden.

| # | Voz | Línea |
|---|---|---|
| 1 | GRÚA | Central, voy a mover la pluma sobre el sótano 2, despejen abajo. |
| 2 | CENTRAL | Copiado grúa, sótano 2 despejado. |
| 3 | TORRE 3 | Central, el figurado que llegó es de nueve, no de doce. |
| 4 | CENTRAL | Copiado torre 3, lo reviso con almacén. |

**El agente no dice nada.** Eso es intencional y hay que dejarlo respirar en cámara: tres o
cuatro transmisiones y un agente callado. El espectador tiene que ver que no es un bot parlanchín.

---

## Bloque 2 · La petición que se entierra *(grabar — el corazón del video)*

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 5 | TORRE 3 | Central, necesito material en el piso 8, me copian. | Se abre el pendiente. Arranca el reloj |
| 6 | GRÚA | Pluma libre, bajando el balde. | Nadie le contestó al 8 |
| 7 | CENTRAL | Grúa, QAP un minuto que estamos vaciando la placa. | Sigue sin contestar |
| 8 | GRÚA | Copiado, en la escucha. | El canal siguió. La petición se perdió |

Aquí **no digas nada durante unos segundos**. Deja el silencio incómodo. Es el momento en que el
espectador entiende el problema solo, sin que nadie lo explique.

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 9 | **RELEVO** | *Pendiente. Solicita material en el piso 8. Sin respuesta.* | **Habla el agente.** Ráfaga de 3 segundos |

Que se escuche saliendo del altavoz del radio, no de un computador.

---

## Bloque 3 · La interrupción que responde *(grabar)*

Esta es la toma que hay que clavar. **Aprieta el PTT mientras el agente todavía está hablando.**

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 10 | CENTRAL | *(pisando al agente)* Ya va subiendo el material al 8. | El agente se corta **a mitad de palabra** |

Y luego el agente **no repite**. Averiguó que la interrupción respondía el pendiente, lo cerró y
se quedó callado. En la bitácora aparece cerrado, con la razón `interrupcion`.

En el video, esos dos segundos de silencio después del corte son lo que separa esto de un bot.

---

## Bloque 4 · La interrupción que no responde *(grabar, si alcanza el tiempo)*

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 11 | TORRE 3 | Central, falta el mixer en la torre 3, el vaciado se está secando. | Nuevo pendiente |
| 12 | GRÚA | Central, tengo viento fuerte, voy a parar la pluma. | Pasan los segundos, nadie contesta |
| 13 | **RELEVO** | *Pendiente. Falta el mixer en la torre 3. Sin respuesta.* | Habla el agente |
| 14 | GRÚA | *(pisando al agente)* Confirmo pluma parada por viento. | Corta al agente, pero de **otro tema** |
| 15 | **RELEVO** | *Pendiente. Falta el mixer en la torre 3. Sin respuesta.* | **Repite completo, una sola vez** |

La diferencia entre el bloque 3 y el 4 es todo el argumento técnico: el agente no reacciona a
que lo interrumpieron, reacciona a **qué** le dijeron.

---

## Bloque 5 · Lo que no entendió *(grabar — 20 segundos bien invertidos)*

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 16 | TORRE 3 | *(tapando el micrófono, hablando encima del ruido)* Central… la… kshh… en el sótano… kshh. | Confianza baja |

El agente **no transmite nada** y en la bitácora aparece en *Requiere revisión humana*, citando
lo poco que alcanzó a oír.

Muéstralo en pantalla. Es el momento en que un juez entiende que el sistema no inventa, y vale
más que dos features.

---

## Bloque 6 · El relevo de turno *(grabar — el cierre)*

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 17 | CENTRAL | Relevo, relevo de turno. | Lo pide un humano |
| 18 | **RELEVO** | *Abierto 1. Falta el mixer en la torre 3.* | Ráfaga |
| 19 | **RELEVO** | *Abierto 2. Figurado llegó de nueve, no de doce.* | Ráfaga |
| 20 | **RELEVO** | *Abierto 3. Filtración en el sótano 1.* | Ráfaga |

Corta a la bitácora en pantalla: lo que transmitió son tres, lo que quedó escrito son quince.
Ahí va la frase: **ocho horas de operación que antes se entregaban de memoria en dos minutos.**

---

## Bloque 7 · El apagado *(grabar si sobran segundos)*

| # | Voz | Línea | Qué pasa |
|---|---|---|---|
| 21 | GRÚA | Relevo, silencio. | Aparece SILENCIADO en la pantalla |

Cualquiera lo apaga hablando. No hay que abrir nada. Y sigue escuchando y registrando: solo dejó
de hablar.

---

## Notas de rodaje

**Filma los radios, no la pantalla.** Dos o tres teléfonos sobre una mesa, con manos sucias si
se puede. La bitácora entra en corte, no como plano principal.

**El umbral está en 20 segundos** (`UNANSWERED_MS`) para no esperar un minuto en cámara. En
operación real son 60. Si quieres bajarlo más para el corte, ponlo en 12000 y reinicia.

**El orden que importa si el tiempo aprieta.** Si solo alcanzas a grabar tres bloques, graba el
2, el 3 y el 6. Esos tres cuentan el producto completo. El 5 es el que más suma por segundo si
te queda uno más.

**Si el agente no habla cuando debería:** revisa la consola. Si dice `suprimido (presupuesto)`,
ya gastó sus 2 transmisiones de la hora. Sube `MAX_TX_PER_HOUR` a 6 para grabar y reinicia. El
relevo de turno del bloque 6 no tiene ese problema: es solicitado y no gasta presupuesto.
