# Revisión de Milestone — Ontology — 2026-05-26

> *Ejecución automática de la tarea programada `ontology-pr-suggestions`. Revisión posterior a la del 2026-05-25; status verificado mediante `git log`, `tsc --noEmit`, escaneo de bytes, y lectura de código. Git pull bloqueado por proxy del sandbox (mismo que antes); sincronización local: 0 adelante / 0 atrás.*

> **Postscript (committed retrospectively).** This review captures the
> state at the *start* of 2026-05-26 (HEAD `ad5f148`). The behaviour-
> axis checker v0 proposed in §6 below shipped later the same day
> (commits `7ebdb52` close narrative, `5a62584` v0 implementation). The
> document is preserved as a snapshot of what was true that morning;
> see [[phase-e-close-status]] for the post-close state.

---

## 0. ⚠️ Resumen de las limitaciones del sandbox

1. **`git pull` sigue bloqueado** (`HTTP 403 from proxy after CONNECT`). El estado local es `HEAD = ad5f148`, sincronizado con `origin/main` (0/0).
2. **`vitest` no corre** (binding rolldown arm64, npm bloqueado). Verificación: `tsc --noEmit` → exit 0 (clean).
3. **`.git/index.lock` presente** (lectura por montaje read-only). Inocuo; `rm -f` antes de tu próximo `commit`.

---

## 1. ¿Qué cambió desde el 2026-05-25?

La revisión 05-25 dejó HEAD en `fb3f2bf` (2026-05-24 22:14). Hoy, **HEAD está en `ad5f148`** (2026-05-25 13:53), con **2 commits nuevos intermedios**:

| Commit | Fecha | Qué hizo |
|---|---|---|
| `e016662` | 2026-05-25 13:53 | **fix(verify): replace NUL byte separator** — La revisión 05-25 §3 reportó un byte NUL en `src/commands/verify/homeomorphism.ts:618` que escapaba al guard. Este commit **lo arregló**: cambió el separador `}\x00${` por `}|${` (el pipe nunca aparece en nombres de provider/modelo). También **actualizó la evaluación del guard** — ahora el script pasa porque no hay NUL bytes (por la razón correcta). |
| `ad5f148` | 2026-05-25 13:53 | **docs(legend): reconcile behaviour/behavior spelling** — La revisión 05-25 §4.1 reportó un drift entre la ortografía británica del spec (`behaviour`) y la americana del código (`behavior`). Este commit arregló el spec para alinear con el código (decidió ir con `behavior` de los 334 `.ts/.tsx` existentes). |

**Evaluación:** Excelente. Los dos bugs reportados hace 24 horas **ya se cerraron** — el upstream reaccionó muy rápido. El código está ahora en mejor forma que ayer.

---

## 2. Estado verificado en HEAD `ad5f148` (2026-05-25 13:53)

| Señal | Resultado | Verificación |
|---|---|---|
| **HEAD local** | `ad5f148` | `git log --oneline -1` |
| **Sync con `origin/main`** | **0 adelante / 0 atrás** | `git status` |
| **Working tree** | limpio (experimental/ untracked es esperado) | `git status --porcelain` |
| **`tsc --noEmit`** | ✅ limpio (exit 0) | Ejecutado hoy |
| **NUL bytes en fuentes** | ✅ **0** (el fix landed) | escaneo byte-a-byte de 334 `.ts/.tsx` |
| **Guard de NUL** | ✅ `check-nul-bytes.sh --all` da exit 0 | Corrido hoy; NOW por la razón correcta |
| **Ortografía `behavior`** | ✅ consistente (código + spec) | lectura de `BEHAVIOUR_AXIS_CHECKER_SPEC.md` |
| **Higiene de tests** | ✅ **0** `.only`/`.skip` detectados | grep de 122 `.test.ts` |

---

## 3. Análisis del progreso del Phase ε

### 3.1 Estado del milestone (alto nivel)

**Phases α–δ shipped**; **Phase ε mid-flight** con **Move 3α casi completo localmente:**

- ✅ **Arm A** (qwen2.5-coder:7b): 125/125 nodes, mean Jaccard 0.581, grounding Δ = +0.355 (vs Arm A0 control)
- ✅ **Arm A0** (control sin grounding): 125/125 nodes, mean Jaccard 0.226 — aisla el aporte del grounding
- ✅ **Arm B** (granite4.1:8b): HW-veto, 124/125 fallos por swap (no es veredicto del modelo)
- ✅ **Arm C-local** (starcoder2:7b): 57/125 coverage, 0.033 Jaccard — confirms "coding-base 7B no soporta el contract"
- ✅ **Síntesis 4-arm** renderizada en `SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md` + `.json`

**Matriz de cartografía:**
- ✅ Columna **`structural`** (+ `cost`): llena en los 125 nodos
- 🟡 Columnas **`contract` / `behavior` / `intent`**: aún vacías (spec del `behaviour` checker v0 aterrizado `fb3f2bf`)

### 3.2 Gate restante para cierre limpio de ε

**Arm C-cloud** (`devstral-small-2:24b` en GPU rentado, ~$5–10). Este es el único blocker pagado. Después:
- Recalibración de hipótesis contra A0/A (falsadores ya actualizados en `fb3f2bf`)
- Upgrade `MATHEMATICAL_CLAIMS.md` §3.10 adjoint T4 → T2
- Opcionalmente: Behaviour checker v0 (~4–6 h, $0, puede shipear antes o después de C-cloud)

---

## 4. 🟢 Hallazgos principales hoy

### 4.1 🟢 Bug reportado en 05-25 §3 → **ya cerrado**

El byte NUL en `homeomorphism.ts:618` que aparecía en `}\x00${provider}\x00${model}` ha sido **reemplazado por `}|${provider}|${model}`** en `e016662`. Verificado:

```sh
# Antes (bug):
$ od -c src/commands/verify/homeomorphism.ts | grep '\\0'
# → encontraba 0x00

# Hoy (fix):
$ tr -d -c '\000' < src/commands/verify/homeomorphism.ts | wc -c
# → 0 (sin NUL bytes)
```

El pipe `|` nunca aparece en nombres de providers (anthropic, ollama, openai) ni en nombres de modelos (claude-opus, qwen2.5-coder:7b, granite4.1:8b), así que es un separador text-safe.

**Implicación:** El comando `verify` que corre todo el Move 3α **no caerá silenciosamente** de su propio self-ingest. La preocupación load-bearing de la revisión 05-25 se cerró.

### 4.2 🟢 Drift ortográfico en 05-25 §4.1 → **reconciliado**

El spec `BEHAVIOUR_AXIS_CHECKER_SPEC.md` y el ROADMAP decían `behaviour` (británico), pero el código usa `behavior` (americano) en `HONESTY_AXES`, `MatrixCell`, etc. El commit `ad5f148` **alineó el spec con el código**:

```
docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md | 39 +++++++++++++++++++-----------
```

**Resultado:** Cuando el próximo implementador escriba el v0 del checker, no se topará con campos inexistentes (`cell.behaviour` contra código que espera `cell.behavior`).

### 4.3 🟡 Nueva tarea descoberta: `experiments/verify-refine-math/`

Hay un folder **untracked** que contiene un experimento nuevo:

```
experiments/verify-refine-math/
  ├── pipeline/
  │   ├── client.py
  │   ├── loop.py
  │   ├── verifier.py
  │   ├── prompts.py
  │   └── types.py
  ├── problems/
  │   ├── usamo2026_p{1..6}.json
  │   ├── imo2025_p1.json
  │   └── README.md
  └── requirements.txt
```

**Observación:** Este folder toca un área ortogonal a Phase ε (usa Python, no TS; refinement de verificación matemática, no self-ingest de ontology). Sin acción urgente, pero:
- Si es experimental / WIP: considera `.gitignore` para no contaminar `git status`
- Si es intencional para Phase ζ: considera documentarlo en ROADMAP (línea 51–56 menciona "Open-Prompt protocol" y "Wakeup Scanners", pero no esto)

---

## 5. Métricas y estado de código

| Métrica | Valor | Status |
|---|---|---|
| **Commits desde 05-24** | 2 (ambos fixes/docs documentados) | ✅ |
| **TypeScript build** | exit 0 (clean) | ✅ |
| **NUL bytes tracked** | 0 (fix landed) | ✅ |
| **Tracked `.ts/.tsx`** | 334 archivos | — |
| **Test files** | 122 `.test.ts` | ✅ (0 `.only`/`.skip`) |
| **Untracked (git status)** | `experiments/` | 🟡 (nuevo, WIP?) |
| **Branches ahead of main** | 0 | ✅ |

---

## 6. Próximos pasos priorizados

**🥇 HECHO — Limpieza de NUL + reconciliación ortográfica** 
Ambos items de la revisión 05-25 ya están cerrados en `e016662` + `ad5f148`. Status: ✅ done.

**🥈 Comportamiento-axis checker v0 (~4–6 h, $0)**
El spec `fb3f2bf` + la reconciliación `ad5f148` están listos. Implementar:
- Runner `--behaviour-check` en `src/commands/verify/homeomorphism.ts`
- ~20 fixtures del cohorte high-Jaccard de Arm A
- Wiring en `src/runtime/legend/matrix.ts` (la columna 2/5)
- Tests de cobertura

**🥉 Arm C-cloud (devstral-small-2:24b, ~$5–10)**
Único gate pagado. Una vez corrida, extender `scripts/run-3a-bakeoff-synthesis.ts` de 4 → 5 brazos y decidir `MATHEMATICAL_CLAIMS.md` §3.10.

**Opcionalmente (sin bloqueo):**
- Preflight unificado de integridad de perímetro (caza node_0094 + NUL + futuros)
- CLI surface `onto legend bakeoff-synthesis` (hoy es driver manual)
- Documentar experimento `verify-refine-math/` si es intencional para Phase ζ

---

## 7. Tabla resumen de cambios

| Item | Estado anterior | Estado hoy | Urgencia |
|---|---|---|---|
| **NUL byte `homeomorphism.ts:618`** | 🔴 bug (separador `\x00`) | ✅ cerrado (separador `\|`) | — |
| **Guard `check-nul-bytes.sh`** | 🔴 falso negativo | ✅ correcto (fix y re-verificado) | — |
| **Drift `behaviour`/`behavior`** | 🟡 spec ≠ código | ✅ alineado a `behavior` | — |
| **HEAD** | `fb3f2bf` (05-24 22:14) | `ad5f148` (05-25 13:53) | — |
| **Sync con `origin/main`** | 0/0 (status quo) | 0/0 (sin cambios) | — |
| **Phase ε avance** | Move 3α 4 brazos local | Move 3α 4 brazos + síntesis | Media (C-cloud + checker) |
| **`experiments/verify-refine-math/`** | N/A (nuevo) | 🟡 untracked, WIP? | Baja (documentar) |

---

## 8. Evaluación de riesgo y deuda

### 🟢 Ceros nuevos
- Ningún nuevo bug detectado; dos bugs reportados ya cerrados.
- Build limpio. Tests higiene limpia.

### 🟡 Deuda heredada (revisiones previas, sin cambios)
- Concurrent multi-process writes no lock-protected (writes son crash-atomic, cooperación entre CLI invocaciones no)
- BRANCH_MODEL.md Option-C recomendado pero no user-confirmed
- Walker v2 (proposal review pane) unshipped
- Algunas claims en `MATHEMATICAL_CLAIMS.md` son intuición, no tests (tiered ledger documentado)

### 🔵 Speculative (Phase ζ)
- Open-Prompt protocol, Wakeup Scanners, Branch-merge proposals, cross-branch `node_update` — esperando decisiones de diseño, no bloqueados.

---

## 9. Resumen ejecutivo (un párrafo)

Desde la revisión 05-25 aterrizaron 2 commits (ambos en el mismo minuto, 2026-05-25 13:53), ambos **fixes** de items reportados ayer: **`e016662` reemplazó el byte NUL** en `homeomorphism.ts:618` del separador `\x00` por `|` (text-safe, no aparece en provider/model names); **`ad5f148` reconcilió la ortografía** `behaviour` (spec) vs `behavior` (código) alineando el spec al código. HEAD está en `ad5f148`, sincronizado con `origin/main` (0/0), working tree limpio, `tsc --noEmit` en verde. Los dos issues críticos de higiene se cerraron. El milestone Phase ε sigue en muy buena forma: Move 3α tiene los 4 brazos locales en disco, la circularidad métrica resuelta (control A0 aisla el grounding Δ = +0.355 Jaccard real), y **solo falta el gate pagado Arm C-cloud (~$5–10)** más el checker `behaviour` (~4–6 h) para un cierre defendible. Nueva tarea descoberta: `experiments/verify-refine-math/` es untracked, WIP, ortogonal a Phase ε — documentar si es intencional para Phase ζ. Status overall: **excelente avance; cero bugs nuevos; dos curas rápidas entregadas.**

---

## 10. Anotaciones técnicas verificadas hoy

1. **NUL byte verification** — Ejecuté `tr -d -c '\000' < src/commands/verify/homeomorphism.ts | wc -c` → salida `0`, confirma fix.

2. **Guard functionality** — `bash scripts/check-nul-bytes.sh --all` → exit 0, lo que es correcto porque no hay NUL en archivos tracked.

3. **Spec alignment** — Leí `docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md` línea a línea; ahora dice `behavior` de forma consistente con `src/runtime/legend/matrix.ts` (`HONESTY_AXES = ["structural", "contract", "behavior", "intent"]`).

4. **Build state** — Compilación limpia, sin warnings de TypeScript.

---

*Generado por la tarea programada `ontology-pr-suggestions` el 2026-05-26 (post-upstream fixes). HEAD: `ad5f148`. Sincronización local: 0/0. Verificación: `tsc`, bytes, código, commit history. Git pull y npm bloqueados por proxy; `vitest` no disponible in-sandbox (binding rolldown arm64).*
