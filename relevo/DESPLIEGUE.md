# Llevar Relevo a la nube · Fly.io

Relevo necesita tres cosas que no todos los servicios dan:

| Necesita | Por qué |
|---|---|
| **Estar siempre encendido** | La conexión con Zello tiene que estar abierta todo el tiempo. Un servicio que se apaga sin visitas (como Google Cloud Run) saca al agente del canal |
| **Un disco que persista** | La bitácora vive en una base SQLite |
| **HTTPS con certificado válido** | Sin eso, el navegador advierte y la sesión no es segura |

Fly.io da las tres, y además entrega una dirección `https://<app>.fly.dev` **sin tener que
comprar dominio**.

**Costo aproximado:** unos **USD 3,5 al mes** — máquina `shared-cpu-1x` de 512 MB (~USD 3,2)
más 1 GB de disco (USD 0,15). Precios verificados el 2026-09-15; confírmalos en
[fly.io/pricing](https://fly.io/pricing/).

---

## ⚠ Tres reglas que no se rompen

1. **Una sola máquina, siempre.** Nunca `fly scale count 2`. Dos máquinas tendrían dos bases
   de datos distintas y dos agentes entrando a Zello con el mismo usuario, expulsándose del
   canal entre sí. Por eso todo despliegue va con `--ha=false`
2. **Un usuario de Zello solo para el agente.** Crea en Zello Work un usuario dedicado, por
   ejemplo `relevo`. Si el servidor de tu computador y el de la nube entran con el mismo
   usuario, se sacan del canal el uno al otro
3. **Los secretos los escribes tú.** La clave de OpenAI y la de Zello nunca van en el repo ni
   en `fly.toml`

---

## Primera vez

Todos los comandos se corren en la carpeta `relevo/`.

### 1 · Cuenta e instalación

Crea la cuenta en [fly.io](https://fly.io) (pide tarjeta). Luego instala la herramienta:

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

(La documentación de Fly usa `pwsh`, que es PowerShell 7 y no viene con Windows. `powershell` es
el que sí está.)

Cierra y abre la terminal, y entra:

```powershell
fly auth login
```

### 2 · Crear la app y su disco

```powershell
fly apps create relevo-radio
fly volumes create relevo_datos --size 1 --region iad
```

Si `relevo-radio` ya está tomado, elige otro nombre y cámbialo también en la línea `app =` de
`fly.toml`.

### 3 · Los secretos

Crea un archivo `.env.nube` en `relevo/` con esto, y llénalo tú:

```
OPENAI_API_KEY=
ZELLO_NETWORK=
ZELLO_CHANNEL=
ZELLO_USERNAME=
ZELLO_PASSWORD=
```

`ZELLO_USERNAME` y `ZELLO_PASSWORD` son los del usuario dedicado al agente (regla 2). Luego:

```powershell
Get-Content .env.nube | fly secrets import
Remove-Item .env.nube
```

El archivo está en `.gitignore`, pero bórralo igual después de importarlo.

### 4 · Apagar el servidor local

Si Relevo está corriendo en tu computador con el mismo usuario de Zello, ciérralo antes de
seguir.

### 5 · Desplegar

```powershell
fly deploy --ha=false
```

La primera vez tarda unos minutos: construye la imagen en los servidores de Fly.

### 6 · Verificar

```powershell
fly status
fly logs
```

En `fly status` tiene que haber **una sola máquina**. En los logs tienen que aparecer:

```
Zello: conectado a "..." en wss://zellowork.io/ws/...
Relevo arriba. Canal: zello
respaldo: /data/respaldos/relevo-....db
```

### 7 · Crear el primer usuario

```powershell
fly ssh console -C "relevo-usuario crear"
```

Te pide correo, nombre, rol (usa `admin`) y la clave, que no se ve al escribir.

### 8 · Entrar

`https://relevo-radio.fly.dev/?board=1` (con el nombre de tu app).

---

## Día a día

| Para | Comando |
|---|---|
| Subir una versión nueva | `fly deploy --ha=false` |
| Ver qué está pasando | `fly logs` |
| Estado de la máquina | `fly status` |
| Reiniciar | `fly machine restart` |
| Listar usuarios | `fly ssh console -C "relevo-usuario listar"` |
| Quitarle el acceso a alguien | `fly ssh console -C "relevo-usuario desactivar <correo>"` |
| Cambiar una clave | `fly ssh console -C "relevo-usuario clave <correo>"` |
| Cambiar un secreto | `fly secrets set ZELLO_PASSWORD=...` (reinicia la máquina) |

Cada despliegue apaga la máquina con un aviso: Relevo suelta el canal, cierra la base y en los
logs aparece `apagado limpio`.

## Dominio propio

Cuando tengas `relevoradio.com`, la bitácora puede ir en un subdominio:

```powershell
fly certs add app.relevoradio.com
```

Fly te dice qué registro DNS crear. El sitio de marca (`sitio/`) va aparte, en un hosting
estático.

---

## Respaldos

Relevo guarda una copia de la base al arrancar y una vez al día en `/data/respaldos/`, y
conserva las 7 más nuevas. Antes de cualquier cambio de estructura de la base hace una copia
adicional que no se borra sola.

**Límite honesto:** esas copias viven en el mismo disco que la base. Protegen contra una base
corrupta o un borrado por error, **no contra perder el disco**. Para bajar una copia a tu
computador:

```powershell
fly ssh sftp shell
```

y adentro, `get /data/respaldos/<nombre-del-archivo>`.

**Pendiente:** subir las copias automáticamente a un almacenamiento externo.

---

## Qué está probado y qué no

| | |
|---|---|
| Comportamiento detrás del proxy (cookie segura, IP real, bloqueo por intentos) | Probado — `node scripts/test-nube.mjs`, 11 pruebas |
| Chequeo de salud y respaldos con rotación | Probado — mismas pruebas |
| Acceso y base de datos | Probado — `npm run test:acceso`, 32 pruebas |
| La imagen de Docker | Probada el 2026-09-15 en Docker local: 351 MB, construye en 15 s |
| El proceso corre sin privilegios | Probado: corre como `node` (UID 1000), nunca como root |
| Los permisos del disco montado | Probado: el disco llega con dueño root y el arranque lo entrega a `node` |
| Que la imagen no lleve secretos ni datos | Probado: dentro solo hay `src`, `scripts`, `node_modules` y los `package*.json` |
| Apagado limpio con SIGTERM | Probado: `apagado limpio`, código de salida 0, en 0,7 s |
| Que los datos sobrevivan a un reinicio | Probado: la base y los respaldos quedan en el disco; al reiniciar no repite migraciones |
| `relevo-usuario` dentro del servidor | Probado: corre como `node` y usa `/data/relevo.db`, no crea una base suelta en `/app` |
| Hora de Bogotá en los logs | Probada: el log marca 17:54 cuando en UTC son 22:54 |
| El despliegue en Fly.io | **Sin probar**: requiere tu cuenta |
