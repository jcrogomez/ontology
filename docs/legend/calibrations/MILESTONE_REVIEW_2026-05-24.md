# Revisión de milestone — Ontology — 2026-05-24

> *Ejecución automática de la tarea programada `ontology-pr-suggestions`. Esta revisión se escribe en español porque la instrucción de hoy lo pidió así; las revisiones previas (05-19 → 05-23) están en inglés. Si prefieres mantener la serie en inglés por consistencia, avísame y la próxima vuelve a inglés. Todos los identificadores de commit, métricas y nombres de archivo se dejan literales.*
>
> *Cambio principal desde la revisión 05-23: el bug titular de aquel día (`--reps` inerte por colisión de caché) **ya está corregido** (`5d70f3b`), HEAD avanzó `ab76a18 → 103d3c2`, y **Arm A del experimento Move 3α ya corrió** — 125 nodos verificados. La revisión de hoy se centra en (1) leer los resultados de Arm A contra la hipótesis pre-registrada y (2) un matiz de diseño importante que esos resultados destapan.*

---

## 0. ⚠️ Lo que el sandbox no pudo hacer — contexto sobre el `git pull`

1. **`git pull` está bloqueado en el sandbox** (`HTTP 403 from proxy after CONNECT`; `origin` es privado y el proxy del entorno corta todo tráfico a github.com). **Pero es discutible**: el ref local `origin/main` está en `103d3c2`, igual que `HEAD` — **0 adelante / 0 atrás**. El "push pendiente" que la revisión 05-23 reclamaba **ya se hizo**: el burst de 10 commits del 05-22 está publicado. No hay nada que traer ni que empujar a nivel de commits.

2. **`.git/index.lock` se vuelve a crear** al sondear git desde el sandbox (el `.git` está montado de solo-lectura aquí, así que ni siquiera se puede borrar: git registró `unable to unlink … index.lock: Operation not permitted`). Es el mismo artefacto inocuo que las cinco revisiones anteriores señalaron. Antes de tu próximo `git add`/`commit`, límpialo en tu máquina:
   ```sh
   rm -f ~/Development/ontology/.git/index.lock
   ```

3. **Verificación disponible**: `tsc --noEmit` corrió hoy y da **exit 0** (build limpio). `vitest` **sigue sin poder correr** en el sandbox (binding nativo de `rolldown` ausente para esta arquitectura — restricción de infra, no regresión). Todo lo demás se verificó por lectura directa de código + análisis del JSON de Arm A.

---

## 1. Resumen situacional — el experimento por fin tiene datos

La revisión 05-23 cerró con: bug `--reps` detectado antes de commitear, y el experimento 3α "totalmente tooleado, listo para correr Arm A". Desde entonces (5 commits nuevos, `4accf43..103d3c2`):

| Commit | Qué hizo |
|---|---|
| `4accf43` | Aterrizó la revisión automática 05-23 |
| `d41798e` | Decisión de Arm C (`starcoder2:7b`) + comandos listos |
| `0313ebc` | Kernel `node_update_parent` — schema + apply path |
| `5d70f3b` | **Corrige el bug titular 05-23**: pliega un token por-rep en el `runId` (caché ya no colisiona) |
| `2591179` | Endurecimiento pre-Arm-A: `fsync`, test de integración de `--reps`, honestidad en README |
| `103d3c2` | Checklist pre-flight de Arm A + mapa de ruta crítica (HEAD) |

Y luego, fuera de git (en el working tree / sidecars): **se corrió Arm A**. El resultado está en `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` (untracked) + `.ontology.self-ingest-epsilon-3a-arm-a.json` (292K). Esto es lo que merece la atención de hoy.

---

## 2. Estado verificado en HEAD `103d3c2` (hoy, por inspección directa)

| Señal | Resultado | Cómo se verificó |
|---|---|---|
| `tsc --noEmit` | ✅ limpio (exit 0) | corrido hoy |
| HEAD | `103d3c2` (era `ab76a18`) | `git log` |
| Sync con `origin/main` | **0 adelante / 0 atrás** — push 05-22 ya publicado | `git rev-list --left-right --count` |
| Archivos de test | **122** `.test.ts` (eran 118 el 05-23) | `ls tests/*.test.ts \| wc -l` |
| Bug `--reps` (titular 05-23) | ✅ **CERRADO** (`5d70f3b`) + test de integración (`2591179`, `tests/verify-reps-cache-bypass.test.ts`) | `git show` |
| Arm A | ✅ **corrió** — 125 nodos, 1h 33min wall-clock | reporte + JSON |
| Arm B | ⚠️ JSON de **0 bytes** — no completó (ver §4.2) | `wc -c` |
| `vitest` | ❌ no corre en sandbox (binding rolldown) | intento hoy |
| `.git/index.lock` | ⚠️ presente (artefacto de sandbox, recurrente) | `git status` |

Sin drift, sin regresión. La corrección del bug 05-23 se hizo exactamente como se recomendó (espejo del patrón `--ast-grounding`, token solo en el paso focal para no malgastar tokens en los padres upstream) y trajo el test de integración que lo habría cazado. Disciplina ejemplar.

---

## 3. 🟢 Titular — Arm A confirma H1 en las **seis** métricas pre-registradas

Leí el JSON crudo y recomputé los agregados (no me fié solo del markdown). Contra los falsadores que la hipótesis fijó **antes** de correr:

| Métrica | δ' (piso) | Arm A predicho | Falsador | **Arm A real** | Veredicto |
|---|---:|---:|---|---:|:---:|
| exportRecovery micro | ≤0.30 | ≥0.45 | <0.30 → grounding inerte | **0.686** | ✅ |
| Jaccard medio | 0.021 | ≥0.06 | <0.04 → ruido | **0.581** | ✅ |
| Honestidad media (struct) | 0.246 | ≥0.30 | <0.25 | **0.496** | ✅ |
| Missing exports (vocab gap) | 488 | ≤350 | >420 | **106** | ✅ |
| Archivos Jaccard ≥0.5 | 2 | ≥5 | ≤2 | **83** | ✅ |
| `unrecoverable` | 24 | ≤19 | >22 | **0** | ✅ |

**Las seis confirmadas.** Por el árbol de decisión pre-registrado, esto cae en la rama "All confirmed → AST grounding at code_sketch **es** el lift al tier qwen; mirar H3/H4 (Arm B granite, Arm C starcoder) para decidir promoción". Es un resultado real y bien ganado: la honestidad estructural más que se duplicó, `unrecoverable` se fue a cero, y el vocab gap cayó 77% (488 → 106). Verificación interna: `0.5·(1−0.589 loc) + 0.5·(0.581 jac) = 0.496` cuadra con la honestidad reportada. Distribución de veredictos: 12 ε-equiv (10%) / 71 divergent_loc (57%) / 5 divergent_structural (4%) / 37 divergent_both (30%) / **0** unrecoverable.

### 3.1 ⚠️ El matiz que hay que registrar **antes** de celebrar (la observación de diseño más importante de esta revisión)

Arm A no solo confirma H1: lo confirma **rompiendo cada falsador por ~10×** (Jaccard 0.581 vs un predicho de ≥0.06; vs un piso δ' de 0.021 → eso es **28×**). Cuando un experimento pre-registrado supera su propio falsador por un orden de magnitud, la postura honesta — que este proyecto explícitamente abraza ("tools promising 100% fidelity always lie") — es preguntar *por qué*, no solo festejar.

El mecanismo: **la intervención alimenta directamente la métrica que define "éxito".**

- La intervención (`--ast-grounding`) inyecta en el system prompt un bloque `MANDATORY EXPORTS` con los **nombres exactos de las declaraciones top-level** extraídos por AST.
- `structuralJaccard` mide precisamente el **solapamiento de nombres de declaraciones top-level** entre fuente y regenerado.
- `exportRecoveryRate` mide si esos mismos `mandatoryExports` sobreviven a la salida.

Es decir, las **dos métricas titulares** (Jaccard 0.581, recovery 0.686) miden exactamente la superficie que la intervención le entrega al modelo. El **Candado #2** ("medir en el output, no en el prompt") evita el comportamiento "dump" puro (recitar la lista sin tejerla), pero **no neutraliza** la preocupación más profunda: se le está dando al modelo la hoja de respuestas de las métricas que decretan la victoria. Parte del salto 28× es mecánico (nombres entregados → nombres devueltos), no necesariamente "el modelo entiende mejor el código".

Esto **no invalida** el resultado, pero lo recalibra, y la señal honesta está en las métricas que la intervención **no** alimenta:

- **LoC distance media = 0.589** (alta) → 57% de los nodos siguen siendo `divergent_loc`. El regenerado acierta los *nombres* pero sigue divergiendo fuerte en *tamaño/cuerpo*.
- Ejes **contract / behavior / intent**: `not-measured` / `untested` / `not-reviewed` en los 125 nodos. La cartografía sigue cubriendo **una sola** de sus cinco columnas.
- **Hallucination micro ≈ 0.19–0.22** (127 exports inventados sobre 671 mandatorios; 116 unexpected exports). El modelo todavía inventa superficie que G nunca pidió.

**Encuadre publicable honesto** (alineado con el ethos "admite las zonas resistentes" del README): *"El AST grounding cierra el gap estructural a nivel de nombres — que es justo lo que el gluing y el compile-back necesitan — pero por sí solo no cierra el gap de tamaño ni el conductual."* Eso es defendible y resistente a un revisor escéptico. Afirmar "Jaccard subió 28×, el grounding funciona" **sin** este matiz es exactamente el tipo de over-claim que el proyecto dice querer evitar.

**Recomendación concreta (control barato, alto valor):** antes de gastar noches en Arm B/C, corre un **Arm A0 de control** = qwen2.5-coder:7b **+ safety-net pero SIN `--ast-grounding`**, sobre el grafo idéntico post-ingest. Hoy la comparación δ'(0.021) → ArmA(0.581) confunde tres cosas a la vez (safety-net + grounding + posible circularidad métrica), porque δ' no tenía ni safety-net ni grounding. Arm A0 aísla el aporte marginal del grounding y revela cuánto del 0.581 es "inyectar nombres en una métrica de nombres". La hipótesis ya admite que la descomposición es "mechanical post-hoc"; un arm de control la hace limpia y barata (~1h 33min, $0).

---

## 4. 🔴/🟡 Bugs y hallazgos concretos

### 4.1 🟡 Cobertura silenciosa: `node_0094` se cayó del verify (125 de 126 nodos de código)

Arm A reporta "125 nodos", pero el perímetro tiene **126** nodos de código (`node_0001`…`node_0126`). Falta `node_0094` → `src/commands/ingest/index.ts`. La causa, verificada nodo a nodo:

- Los 125 nodos verificados tienen `coordinates.manifestation == "code"`.
- `node_0094` tiene `coordinates.manifestation == "intent"` (el único nodo de código con esa coordenada; el otro "intent" es `node_0000_canon`, que sí corresponde excluir).

`verify-homeomorphism --all-artifacts` resuelve candidatos por `manifestation == "code"`, así que `node_0094` queda **invisible, sin warning**. Ironía notable: el archivo que se cae es el **entry point del propio comando `ingest`** — la pieza que hizo el lift se lifteó a sí misma con la coordenada equivocada.

Por qué importa para una claim publicable: el `perimeterHash` (que `00b8100` añadió al evento `homeomorphism_verified` precisamente para que la cadena sea replayable) se computa sobre **125** archivos, no 126. El perímetro se encoge en silencio. Acciones sugeridas:
- **Corto plazo:** corregir `coordinates.manifestation` de `node_0094` a `"code"` (revisar por qué el clasificador estático qwen-3b lo etiquetó "intent" durante el ingest) y re-correr el verify para tener 126/126.
- **Estructural:** que el resolver de candidatos **emita un warning** cuando un nodo con `outputs.files` apuntando a un `.ts/.tsx` real quede excluido por su `manifestation`. Hoy el under-count es indistinguible de un perímetro legítimamente menor.

### 4.2 🟡 Arm B: JSON de 0 bytes — no completó

`.ontology.self-ingest-epsilon-3a-arm-b.json` existe pero pesa **0 bytes** (creado 2026-05-23 23:44), y **no hay** `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md`. El redirect `> archivo.json` trunca el archivo al instante, así que un proceso abortado/caído antes de escribir deja exactamente este rastro. Junto a él aparece `.ontology.toy-pre-arm-b-backup/` (104K, un `.ontology` de juguete) creado en el mismo minuto — sugiere que se preparó el entorno de Arm B (backup) pero la corrida no produjo salida. **No commitear ese JSON vacío.** Antes de relanzar Arm B (`granite4.1:8b`), conviene revisar logs/`ollama` por qué murió — recordar que la caracterización pre-flight midió granite en **0.2 tok/s** (swap pesado, "marginal"), así que una corrida de 125 nodos puede tardar **10–25 h** y es candidata a quedarse sin RAM. Considera correr primero **Arm C-local** (`starcoder2:7b`, 4.0 GB, debería ir más rápido que granite 5.3 GB) para no bloquear el experimento en el arm más lento.

### 4.3 🟡 Hueco en `.gitignore` para los sidecars del self-ingest

`.gitignore` cubre `.ontology.self-ingest-*-result/` (los dirs de workspace, bien ignorados) pero **no** cubre:
- `.ontology.self-ingest-*.json` (el sidecar de Arm A, 292K, hoy untracked) → o lo commiteas como dato crudo del experimento, o extiendes el ignore.
- `.ontology.toy-pre-arm-b-backup/` (104K, untracked, parece residuo).

Sugerencia: añadir `.ontology.self-ingest-*.json` y `.ontology.*-backup/` al `.gitignore`, **y** decidir explícitamente si el JSON de Arm A debe versionarse (es la data cruda detrás del reporte pre-registrado; archivarlo aparte tiene valor de auditoría). El JSON vacío de Arm B no debe entrar de ninguna forma.

### 4.4 🟢 `node_update_parent` (`0313ebc`) es primitiva de kernel sin verbo CLI todavía

El kernel, el apply path (`proposal/apply.ts`), `proposals/persist.ts`, `readiness.ts` y `hierarchizer.ts` ya consumen `node_update_parent`, pero **no hay** un `onto node update-parent` directo en `src/cli.ts` (grep vacío). Hoy solo se ejerce vía el pipeline de propuestas. Es un orden de construcción razonable (la primitiva antes que su consumidor; el hierarchizer es el consumidor previsto), pero conviene anotarlo para que nadie asuma que existe el comando. Sin acción urgente.

### 4.5 🟢 `.git/index.lock` recurrente — ver §0.2. Inocuo, pero ya van seis revisiones.

---

## 5. Mejoras de diseño (más allá de bugs)

1. **(Lo más importante — ya en §3.1)** Romper la circularidad intervención↔métrica con un arm de control sin grounding, y reportar LoC/behavior como la "señal no contaminada". Es el cambio que hace creíble la cartografía publicable.

2. **Cerrar columnas de la matriz de cartografía.** Hoy 4 de 5 ejes (contract/behavior/intent + cost en local=$0) están vacíos en los 125 nodos. El eje `structural` solo no sustenta la claim "fidelity cartography matrix across orthogonal axes" del README. El siguiente checker de mayor valor es probablemente **behavior** (aunque sea un smoke `--runtime-check` sobre el subconjunto que compila), porque es ortogonal al grounding y por tanto inmune a la circularidad de §3.1.

3. **Superficie CLI para `bakeoff-synthesis`.** El generador (`ddfe266`) existe como librería pero el TODO admite que la síntesis cross-arm hoy requiere "hand-roll a tiny driver". Con Arm A ya en disco y B/C en camino, un `onto legend bakeoff-synthesis <jsons...>` (o un script en `scripts/`) elimina el último paso manual y la superficie de cherry-picking justo cuando más se necesita.

4. **Disciplina de pre-registro: recalibrar predicciones.** Que las seis métricas superen su falsador por 10× sugiere que las predicciones de la hipótesis (Jaccard ≥0.06) estaban mal calibradas respecto al efecto combinado safety-net+grounding. Para Arm B/C, fijar predicciones a partir del **real** de Arm A (no del piso δ'), para que los falsadores de B/C sigan siendo informativos y no triviales.

5. **Higiene de archivos de workspace.** Los dirs `.ontology.*-result/` suman ~12.7 MB (3.3 MB solo Arm A). Benigno, pero un `scripts/legend-archive-prune.sh` (señalado desde hace varias revisiones) evitaría que crezca sin control conforme entran B/C.

---

## 6. Items heredados — re-verificados hoy

| # | Item | Estado hoy |
|---|---|---|
| ROADMAP | `docs/ROADMAP.md` "Last refresh: 2026-05-12" | 🟡 **12 días stale**; predates Arm A y todo el burst 05-22. Cada vez más engañoso. |
| CALIBRATION_LOG | índice de `docs/legend/calibrations/` | 🟡 **sigue sin existir**; la carpeta ya tiene ~31 archivos `.md`. Un recién llegado debe `grep -r SELF_INGEST` para reconstruir el hilo. Valor creciente. |
| Archive dirs | `.ontology.*-result/` | 🟡 ~12.7 MB (4 dirs + Arm A). Benigno, baja prioridad. |
| Push pendiente (05-23 §0) | publicar el burst | ✅ **RESUELTO** — 0 adelante/0 atrás. |
| Bug `--reps` (05-23 §3) | caché colisiona | ✅ **CERRADO** (`5d70f3b` + test `2591179`). |

---

## 7. Próximos pasos priorizados

**🥇 Move 1 — Higiene de datos de Arm A antes de seguir (~30 min)**
Corregir `node_0094.manifestation → "code"` (§4.1) y re-correr el verify para 126/126; **no** commitear el JSON vacío de Arm B; resolver el hueco de `.gitignore` (§4.3); commitear el reporte Arm A (`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md`, hoy untracked) + el `+1` línea del TODO. Es el output pre-registrado que la hipótesis prometió versionar.

**🥈 Move 2 — Arm A0 de control sin grounding (~1h 33min, $0) — *el gate científico nuevo***
qwen 7b + safety-net **sin** `--ast-grounding`, grafo idéntico. Descompone safety-net vs grounding y mide cuánto del Jaccard 0.581 es circularidad métrica (§3.1). Barato y desbloquea un encuadre publicable defendible.

**🥉 Move 3 — Relanzar el experimento multi-arm, empezando por el arm rápido (noches)**
Investigar por qué murió Arm B (§4.2). Correr **Arm C-local** (`starcoder2:7b`, 4.0 GB) primero — más rápido que granite — luego Arm B (`granite4.1:8b`, esperar 10–25 h). Recalibrar predicciones B/C contra el real de Arm A (§5.4). Pasar los tres por bakeoff-synthesis y disparar el árbol H2/H3/H4.

**Prioridad media (cuando convenga)**
Checker del eje `behavior` (§5.2, ortogonal al grounding) · superficie CLI de bakeoff-synthesis (§5.3) · warning de candidato excluido (§4.1 estructural).

**Prioridad baja**
Refrescar ROADMAP (12 días stale) · crear `CALIBRATION_LOG.md` (~31 archivos) · `scripts/legend-archive-prune.sh`.

---

## 8. Tabla resumen

| Item | Estado | Urgencia | Esfuerzo |
|---|---|---|---|
| Bug `--reps` (titular 05-23) | ✅ **CERRADO** (`5d70f3b`) | — | — |
| Push del burst 05-22 | ✅ **RESUELTO** (0/0) | — | — |
| Arm A confirma H1 (6/6) | ✅ **resultado real** | — | — |
| Circularidad intervención↔métrica (§3.1) | 🟡 recalibra la claim, no la invalida | **Alta — antes de publicar/Arm B-C** | arm de control ~1.5h |
| `node_0094` caído del verify (§4.1) | 🟡 under-count silencioso 125/126 | Media | ~30 min |
| Arm B JSON 0 bytes (§4.2) | 🟡 no completó | Media (antes de relanzar) | investigar |
| Hueco `.gitignore` (§4.3) | 🟡 sidecars untracked | Baja-Media | ~15 min |
| `node_update_parent` sin CLI (§4.4) | 🟢 primitiva sin consumidor directo | Baja | nota |
| Ejes contract/behavior/intent vacíos (§5.2) | 🟡 cartografía incompleta | Media | checker behavior ~varias h |
| CLI bakeoff-synthesis (§5.3) | 🟡 solo librería | Media | ~1-2 h |
| ROADMAP 12 días stale | 🟡 engañoso | Baja | ~30 min |
| `CALIBRATION_LOG.md` ausente (~31 archivos) | 🟡 falta índice | Baja | ~30 min |
| `.git/index.lock` recurrente | 🟢 inocuo | trivial | `rm` local |

---

## 9. Resumen ejecutivo (un párrafo)

El bug titular de la revisión 05-23 (`--reps` inerte por colisión de caché) está corregido exactamente como se recomendó (`5d70f3b`, espejo de `--ast-grounding`, con test de integración en `2591179`), el push pendiente ya se publicó (local 0/0 con `origin`), `tsc --noEmit` sigue limpio y los tests subieron a 122 archivos. El hito del día es que **Arm A del Move 3α corrió y confirma la hipótesis H1 en las seis métricas pre-registradas** (Jaccard 0.581, exportRecovery 0.686, honestidad 0.496, vocab gap 488→106, 83/125 archivos con Jaccard≥0.5, unrecoverable 24→0). El detalle que esta revisión insiste en registrar: Arm A supera cada falsador por ~10×, y eso destapa una **circularidad de diseño** — la intervención (`--ast-grounding`) inyecta los nombres exactos de declaraciones que las dos métricas titulares (Jaccard estructural y exportRecovery) precisamente miden; el Candado #2 evita el "dump" pero no esta circularidad. El encuadre honesto es "el grounding cierra el gap de nombres, no el de tamaño ni el conductual" (la LoC distance sigue en 0.589 y 57% de nodos son `divergent_loc`; behavior/contract/intent siguen sin medir). La recomendación científica nueva es un **Arm A0 de control sin grounding** (~1.5h, $0) que aísle el aporte real antes de gastar noches en Arm B/C. Hallazgos menores: `node_0094` (el entry point del propio `ingest`) se cayó del verify por tener `manifestation:"intent"` → el "125" subcuenta el perímetro real de 126 en silencio; el JSON de Arm B quedó en 0 bytes (no completó, no commitear); y hay un hueco en `.gitignore` para los sidecars `.json`. La columna estructural de la matriz de cartografía está sólida; las otras cuatro siguen vacías, y cerrar **behavior** (ortogonal al grounding) es el próximo checker de mayor valor.

---

*Generado por la tarea programada `ontology-pr-suggestions` el 2026-05-24. HEAD: `103d3c2` (0 adelante / 0 atrás de `origin/main`). Build: `tsc --noEmit` limpio (verificado). `git pull` bloqueado por proxy en el sandbox y discutible (local sincronizado). `vitest` no disponible in-sandbox (binding rolldown); toda verificación vía `tsc` + lectura de código + recómputo del JSON de Arm A.*
