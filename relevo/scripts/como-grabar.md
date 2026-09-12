# Cómo grabar el video de 2 minutos

## Primero, el bloqueo que hay que saber

El navegador **solo da acceso al micrófono en un contexto seguro**: HTTPS, o `localhost`.

Eso significa que si abres `http://192.168.x.x:8787` en tu celular, Chrome te bloquea el
micrófono y el botón de hablar no hace nada. No es un bug de Relevo, es política del navegador.

Por eso el plan recomendado **corre todo en el PC**, donde `localhost` sí funciona. Si quieres
celulares de verdad, mira el último apartado.

---

## El plan recomendado · sin software nuevo, sin riesgo

**Todo corre en el PC y filmas la pantalla con tu celular.**

Suena rústico y es lo mejor que puedes hacer hoy, por tres razones: el micrófono funciona
seguro, el celular captura a la vez la pantalla, tu voz en la habitación y **la voz del agente
saliendo del parlante**, y el resultado se ve físico en vez de verse como una página web. Eso
último juega a tu favor con el tema del hackathon.

### Preparación · 10 minutos

**1. Deja el servidor corriendo.**

```
cd D:\Hackaton\relevo
npm run dev
```

**2. Baja el umbral para no esperar en cámara.** En `.env` pon `UNANSWERED_MS=12000` y
`MAX_TX_PER_HOUR=8`, y reinicia. Doce segundos es suficiente para que se sienta el silencio
incómodo sin que la toma se muera. El techo de 8 es para que no te quedes sin presupuesto a
media grabación.

**3. Siembra el turno anterior.**

```
npm run seed
```

Noventa segundos. Espera a que diga `listo para grabar`.

**4. Arma tres ventanas.** Mitad de arriba, dos ventanas del navegador lado a lado:

- izquierda: `http://localhost:8787/?user=torre3`
- derecha: `http://localhost:8787/?user=central`

Mitad de abajo, una tercera: `http://localhost:8787/?board=1`

Dale permiso de micrófono a las dos de arriba la primera vez que aprietes el botón.

**5. Sube el volumen del parlante.** La voz del agente tiene que oírse fuerte, porque es el
momento del video.

**6. Apoya el celular en algo.** Horizontal, apuntando a la pantalla. No a pulso: te va a
temblar justo en la toma buena.

### Cómo se habla

Mantienes apretado el botón del mouse sobre el círculo, hablas, sueltas. Igual que un radio.

Las tres voces las haces tú. Cámbialas así, que es suficiente:

- **TORRE 3** — más lejos del micrófono, apurado, como si estuviera cargando algo
- **CENTRAL** — cerca del micrófono, plano, aburrido, de despachador
- **GRÚA** — seco, cortante, pocas palabras

Después de soltar, la otra ventana reproduce tu transmisión por el parlante. **Espera a que
termine** antes de la siguiente. Eso no es un estorbo: es lo que hace que suene a canal de
radio en la grabación.

---

## Qué grabar · los dos minutos, con reloj

Grábalo **de una sola toma**. No tienes tiempo de editar, y una toma continua además se ve más
creíble. Si algo sale mal, empieza de nuevo: es más rápido que cortar.

| Tiempo | Qué pasa |
|---|---|
| **0:00–0:12** | Plano de la pantalla con la bitácora del turno sembrado. Dices la frase: *"la radio push-to-talk es el único canal de trabajo que todavía no tiene memoria"* |
| **0:12–0:40** | **La petición se entierra.** TORRE 3: *"Central, necesito material en el piso 8, me copian."* Y después el canal sigue en otra cosa: GRÚA *"Pluma libre, bajando el balde."* · CENTRAL *"Grúa, QAP un minuto que estamos vaciando la placa."* · GRÚA *"Copiado, en la escucha."* Nadie contestó al 8. **Quédate callado unos segundos.** Ese silencio es el video |
| **0:40–0:50** | **Habla el agente:** *"Pendiente. Solicita material en el piso 8. Sin respuesta."* Déjalo sonar completo |
| **0:50–1:15** | **La toma clave.** Repite la petición con otro asunto, espera el aviso, y **aprieta el PTT mientras el agente está hablando**, contestándole: CENTRAL *"Ya va subiendo el material al 8."* Se corta a mitad de palabra. Y **no repite**. Deja dos segundos de silencio ahí. Acerca el celular a la bitácora: el ítem quedó cerrado, con la razón `interrupcion` |
| **1:15–1:35** | **El contraste.** Otra petición, otro aviso, y esta vez lo interrumpes con algo ajeno: GRÚA *"Confirmo pluma parada por viento."* El agente **repite el mensaje completo**. Acá dices la línea que explica todo: *"no reacciona a que lo interrumpieron, reacciona a qué le dijeron"* |
| **1:35–1:52** | **El cierre.** CENTRAL: *"Relevo, relevo de turno."* El agente transmite tres pendientes. Corte a la bitácora: transmitió tres, hay quince escritos. Dices: *"ocho horas de operación que antes se entregaban de memoria en dos minutos"* |
| **1:52–2:00** | GRÚA: *"Relevo, silencio."* Aparece SILENCIADO. Cierras: *"y cualquiera lo apaga hablando"* |

### Si te quedas sin tiempo

Con **0:12–0:50** y **1:35–1:52** ya tienes el producto contado: la petición que se cae y el
relevo de turno. Todo lo demás es refuerzo.

### Si te sobran veinte segundos

Mete la toma de lo que no entendió: tapa el micrófono y habla encima del ruido. El agente no
transmite nada y en la bitácora sale en *Requiere revisión humana*, citando lo poco que oyó.
Es el momento donde un juez entiende que el sistema no inventa, y vale más que dos features.

---

## Si algo sale mal

| Síntoma | Qué es |
|---|---|
| El botón no hace nada | Falta el permiso de micrófono. Mira el candado en la barra de direcciones |
| El agente nunca habla | Revisa la consola. Si dice `suprimido (presupuesto)`, sube `MAX_TX_PER_HOUR` y reinicia |
| El agente tarda mucho | Baja `UNANSWERED_MS`. Con 12000 son doce segundos |
| Clasificó mal una frase | Dila más corta y más directa. El clasificador es conservador a propósito: si duda, no dispara |
| Se oye eco | Estás apretando PTT mientras la otra ventana reproduce. Espera a que termine |

---

## Mejora opcional · celulares de verdad

Se ve mucho mejor, y cuesta unos minutos más. Solo si ya tienes la toma del plan A guardada.

Para saltarte el bloqueo del micrófono en Chrome de Android:

1. Averigua la IP del PC: `ipconfig`, busca *Dirección IPv4* (algo como `192.168.1.20`)
2. En el celular, abre `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
3. Pega `http://192.168.1.20:8787` en la caja y ponlo en **Enabled**
4. Relanza Chrome y abre `http://192.168.1.20:8787/?user=torre3`

Con dos celulares y dos personas, esto es el video que quieres: dos radios sobre una mesa, y la
voz del agente saliendo del altavoz de los dos al mismo tiempo.

El PC tiene que estar en la misma red wifi, y si no conecta es el firewall de Windows pidiendo
permiso para Node en redes privadas.
