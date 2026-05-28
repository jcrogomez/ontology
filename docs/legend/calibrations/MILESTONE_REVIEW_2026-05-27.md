# Revisión de Milestone — Ontology — 2026-05-27

> *Ejecución automática de la tarea programada `ontology-pr-suggestions`.
> Revisión posterior a la del 2026-05-26. Status verificado mediante
> lectura de código, `tsc --noEmit`, escaneo de bytes, grep de higiene
> de tests y `git log`. **`git pull` bloqueado** por el allowlist del
> proxy del sandbox (`HTTP 403 from proxy after CONNECT`, mismo bloqueo
> que las revisiones previas). `vitest` tampoco corre in-sandbox
> (binding nativo `rolldown` es arm64-darwin, no linux-arm64, y `npm`
> está bloqueado). El usuario no estuvo presente: ejecución autónoma.*

---

## 0. ⚠️ Limitaciones del sandbox (sin cambios respecto a 05-26)

1. **`git pull` bloqueado** — `curl -I https://github.com` devuelve
   `X-Proxy-Error: blocked-by-allowlist`. No se pudo sincronizar contra
   `origin/main` ni verificar si hay commits remotos nuevos. La
   sincronización local se evalúa con el `origin/main` cacheado.
2. **`vitest` no corre** — falta `rolldown-binding.linux-arm64-gnu.node`
   (el `node_modules` se instaló en el Mac arm64-darwin del usuario). La
   salud del build se mide con `tsc --noEmit` (verde) en su lugar.
3. **`.git/index.lock` presente** (montaje read-only). Inocuo; `rm -f`
   antes del próximo commit local.

---

## 1. 🔴 Hallazgo nuevo de estado: 5 commits locales SIN PUSHEAR

A diferencia de todas las revisiones desde el 05-19 (que reportaban
`origin/main` en `0 adelante / 0 atrás`), **hoy el branch local está 5
commits ADELANTE de `origin/main`**:

```
$ git status
On branch main
Your branch is ahead of 'origin/main' by 5 commits.
```

| HEAD local | `origin/main` (cacheado) |
|---|---|
| `f365b66` | `dd641c7` |

Commits sin pushear (de más nuevo a más viejo):

| Commit | Qué hizo |
|---|---|
| `f365b66` | feat(workflow): runtime v0 — máquina de estados de nodos tipados con edges `branches_on` |
| `8735eba` | docs(legend): spec del workflow runtime v0 — pickup-and-go de Phase ζ |
| `4d306e5` | docs(legend): snapshot de auto-review 2026-05-26 (start-of-day) |
| `5a62584` | feat(legend): behaviour-axis checker v0 — matriz 1/5 → 2/5 columnas |
| `7ebdb52` | docs(legend): cierre de Phase ε sobre 4-arm + 2-column substate — §3.10 T4 → T2 |

> **Acción recomendada (alta):** hacer `git push`. El trabajo de cierre
> de ε y el arranque de ζ vive sólo en local; un fallo de disco lo
> perdería. *No pude pushear yo* (proxy bloqueado); requiere tu máquina.
> Si el push ya ocurrió después de mi último fetch cacheado, ignora este
> punto — no pude verificar el remoto real.

---

## 2. Estado verificado en HEAD `f365b66` (2026-05-27)

| Señal | Resultado | Δ vs. 05-26 | Verificación |
|---|---|---|---|
| **HEAD local** | `f365b66` | (era `ad5f148`) | `git log -1` |
| **Sync con `origin/main`** | **5 adelante / 0 atrás** | (era 0/0) | `git status` |
| **`tsc --noEmit`** | ✅ exit 0 (limpio) | = | corrido hoy |
| **NUL bytes en fuentes** | ✅ 0 | = | escaneo byte-a-byte de 364 `.ts/.tsx` |
| **Guard `check-nul-bytes.sh --all`** | ✅ exit 0 | = | corrido hoy |
| **Higiene de tests** | ✅ 0 `.only` / `.skip` | = | grep de 144 `.test.ts` |
| **Archivos `.ts/.tsx` tracked** | 364 | +30 | `git ls-files` |
| **Test files** | 144 | +22 | `git ls-files '*.test.ts'` |

El crecimiento (+30 fuentes, +22 tests) es consistente con dos features
nuevas con sus baterías de tests: el workflow runtime v0 y el
behaviour-axis checker v0.

---

## 3. ¿Qué cambió desde el 2026-05-26? (6 commits)

La revisión 05-26 dejó HEAD en `ad5f148` (start-of-day). Aterrizaron 6
commits, que cierran **las Prioridades 1 y 4 del `NEXT_STEPS_SUMMARY` de
ese día** y arrancan Phase ζ:

### 3.1 ✅ Phase ε CERRADA

- **Behaviour-axis checker v0 (`5a62584`)** — Prioridad 🥇 del 05-26,
  estimada en 4–6 h, entregada el mismo día. Implementación en
  `src/runtime/legend/behavior-checker.ts` (559 líneas), cableada al
  comando `verify` detrás de `--behavior-check --matrix`, con 9 fixtures
  en `tests/behavior-fixtures/`. La matriz de cartografía pasa de **1/5
  → 2/5 columnas** (`structural` + `behavior`).
- **Cierre de ε + §3.10 T4 → T2 (`7ebdb52`)** — el adjunto de
  `MATHEMATICAL_CLAIMS.md` §3.10 se promovió de T4 a T2 sobre el
  substate de 4 brazos + 2 columnas. Arm C-cloud queda **parkeado por
  presupuesto** (ya no bloquea el cierre; pasa a ser refuerzo opcional).

### 3.2 ✅ Item abierto del 05-26 §4.3 resuelto

- **`experiments/verify-refine-math/` (`dd641c7`)** — estaba *untracked*
  el 05-26 (lo marqué como "documentar si es intencional"). Hoy está
  committeado con su `README.md`. Resuelto.

### 3.3 🟡 Phase ζ ARRANCA

- **Spec del workflow runtime v0 (`8735eba`)** + **implementación v0
  (`f365b66`)** — máquina de estados que camina un grafo de nodos
  tipados (`generator` / `verifier` / `terminal`), ramifica sobre
  veredictos estructurados vía un DSL de predicados, y termina en
  accept/reject o por agotamiento de presupuesto de pasos. Caso motor:
  el patrón verify-refine de Huang & Yang 2025 (arXiv:2507.15855v4) para
  IMO 2025.

**Evaluación:** Ritmo excelente. El cierre de ε se ejecutó tal como lo
proyectó el `NEXT_STEPS_SUMMARY`, y ζ ya tiene una superficie nueva
funcional el mismo día. El código nuevo compila limpio y trae tests.

---

## 4. 🔴 Hallazgo principal: el verify-refine v0 PIERDE la solución

Este es el hallazgo de mayor valor de hoy. El **ejemplo estrella** de
Phase ζ (`examples/workflow-imo-verify-refine/graph.json`, el caso que
la spec y el README enmarcan como la demo del método publicado) **no
hace lo que afirma**, por un bug de dataflow en el executor.

### 4.1 El mecanismo

El executor hilvana **un solo string**, `currentInput`, y tras visitar
un verifier hace, para **todas** las ramas
(`src/runtime/workflow/executor.ts:237`):

```ts
currentNode = nextNode;
currentInput = visit.output;   // ← output VERBATIM del verifier (texto del veredicto)
```

donde `visit.output` de un verifier es `response.text` — el JSON del
veredicto, **no** la solución que el verifier acaba de juzgar
(`executor.ts:394`). No existe ninguna memoria del "artefacto actual"
distinta del "output del último nodo".

### 4.2 Consecuencia A — la rama de PASS re-verifica el veredicto, no la solución

El grafo añade un nodo `step3b_revisit` con `passThrough: true`, cuyo
comentario de schema dice textualmente que existe para *"preservar un
artefacto a través de un self-loop del verifier … re-verificar la MISMA
solución varias veces"*. Pero:

1. Verificación #1 lee la solución real (de `step2`) → veredicto `pass`.
2. La rama `verdict == "pass"` enruta a `step3b_revisit`, y
   `currentInput` queda = **el JSON del veredicto** del verifier.
3. `step3b_revisit` (passThrough) re-emite su input = ese JSON.
4. Verificación #2 recibe como "solución candidata" el **JSON del
   veredicto de la verificación #1**, no la solución.

Es decir, "5 pases consecutivos sobre la misma solución" en realidad
re-verifica el texto del veredicto. El nodo passThrough — agregado
justamente para arreglar esto — opera sobre el valor equivocado (el
*output* del verifier, no su *input*).

### 4.3 Consecuencia B — la rama de FAIL no puede corregir la solución

El prompt de `step5_correction` dice: *"Apply the corrections … to the
solution as you remember it from the conversation context."* Pero los
dispatches son **stateless**: `LlmRequest` no lleva historial de
mensajes (verificado: `src/runtime/llm/types.ts:35` no tiene `messages`/
`history`). Cada nodo compone `prompt = body + "\nINPUT:\n" + input` de
forma independiente. El corrector sólo recibe el *bug report* como
INPUT; **nunca ve la solución**. No puede corregir un texto que no tiene
— alucinaría una solución nueva a partir del reporte de bugs.

### 4.4 Consecuencia C — el output de ACCEPT es el veredicto, no la solución

`executor.ts:161` devuelve `output: currentInput` en el terminal. Como
el verifier sobreescribió `currentInput` con su texto verbatim, el
`result.output` de un accept es el JSON del veredicto, no la solución
aceptada. El "output preview" del CLI muestra eso.

### 4.5 Por qué los tests no lo atrapan

- El test `(c)` corre el grafo IMO en **dry-run**: cada verifier emite
  `{"verdict":"pass"}` enlatado y cada generator emite
  `[dry-run output of <id>]`. Nunca hilvana contenido real, así que el
  *qué* se re-verifica jamás se asevera. Sólo valida la *forma* del loop
  (5 visitas al verifier, 4 al revisit, 12 pasos).
- El test `(g)` usa un grafo sin loop contra el mock provider y sólo
  chequea la nota de retry de parseo + veredicto reject.

Ningún test hilvana contenido distinguible por el loop para comprobar
que la solución sobrevive.

### 4.6 Causa raíz y dirección de arreglo

Dataflow de **una sola ranura**. Verify-refine necesita expresar
"conserva el artefacto, ramifica sobre la crítica" — dos valores
distintos. Opciones (en orden de menor blast-radius):

1. **Slot de artefacto explícito.** Mantener el último output de
   *generator* como `currentArtifact`; el verifier lo lee; en la rama de
   re-verify se reenvía `currentArtifact` (no el veredicto); en la rama
   de corrección se reenvía `{artefacto + crítica}`.
2. **`carry` por edge.** Que cada `branches_on` declare qué reenvía:
   `verifier.input` (el artefacto) vs `verifier.output` (la crítica).
   Más expresivo; más superficie de spec.
3. **Threading de conversación.** Dar al dispatcher un historial de
   mensajes por workflow para que el prompt "as you remember it" sea
   verdadero. Mayor cambio; toca el dispatcher.

Sea cual sea, **agregar un test end-to-end con mock provider de
veredictos scripteados** que hilvane contenido distinguible (p.ej. la
"solución" lleva un token único) y asevere: (a) qué lee cada verifier en
cada vuelta, y (b) qué contiene `result.output` en accept. Eso fija la
regresión.

> Esto es v0 explícitamente mínimo, pero el verify-refine IMO es **la**
> demo de narrativa externa que la propia spec §8 declara como objetivo.
> Vale la pena arreglarlo antes de mostrarlo.

---

## 5. Otros hallazgos (menores)

### 5.1 🟡 `with-severity` exige `severity` incluso en `pass`, pero el prompt la presenta como opcional

`WithSeveritySchema` (`verifier-schemas.ts:33`) marca `severity` como
**requerida** (`z.enum(["minor","major"])`, no `.optional()`). Pero el
prompt del verifier IMO dice *"Severity (only meaningful for fail)"*. Un
modelo que omita `severity` en un `pass` produce parse-fail → retry →
**veredicto de fallback `fail`/`major`** (`executor.ts:380-387`). Eso
convierte un pase correcto en un fallo silencioso (y puede disparar la
rama de reject). Arreglo: o hacer `severity` opcional en el schema (y que
`severityEq` trate ausente como no-match), o exigir `severity` siempre y
sin ambigüedad en el prompt.

### 5.2 🟡 Sin chequeo estático de cobertura de ramas

La spec §3.2 dice que graph-load debería *"surface a CLI warning at
graph-load time when a verifier has incomplete branch coverage so this
is a hard error, not a silent stall."* El loader sólo valida ≥1 edge
`branches_on`; no valida exhaustividad. Por eso `no_matching_branch` se
descubre en runtime, no al cargar. Aceptable para v0 pero diverge de la
intención declarada de la spec. Un lint que recomiende una rama
catch-all cerraría el gap.

### 5.3 🔵 Drift spec ↔ ejemplo en el predicado de reject

- Spec §7: `since_last(verdict == "pass" || severity == "minor") >= 10`
- `graph.json`: `since_last(verdict == "pass") >= 10 && severity == "major"`

Semánticas distintas. La del ejemplo es defendible; la de la spec mete
un `|| severity == "minor"` dentro del `since_last` que es raro.
Reconciliar (actualizar la spec o anotar la diferencia).

### 5.4 🔵 `${INPUT}` documentado pero no implementado

`composePrompt` (`executor.ts:403`) siempre **anexa** `INPUT:\n<input>`;
el comentario menciona substitución de `${INPUT}` como "v1". Un autor que
escriba `${INPUT}` en su prompt obtendrá el token literal *más* el bloque
anexado. Documentar claramente que no está soportado aún.

### 5.5 🔵 Wikilinks colgantes `[[phase-e-close-status]]`

Los postscripts de `MILESTONE_REVIEW_2026-05-26.md` y
`NEXT_STEPS_SUMMARY.md` referencian `[[phase-e-close-status]]`, un
archivo que no existe en el repo. Higiene de docs: crearlo o quitar el
enlace.

### 5.6 🔵 El behaviour checker no evicta módulos (memoria)

`importIsolatedRaw` (`behavior-checker.ts:216`) hace cache-bust con
`?ts=...` para re-evaluar, pero las instancias viejas nunca se liberan
del registro del loader → crecimiento de memoria en un sweep grande. Ya
reconocido como concern de v1 (aislamiento de proceso). Inocuo para el
subset de ~20 nodos de v0.

---

## 6. Lo que está SÓLIDO (revisado hoy)

- **Predicate DSL** (`predicate-parser.ts`): tokenizer + descenso
  recursivo limpio, precedencia correcta (`>=` se consume dentro del
  atom de `since_last`/`step_count`), validación estática de campos
  contra el schema del verifier en load-time. Bien testeado.
- **Alineación de índices loader↔executor**: `edgePredicateKey(from,to,
  idx)` usa el mismo `idx` del array `outgoing` por nodo en ambos lados;
  no hay desalineación. ✓
- **Conteo de `current` en `consecutive`/`since_last`**: `history`
  excluye el visit actual y el evaluador hace `[...history, current]`;
  no hay doble conteo. ✓
- **Behaviour checker**: deep-equal estructural (Map/Set/array), doble
  `setup()` por aislamiento de side-effects, timeouts por caso e import,
  fixtures con shape validado, integración real en `verify` (no es
  código muerto). ✓
- **Higiene**: 0 NUL, 0 `.only`/`.skip`, `tsc` limpio.

---

## 7. Próximos pasos priorizados

| # | Acción | Esfuerzo | Bloqueador |
|---|---|---|---|
| 🥇 | **`git push`** los 5 commits locales (cierre ε + arranque ζ viven sólo en local) | 1 min | tu máquina (proxy me bloquea) |
| 🥈 | **Arreglar el dataflow del verify-refine** (§4): slot de artefacto o `carry` por edge; + test e2e con mock scripteado que asevere qué se re-verifica y el output de accept | ~3–5 h | ninguno |
| 🥉 | **Fix `severity` en `pass`** (§5.1): opcional en schema o requerida sin ambigüedad en prompt | ~30 min | ninguno |
| 4 | **Lint de cobertura de ramas** en graph-load (§5.2) — alinear con spec §3.2 | ~1 h | ninguno |
| 5 | **Actualizar `ROADMAP.md`** — dice "Phase ε mid-flight" / "Last refresh 2026-05-24"; ε ya cerró y ζ arrancó. Promover ε a bootstrap-history y abrir sección ζ | ~20 min | ninguno |
| 6 | **Phase ζ thread 2**: test de determinismo del verdict-map (§3.10 T2 → T1), aún pendiente, scope-parallel al runtime | ~2–4 h | ninguno |
| 7 | Reconciliar drift spec↔ejemplo (§5.3) + doc `${INPUT}` (§5.4) + wikilink colgante (§5.5) | ~30 min | ninguno |
| 🔵 | (opcional) Arm C-cloud devstral-24b (~$5–10) como refuerzo; ya no bloquea ε | ~4 h + $ | dinero + GPU |
| 🔵 | (opcional) Backfill de fixtures de comportamiento más allá de los 9 actuales para robustecer la 2ª columna de la matriz | variable | ninguno |

---

## 8. Riesgo y deuda

### 🔴 Nuevo
- **Dataflow del verify-refine v0 (§4)** — la demo estrella de ζ no
  preserva la solución. Bug de diseño + ejemplo que no cumple su README.
- **5 commits sin pushear (§1)** — riesgo de pérdida de trabajo.

### 🟡 Nuevo, menor
- `severity` requerida vs prompt ambiguo (§5.1).
- Sin cobertura de ramas estática (§5.2).

### 🟡 Heredada (sin cambios)
- Escrituras concurrentes multi-proceso sin lock (atómicas pero no
  cooperativas).
- BRANCH_MODEL.md Option-C recomendado, no user-confirmed.
- Walker v2 (panel de revisión de propuestas) no shippeado.
- Claims de `MATHEMATICAL_CLAIMS.md` en intuición, no tests (ledger
  tiered documentado).

### 🔵 Especulativo (sin bloqueo)
- Open-Prompt protocol, Wakeup Scanners, Prompt Generators, fan-out de
  workflows (v1), persistencia de workflows (v1).

---

## 9. Resumen ejecutivo

Desde el 05-26 aterrizaron 6 commits que **cerraron Phase ε** (behaviour
checker v0 → matriz 2/5 columnas; adjunto §3.10 T4 → T2; experimento
`verify-refine-math` ya trackeado) y **arrancaron Phase ζ** (workflow
runtime v0 + spec). HEAD `f365b66`, `tsc` limpio, 0 NUL, 0 `.only/.skip`,
364 fuentes / 144 tests. **Dos cosas pesan hoy:** (1) el branch local
está **5 commits adelante de `origin/main` sin pushear** — el trabajo de
cierre de ε y arranque de ζ vive sólo en local; haz `git push`; y (2) el
**verify-refine v0 — la demo estrella de ζ — pierde la solución**: el
executor reenvía el output verbatim del verifier (el veredicto) en todas
las ramas, así que el nodo `passThrough` re-verifica el JSON del
veredicto en vez de la solución, y el corrector nunca ve la solución (los
dispatches son stateless). Ningún test lo atrapa porque corren en dry-run
con veredictos enlatados. Fuera de eso, el código nuevo está bien
construido (DSL de predicados sólido, índices alineados, behaviour
checker bien integrado). Status: **avance fuerte de milestone; 1 bug de
diseño load-bearing en la demo de ζ; cero bugs nuevos en ε.**

---

## 10. Anotaciones técnicas verificadas hoy

1. **Sync** — `git status` → "ahead of origin/main by 5 commits";
   `git log origin/main..HEAD` lista los 5 (HEAD `f365b66`, base
   cacheada `dd641c7`).
2. **Build** — `npx tsc --noEmit` → exit 0, sin warnings.
3. **NUL** — bucle `tr -d -c '\000' < $f | wc -c` sobre los 364
   `.ts/.tsx` tracked → 0 en todos; `check-nul-bytes.sh --all` → exit 0.
4. **Higiene tests** — grep `\b(it|describe|test)\.(only|skip)\b` sobre
   144 `.test.ts` → 0 matches.
5. **Dataflow §4** — leído `executor.ts` (líneas 161, 237, 267, 394),
   `graph.json`, y `types.ts:35` (LlmRequest sin historial). El test
   `(c)` (`workflow-runtime.test.ts:429`) corre en `dryRun: true`.
6. **Behaviour checker** — `--behavior-check` registrado en `cli.ts:949`,
   invocado en `commands/verify/homeomorphism.ts:391`, 9 fixtures en
   `tests/behavior-fixtures/`.

---

*Generado por la tarea programada `ontology-pr-suggestions` el
2026-05-27. HEAD: `f365b66`. Sincronización local: **5 adelante / 0
atrás** (sin pushear). Verificación: lectura de código, `tsc`, escaneo de
bytes, grep de higiene, historial de commits. `git pull`, `npm` y
`vitest` no disponibles in-sandbox (allowlist del proxy + binding
rolldown arm64). Próxima revisión: tras el push y/o el arreglo del
dataflow del verify-refine.*
