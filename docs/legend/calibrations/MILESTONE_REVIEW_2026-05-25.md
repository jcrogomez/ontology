# Revisión de milestone — Ontology — 2026-05-25

> *Ejecución automática de la tarea programada `ontology-pr-suggestions`. Escrita en español para mantener continuidad con la revisión 05-24 (la serie 05-19 → 05-23 está en inglés; si prefieres volver a inglés, avísame). Identificadores de commit, métricas y nombres de archivo se dejan literales.*
>
> *El addendum §10.1 de la revisión 05-24 dejó una instrucción explícita para hoy: «tratar las revisiones automáticas como hipótesis sobre el estado, no estado» y reportar el delta vía `git log --since=2026-05-24` sin asumir continuidad lineal. Eso es lo que hace esta revisión: parte del HEAD que la 05-24 dejó (`4697e4e`), reporta los 2 commits que aterrizaron después, y dedica el cuerpo a **un bug nuevo, concreto y verificado** que ninguna revisión anterior detectó.*

---

## 0. ⚠️ Lo que el sandbox no pudo hacer — `git pull` y tests

1. **`git pull` está bloqueado en el sandbox** (`HTTP 403 from proxy after CONNECT`; el proxy del entorno corta todo tráfico a github.com **y** a registry.npmjs.org). Igual que las seis revisiones previas, esto es discutible: el ref local `origin/main` y `HEAD` están ambos en `fb3f2bf` — **0 adelante / 0 atrás**. No hay nada que traer ni empujar a nivel de commits. El working tree está limpio.

2. **`vitest` sigue sin poder correr en el sandbox.** Falta el binding nativo `@rolldown/binding-linux-arm64-gnu` (vitest 4.x usa rolldown) y `npm install` del binding también da **403** (registro npm bloqueado). Restricción de infra, no regresión. **Verificación disponible hoy:** `tsc --noEmit` corrió y da **exit 0** (build limpio); el resto se verificó por lectura directa de código, escaneo de bytes y recómputo. *Acción para ti en local:* `npm run test:run` para confirmar los 122 archivos de test en verde — no pude hacerlo aquí.

3. **`.git/index.lock` recurrente** (`.git` montado read-only en el sandbox; git no lo puede borrar). Inocuo, séptima revisión que lo señala. Antes de tu próximo `git add`/`commit` en tu máquina:
   ```sh
   rm -f ~/Development/ontology/.git/index.lock
   ```

---

## 1. Resumen situacional — qué cambió desde la 05-24

La revisión 05-24 (mañana) corrió sobre HEAD `103d3c2`; su addendum §10 documentó la cadena que aterrizó esa tarde, dejando HEAD en `4697e4e`. Desde entonces, **2 commits nuevos** (`4697e4e..fb3f2bf`), ambos de documentación:

| Commit | Fecha | Qué hizo |
|---|---|---|
| `7e2df40` | 2026-05-24 21:43 | Addendum §10 a la revisión 05-24 — cierra el review de la mañana con lo que realmente aterrizó (incluida la nota de auto-staleness para hoy). |
| `fb3f2bf` | 2026-05-24 22:14 | **(HEAD)** Recalibración de falsadores H1/H3 contra A0/A en el doc HYPOTHESIS + spec v0 del checker del eje `behaviour`. Cierra los dos gates de costo-cero del cierre de Phase ε. |

No aterrizó código ejecutable nuevo desde la 05-24: los dos commits son docs. Eso es coherente y disciplinado — el cierre de Phase ε quedó en estado «las decisiones de costo-cero registradas, esperando el único gate que cuesta dinero (Arm C-cloud)».

**Dónde está el milestone (Phase ε, self-ingestión del repo Ontology):**

- Fases **α–δ shipped**; **Phase ε mid-flight**.
- Move 3α (bake-off multi-arm de AST grounding) **tiene los cuatro brazos locales en disco**: Arm A (grounded, confirma H1 6/6, Jaccard 0.581), Arm A0 (control sin grounding, 0.226 → aísla el aporte del grounding Δ = **+0.355**), Arm B (granite, HW veto, 124/125 unrecoverable), Arm C-local (starcoder, contract violation). Síntesis de 4 brazos renderizada.
- La preocupación de **circularidad métrica §3.1** quedó **resuelta con datos** (el grounding aporta lift real, no artefacto).
- **Gate restante para un cierre limpio de ε:** Arm **C-cloud** (`devstral-small-2:24b` en GPU rentado, ~$5–10) → luego upgrade `MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2.
- **Matriz de cartografía:** solo la columna `structural` (+`cost`) está llena en los 125 nodos; `contract` / `behavior` / `intent` siguen vacías. El checker del eje **behaviour** (spec v0 aterrizado hoy, `fb3f2bf`) es el siguiente de mayor valor porque es ortogonal al grounding.

**Lectura honesta del progreso:** el proyecto está en muy buena forma. La disciplina de pre-registro, el ablation control (A0), el encuadre publicable honesto y el hardening son ejemplares. El milestone está a **~1 corrida de GPU pagada + 1 checker (~4–6 h)** de un cierre de Phase ε defendible.

---

## 2. Estado verificado en HEAD `fb3f2bf` (hoy, por inspección directa)

| Señal | Resultado | Cómo se verificó |
|---|---|---|
| HEAD | `fb3f2bf` (era `4697e4e` al cierre 05-24) | `git log` |
| Sync con `origin/main` | **0 adelante / 0 atrás** | `git rev-list --left-right --count HEAD...origin/main` |
| Working tree | limpio (solo el warning inocuo de `index.lock`) | `git status --porcelain` |
| `tsc --noEmit` | ✅ limpio (exit 0) | corrido hoy |
| Sidecars `.json` de los 4 brazos | ✅ todos **tracked**, sin diff vs HEAD | `git ls-files` + `git diff --stat HEAD` |
| Archivos de test | **122** `.test.ts` | `ls tests/*.test.ts \| wc -l` |
| Higiene de tests | ✅ **0** `it.only`/`describe.only`/`.skip` | grep |
| `vitest` | ❌ no corre en sandbox (binding rolldown arm64; npm bloqueado) | intento hoy |
| **NUL bytes en fuentes `.ts`** | 🔴 **1 archivo contaminado** (ver §3) | escaneo byte-a-byte de los 334 `.ts/.tsx` tracked |

Sin drift de commits, sin regresión de build. La sorpresa del día está en la última fila.

---

## 3. 🔴 Titular — un byte NUL en `src/commands/verify/homeomorphism.ts` (y el guard que debía cazarlo está roto)

Esta es la observación que merece la atención de hoy. Es **nueva** — no aparece en ninguna de las siete revisiones anteriores — y es exactamente la clase de bug que este proyecto ya conoce, documentó, y construyó una defensa específica para evitar… que no funciona.

### 3.1 El bug — un NUL committeado en un archivo de fuente

Escaneé byte a byte los **334** archivos `.ts/.tsx` tracked. Exactamente **uno** contiene un byte NUL (`0x00`):

```
src/commands/verify/homeomorphism.ts  →  1 NUL byte  (también presente en el blob committeado en HEAD)
```

Está en la **línea 618**, dentro de la función `dominantDispatchModel`, como **separador de un key de `Map`**:

```ts
const key = `${r.dispatchModel.provider}\x00${r.dispatchModel.model}`;
//                                       ^^^^  byte NUL literal (0x00)
```

El NUL es funcionalmente inocuo *para el código*: es un separador entre `provider` y `model` al tallar el modelo de dispatch dominante. TypeScript compila (NUL es un carácter válido en un string JS), `tsc --noEmit` da exit 0, y cualquier test pasa porque la igualdad de strings funciona con NUL adentro.

### 3.2 Por qué importa — *déjà vu* del bug de `pareto.ts`, en un archivo peor

El header del propio `scripts/check-nul-bytes.sh` cuenta la historia textual:

> *«pareto.ts shipped to 0.4.0-rc.1 main with two NUL bytes inside a template-literal separator. TypeScript still compiled… tests still passed… but the Phase ε pilot's ingest correctly classified the file as `binary_content` and refused to extract its intent.»*

Es **el mismo patrón**: un NUL como separador dentro de un template-literal. Y la consecuencia está codificada, no es folclore — `src/commands/ingest/index.ts:626`:

```ts
if (fileContent.includes("\u0000")) {
  // ... reason: "binary_content"  → NO LLM dispatch
}
```

El pipeline de ingest **rechaza** cualquier archivo con un NUL como `binary_content`, sin dispatch al modelo. Implicación directa: si una futura corrida de self-ingest incluye `src/commands/verify/homeomorphism.ts`, queda **silenciosamente excluido del perímetro** — exactamente la misma clase de bug que `node_0094` (el under-count silencioso que la revisión 05-24 §4.1 y el commit `e6141b1` acaban de pelear con tanto cuidado).

Y el archivo afectado es **el peor posible para que esto pase desapercibido**: `verify/homeomorphism.ts` es **el comando por el que corre todo el experimento Move 3α**. Una claim publicable de «cartografía de fidelidad del perímetro core de Ontology vía self-ingest» se construye encima de un archivo que, si se auto-ingesta, se cae solo del perímetro. El perímetro se encoge en silencio otra vez, y esta vez en la pieza load-bearing.

### 3.3 El guard que debía cazarlo no dispara (la causa raíz)

El repo tiene `scripts/check-nul-bytes.sh` + `npm run check:nul`, construido **específicamente** para prevenir la regresión de `pareto.ts`. **Lo corrí hoy: `bash scripts/check-nul-bytes.sh --all` da exit 0 (pasa).** No reporta a `homeomorphism.ts`. El guard es ciego al byte que existe para cazar.

La causa es el detector mismo. La línea de detección:

```sh
if LC_ALL=C tr -d -c '\000' < "$f" | head -c 1 | LC_ALL=C grep -q . ; then
```

Lo verifiqué empíricamente:

```sh
printf '\000' | LC_ALL=C tr -d -c '\000' | head -c 1 | LC_ALL=C grep -q .
#  → exit 1  (NO match)
```

`grep -q .` **no matchea un byte NUL aislado** (el `.` de grep no cuenta al NUL como «carácter» en esta ruta / `grep` trata el NUL como dato vacío de línea). Resultado: **falso negativo garantizado** sobre exactamente la entrada que el script debe detectar. El `check:nul` y el pre-commit hook opt-in dan **falsa confianza** — por eso el NUL en `homeomorphism.ts` se committeó sin alarma.

### 3.4 Fixes recomendados (no los apliqué — esto es una revisión; tú decides)

**Fix A — el byte NUL (trivial, ~2 min).** Cambiar el separador del key por uno text-safe que no pueda colisionar con un nombre de provider/model. Opciones:

```ts
// Opción 1 — JSON, cero riesgo de colisión:
const key = JSON.stringify([r.dispatchModel.provider, r.dispatchModel.model]);

// Opción 2 — separador imprimible (provider/model no contienen '\n'):
const key = `${r.dispatchModel.provider}\n${r.dispatchModel.model}`;
```

**Fix B — el detector del guard (el que de verdad importa, ~5 min).** Reemplazar el one-liner por uno que sí cace NULs, portable:

```sh
# Cuenta bytes NUL; >0 ⇒ offender. Robusto y portable:
if [ "$(LC_ALL=C tr -d -c '\000' < "$f" | wc -c)" -gt 0 ]; then
```
o, con GNU grep, `grep -qaP '\x00' "$f"`. Después de arreglar el detector, conviene **forzar** el guard (hoy es un symlink opt-in): wirearlo en CI o como pre-commit no-opcional. Un guard que falla en silencio es peor que no tener guard, porque desactiva la vigilancia humana.

**Verificación sugerida tras el fix:** re-correr `tr -d -c '\000' < src/commands/verify/homeomorphism.ts | wc -c` → debe dar `0`, y `bash scripts/check-nul-bytes.sh --all` debe seguir en exit 0 *por la razón correcta* (probarlo metiendo un NUL temporal en un archivo de prueba y confirmando que ahora SÍ falla).

---

## 4. 🟡/🟢 Otros hallazgos

### 4.1 🟡 Drift de ortografía `behaviour` (docs) vs `behavior` (código) — trampa para el próximo implementador

El spec aterrizado hoy (`docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md`) y el ROADMAP usan consistentemente la ortografía británica **`behaviour`**: `--behaviour-check`, `tagBehaviour(...)`, «`HONESTY_AXES` already declares `behaviour`». Pero el **código** usa la americana **`behavior`** en todas partes:

- `src/runtime/legend/matrix.ts`: `HONESTY_AXES = ["structural", "contract", "behavior", "intent"]`, los campos `MatrixCell.behavior` y `AxisHonesty.behavior`, y las ramas `case "pass"` que ya implementan `behavior: pass→1, fail→0`.

La fórmula del spec (§3.3, `pass→1 / fail→0 / untested→null`) **coincide** con lo ya implementado; solo difiere el spelling. Pero el spec afirma como «one-line change» que la matriz «ya declara `behaviour`» — y declara `behavior`. Si el próximo sesión implementa el v0 al pie de la letra (escribiendo `cell.behaviour = "pass"` o `--behaviour-check`), se topará con un campo inexistente (no-op silencioso en JS, o error de tipo en TS). **Recomendación:** decidir una ortografía **antes** de implementar. Como el código ya shipeó `behavior`, lo más barato es alinear el spec + ROADMAP a `behavior` (o documentar explícitamente que el flag CLI será `--behaviour-check` pero la key interna es `behavior`). 5 minutos ahora ahorran una hora de depuración confusa después.

### 4.2 🟢 `node_update_parent` sigue sin verbo CLI directo (carryover 05-24 §4.4)

El kernel `updateNodeParent` (`src/core/nodes/update-parent.ts`) está sólido — invariantes correctas (existencia, mismo branch, no-op, y detección de ciclo vía BFS de descendientes con set `visited`, exportada para que el hierarchizer use la misma regla en plan-time y apply-time, sin drift). Lo ejercen `proposal/apply.ts` y `proposal/show.ts`. Pero **sigue sin** `onto node update-parent` directo en `src/cli.ts`; solo se llega vía el pipeline de propuestas. Es orden de construcción razonable (primitiva antes que consumidor; el hierarchizer es el consumidor previsto). Sin acción urgente — solo anotar para que nadie asuma que el comando existe.

### 4.3 🟢 Higiene de doc-drift de revisiones anteriores: resuelta

`docs/ROADMAP.md` (que la 05-24 §6 marcaba «12 días stale») fue refrescado y simplificado (`2fd1c17` → `5a72af8`, ahora «Last refresh: 2026-05-24», 89 líneas). `CALIBRATION_LOG.md` (que faltaba) aterrizó (`783b5b1`). Ambos ítems heredados están cerrados. Buen seguimiento.

---

## 5. Mejoras de diseño (más allá de bugs)

1. **(Lo más importante — §3.3) Arreglar el detector del NUL guard y forzarlo.** El guard existe pero da falso negativo sobre su caso de uso exacto; eso es deuda de seguridad activa, no latente. Tras el fix, wirearlo en CI / pre-commit obligatorio.

2. **Un único preflight de «integridad de perímetro» que cace toda la clase de exclusión silenciosa.** Ya van **dos** instancias de la misma patología en dos semanas: `node_0094` (manifestation mal etiquetada) y ahora el NUL de `homeomorphism.ts` (binary_content). Ambas encogen el perímetro en silencio antes de una corrida publicable. En vez de parchear caso por caso, un comando `onto legend perimeter-check` (o un test) que liste **todo archivo `.ts/.tsx` tracked que NO esté representado como nodo `code` en el candidate-set del verify** —incluyendo los que se caerían por NUL o por manifestation— cazaría ambas clases de una sola pasada, y cualquier futura. Es el invariante que las dos curas puntuales sugieren.

3. **Cerrar la columna `behaviour` de la matriz de cartografía** (ya es el plan; spec v0 aterrizado). Sigue siendo el siguiente checker de mayor valor: ortogonal al grounding ⇒ inmune a la circularidad §3.1; binario por nodo ⇒ resiste la lectura «el lift estructural es parcialmente mecánico». ~4–6 h. Reconciliar el spelling primero (§4.1).

4. **Versionar el JSON crudo del experimento como data, no como código.** Los cinco sidecars (`.ontology.self-ingest-epsilon-3a-*.json`) ya están tracked (decisión consciente del 05-24 §10.2). Bien para auditabilidad. Solo conviene que un futuro `.gitattributes` los marque `-diff`/`linguist-generated` para que no contaminen los diffs ni las estadísticas de lenguaje del repo.

5. **Higiene de workspace de self-ingest** (carryover de varias revisiones). Los dirs `.ontology.*-result/` siguen creciendo conforme entran brazos. Un `scripts/legend-archive-prune.sh` señalado hace tiempo evitaría el crecimiento sin control. Baja prioridad, benigno.

---

## 6. Items heredados — re-verificados hoy

| Item | Estado hoy |
|---|---|
| Push pendiente / sync con `origin` | ✅ 0 adelante / 0 atrás en `fb3f2bf`. |
| Bug `--reps` (titular 05-23) | ✅ cerrado desde `5d70f3b` + test. |
| Arm A confirma H1 (6/6) | ✅ resultado real; A0 control descompone el lift (+0.355). |
| Circularidad métrica §3.1 | ✅ resuelta con datos (05-24). |
| `node_0094` under-count silencioso | ✅ guards estructurales shipped (`e6141b1`); re-verify del dato diferido (costo/beneficio). |
| ROADMAP stale (05-24 §6) | ✅ refrescado + simplificado. |
| `CALIBRATION_LOG.md` ausente (05-24 §6) | ✅ aterrizado (`783b5b1`). |
| `.git/index.lock` recurrente | 🟢 inocuo; `rm` local. |
| `node_update_parent` sin CLI directo | 🟢 sigue igual; por diseño, sin urgencia. |
| **NUL byte + guard roto** | 🔴 **NUEVO hoy — ver §3.** |
| **Drift `behaviour`/`behavior`** | 🟡 **NUEVO hoy — ver §4.1.** |

---

## 7. Próximos pasos priorizados

**🥇 Move 1 — Limpiar el NUL y reparar su guard (~10 min, $0) — *el gate de higiene nuevo***
Aplicar Fix A (separador text-safe en `homeomorphism.ts:618`) **y** Fix B (detector de `check-nul-bytes.sh` que sí cace NULs), y forzar el guard en CI/pre-commit (§3.4). Es barato, cierra un riesgo directo a la claim publicable (el archivo de verify se caería de su propio self-ingest) y arregla una defensa que hoy da falsa confianza. Verificar con el escaneo `tr -d -c '\000' | wc -c → 0`.

**🥈 Move 2 — Reconciliar `behaviour` vs `behavior` (~5 min, decisión) — *antes* de implementar el checker***
Elegir una ortografía y alinear spec + ROADMAP al código (`behavior`) o viceversa (§4.1). Decisión de un párrafo que evita una hora de no-ops silenciosos en la siguiente sesión.

**🥉 Move 3 — Behaviour-axis checker v0 (~4–6 h, $0)**
Implementar el spec `fb3f2bf` (runner `--behaviour-check` + ~20 fixtures sobre el cohorte high-Jaccard de Arm A + wiring en `matrix.ts` + tests). Lleva la matriz de **1/5 → 2/5** columnas; ortogonal al grounding. Puede shipear antes o después de Arm C-cloud (backfill sobre workspaces archivados es $0).

**Gate pagado del cierre de ε**
Arm **C-cloud** (`devstral-small-2:24b` en GPU rentado A10/L4, ~$5–10). Falsadores ya recalibrados a H1'/H3' contra A0/A (`fb3f2bf`), así que la corrida es informativa. Pasarlo por la síntesis (extender `scripts/run-3a-bakeoff-synthesis.ts` de 4 → 5 brazos, mismo patrón que el 3 → 4 de `4697e4e`) y, con ≥2 columnas de cartografía llenas, decidir `MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2.

**Prioridad media (cuando convenga)**
Preflight unificado de integridad de perímetro (§5.2, caza node_0094 + NUL + futuros) · superficie CLI `onto legend bakeoff-synthesis` (sigue hand-rolled) · `onto node update-parent` directo.

**Prioridad baja**
`scripts/legend-archive-prune.sh` · `.gitattributes` para los sidecars `.json` · `rm .git/index.lock` local.

---

## 8. Tabla resumen

| Item | Estado | Urgencia | Esfuerzo |
|---|---|---|---|
| **NUL byte en `homeomorphism.ts:618` (committeado)** | 🔴 **nuevo** — excluiría el comando verify de su propio self-ingest | **Alta** | ~2 min |
| **`check-nul-bytes.sh` da falso negativo** | 🔴 **nuevo** — guard ciego a su caso de uso | **Alta** | ~5 min + CI wiring |
| Drift `behaviour`/`behavior` (spec vs código) | 🟡 **nuevo** — trampa para el implementador del v0 | Media (antes del checker) | ~5 min decisión |
| Sync `origin/main` (0/0 en `fb3f2bf`) | ✅ | — | — |
| `tsc --noEmit` limpio | ✅ | — | — |
| Higiene de tests (0 `.only`/`.skip`) | ✅ | — | — |
| Behaviour-axis checker v0 (spec landed) | 🟡 abre columna 2/5 | Media | ~4–6 h |
| Arm C-cloud (devstral-24b, GPU rentado) | 🟡 último gate pagado de ε | Media | ~$5–10 |
| Preflight de integridad de perímetro | 🟡 caza toda la clase de exclusión silenciosa | Media | ~1–2 h |
| `node_update_parent` sin CLI directo | 🟢 por diseño | Baja | nota |
| Archive prune / `.gitattributes` sidecars | 🟢 higiene | Baja | ~30 min |
| `vitest` no corre in-sandbox | 🟢 infra; correr `npm run test:run` local | — | — |
| `.git/index.lock` recurrente | 🟢 inocuo | trivial | `rm` local |

---

## 9. Resumen ejecutivo (un párrafo)

Desde la revisión 05-24 aterrizaron 2 commits, ambos de documentación (`7e2df40` addendum del review; `fb3f2bf` recalibración de falsadores H1'/H3' + spec v0 del checker `behaviour`), dejando HEAD en `fb3f2bf`, sincronizado con `origin/main` (0/0), working tree limpio y `tsc --noEmit` en verde. El estado del milestone es fuerte: Phase ε tiene los cuatro brazos locales de Move 3α en disco, la circularidad métrica §3.1 resuelta con el control A0 (grounding aporta Δ = +0.355 Jaccard real), y solo resta el gate pagado **Arm C-cloud** (~$5–10) más el checker `behaviour` (~4–6 h) para un cierre de ε defendible. **El hallazgo del día es nuevo y concreto:** `src/commands/verify/homeomorphism.ts` línea 618 contiene un **byte NUL committeado** usado como separador de un key de `Map` (`provider}\x00${model`) — el mismo patrón exacto que el bug histórico de `pareto.ts`. `tsc` y los tests no lo ven (NUL es string válido), pero `ingest/index.ts:626` clasifica cualquier archivo con NUL como `binary_content` y lo excluye sin dispatch — o sea, el comando de verify por el que corre todo el experimento se **caería en silencio de su propio self-ingest**, repitiendo la patología de `node_0094` en la pieza load-bearing. Peor: el guard construido para prevenir esto, `scripts/check-nul-bytes.sh --all`, **da exit 0** porque su detector (`tr -d -c '\000' | head -c 1 | grep -q .`) no matchea un NUL aislado — falso negativo verificado empíricamente. Fixes: separador text-safe (`JSON.stringify([provider, model])`) + detector que cuente NULs (`tr -d -c '\000' | wc -c`) + forzar el guard en CI. Hallazgo secundario: el spec `behaviour` y el ROADMAP usan ortografía británica mientras el código usa `behavior` (americana) en `HONESTY_AXES`/`MatrixCell`/`AxisHonesty` — reconciliar antes de implementar el v0 para no perder una hora en no-ops silenciosos. La columna `structural` de la cartografía sigue sólida; `behaviour` sigue siendo la próxima de mayor valor.

---

*Generado por la tarea programada `ontology-pr-suggestions` el 2026-05-25. HEAD: `fb3f2bf` (0 adelante / 0 atrás de `origin/main`). Build: `tsc --noEmit` limpio (verificado). `git pull` y `npm install` bloqueados por el proxy del sandbox (github + npm); local sincronizado. `vitest` no disponible in-sandbox (binding rolldown arm64); toda verificación vía `tsc` + lectura de código + escaneo byte-a-byte de los 334 `.ts/.tsx` tracked + recómputo. El bug del NUL se confirmó en el blob committeado (HEAD), no solo en el working tree.*
