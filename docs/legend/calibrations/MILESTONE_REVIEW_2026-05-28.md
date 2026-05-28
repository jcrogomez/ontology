# Revisión de Milestone — Ontology — 2026-05-28

> *Ejecución automática de la tarea programada `ontology-pr-suggestions`.
> Revisión posterior a la del 2026-05-27. **No aterrizaron commits
> nuevos en 24 h** — HEAD sigue en `f365b66` y la 05-27 quedó como
> archivo untracked. Status verificado mediante lectura de código,
> `tsc --noEmit`, `check-nul-bytes.sh --all`, grep de higiene de tests y
> `git log`. **`git pull` y acceso a GitHub bloqueados** por el
> allowlist del proxy del sandbox (`HTTP 403 from proxy after CONNECT`),
> idéntico a las revisiones de los últimos cinco días. `vitest` tampoco
> corre in-sandbox (binding nativo `rolldown` arm64-darwin, no
> linux-arm64). El usuario no estuvo presente: ejecución autónoma.*

---

## 0. ⚠️ Limitaciones del sandbox (sin cambios respecto a 05-27)

1. **`git pull` bloqueado** — `curl -I https://github.com` y
   `https://api.github.com` devuelven `X-Proxy-Error:
   blocked-by-allowlist`. No se pudo sincronizar contra `origin/main`,
   ni verificar PRs/issues remotos, ni saber si los 5 commits locales
   por fin se pushearon.
2. **`vitest` no corre** — falta `rolldown-binding.linux-arm64-gnu.node`
   (`node_modules` instalado en el Mac arm64-darwin del usuario). Build
   health se mide con `tsc --noEmit` (verde).
3. **Sin `.git/index.lock` hoy** (mejora respecto a 05-27).

---

## 1. 🔴 Estado inalterado: 5 commits locales SIN PUSHEAR (mismo set de 05-27)

`git status` sigue reportando 5 commits adelante de `origin/main`. Es el
**mismo** set que la 05-27 ya señaló como riesgo alto:

| HEAD local | `origin/main` (cacheado) |
|---|---|
| `f365b66` | `dd641c7` |

Commits sin pushear (sin cambio):

| Commit | Qué hizo |
|---|---|
| `f365b66` | feat(workflow): runtime v0 — máquina de estados, edges `branches_on` |
| `8735eba` | docs(legend): spec del workflow runtime v0 — Phase ζ |
| `4d306e5` | docs(legend): snapshot 2026-05-26 (start-of-day) |
| `5a62584` | feat(legend): behaviour-axis checker v0 — matriz 2/5 columnas |
| `7ebdb52` | docs(legend): cierre Phase ε — §3.10 T4 → T2 |

> **Acción 🥇 (alta, repetida):** `git push`. Llevamos 2 días con el
> cierre de ε y el arranque de ζ viviendo sólo en local. No pude
> pushear yo (proxy). Si el push ya ocurrió y el proxy del sandbox no lo
> ve, ignorar este punto.

---

## 2. 🟡 Hallazgo nuevo: 24 horas sin commits

Desde la 05-27 (HEAD `f365b66`, 2026-05-26) **no aterrizó nada**. El
único cambio en el árbol es la 05-27 misma, todavía **untracked**:

```
$ git status --porcelain
?? docs/legend/calibrations/MILESTONE_REVIEW_2026-05-27.md
```

Posibles lecturas (no pude distinguirlas desde el sandbox):
- Día de pausa (descanso, viaje, otra prioridad).
- Empezó el arreglo del verify-refine pero aún en working tree no
  committeado (no — `git status` está limpio salvo la review).
- El push y la jornada ocurrieron desde otra máquina/branch que el
  sandbox no ve.

Acción recomendada al volver: (a) `git push` los 5 + (b) `git add` y
commit de la 05-27 para no perder el snapshot, y para que la 05-28 de
hoy aterrice como continuación, no como rama suelta.

---

## 3. Estado verificado en HEAD `f365b66` (2026-05-28)

| Señal | Resultado | Δ vs. 05-27 | Verificación |
|---|---|---|---|
| **HEAD local** | `f365b66` | = | `git log -1` |
| **Sync con `origin/main`** | 5 adelante / 0 atrás (cacheado) | = | `git status` |
| **`tsc --noEmit`** | ✅ exit 0 (limpio) | = | corrido hoy |
| **Guard `check-nul-bytes.sh --all`** | ✅ exit 0 | = | corrido hoy |
| **Higiene de tests** | ✅ 0 `.only` / `.skip` | = | grep de 142 `.test.ts` |
| **Test files** | 142 | −2 | `find tests -name *.test.ts` |
| **Working tree** | 1 untracked (la 05-27) | misma idea | `git status` |

Nota sobre los “−2 tests”: el conteo de ayer (144) usaba `git ls-files`;
hoy usé `find` (que también ve tests untracked, normalmente más). La
baja sugiere que la 05-27 contó files que `find` excluye por
`.gitignore`. No es regresión real — el árbol fuente no cambió.

---

## 4. 🔴 Bugs de la 05-27 **siguen vivos** — sin parche

Verifiqué archivo por archivo que las cinco rojas/amarillas de ayer no
se tocaron. Cada referencia está corroborada hoy.

### 4.1 🔴 Dataflow verify-refine — `executor.ts:237` intacto

```
237: currentInput = visit.output;   // ← output verbatim del verifier (texto del veredicto)
267: currentInput = visit.output;   // ← idem tras generator
```

Sin slot de artefacto, sin `carry` por edge, sin historial de
conversación en `LlmRequest`. La demo IMO de Phase ζ sigue
re-verificando el JSON del veredicto y el corrector sigue ciego a la
solución. Los tests siguen en dry-run con veredictos enlatados — nada
hilvana contenido distinguible.

**Sigue siendo el ítem 🥈 de mayor valor.**

### 4.2 🟡 `severity` requerida — `verifier-schemas.ts:35` intacto

```ts
export const WithSeveritySchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  severity: z.enum(["minor", "major"]),   // ← required
  issues: z.array(z.string()),
});
```

El prompt del verifier IMO en `graph.json` sigue diciendo *“Severity
(only meaningful for fail)”*. Sigue habiendo riesgo de fallback
silencioso `fail/major` si el modelo omite `severity` en un `pass`.

### 4.3 🔵 Drift spec ↔ ejemplo en el predicado de reject — sin cambio

- `WORKFLOW_RUNTIME_SPEC.md:302`: `since_last(verdict == "pass" || severity == "minor") >= 10`
- `examples/.../graph.json`: `since_last(verdict == "pass") >= 10 && severity == "major"`

Semánticas distintas; sin reconciliar.

### 4.4 🔵 Wikilink colgante `[[phase-e-close-status]]` — sin cambio

Aún aparece en:
- `docs/legend/calibrations/MILESTONE_REVIEW_2026-05-26.md:10`
- `docs/legend/calibrations/NEXT_STEPS_SUMMARY.md:11`
- `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md:457`
- `docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md:214`

(La 05-27 lo señala correctamente en §5.5.)

### 4.5 🔵 ROADMAP desincronizado — sin cambio

`docs/ROADMAP.md:89`:
> *Last refresh: 2026-05-24 (late). Phase ε is mid-flight; … Arm C is
> the remaining gate for a clean ε close …*

Pero ε cerró el 26 (§3.10 T4 → T2 en `7ebdb52`) y ζ arrancó. El ROADMAP
sigue declarando ε como mid-flight y Arm C como gate. Es la deuda doc
más visible.

### 4.6 🔵 Behaviour checker — sin evicción de módulos

`behavior-checker.ts:216` sigue haciendo cache-bust con `?ts=` y nunca
libera instancias viejas. Aceptable para v0 (~20 nodos); a vigilar en
v1.

---

## 5. Salud del código — sólido

- `tsc --noEmit` → exit 0, sin warnings.
- `bash scripts/check-nul-bytes.sh --all` → exit 0.
- 0 `.only` / `.skip` en 142 `.test.ts`.
- Sin cambios en working tree salvo la review untracked.
- Sin `.git/index.lock` colgado (mejora respecto a 05-27).

El código nuevo de ζ (predicate DSL, alineación de índices
loader↔executor, conteo de `current` en `consecutive`/`since_last`,
behaviour checker integrado en `verify`) sigue en pie según la
auditoría de la 05-27.

---

## 6. Próximos pasos priorizados (orden de la 05-27, sin progreso → mismo orden hoy)

| # | Acción | Esfuerzo | Bloqueador | Estado |
|---|---|---|---|---|
| 🥇 | **`git push`** los 5 commits locales + commit/push de la 05-27 y de esta 05-28 | 2 min | tu máquina (proxy me bloquea) | **abierto, 2º día** |
| 🥈 | **Arreglar el dataflow del verify-refine** (§4.1): slot de artefacto o `carry` por edge; + test e2e con mock scripteado | 3–5 h | ninguno | abierto |
| 🥉 | **Fix `severity` en `pass`** (§4.2): opcional en schema **o** requerida sin ambigüedad en prompt + retry con guidance | 30 min | ninguno | abierto |
| 4 | **Lint de cobertura de ramas** en graph-load — alinear con spec §3.2 | 1 h | ninguno | abierto |
| 5 | **Refrescar `ROADMAP.md`** — promover ε a bootstrap-history, abrir sección ζ con runtime v0 + behaviour checker | 20 min | ninguno | abierto |
| 6 | **Phase ζ thread 2**: test de determinismo del verdict-map (§3.10 T2 → T1) | 2–4 h | ninguno | abierto |
| 7 | Reconciliar drift spec↔ejemplo (§4.3) + doc `${INPUT}` + wikilink colgante (§4.4) | 30 min | ninguno | abierto |
| 🔵 | (opcional) Arm C-cloud devstral-24b (~$5–10) como refuerzo | 4 h + $ | dinero + GPU | parqueado |
| 🔵 | (opcional) Backfill de fixtures de comportamiento (>9) | variable | ninguno | parqueado |

> Si vas a tocar **una sola cosa** al volver, hazla 🥇 (5 min) +
> empieza 🥈 (la demo de ζ que tu propio README enmarca como
> motivación). 🥉, 4, 5 y 7 son todos sub-hora y limpian deuda
> visible.

---

## 7. Riesgo y deuda

### 🔴 Persistente desde 05-27
- **Dataflow del verify-refine v0 (§4.1)** — sin parche.
- **5 commits sin pushear (§1)** — **2.º día**; el riesgo de pérdida
  se acumula.

### 🟡 Persistente, menor
- `severity` requerida vs prompt ambiguo (§4.2).
- Sin cobertura de ramas estática (graph-load no exhaustivo).
- Drift `ROADMAP.md` vs estado real (§4.5).

### 🟡 Heredada
- Escrituras concurrentes multi-proceso sin lock cooperativo.
- BRANCH_MODEL.md Option-C no user-confirmed.
- Walker v2 no shippeado.
- Claims de `MATHEMATICAL_CLAIMS.md` en intuición, no tests.

### 🔵 Especulativo
- Open-Prompt, Wakeup Scanners, Prompt Generators, fan-out de
  workflows (v1), persistencia (v1).

---

## 8. Sugerencias de diseño (foco hoy: ζ runtime v1)

Tres ejes de mejora para cuando el 🥈 se resuelva y haya espacio para
diseñar:

1. **Slot de artefacto explícito en el state.** Hoy el ejecutor lleva
   `currentInput: string`. Una sola variable obliga a que el verifier
   sobreescriba el input. Cambio mínimo: añadir `currentArtifact:
   string | null` (último output de **generator**). El verifier lee
   `currentArtifact`; en la rama pass se reenvía `currentArtifact`; en
   la rama fail se reenvía `{artefacto, crítica}` serializado. Cero
   cambios al loader; cambio chico en `composePrompt`.

2. **Cobertura estática de ramas.** En `graph-loader.ts`, además de
   exigir ≥1 `branches_on`, computar el universo de veredictos del
   schema declarado (cartesiano `verdict × severity` cuando aplique) y
   emitir warning si el conjunto de predicados no cubre algún punto. Es
   básicamente recorrer el AST y proyectar sobre `{pass, fail} × {minor,
   major}`. Reduce `no_matching_branch` en runtime a hard error en
   load-time, como la spec §3.2 ya promete.

3. **Determinismo del verdict-map (§3.10 T2 → T1).** El thread 2 de ζ.
   Independiente del runtime, scope-parallel; conviene arrancarlo en
   paralelo al fix del dataflow para no serializar.

Riesgos a evitar:
- **No** introducir todavía un dispatcher con historial de mensajes.
  Toca demasiado y duplica state. El slot de artefacto es estrictamente
  más pequeño y más fácil de revertir.
- **No** promover el behaviour checker a aislamiento de proceso aún;
  ~20 nodos no justifican esa complejidad.

---

## 9. Resumen ejecutivo

24 horas sin commits. HEAD sigue en `f365b66`, branch sigue **5 commits
adelante de `origin/main`** sin pushear (mismos commits que la 05-27 ya
flageó). El único cambio en el árbol es la 05-27 misma, **untracked**.
El código que existe sigue sólido (`tsc` limpio, 0 NUL, 0 `.only/.skip`)
pero los **dos hallazgos rojos de ayer no han sido atacados**: (1) el
push pendiente lleva ahora ≥2 días de exposure, y (2) el bug de
dataflow del verify-refine en `executor.ts:237` está intacto, así que la
demo motora de ζ sigue rota. Los 5 menores (severity required, drift
spec, ROADMAP stale, wikilink colgante, behaviour checker memory)
también persisten. **Acción mínima al volver:** `git push` + commit de
las dos reviews pendientes (5 min). **Acción de mayor valor:**
introducir un slot de artefacto en el executor + test e2e con
veredictos scripteados (3–5 h). Status: **milestone congelado un día;
salud de build intacta; deuda visible acumulándose despacio.**

---

## 10. Anotaciones técnicas verificadas hoy

1. **Sync** — `git status` → "ahead of origin/main by 5 commits";
   `git log -1` → `f365b66 2026-05-26`. `curl -I https://github.com` →
   403 `blocked-by-allowlist`.
2. **Build** — `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
3. **NUL** — `bash scripts/check-nul-bytes.sh --all` → exit 0.
4. **Higiene tests** — grep de `.only|.skip` sobre `tests/**/*.test.ts`
   → 0 matches; 142 archivos.
5. **Dataflow §4.1** — releí `src/runtime/workflow/executor.ts` líneas
   140–270 y 220–270. `currentInput = visit.output;` sigue en 237 (post-
   verifier) y 267 (post-generator). `WithSeveritySchema` en
   `verifier-schemas.ts:33-37` sigue con `severity` requerida.
6. **Drift §4.3** — `WORKFLOW_RUNTIME_SPEC.md:302` vs
   `examples/workflow-imo-verify-refine/graph.json` (predicado de
   reject) sigue divergente.
7. **Wikilink §4.4** — `grep -rn phase-e-close-status docs/` retorna 4
   matches en 4 archivos, todos vivos. El archivo `phase-e-close-status.md`
   no existe.

---

*Generado por la tarea programada `ontology-pr-suggestions` el
2026-05-28. HEAD: `f365b66` (mismo que 05-27). Sincronización local:
**5 adelante / 0 atrás** (sin pushear; 2.º día). Verificación: lectura
de código, `tsc`, escaneo de bytes, grep de higiene, historial de
commits. `git pull`, `npm` y `vitest` no disponibles in-sandbox.
Próxima revisión: tras el push y/o el arreglo del dataflow del
verify-refine. Si no hay cambios mañana, considerar reducir la
frecuencia de la tarea programada a cada 2 días hasta que haya
movimiento.*
