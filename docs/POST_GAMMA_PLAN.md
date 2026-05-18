# Post-γ plan — δ, ε, ζ y Hardening

> *La luz que hace visible el código oscuro: convertir los streams pendientes
> en microtareas con importancia, dependencias y cotas verificables.*

Estado actual (2026-05-13): Phase γ + γ-7 + Phase δ completos en `main`.
δ-1 (Inspector / Lupa, `8779acc`), δ-2 (`verify-homeomorphism`,
`29b330c`), γ-7 prompt invariants (`2e8853e`), 5 tooling-gap fixes
(`6ea7e94`), 5 reviewer fixes (`b035ce7`), cross-provider per-task
routing (`f80163d`) — todos shipped. BRANCH_MODEL.md Option C
confirmado (2026-05-13). Lo que sigue son tres streams: **ε**
(self-ingestion sobre el repo de Ontology, gated por API credit),
**ζ** (release + semillas Open-Prompt) y **Hardening** (advisory lock
+ Walker v2). Las secciones §1 (δ-1) y §2 (δ-2) abajo se preservan
como referencia histórica de la planificación original; las casillas
con tooling y documentación que prometían `docs/INSPECTOR.md` o
`docs/VERIFICATION.md` se materializaron como secciones inline en
[`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) §3 y §6 respectivamente.

> **Alcance de este documento.** Cubre los streams entre Phase γ y
> Phase ζ. Las dos chapters que vienen *después* de ζ —
> [`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md) (system-initiated
> proposals) y [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md)
> (content-addressed templates, prerrequisito de scanners LLM) —
> viven en sus propios RFCs. Sus roadmaps no se duplican aquí.

---

## 0. Grafo de dependencias y orden recomendado

```
                BRANCH_MODEL.md  ──┐                             (independiente)
                                    │
Advisory lock  ─────────────────────┤                            (independiente)
                                    │
                δ-1 (inspect) ──┐   │
                                ├──► ε (self-ingestion) ───► ζ (release)
                δ-2 (verify) ───┘
                                    │
Walker v2 ──────────────────────────┘                            (paraleliza con todo)
```

Reglas:

- δ-1 y δ-2 son ortogonales — pueden ir en ramas siblings simultáneas.
- ε **requiere** δ-1 y δ-2 mergeados a `main` (su loop manual es lo que δ-2 automatiza, y la lectura humana del network ingerido depende de la lupa de δ-1).
- ζ no merece tagearse hasta tener los datos de ε (el release note presume el ε medido en §3.10).
- Hardening corre en paralelo: cero acoplamiento con el Legend journey.

**Orden recomendado para minimizar churn:**

1. BRANCH_MODEL.md (30 min, desbloquea Bootstrap 0.10).
2. Advisory lock (independiente, baja-fricción, blinda δ-2 que escribirá a `--target`).
3. δ-1 + δ-2 en paralelo (siblings, similar a β-1/β-2/β-3).
4. ε (n=N sobre el propio repo).
5. Walker v2 (puede arrancar en paralelo con ε si la mano lo permite).
6. ζ (release + Open-Prompt seeds).

**Presupuesto agregado:** ~30–45 h dev + ~$30–50 de Anthropic Opus 4.7 para ε.

---

## 1. Stream δ-1 — `onto node inspect` (Inspector / Lupa)

**Por qué importa:** sin la lupa, una red de 200 nodos no es más legible
que 200 archivos; es solo otra superficie opaca. El translator cacheado
hace que la compresión rinda: una llamada al LLM por nodo *de por vida*
amortiza el costo de leer la red sobre todas las inspecciones futuras.

**Posición categorial:** segunda transformación natural del pipeline
Legend, `τ : Intent ⇒ Prose`. Acompaña a `F` (compile) y `G` (ingest).
El triángulo `τ ≈ σ ∘ F` (PROJECT_LEGEND.md §3.4) es lo que hace
falsable la afirmación de que la prosa derivada del intent es más
estable que la prosa derivada del código.

### Microtareas

| # | Tarea | LoC | Constraint |
|---|---|---:|---|
| 1.1 | Extender schema: `node.translator?: { summary, providesRoles, edgeRoles, model, runId, generatedAt, sourceHash }` con Zod. Migración de schema (no rompe nodos viejos). | ~30 | `sourceHash` debe ligarse al hash del nodo en el momento de inspeccionar — sirve para invalidación. |
| 1.2 | Template de extracción `inspect.template.md` con sistema XML `<node>…</node>`, salida JSON estricta validable por Zod. | ~20 | Cacheable: prompt > 4096 tokens (cumple mínimo de Opus 4.7) para hit en re-runs. |
| 1.3 | Nuevo evento `node_inspected` en `events.schema.ts` con `previousEventId` chain. | ~10 | Idempotente: re-emit solo si `--no-cache` o cache invalidada. |
| 1.4 | Comando `onto node inspect <id>` — dispatch vía Anthropic adapter, persiste `runId`, escribe `translator`, emite evento. Flags `--no-cache`, `--with-neighbors`, `--json`, `--provider`, `--model`. | ~80 | Una llamada al LLM por nodo por *cambio de hash*. Si `--with-neighbors`, no incrementa el costo cacheable (los neighbors caen en el contexto, no en otra llamada). |
| 1.5 | Invalidación de cache en `node_updated`: si `prompt.raw` / `requires` / `provides` / `forbids` cambian, marcar `translator.staleSince = eventId`. **No borrar** — la prosa stale sigue siendo útil con un warning. | ~25 | Stale ≠ ausente. La UX del walker debe mostrar `(stale, run :inspect to refresh)` no `(missing)`. |
| 1.6 | Walker action `:inspect` + keybinding `i`. Panel inline bajo la focal cell. | ~40 | Render no debe bloquear el TUI durante la dispatch — reutilizar el patrón async de `:run` (PR #100). |
| 1.7 | Tests: unit (Zod schema), integration (CLI mock provider), e2e (cache hit/miss, stale invalidation, `--with-neighbors` enriquece el prompt y no la cuenta de calls). | ~150 líneas test | Cobertura ≥ las que tenía γ-1 (`onto ingest <file>`). |
| 1.8 | Docs: `docs/INSPECTOR.md` (companion) + update `PROJECT_LEGEND.md` §3 (`status: shipped`). | — | — |

**Total estimado:** ~205 LoC src + ~150 líneas test. ~6 h.

**Stop conditions:**

- Si el modelo no produce JSON parseable por Zod en 3 reintentos, fallar con `extraction_malformed` (no inventar prosa).
- Si `node.translator` existe y el hash del nodo no cambió, **nunca** llamar al LLM (rompe la invariante "una llamada por lifetime").

**Tests verificables:**

- `inspect twice → 1 LLM call` (cache hit).
- `inspect → node update → inspect → 2 LLM calls` (invalidación por hash).
- `inspect --no-cache → 2 LLM calls` independientemente del cache.

---

## 2. Stream δ-2 — `onto verify-homeomorphism`

**Por qué importa:** automatiza el loop manual del paso §6 de
`VIBE_REASONING_PROCEDURE.md`. Sin esto, cada Phase ε hay que correrlo
con un shell script de 30 líneas y eyeball'd diffs. El comando es
también la única forma honesta de reportar el ε medido en `§3.10` del
ledger de claims.

**Posición categorial:** función de distancia `d : C × C → ℝ` que mide
el desvío del round-trip `F ∘ G` respecto a `id_C`. Lo que define a un
*intent-faithful subcategory* es exactamente `{c ∈ C : d(c, F(G(c))) <
ε}`. Por la observación del γ-2 (`hash.ts` falla LoC pero pasa
semántica), el reporte debe contener **dos** distancias.

### Microtareas

| # | Tarea | LoC | Constraint |
|---|---|---:|---|
| 2.1 | Tipo `VerifyVerdict = "ε-equivalent" \| "divergent" \| "unrecoverable"`. Tipo `VerifyReport` (nodeId, file, locDistance, behaviourDistance, verdict, deltas, sample). | ~30 | Sin LLM en este módulo — pura aritmética + diff. |
| 2.2 | `locDistance(orig, regen) ∈ [0,1]` — unified-diff sobre líneas, normalizado por `max(|orig|, |regen|)`. Función pura, exportada. | ~40 | Determinístico. Tests pinned sobre fixtures sintéticos. |
| 2.3 | `behaviourDistance(orig, regen, lang)` — AST-shape distance via Tree-sitter (TS + Python). Fallback a `locDistance` cuando el parser falla. | ~80 | Cost-aware: parseo local, sin LLM. Si el parser no soporta el lang, devolver `undefined` y reportar `behaviourDistance: "skipped"`. |
| 2.4 | `onto verify-homeomorphism <nodeId>` — un solo nodo. Reutiliza `compileNode` con `--target` apuntando a sandbox `.ontology/verify/<runId>/`. Diff vs `outputs.files[0]`. Emite `homeomorphism_verified`. | ~60 | **No** sobreescribe la fuente real por default. `--apply` es el flag explícito que escribe a la ruta real. |
| 2.5 | `onto verify-homeomorphism --all` / `--batch` — itera artifact nodes. Reusa `runCompilePlan` y el cache de runs para amortizar el upstream walk (mismo pattern que β-1 run-batch). | ~50 | Política de fallo: continúa pasados los errores, agrega al reporte. Exit code 1 solo si todos fallaron, igual que β-1. |
| 2.6 | Flags `--epsilon 0.3 --tau 0.7 --report <path.md> --json --provider --model`. | ~20 | Defaults por PROJECT_LEGEND.md §2.5 (ε=0.3, τ=0.7). Reportar los valores usados en el header del reporte. |
| 2.7 | Generador de reporte markdown (`--report`): formato análogo a `HASH_TS_2026-05-12.md`. Headers, tabla por-nodo, sección "intent-resistant complement". | ~60 | El reporte es el deliverable publicable — debe ser legible sin abrir el JSON. |
| 2.8 | Tests: distancia LoC pinned, distancia AST pinned sobre 6 fixtures (TS idéntico, TS con docstring delta, TS con cambio semántico, Python misma cosa), comando integration con mock provider, batch sobre 3-nodo plan compartido. | ~220 líneas test | — |
| 2.9 | Docs: `docs/VERIFICATION.md` + update `PROJECT_LEGEND.md` §6 Layer 6 a `shipped` + paragraph en §2.5 referenciando que ahora hay implementación. | — | — |

**Total estimado:** ~340 LoC src + ~220 líneas test. ~8 h.

**Constraints duras:**

- **No mutate working tree by default.** El daño potencial es alto si δ-2 escribe artifacts sobre fuentes reales sin opt-in. Sandbox en `.ontology/verify/<runId>/` es el default; `--apply` se documenta como "do not pass me unless your tree is committed".
- **Cost-aware:** un `--all` corre 1 LLM call por artifact node. Para Ontology (~90 archivos) son ~$7 por pasada. El reporte debe llevar el `tokensUsed` y `costUSD` por nodo para que el usuario pueda decidir si re-ejecutar la subset divergente con un modelo más barato.
- **Reuso, no parallel path:** `verify-homeomorphism` orquesta `runCompilePlan`. No reimplementar.

---

## 3. Stream ε — self-ingestion sobre Ontology

**Por qué importa:** sube `§3.10` del ledger de claims de **T4
(retórico)** a **T2 (medido sobre n=N)**. Con δ-1+δ-2 mergeados, hay
una forma operativa de defender la afirmación de adjunción
`F ⊣ G ≈ id_C` con un número y una caracterización del complemento
intent-resistente.

### Microtareas

| # | Tarea | Duración | Constraint |
|---|---|---:|---|
| 3.1 | Definir perímetro: ingerir `src/runtime/` + `src/commands/` + `src/schemas/`. Excluir `node_modules/`, `dist/`, `.claude/worktrees/`, `tests/`. Conteo de archivos previo: ~90 con `--include ts`. | 15 min | El perímetro debe ser estable y reproducible. Documentarlo en el reporte. |
| 3.2 | Workspace separado: `mkdir /tmp/onto-self-calibration && cd … && onto init`. **Nunca** dentro del propio `.ontology/`. | 5 min | Idempotencia: el experimento se puede redo sin contaminar el repo. |
| 3.3 | Pass 0 — dry-run con `onto ingest --dry-run --json` para verificar conteo de archivos, costo estimado, y que la plantilla de extracción no choke sobre el código de Ontology. | 30 min | Si el dry-run reporta >$15 estimado, escalar al usuario antes de pagar la pasada full. |
| 3.4 | Pass 1 — ingest full con Anthropic Opus 4.7: `onto ingest /Users/.../ontology/src --include ts --provider anthropic --json > ingest.json`. Estimado: ~$7. | 5–10 min wall-clock | Persistir el JSON completo: contiene los tokens por archivo y el material para el reporte. |
| 3.5 | Apply de proposals — loop sobre todas las pending. Inspector idempotente: si un proposal viene stale por hash drift (improbable en el mismo workspace), reportarlo. | 5 min | Verificar `ls .ontology/nodes/ | wc -l` = `canon + 90`. |
| 3.6 | γ-6 — `onto graph infer-edges /Users/.../ontology/src --create-proposals`. Apply de edges. Cuántos `depends_on` se infieren cuenta como dato del reporte. | 10 min | Idempotente; las clasificaciones de skip (`from_node_missing` etc.) son parte del reporte. |
| 3.7 | Pass 2 — Inspector sobre toda la red: loop `onto node inspect <id>` por cada nodo. Estimado: ~$7 adicionales si Opus, ~$1 si Haiku. | ~15 min wall-clock | Esta es la prueba operacional de δ-1 a escala. Si más del 5% falla extraction_malformed, parar e iterar el template. |
| 3.8 | Pass 3 — `onto verify-homeomorphism --all --report docs/legend/calibrations/SELF_INGEST_2026-MM-DD.md`. Estimado: ~$7 (compile-back) o más si se acepta la sugerencia del γ-2 de medir behaviour-aware con un compile real. | ~15 min wall-clock | El reporte es el deliverable. Cuenta de ε-equivalent / divergent / unrecoverable por categoría. |
| 3.9 | Lectura humana en el walker — usar el inspector para navegar la red. Esta es la **falsabilidad** del compression-meets-legibility: si la red es ilegible aun con translator, δ-1 falla su propósito y hay que rediseñar `τ`. | 1–2 h | Anotar cuáles nodos quedaron opacos. Esto retroalimenta la plantilla de Inspector. |
| 3.10 | Iteración sobre la subset divergente: para cada nodo `unrecoverable`, decidir entre (a) `node.literal` (irreducible specificity), (b) refactor del intent para hacerlo extractable, (c) classify y aceptar el complemento intent-resistente. | 2–3 h | Esta es la decisión más cara del Phase ε — define la frontera de la categoría faithful. |
| 3.11 | Reporte: `docs/legend/calibrations/SELF_INGEST_<date>.md`. Estructura por PROJECT_LEGEND.md §7. | 1 h | Debe nombrar el ε medido y caracterizar el complemento por *categorías de archivo* (algorítmicos / schemas / UI / stateful). |
| 3.12 | Update `MATHEMATICAL_CLAIMS.md` §3.10: T4 → T2 con cita al reporte. | 15 min | El claim ahora dice "operationally measured on n=90, ε=…, intent-faithful fraction =…". |

**Estimado total:** ~6–10 h human + ~$15–30 de Anthropic.

**Pre-requisito duro:** δ-1 + δ-2 mergeados a `main`.

**Risk:** Phase ε puede surface design flaws en Ontology mismo. Esto es
*esperado* (PROJECT_LEGEND.md §8.5) — el output es un feedback loop, no
una falla del experimento.

---

## 4. Stream ζ — release + Open-Prompt seeds

**Por qué importa:** empaquetado. Sin ζ, ε queda como un calibration
file más; con ζ, hay un release tagged y una semilla del protocolo
Open-Prompt que abre la puerta a la siguiente conversación
(transparencia-de-trust regulatoria, §4 de PROJECT_LEGEND.md).

### Microtareas

| # | Tarea | LoC | Constraint |
|---|---|---:|---|
| 4.1 | `docs/LEGEND.md` — release note end-to-end desde γ-0 hasta ε, con el ε medido del reporte de §3.11. | — | Citar commits y reportes. Es el doc que un lector externo lee primero. |
| 4.2 | `docs/OPEN_PROMPT.md` — esqueleto del protocolo. Toma §4 de PROJECT_LEGEND.md y lo formaliza: shape del `signed-artefact`, chain de eventos, los tres primitivos. **Spec only**, no implementation. | — | El doc es el contrato; los comandos vienen después. |
| 4.3 | `onto sign <branch>` (experimental, gated por `--experimental`) — Merkle root sobre `node.hash` + `events.jsonl` hash chain. SHA-256 vía `node:crypto`. **No firmas reales en v1**, solo el Merkle. | ~80 | Output JSON con root + per-node leaves + chain head. La firma criptográfica real es follow-up post-ζ. |
| 4.4 | `onto verify-published <signed-artefact>` (experimental) — re-walk del chain y validar el Merkle. | ~60 | Reusa los hashes existentes; no recomputa. |
| 4.5 | `onto replay --against <intent-artefact>` (experimental) — toma un output stream y lo pasa por `validateIntent` contra `N_O`. | ~120 | Reusa el validator; el comando es un wrapper. |
| 4.6 | Tag `0.4.0`. Update `RELEASE_NOTES.md` + `CHANGELOG.md`. Update `README.md` con un walkthrough de `onto ingest`. | — | — |
| 4.7 | Opcional: `examples/hello-ingest/` análogo a `examples/hello-world/`. Un archivo TS pequeño que el lector puede ingerir y verificar el round-trip en <5 min. | ~40 | UX hook para nuevos lectores. |

**Estimado:** ~3–5 h.

**Constraints:**

- **No crypto real en ζ.** El Merkle es honesto; la firma con clave privada se desbordina a un follow-up (necesita decision sobre key management — out of scope).
- **No release hasta tener el reporte de ε.** El release note presume el dato.

---

## 5. Stream Hardening (independiente del Legend journey)

### 5.1 Advisory lock bajo `.ontology/.lock`

| # | Tarea | LoC | Constraint |
|---|---|---:|---|
| 5.1.1 | Helper puro `acquireLock(repoRoot, opts): Effect<Lock, LockError>`. Implementación: `proper-lockfile` o hand-rolled vía `fs.openSync(O_CREAT \| O_EXCL)` + cleanup hook. | ~50 | Stale-lock detection: si el PID escrito está muerto, take the lock. |
| 5.1.2 | Wrap de cada entry point que escribe: `writeJson`, `writeArtifact`, `appendEvent`, todos los CLI commands mutativos. | ~30 | El lock es per-process, no per-comando — usa un context wrap en el dispatcher de comandos. |
| 5.1.3 | Flag `--no-lock` para tests / debug. | ~5 | — |
| 5.1.4 | Tests: dos invocaciones concurrentes serializan; SIGKILL entre cooperators no deja lock permanente. | ~80 líneas test | — |

**Total:** ~85 LoC + ~80 líneas test. ~3 h.

**Por qué urgente-ish:** δ-2 va a escribir a `--target` paths reales con
`--apply`. Sin lock, dos `verify-homeomorphism --all --apply` concurrentes
pueden corromper la fuente. Mejor blindar antes.

### 5.2 Walker v2

Aspiración: cuatro paneles rotables (plano / tiempo / branch /
manifestation), pane de revisión de proposals, time scrubber. Es un
proyecto en sí mismo, mejor partirlo en PR-sized chunks:

| # | Tarea | LoC est. |
|---|---|---:|
| 5.2.1 | Proposal review pane: list pending, show diff, accept/reject/dry-run desde el TUI. | ~150 |
| 5.2.2 | Plane rotation: ciclar entre `coordinates.abstraction` / `temporal` / `branch` / `manifestation` con tecla `r`. | ~120 |
| 5.2.3 | Time scrubber: render past states replaying `events.jsonl` hasta un eventId elegido. | ~100 |
| 5.2.4 | Branch picker overlay con `:branch switch`. | ~60 |
| 5.2.5 | Snapshot tests por panel. | ~150 líneas test |

**Total:** ~430 LoC + ~150 test. ~10 h. **Puede paralelizarse con ε** —
es UX pura, no toca el core.

### 5.3 BRANCH_MODEL.md (Option A/B/C)

| # | Tarea | Duración |
|---|---|---:|
| 5.3.1 | Confirmar Option C (lazy materialisation) con el usuario en una conversación de dos frases. | 5 min |
| 5.3.2 | Update `BRANCH_MODEL.md` con la confirmación + actualizar `RELEASE_NOTES.md` listando los storylines de Bootstrap 0.10 ahora unblocked. | 20 min |
| 5.3.3 | Apertura de follow-up: `onto branch lift` (depende de la decisión, no se implementa en este stream). | — |

**Total:** ~30 min. **Hacer primero** — es el item más barato del backlog
y desbloquea Bootstrap 0.10 entero.

---

## 6. Constraints transversales

- **Sandbox de tests no corre vitest.** El `@rolldown/binding-*` en
  `node_modules/` es `darwin-arm64` y el sandbox es `linux aarch64`.
  Cada feature branch necesita `npm test` corrido localmente antes de
  merge. Esto vale para δ-1, δ-2, hardening y Walker v2.

- **GitHub proxy bloqueado.** `git pull` local es la fuente de verdad
  antes de cada planning loop. Recordatorio antes de iniciar cada
  stream.

- **Quality gates por feature branch:**
  - `tsc --noEmit` clean.
  - Test file target verde.
  - Full vitest suite verde.
  - Linter clean.
  Ninguno es opcional. Pattern establecido por β-1/β-2/β-3.

- **Tres siblings en `compile-node.ts` causaron conflicts en β.** Si
  δ-1 y δ-2 van en siblings, ambos van a tocar `compile-node.ts` mínimo
  por shared types. Merge order recomendado: **δ-1 primero** (toca
  `node-schema.ts` + nuevo `commands/node/inspect.ts`, contained), **δ-2
  después** (toca `compile-node.ts` por reuso del run-batch). Rebase de
  δ-2 sobre δ-1 será trivial.

- **Costo agregado de Anthropic.** Budget aproximado:
  - δ-1 dev (mock provider en test): $0.
  - δ-2 dev (mock): $0.
  - ε self-ingestion: ~$15–30.
  - ζ release: ~$0 (no LLM en el release flow).
  - **Total ε + buffer: $30–50.** Conservador, no requiere aprobación adicional si está dentro del presupuesto operativo del proyecto.

- **Cache invalidation es la fuente de bugs sutiles.** Tanto δ-1
  (`translator` cache) como las runs persistidas (β-2 literal,
  `compile run` cache hits) tienen mecanismos de invalidación por hash.
  Cualquier nuevo evento que mutate el nodo (`node_update`,
  `node_remove`) debe propagar la invalidación. Hacer un audit explícito
  durante δ-1.

---

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Inspector produce JSON malformado en >5% de los nodos | Media | Alta (ε bloqueado) | Schema strict + retry 3x + fallback a "manual translator" prompt. |
| `verify-homeomorphism --apply` sobrescribe trabajo del usuario | Baja | Crítica | Default sandbox + `--apply` opt-in + advisory lock + warning explícito en docs. |
| Self-ingestion surface flaws en Ontology mismo | Alta | Media (feature, no bug) | Esperado. Documentar en el reporte, no parchar reactivamente. |
| Walker v2 absorbe tiempo de ε | Media | Media | No empezar v2 hasta que ε esté en `main`. |
| ζ se publica sin firma criptográfica real | Cierta | Bajo (es la spec) | OPEN_PROMPT.md deja claro qué es seed vs. v1.0. |
| Costo Anthropic >$50 en ε | Baja | Baja | Dry-run obligatorio antes de full sweep. Escalar al usuario si excede. |
| BRANCH_MODEL.md sigue sin confirmar | Cierta | Bajo (no bloquea estos streams) | Hacerlo primero — 5 min. |

---

## 8. Resumen ejecutivo

| Stream | Pre-req | LoC src | LoC test | h dev | Cost LLM | Prioridad |
|---|---|---:|---:|---:|---:|---|
| BRANCH_MODEL.md confirm | — | 0 | 0 | 0.5 | $0 | **P0 ahora** |
| Advisory lock | — | ~85 | ~80 | 3 | $0 | **P1 ahora** |
| δ-1 inspect | — | ~205 | ~150 | 6 | $0 | **P1 next sprint** |
| δ-2 verify-homeomorphism | — | ~340 | ~220 | 8 | $0 | **P1 next sprint** |
| ε self-ingestion | δ-1, δ-2 | 0 | 0 | 6–10 | $15–30 | **P2 después de δ** |
| Walker v2 | — | ~430 | ~150 | 10 | $0 | **P2 paralelo a ε** |
| ζ release + Open-Prompt | ε | ~260 | ~100 | 3–5 | $0 | **P3 cierre** |
| **Totales** | | **~1320** | **~700** | **~36–42 h** | **$15–30** | |

---

*Documento creado 2026-05-12 tras el cierre de Phase γ (commit
`bc350ce`). Refresco esperado cuando δ-1 / δ-2 lleguen a `main` o
cuando el costo estimado de ε se revise tras una pasada Ollama de
sanity-check. Vive junto a [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) y
[`ROADMAP.md`](ROADMAP.md); reemplaza la sección "Open follow-ups" del
roadmap cuando cada stream termine — al merge, mover el item al
"Bootstrap history" del ROADMAP.*
