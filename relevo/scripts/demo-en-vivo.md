# Demo en vivo · Relevo sobre Zello

Duración: unos **2 minutos y medio**. Todo lo que aparece aquí salió de pruebas reales del
12 de septiembre: los tiempos, el formato de los logs y lo que responde el agente.

La redacción exacta de los asuntos varía un poco entre corridas, porque la escribe el
modelo. La estructura no cambia.

---

## Preparación · 10 minutos antes

### 1 · El PC en el hotspot — obligatorio

En la wifi de la universidad `zellowork.io` está bloqueado y el servidor no arranca. Si ves
*"No pude abrir el canal (zello)... bloqueando zellowork.io"*, es esto.

### 2 · Arrancar el servidor en una terminal que se pueda proyectar

```
chcp 65001
cd D:\Hackaton\relevo
npm run dev
```

`chcp 65001` es para que las tildes no salgan rotas. Tiene que aparecer:

```
Zello: conectado a "Everyone" en wss://zellowork.io/ws/miempresapruebas
16:40:02 Relevo arriba. Canal: zello
16:40:02 Canal:    Zello, "Everyone" en miempresapruebas
16:40:02 Bitacora: https://172.20.10.2:8787/?board=1
16:40:02 umbral 12000ms | rafaga 5000ms | 8 tx/hora | 1 reintento
Zello: canal Everyone online, 2 en linea
```

**"2 en linea"** = el agente y tu celular. Si dice 1, el celular no está en el canal.

### 3 · Sembrar el turno anterior (otra terminal)

```
cd D:\Hackaton\relevo
npm run seed
```

Noventa segundos. Espera `listo para grabar`. Deja dos pendientes abiertos a propósito:
el arnés rozado de la cuadrilla 2 y el acero de tres octavos. Son los que va a leer el
relevo de turno al final.

### 4 · La pantalla

Bitácora en el navegador del PC: `https://localhost:8787/?board=1`

Lo ideal es proyectar **bitácora a la izquierda y la terminal de logs a la derecha**.

### 5 · El celular

Zello Work, usuario **torre 3**, canal **Everyone**, **volumen al máximo**.

Prueba de micrófono sin ensuciar la bitácora: di *"Relevo, activo."* En la terminal tiene
que aparecer `<torre 3> Relevo, activo.` y nada más. Si aparece, el audio entra bien.

---

## El demo

### Momento 1 · El canal ya tiene memoria *(0:00 — sin celular)*

Señala la bitácora.

> *"Esto es lo que pasó en el turno de la mañana, por radio. Normalmente todo esto se
> habría evaporado. Aquí quedó escrito, y fíjense: nadie escribió nada."*

---

### Momento 2 · Una petición *(0:15)*

**Tú, desde el celular:**
> *"Central, necesito material en el piso 8, me copian."*

**El agente:** no dice nada. Todavía.

**Logs:**
```
16:42:10 <torre 3> Central necesito material en el piso 8, ¿me copian?
16:42:11   -> peticion | Solicito material en el piso 8 | conf 0.9 | abierto
```

**Bitácora:** aparece una tarjeta nueva arriba en **Abierto**, con borde amarillo y la frase
exacta citada abajo.

**Mientras esperas** — son unos **15 segundos**, y el silencio es parte del demo:
> *"Nadie le contestó. En una obra de verdad, en este momento esa petición se acaba de
> perder: el canal sigue, cada quien en lo suyo, y nadie tiene la cuenta de qué quedó
> pendiente. Relevo sí."*

---

### Momento 3 · El agente habla *(0:30 — sin tocar nada)*

**El agente, por el altavoz del celular** (~5 segundos):
> *"Pendiente. Material en el piso 8. Sin respuesta."*

**Logs:**
```
16:42:26 aviso "Solicito material en el piso 8" -> hablando
```

⚠ **No hables encima.** Zello no te deja transmitir mientras el agente habla — el celular
rechaza el PTT. Espera a que termine. Si te preguntan, esa es la respuesta: *"en una radio
solo habla uno a la vez, y la red lo hace cumplir."*

---

### Momento 4 · Alguien contesta *(0:45)*

**Tú, desde el celular:**
> *"Ya va subiendo el material al 8."*

**El agente:** no dice nada. No hace falta.

**Logs** (unos 3 segundos después):
```
16:42:34 <torre 3> Ya va subiendo el material al 8.
16:42:37   -> cierra "Solicito material en el piso 8" (conf 0.9) La transmisión indica que el material ya está en camino al piso 8, lo que corresponde directamente al pendiente abierto.
```

**Bitácora:** la tarjeta sale de **Abierto**. En **Todo el turno** queda con borde verde y
*cerrado (respuesta)*.

> *"Nadie marcó nada como resuelto. Lo entendió de la conversación. Y funciona aunque la
> transcripción no salga perfecta: en una prueba de hoy transcribió 'estaba subiendo' y
> cerró el pendiente correcto igual."*

---

### Momento 5 · Un reporte no molesta *(1:05 — opcional, 15 segundos)*

**Tú, desde el celular:**
> *"Central, terminamos el vaciado del piso 7."*

**El agente:** nada.

**Logs:**
```
16:42:55 <torre 3> Central, terminamos el vaciado del piso 7.
16:42:57   -> reporte | Terminamos el vaciado del piso 7 | conf 0.9 | registrado
```

**Bitácora:** entra a **Todo el turno** como reporte. No aparece en Abierto.

> *"Eso no es una petición. Queda escrito, y el agente se queda callado. El silencio es su
> estado por defecto."*

---

### Momento 6 · El relevo de turno *(1:20 — el cierre fuerte)*

**Tú, desde el celular:**
> *"Relevo, relevo de turno."*

**El agente** (empieza ~3 segundos después, una ráfaga cada ~8 segundos):
> *"Abierto 1. Revisar arnés de la cuadrilla 2, está rozado."*
>
> *"Abierto 2. Confirmar llegada del acero de tres octavos."*

**Logs:**
```
16:43:10 <torre 3> Relevo, relevo de turno.
16:43:30 relevo de turno: 2 de 2 al aire, resto en bitacora
```

**Bitácora:** no cambia — el relevo no cierra nada, solo entrega.

> *"Ocho horas de operación, que antes se entregaban de memoria en dos minutos. Lo que
> quedó abierto, dicho al aire. Todo lo demás, escrito."*

---

### Momento 7 · Y cualquiera lo apaga *(1:50 — cierre)*

**Tú, desde el celular:**
> *"Relevo, silencio."*

**Logs:**
```
16:43:40 <torre 3> Relevo, silencio.
16:43:40 SILENCIADO por torre 3
```

**Bitácora:** en el encabezado aparece **SILENCIADO** en rojo.

> *"Sin app, sin configuración, sin pedirle permiso a nadie. Se dice al aire. Y sigue
> escuchando: solo dejó de hablar."*

**Déjalo al final a propósito.** Silenciado tampoco dice el relevo de turno; si lo pones
antes, el momento 6 se queda mudo.

---

## Si algo sale mal en el escenario

| Pasa esto | Es esto | Haz esto |
|---|---|---|
| El agente no habla después de 25 s | Mira el log. Si la petición salió como `reporte`, no se entendió como pedido | Repítela más directa: *"Central, necesito..."* |
| El log dice `suprimido (presupuesto)` | Se gastaron los avisos de la hora | No debería pasar (el techo está en 8). Sigue al momento 4 igual |
| El celular no te deja hablar | El agente todavía está transmitiendo | Espera a que termine. Es correcto |
| Una transcripción sale rara | Ruido o dicción | Sigue. Si baja de confianza va a revisión humana, y eso también es una función |
| El servidor no arranca | Estás en la wifi de la universidad | Hotspot. Si no hay, abre el demo ilustrativo |
| Zello se cae a mitad | Red del celular | Pasa al demo ilustrativo: `https://localhost:8787/?board=1&demo=1` y dale ▶ Reproducir turno |

## Si te preguntan por la interrupción

La función existe y está probada con 42 pruebas automatizadas, pero **en Zello no se puede
mostrar**: la red no deja pisar al agente. Abre el demo ilustrativo y toca el chip
**Corte ante PTT**, o **Veredicto: respondía**. Y dilo derecho: *"en una red real el turno lo
arbitra la red; lo medimos hoy, y cambiamos el diseño por eso."*
