# Cómo grabar el video de 2 minutos

**Lo que quieres en cámara: dos celulares sobre una mesa que se vean como radios, y la voz del
agente saliendo de los dos altavoces.** Nada de ventanas de navegador. Si el jurado ve una
barra de direcciones, ve una web app, y el tema del hackathon es exactamente lo contrario.

Esto ya está resuelto. Dos cosas lo hacían imposible y las dos están hechas:

**1 · El micrófono.** El navegador solo lo entrega en contexto seguro, así que
`http://10.x.x.x` no sirve. Ahora Relevo sirve **HTTPS con certificado propio**, y eso sí es
contexto seguro. Hay que aceptar la advertencia una vez por dispositivo.

**2 · La barra de direcciones.** La app tiene manifest con `display: standalone`. **Instalada
en la pantalla de inicio arranca sin barra de direcciones ni pestañas**: en pantalla no queda
nada que delate un navegador.

---

## Preparación

### 1 · El certificado y el servidor

Ya están hechos y el servidor está corriendo en HTTPS. Si cambias de red, la IP cambia y hay
que regenerar:

```
cd D:\Hackaton\relevo
npm run cert
```

Eso imprime la IP y las URLs. Si la IP cambió, actualiza `LAN_IP` en `.env` y reinicia.

### 2 · La wifi — lee esto antes de perder veinte minutos

Estás en la red de la universidad. **Esas redes casi siempre tienen aislamiento de clientes**:
el celular y el PC están en la misma wifi pero no se pueden ver entre sí. No es tu firewall
(Node ya está permitido), es el punto de acceso.

Pruébalo primero: abre `https://10.16.111.212:8787/?user=torre3` en el celular. Si carga,
sigue. Si se queda pensando, no insistas — **usa el hotspot del celular**:

1. Prende el hotspot en un celular
2. Conecta el PC a ese hotspot
3. `npm run cert` otra vez, porque la IP cambió
4. Actualiza `LAN_IP` en `.env` y reinicia el servidor
5. Conecta el segundo celular al mismo hotspot

Con hotspot funciona siempre, porque la red es tuya.

### 3 · Instalar la app en los celulares

En cada celular, abre la URL del radio y acepta la advertencia del certificado
(**Avanzado → Continuar**). Ya adentro:

- **Android Chrome:** menú de tres puntos → *Instalar app* o *Agregar a pantalla de inicio*
- **iPhone Safari:** compartir → *Agregar a pantalla de inicio*

Ábrela desde el ícono de la pantalla de inicio, **no desde el navegador**. Ahí arranca a
pantalla completa y se ve como un radio.

Las URLs, una por celular:

```
https://10.16.111.212:8787/?user=torre3
https://10.16.111.212:8787/?user=central
```

En el PC, la bitácora: `https://10.16.111.212:8787/?board=1`

> **iPhone:** Safari es más estricto con certificados propios y el micrófono puede seguir
> bloqueado. Si tienes Android, usa Android. Si solo hay iPhone, el plan B de abajo.

### 4 · Sembrar el turno anterior

```
npm run seed
```

Noventa segundos. Espera el `listo para grabar`. Carga el turno previo a la bitácora para que
la pantalla no salga vacía, y lo hace en modo sordo para que no salgan avisos atrasados justo
cuando prendas la cámara.

### 5 · El encuadre

- Los dos celulares sobre una mesa, horizontal, **volumen al máximo**
- Filma con un tercer celular apoyado en algo. No a pulso
- Pon algo de obra en el plano si tienes: guantes, un casco, una cinta métrica. Un par de
  guantes de trabajo cambia el video entero
- La bitácora del PC entra **en corte**, no como plano principal

---

## Qué grabar · los dos minutos, en una sola toma

No hay tiempo de editar, y una toma continua se ve más creíble. Si algo sale mal, empieza de
nuevo: es más rápido que cortar.

| Tiempo | Qué pasa |
|---|---|
| **0:00–0:12** | Los dos radios en la mesa, en silencio. Dices: *"la radio push-to-talk es el único canal de trabajo que todavía no tiene memoria"* |
| **0:12–0:40** | **La petición se entierra.** TORRE 3: *"Central, necesito material en el piso 8, me copian."* Y el canal sigue en otra cosa: *"Pluma libre, bajando el balde."* · *"Grúa, QAP un minuto que estamos vaciando la placa."* · *"Copiado, en la escucha."* Nadie contestó al 8. **Quédate callado unos segundos.** Ese silencio es el video |
| **0:40–0:50** | **Habla el agente**, por el altavoz de los dos radios: *"Pendiente. Solicita material en el piso 8. Sin respuesta."* Déjalo sonar completo |
| **0:50–1:15** | **La toma clave.** Otra petición, espera el aviso, y **aprieta el PTT mientras el agente habla**, contestándole: *"Ya va subiendo el material al 8."* Se corta a mitad de palabra. Y **no repite**. Dos segundos de silencio ahí. Corte a la bitácora: cerrado, razón `interrupcion` |
| **1:15–1:35** | **El contraste.** Otra petición, otro aviso, y lo interrumpes con algo ajeno: *"Confirmo pluma parada por viento."* El agente **repite completo**. Dices: *"no reacciona a que lo interrumpieron, reacciona a qué le dijeron"* |
| **1:35–1:52** | **El cierre.** *"Relevo, relevo de turno."* Tres pendientes al aire. Corte a la bitácora: transmitió tres, hay catorce escritos. *"Ocho horas de operación que antes se entregaban de memoria en dos minutos"* |
| **1:52–2:00** | *"Relevo, silencio."* Aparece SILENCIADO. *"Y cualquiera lo apaga hablando"* |

**Si el reloj aprieta:** con `0:12–0:50` y `1:35–1:52` ya tienes el producto contado.

**Si te sobran veinte segundos:** tapa el micrófono y habla encima del ruido. El agente no
transmite nada y en la bitácora sale en *Requiere revisión humana*, citando lo poco que oyó. Es
donde un juez entiende que el sistema no inventa, y vale más que dos features.

### Las voces

Si estás solo, las tres las haces tú y alcanza con cambiar así:

- **TORRE 3** — lejos del micrófono, apurado, como si cargara algo
- **CENTRAL** — cerca, plano, aburrido, de despachador
- **GRÚA** — seco, cortante

Si tienes a alguien, mucho mejor: una persona por radio y la toma se graba sola.

---

## Si algo sale mal

| Síntoma | Qué es |
|---|---|
| El celular no carga la página | Aislamiento de clientes de la wifi. Usa el hotspot y regenera el certificado |
| Carga pero el botón no hace nada | Falta el permiso de micrófono, o abriste por HTTP. Tiene que ser `https://` |
| Se ve la barra de direcciones | La abriste desde el navegador. Ábrela desde el ícono de la pantalla de inicio |
| El agente nunca habla | Mira la consola. Si dice `suprimido (presupuesto)`, sube `MAX_TX_PER_HOUR` y reinicia |
| El agente tarda mucho | Baja `UNANSWERED_MS`. Está en 12000, o sea doce segundos |
| Se oye eco | Estás apretando PTT mientras el otro radio reproduce. Espera a que termine |
| Clasificó mal una frase | Dila más corta y directa. El clasificador es conservador: si duda, no dispara |

---

## Plan B · si la red no coopera y no hay hotspot

Un celular como radio y **el PC como el segundo radio**, fuera del plano. Hablas por el PC en
`https://localhost:8787/?user=central` (en `localhost` el micrófono funciona sin nada más) y el
celular en la mesa es el que se filma: recibe, muestra quién transmite y saca la voz del agente
por su altavoz.

Se pierde el plano de los dos radios, pero se conserva lo que importa: un radio físico sobre una
mesa del que sale la voz de un agente.
