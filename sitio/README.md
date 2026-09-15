# relevoradio.com · landing

Un solo archivo HTML, sin servidor, sin base de datos y sin cookies.

## Antes de publicar: una sola cosa que llenar

Al final de `index.html`, en el bloque `CONFIGURACIÓN`:

```js
const CONTACTO = {
  whatsapp: '',                    // ej: '573001234567' — indicativo, sin +, espacios ni guiones
  correo: 'hola@relevoradio.com',
};
```

- **Con WhatsApp vacío**, todos los botones abren el correo. La página funciona igual
- **Con WhatsApp lleno**, cada botón abre el chat con un mensaje que ya dice la industria:
  *"Hola, quiero conocer el piloto de Relevo Radio para seguridad privada."* Así, cuando lleguen
  los primeros contactos, se sabe qué industria respondió primero (decisión D11)

El correo `hola@relevoradio.com` solo funciona después de comprar el dominio y crear el buzón.

## Qué archivos se publican

| Archivo | Se sube |
|---|---|
| `index.html` | Sí |
| `icono.svg` | Sí — el ícono de la pestaña |
| `og.png` | Sí — la imagen que aparece al compartir el link por WhatsApp o LinkedIn |
| `og.html`, `capturas/`, `README.md` | No: son para generar y revisar |

## Dónde publicarla

Cualquier hosting de sitios estáticos sirve. Cloudflare Pages y Netlify tienen plan gratuito
para un sitio así: se sube la carpeta, y después se conecta `relevoradio.com` desde su panel.

## Enlaces directos por industria

Para los posts y los mensajes de venta, cada industria tiene su enlace:

- `relevoradio.com/#seguridad`
- `relevoradio.com/#construccion`
- `relevoradio.com/#eventos`

## Datos personales

La página no recoge datos: no hay formulario ni analítica, solo enlaces a WhatsApp y al correo.
Si se agrega un formulario o una herramienta de analítica, antes hace falta una política de
tratamiento de datos (Ley 1581).

## Afirmaciones

Todo lo que dice la página sigue la tabla de `marca/marca.md`: no promete cumplimiento legal,
no da cifras que no se han medido y dice claro que hoy solo funciona sobre Zello Work.
