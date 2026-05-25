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

---

## 10. Addendum 2026-05-24 (tarde) — qué aterrizó en respuesta a esta revisión

> *La revisión de arriba se generó por la mañana sobre HEAD `103d3c2`. En la sesión que siguió se ejecutó la cadena Move 1 → Move 2 que recomienda §7, más higiene adicional. Este addendum resume lo aterrizado en orden de commit; HEAD pasó a `4697e4e` (`origin/main` sincronizado). El estado del repo discrepa ahora del que la revisión describe — y ese es el cierre que se merece.*

### 10.1 Notas sobre la propia revisión (lo que ya estaba stale al generarse)

- §4.2 afirmaba que `.ontology.self-ingest-epsilon-3a-arm-b.json` pesaba **0 bytes**. En realidad pesaba **200 KB** — la corrida de Arm B completó la noche del 23 → mañana del 24 (10h 27min, 124/125 unrecoverable por HW veto). La revisión auditó el directorio antes de inspeccionar tamaños o ver el reporte `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md` (que ya existía, 30 KB).
- §4.2 también afirmaba que **no existían** los reportes Arm B / Arm C-local / synthesis. Los tres ya estaban en disco (29 KB / 26 KB / 23 KB respectivamente), aterrizados antes del mediodía. El TODO incluso ya los documentaba.
- `.ontology.toy-pre-arm-b-backup/` (§4.3) ya no existía al inicio de la sesión — se había limpiado.

**Implicación operativa:** las revisiones automáticas pueden ir a contramano de un working tree que ya avanzó. Tratarlas como "hipótesis sobre el estado, no estado". El siguiente review (05-25) debería ver `git log --since=2026-05-24` y reportar el delta sin asumir continuidad lineal con el HEAD de la mañana.

### 10.2 Move 1 hygiene + structural guards (commit `e6141b1`)

Resuelve §4.1 (silent perimeter under-count) y §5.1 (gitignore) en una sola pieza estructural. Tres cambios de código + un addendum publicable:

- `inferManifestationFromSourcePath(filePath)` en `src/runtime/compile/manifestation-mapper.ts` — extensión → manifestation (`*.ts/*.py/...` → `code`; `*.test.ts/*.spec.ts/...` → `test`; `build.sh` → `build`; prosa/data → `undefined`). 5 tests nuevos, 11/11 verde en `tests/manifestation-mapper.test.ts`.
- Guard en `createNodeProposalForExtraction` (`src/commands/ingest/index.ts`) — si el extractor dejó `manifestation` en `undefined` o `"intent"` y el path implica otra cosa, override; el override se registra en `provenance.rationale.manifestationOverride` para auditabilidad.
- Warning en `verify-homeomorphism --all-artifacts` candidate resolver — emite `[verify] warning: N node(s) have outputs.files pointing at code-extension files but manifestation !== "code" — excluded` (suprimido bajo `--json` para no contaminar sidecars). El under-count silencioso ya no es invisible.
- Addendum en `SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md` documenta la distinción 125 vs 126: coverage real 99.2 % (no 100 %); headline metrics cambian al tercer decimal; H1 sigue confirmado en 6/6.
- `.gitignore` extendido defensivamente (`.ontology.*-backup/`, `.ontology.scratch-*/`, `.ontology.self-ingest-*.stderr.log`); los sidecars `.json` se **versionan** intencionalmente como output pre-registrado.
- Tests focalizados: 107/107 verde (ingest-cli + homeomorphism-event-audit + verify-report-markdown + verify-reps-cache-bypass + extraction-vocab-guard + compile-cli-run-batch + manifestation-mapper). `tsc --noEmit` limpio.

§7 Move 1 al completo, modulo "re-correr verify para 126/126" — explícitamente diferido (workspace shuffling + el extractor original produjo una extracción degenerada de `node_0094` con `prompt.raw: "- example"`, así que el re-verify casi seguro devuelve `unrecoverable`; valor científico marginal de unos décimos en el tercer decimal).

### 10.3 CALIBRATION_LOG (commit `783b5b1`)

§6 cerrado. `docs/legend/calibrations/CALIBRATION_LOG.md` aterriza como índice canónico del corpus de calibración (33 archivos + Arm A0 después). Cinco secciones: §0 "Start here" para lectores fríos · §1 runs ε con tripletas linkeadas (β / β′ / γ / δ / Move 3α) · §2 pre-ε (HASH_TS, VIBE_REASONING, BAKEOFF, SMOKE) · §3 hierarchizer prework · §4 milestone reviews diarias · §5 convenciones (estructura tripleta, naming, política de sidecars). Ya no hace falta `grep -r SELF_INGEST` para reconstruir el hilo.

### 10.4 ROADMAP refresh y simplificación (commits `2fd1c17` → `5a72af8`)

§6 ítem ROADMAP cerrado. Primer pase expandió a 506 líneas (12 días de arco ε commit-por-commit); el siguiente lo simplificó a **89 líneas** (-78 %) tras feedback explícito del usuario. Detalle commit-por-commit se reubica en `RELEASE_NOTES.md` + `CALIBRATION_LOG.md`; el ROADMAP responde "dónde estamos, hacia dónde vamos, qué está abierto" en una lectura de tres minutos. Memoria guardada para que futuros refreshes defaulteen a encoger.

### 10.5 Move 2 — Arm A0 control (commit `4697e4e`)

§3.1 resuelto con datos. Arm A0 = `qwen2.5-coder:7b` + safety-net **sin** `--ast-grounding`, perímetro idéntico al de Arm A (workspace clonado de `.ontology.self-ingest-epsilon-3a-arm-a-result/`). Wall-clock **2h 29min** (vs Arm A 1h 33min, +60 % — sin el bloque MANDATORY EXPORTS el modelo emite más tokens libres por respuesta, output 53 K → 75 K).

Headline (Arm A − Arm A0):

| Métrica | Arm A (con grounding) | Arm A0 (control) | Δ |
|---|---:|---:|---:|
| Mean Jaccard | 0.581 | **0.226** | **−0.355** |
| Mean LoC dist | 0.589 | 0.563 | −0.026 (~estable) |
| Structural honesty | 0.496 | 0.332 | −0.164 |
| ExportRecovery micro | 68.6 % | 25.6 % | **−43.0 pp** |
| Missing-export keys | 106 | 297 | +191 (3× más drops sin grounding) |
| Hallucinated exports | 116 | **16** | −100 (grounding **causa** 7× over-stuffing) |
| `empty_regen` tag | 21 | 77 | +56 (intent validator rechaza más sin contract block) |
| ε-equivalent | 12 (10 %) | 6 (5 %) | −6 |
| divergent_both | 37 (30 %) | 78 (62 %) | +41 |
| Unrecoverable | 0 | 0 | 0 |

**§3.1 recalibrado, no refutado.** El 28× de Arm A sobre el piso δ' (0.581 vs 0.021) descompone como:

- ~0.205 baseline-qwen-7b + safety-net (A0 − δ') — capacidad del modelo + safety-net.
- ~0.355 grounding-intervention lift (A − A0) — el aporte real de inyectar AST.

La intervención **sí** es load-bearing; **no** es artefacto de circularidad. Sorpresa secundaria: **A0 también pasa el piso H1 = 0.1** (0.226 ≥ 0.1). El falsador H1 estaba calibrado contra δ' (qwen-3b sin safety-net) y ya no es informativo contra arms modernos; **futuros falsadores H1 deben recalibrarse contra A0**, no contra δ'.

Encuadre publicable defendible:

> *"AST grounding at compile-back contributes ~0.355 mean Jaccard lift over a strong qwen-7b + safety-net baseline. The lift is real and not pure metric circularity. Honest costs of the intervention: (1) it does NOT improve LoC accuracy; (2) it causes the model to hallucinate 7× more exports trying to satisfy the contract block (over-stuffing, not deeper understanding); (3) behaviour / contract / intent axes remain unmeasured."*

Synthesis driver `scripts/run-3a-bakeoff-synthesis.ts` extendido de 3 → 4 brazos (baseline sigue siendo A para preservar la lectura "qué pasa cuando cambias ingrediente X relativo a qwen grounded"). Re-renderizado `SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md` incluye A0 con per-mode failure deltas. Workspace archivado en `.ontology.self-ingest-epsilon-3a-arm-a0-result/`; scratch `.ontology/` restaurado desde stash.

### 10.6 Lo que NO se hizo (y por qué)

- **§7 Move 3 (relanzar B / C-local)**: no aplica — ambos ya habían corrido antes de que se generara la revisión (Arm B 2026-05-24T05:11 local, Arm C-local 2026-05-24T13:05 local). El synthesis 3-arm ya estaba en disco. El re-síntesis 4-arm (con A0) **sí** se hizo.
- **Re-verify de `node_0094`**: §4.1 lo pedía; se difirió por costo/beneficio (extracción de origen degenerada → re-verify casi seguro `unrecoverable`; cambia métricas al tercer decimal). El guard estructural en ingest impide que la misma misclasificación recurra en futuras ingests.
- **Checker behaviour axis** (§5.2): identificado como el siguiente checker de mayor valor (ortogonal al grounding → inmune a §3.1); queda en open follow-ups del ROADMAP. No bloqueante para Phase ε.
- **CLI `onto legend bakeoff-synthesis`** (§5.3): queda en open follow-ups. El driver hand-rolled (`scripts/run-3a-bakeoff-synthesis.ts`) sigue siendo idempotente y suficiente.

### 10.7 Estado de cierre de Phase ε al final del día

| Item | Estado |
|---|---|
| Arm A (grounded baseline) | ✅ landed 2026-05-23 |
| Arm B (granite HW veto) | ✅ landed 2026-05-24 |
| Arm C-local (starcoder contract violation) | ✅ landed 2026-05-24 |
| Arm A0 (grounding ablation control) | ✅ landed 2026-05-24 |
| 4-arm synthesis | ✅ landed 2026-05-24 |
| §3.1 metric-circularity worry | ✅ resuelto (grounding contributes real Δ = +0.355) |
| §4.1 silent perimeter under-count | ✅ structural guards shipped |
| `node_0094` data point in Arm A report | 🟡 deferred (data correction noted in addendum; re-verify not run) |
| Behaviour-axis checker | 🟡 open follow-up |
| Arm C-cloud (devstral-24b en GPU rentado, ~$5-10) | 🟡 último gate para clean ε close |
| `MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2 | 🟡 gated en Arm C-cloud |

5 commits del día (`e6141b1` Move 1 hygiene · `783b5b1` CALIBRATION_LOG · `2fd1c17` ROADMAP refresh · `5a72af8` ROADMAP simplification · `4697e4e` Arm A0). Todos en `origin/main`. HEAD final `4697e4e`.

### 10.8 Una corrección al resumen ejecutivo (§9)

El §9 ejecutivo cierra con "la recomendación científica nueva es un Arm A0 de control sin grounding". El día siguiente al texto: la recomendación se ejecutó, y la lectura terminó **fortaleciendo** la claim original (no rebajándola). El encuadre §9 — "the grounding closes the gap of names, not the gap of size or behaviour" — sigue siendo el correcto, ahora con número exacto del aporte aislado (+0.355 Jaccard) y costo cuantificado (7× over-stuffing de exports). Cuando aparezca el milestone review 05-25, la columna `structural` de la cartografía estará sólida con **descomposición causal** (no solo magnitud); las otras cuatro siguen vacías y `behaviour` sigue siendo el próximo checker de mayor valor.
