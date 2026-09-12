# Product Vision Board · Relevo

Sincronizado: 2026-09-12, 13:00 -05. Procedencias: **Medido** / **Citado** / **Estimado** / **TBD**

> **De dónde salen las decisiones de este board, y cuál manda.**
> Este board es la capa estratégica y se queda atrás del PRD por diseño. El orden de autoridad
> cuando dos documentos discrepan es: `decisiones.md` primero, `prd.md` después, este board al
> final.
>
> **Qué cambió después de escribir el PRD y este board no reflejaba:**
> 1. **M7b, el veredicto de interrupción.** Cuando un humano corta al agente, el agente averigua
>    si la interrupción respondía lo que estaba anunciando. Sí → cierra y no repite. No →
>    reintenta una vez. Ambiguo → revisión humana. Esto refuerza el UX Paradigm de §5 (Agent con
>    límites) y agrega una métrica de AI que §8 no tiene: **latencia de corte del TTS**, TBD.
> 2. **Dos puertas de piloto que no eran features y no estaban en ninguna parte:** kill switch
>    por voz del supervisor, y registro de consentimiento con exclusión por id de remitente.
>    Ambas afectan al veto de confianza de §2 y hoy son la parte más floja del board.
> 3. **El moat de §3 ya tiene su primer circuito a medio construir**, no completo: la bitácora
>    permite cerrar un ítem a mano, pero no guarda todavía la etiqueta negativa que calibra el
>    umbral. Sigue siendo cero de corpus.

## PRODUCTO
**Nombre:** Relevo
**Una línea:** Agente que participa en el canal de radio PTT de una obra, sostiene el estado operativo que ningún humano alcanza a tener completo, y transmite por voz solo cuando algo se está cayendo o cuando cambia el turno.

---

## 1 · PROBLEMA

**Una línea:** La radio PTT es el único canal de trabajo sin memoria: lo que se dice se evapora al soltar el botón, y con ello las peticiones que nadie contestó.

En obra la coordinación táctica es verbal por necesidad física: manos en herramienta, ojos en el peligro. El canal es de difusión, así que cada receptor humano aplica un filtro atencional y descarta lo que no le apuntaba. Nadie retiene el estado completo. Ocho horas de operación se transfieren en un relevo verbal de dos minutos apoyado en memoria de corto plazo.

**Frecuencia — los cuatro relojes, y el que manda no es el obvio:**

| Reloj | Cada cuánto |
|---|---|
| Trabajador de campo | Cada transmisión. Decenas por hora |
| Jefe de operaciones (comprador) | Cada cambio de turno. 2-3 veces al día |
| Proyecto de obra | 6-24 meses de acumulación |
| **Entorno regulatorio (el que fuerza la compra)** | **Cada investigación de accidente** |

El cuarto es el que nadie mira y probablemente el que cierra la venta: cuando hay un accidente grave, alguien pide la trazabilidad de lo que se comunicó por radio y no existe. Eso convierte a Relevo de herramienta de eficiencia en herramienta de defensa. **Plazo legal exacto: TBD** — vía: verificar Resolución 1401 de 2007 y qué trazabilidad exige la ARL.

**Severidad — toca las tres áreas donde la AI tiene ventaja estructural:**
- *Carga cognitiva pesada:* filtrar 40 transmisiones por hora de las cuales 3 te aplican.
- *Reconocimiento de patrones:* correlacionar una queja del turno noche con un reporte del turno mañana. Ningún humano está en los dos turnos.
- *Decisión repetitiva:* "¿esto que acabo de oír requiere acción de alguien, o no?", cientos de veces al día.

**¿Sobrevive a las próximas 2-3 generaciones de modelos foundation?**
- [x] **Sí — es problema de WORKFLOW e INTEGRACIÓN, no de OUTPUT**

La transcripción y el resumen ya están commoditizados y se van a abaratar más. Lo que no se commoditiza: el arbitraje de un canal half-duplex donde hablar de más mata, el permiso de estar dentro de la red, y sostener estado a través de turnos. Un modelo mejor no resuelve nada de eso.

**Durability Score: 4 / 5.** No es 5 porque la mitad "resumen de turno" del valor sí se commoditiza; la mitad "arbitraje y estado" no.

---

## 2 · SEGMENTO TARGET

**Formato:** *Jefe de operaciones o coordinador HSE en constructoras colombianas de 200 a 2.000 trabajadores, en proyectos de edificación en altura o infraestructura, que hoy operan flotas de 30 a 150 radios (DMR Motorola/Hytera, o Zello Work) y ya pagan licencia PTT.* **Estimado** en tamaños de flota y rango de licencia.

**Los cinco casos reales: TBD, y se define por conducta con rastro público en vez de por atributos.** La consulta que produce la lista: constructoras con contratos adjudicados en SECOP II cuyos pliegos exigen plan de comunicaciones con radios, cruzadas con reporte de accidentalidad ante la ARL. Eso deja de ser adivinanza y pasa a ser una búsqueda. **No se ejecutó hoy** por tiempo; queda como primera tarea post-hackathon.

**Quién controla el veto de confianza:** no es operaciones. Es el **coordinador HSE junto con el comité de convivencia o el sindicato**, porque escuchar el canal de los trabajadores es materia laboral antes que materia técnica. Operaciones puede amar el producto y el veto lo mata igual.

**Qué necesita esa persona para decir que sí** (parcialmente investigado):
1. Que no exista huella vocal. Resuelto por arquitectura — ver D4.
2. Que el audio original se destruya tras la extracción. Resuelto por diseño.
3. Que quede escrito que el sistema **no** alimenta evaluación de desempeño individual.
4. **TBD:** si hace falta autorización individual firmada por trabajador o basta la política interna más el aviso. Vía: concepto de un laboralista, no de nosotros.

---

## 3 · MOAT PRIMARIO

- [x] **Data Moat**

**Una línea:** Nuestro moat es el corpus de transmisiones de radio de obra en español colombiano, etiquetado con qué peticiones se cerraron y cuáles se evaporaron, porque ese dataset no existe públicamente y no se puede comprar.

**Prueba del flywheel — y la respuesta incómoda:** el activo sí crece con el uso y no con el trabajo del fundador, porque cada canal-día produce etiquetas de resultado sin que nadie las anote. Pero **hoy el moat es cero.** No hay un solo minuto de corpus. Lo que existe hoy es el circuito, no la muralla: cada aviso que el agente emite recibe implícitamente una etiqueta (el supervisor lo marca innecesario, o la petición se cierra después del aviso), y eso calibra el umbral de criticidad, que es justo el parámetro que ningún competidor puede copiar sin operación real.

**Tensión con D4, resuelta:** destruimos el audio y disociamos la identidad, pero retenemos el texto anonimizado con la etiqueta de resultado. Eso es lo valioso y es lo que sí es legal retener. El audio nunca fue el activo.

**Moat secundario, declarado como secundario:** distribución dentro de la red PTT. Real, pero no crece con el uso: cada integración es trabajo.

---

## 4 · ARENA COMPETITIVA

- [x] **Pioneer (AI-Native)** — un participante sintético que arbitra su propio derecho a hablar en un canal half-duplex no podría existir sin AI.

**Competidores reales y por qué no ganan hoy:**

| Quién | Qué hace | Por qué no gana esto |
|---|---|---|
| Zello | Red PTT dominante, transcripción y analítica. **Citado** | Deposita la recuperación en pantalla asíncrona y consola de despacho. Su apuesta es visual |
| Weavix (Walt) | Radio inteligente con pantalla, transcripción, traducción. **Citado** | Defiende explícitamente que "la pantalla es una herramienta de productividad". Su tesis de producto es la opuesta a la nuestra |
| Motorola (WAVE PTX) | Red, hardware, floor control, ecosistema | **El riesgo real.** Tienen todo lo que nos falta |
| Axon 911 / RapidSOS | Inteligencia de llamada en tiempo real. **Citado** | Concentran el valor en el centro de comando, con un despachador humano como interfaz |

**Por qué no nos borra Motorola mañana:** ciclos de release largos y ningún incentivo para optimizar español de obra colombiano. Ventana estimada: **18-24 meses. Estimado, sin evidencia.** Si Motorola decide hacerlo, lo hace.

---

## 5 · UX PARADIGM

- [x] **Agent** — ejecuta autónomamente dentro de límites explícitos.

**Por qué no los otros tres, descartados uno por uno:**
- *Assistant:* requiere que el usuario invoque. Con manos ocupadas, invocar es el costo que estamos tratando de eliminar. Además vuelve el producto un chatbox con voz.
- *Autonomous:* correr sin supervisión en un canal half-duplex es peligroso. El humano tiene que conservar veto físico: aprieta PTT y el agente calla.
- *Embedded / invisible:* el valor exige que el agente **se manifieste al aire** en dos momentos. Invisible no entrega nada.

---

## 6 · AI DECISION TRIANGLE

- [x] **Speed**

El agente vive o muere por no pisar a nadie. El corte del TTS cuando un humano aprieta PTT tiene que ocurrir en milisegundos, y la decisión de si vale la pena hablar tiene que caber en la ventana de silencio del canal. La velocidad no es preferencia, es seguridad.

La precisión se compra sin sacrificar velocidad con arquitectura de dos niveles (el patrón que `validacion.md` describe vía LlamaPIE y TRACE): un clasificador pequeño y permanente que solo decide *si* hay que intervenir, y un modelo grande invocado únicamente en el instante del disparo.

**Trade-offs que acepto, a propósito:**
- **Pierdo cobertura.** Muchas peticiones legítimas no se van a detectar. Preferimos perder avisos que emitir uno falso al aire, porque un falso positivo por altavoz enseña a la cuadrilla a ignorar al agente y eso es irreversible.
- Pierdo razonamiento profundo en el momento. El agente no analiza, registra y avisa.
- Pierdo español perfecto: jerga de obra mal transcrita se marca como no entendida, no se adivina.

---

## 7 · MODELO ECONÓMICO

**Modelo:** Seat-Based + AI Add-On, montado sobre la licencia PTT que el cliente ya paga.

| Concepto | Valor | Procedencia |
|---|---|---|
| Licencia PTT que ya paga | USD 5-12 / radio / mes | **Estimado** |
| Precio Relevo | USD 8-15 / radio / mes | **Estimado** — sin una sola conversación de precio |
| Costo variable | Por **canal**, no por radio | **Medido por estructura** |
| Gross margin | TBD | Requiere medir minutos de audio por canal-día |

**La asimetría que hace que el negocio funcione:** el costo escala con el **canal**, el precio con el **radio**. Un canal con 120 radios produce aproximadamente el mismo audio que uno con 30 si el tráfico es el mismo. El margen crece con el tamaño de la cuadrilla sin que el costo lo siga. Ese es el hallazgo económico del ejercicio.

**¿Escala a 10x usuarios?** Sí, si 10x usuarios significa más radios por canal. **Necesita ajuste** si significa 10x canales.

**Prueba del 30%: TBD.** Vía: medir minutos de transmisión reales por canal-día en un piloto.

**El costo que escala peor que lineal — encontrado:** el contexto acumulado del turno. Si cada evaluación de disparo carga el historial completo del turno en el modelo, el costo es **cuadrático en el número de transmisiones por turno**, no lineal. A 10x tráfico ese término explota y se come el margen. **Mitigación obligatoria en arquitectura:** estado comprimido incremental, nunca reenvío del historial. Entra al PRD como restricción, no como optimización.

---

## 8 · MÉTRICAS DE ÉXITO

**De usuario:**
1. **% de peticiones que se cierran** en vez de evaporarse. *Baseline: desconocido — hoy es imposible de medir porque no hay registro. La ausencia de baseline ES el problema.* Meta: TBD tras dos semanas de piloto.
2. **Completitud del handover:** ítems abiertos que el turno entrante recibe. *Baseline: lo que quepa en dos minutos de relevo verbal.* Meta: 100% de los ítems abiertos registrados.

**De AI:**
3. **Transmisiones del agente por hora de canal.** *Baseline: 0, no existe.* Meta: ≤ 2/hora. Se mide hacia abajo: un agente que habla más no trabaja más.
4. **Tasa de falso positivo al aire** (avisos que el supervisor marca innecesarios). *Baseline: 0/0.* Meta: < 5%. Es la métrica que decide si la cuadrilla lo apaga.

---

## 9 · RIESGOS CRÍTICOS

**1 · ¿Qué pasa si el problema se commoditiza en 12 meses?**
La transcripción ya está commoditizada. El riesgo concreto no es un modelo mejor, es que **Zello o Motorola lancen "resumen de canal" nativo**, y pueden. Nuestra defensa es que el resumen no es el producto: el arbitraje de interrupción calibrado con operación real lo es. Defensa parcial y honesta — si Zello lo hace bien, duele.

**2 · ¿Puede un competidor replicarlo con la misma API en menos de 6 semanas?**
**El demo, sí. En un fin de semana.** El producto, no: lo que no se replica en 6 semanas es el umbral de criticidad calibrado con cuadrillas reales y el consentimiento laboral firmado con un cliente. **El moat técnico es cero y hay que decirlo.**

**3 · Si tiene éxito a escala, ¿cómo se rompe la confianza por primera vez?**
El escenario exacto, tomado de `critica.md`: **el agente registra un estado falso y lo transmite con voz autoritaria en el handover, y el turno entrante actúa sobre eso.** El caso concreto: inscribir una válvula como "cerrada" cuando el operador dijo "falló la cerrada". Un incidente así mata el producto y expone responsabilidad civil.
**Mitigación que entra al PRD como principio:** el agente nunca afirma sin poder citar la transmisión de origen; todo ítem lleva nivel de confianza; bajo el umbral no se transmite, se deja en bitácora marcado para revisión humana. El sesgo de automatización se combate no sonando seguro cuando no se está.
