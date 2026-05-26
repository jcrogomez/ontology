# Próximos pasos — Ontology Phase ε — Resumen ejecutivo

> **Postscript (committed retrospectively).** This summary is the
> start-of-day snapshot for 2026-05-26 (HEAD `ad5f148`). Priority 1
> below — behaviour-axis checker v0 — shipped the same day
> (commits `7ebdb52`, `5a62584`); the §3.10 promotion went through
> on 4-arm + 2-column substate; Arm C-cloud was parked indefinitely
> for budget. Priority 2 (Arm C-cloud) is the parked item.
> Priority 3 (preflight perimeter) and Priority 4 (verify-refine-math
> docs) remain open. Workflow runtime spec is a new Phase ζ item
> not anticipated below. See [[phase-e-close-status]].

## Status actual (2026-05-26)

- **HEAD:** `ad5f148` (sincronizado 0/0 con `origin/main`)
- **Build:** ✅ limpio (`tsc --noEmit` exit 0)
- **Tests:** ✅ higiene (0 `.only`/`.skip`)
- **Bugs reportados ayer (05-25):** ✅ **ambos ya cerrados** (`e016662` fix NUL, `ad5f148` alinea ortografía)
- **Phase ε:** Move 3α 4-arm bake-off local completo; síntesis renderizada; circularidad métrica resuelta

---

## 🥇 Priority 1: Behaviour-axis checker v0 (~4–6 h, $0)

**Desbloqueado tras `ad5f148` (ortografía alineada).**

### Tasks

1. **Crear runner `--behaviour-check` en `src/commands/verify/homeomorphism.ts`**
   - Fixture: ~20 nodos del cohorte high-Jaccard de Arm A (ej. los top 20 por mean Jaccard)
   - Logic: test equivalence runtime (execute snapshot, compare outputs en 2–3 ejecuciones)
   - Output: binario `pass` (≥2/2 consistent) / `fail` (diverge) / `untested` (no fixture)
   - Reference: spec `docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md` §3.3

2. **Wiring en `src/runtime/legend/matrix.ts`**
   - Populate `MatrixCell.behavior` (actualmente `null`) con resultado del runner
   - Alineación: `behavior: "pass" → 1`, `"fail" → 0`, `untested → null` (§3.3 del spec)

3. **Tests**
   - Unit: runner solo con 2–3 fixtures manuales
   - Integration: full `onto verify --behaviour-check` sobre subset de Arm A

### Outcome
- Matriz cartografía pasa de **1/5 → 2/5** columnas llenas
- `structural` + `behaviour` = 2 ejes independientes (comportamiento ortogonal al AST grounding)
- Prueba que el cheque no es artefacto del grounding (§3.1)

---

## 🥈 Priority 2: Arm C-cloud — devstral-small-2:24b (~$5–10 GPU rental)

**Gate pagado único para cierre limpio de Phase ε.**

### Setup
1. **Alquilar GPU** (A10 o L4 class, ~1–2 h de compute)
   - Providers: Vast.ai, Lambda Labs, RunPod (opciones usuales)
   - Modelo: `devstral-small-2:24b` (5.6 GB) en ≥16 GB RAM

2. **Ejecutar Arm C-cloud**
   ```sh
   ollama serve  # on rented GPU
   npx tsx scripts/run-self-ingest-epsilon-3a.ts --arm C-cloud --reps 1
   ```
   - Wall-clock esperado: 3–4 h (parecido a Arm A's 1h33 pero modelo más grande)
   - Esperar salida: `SELF_INGEST_EPSILON_3A_2026-05-XX_ARM_C_CLOUD.md` + sidecar `.json`

3. **Extend synthesis — 5 brazos**
   - Script: `scripts/run-3a-bakeoff-synthesis.ts` (hoy genera 4 brazos)
   - Re-run: `npx tsx scripts/run-3a-bakeoff-synthesis.ts` → genera `SYNTHESIS_2026-05-XX.md`

### Outcome
- H3 clean test: devstral (instruction-tuned, 24b) vs qwen (base 7b) on full perimeter
- Hipótesis recalibradas contra A0 control (falsadores H1'/H3' ya viven en `fb3f2bf`)
- **Decisión:** `MATHEMATICAL_CLAIMS.md` §3.10 adjoint **T4 → T2** si H1/H3 pasan

---

## 🥉 Priority 3: Perimeter integrity preflight (~1–2 h, $0)

**Captura la clase de bug que produjo `node_0094` + NUL bytes + futuros.**

### Idea
Crear un comando `onto legend perimeter-check` que:
1. **Enumera todos los `.ts/.tsx` tracked** del repo
2. **Verifica que cada uno esté representado** como nodo `code` en el candidate-set de `verify`
3. **Excluye nodos que caerían** por:
   - NUL bytes (`binary_content`)
   - Manifestation incorrecto (`manifestation: "intent"` para un `.ts`)
   - Path patterns que trigger exclusión implícita
4. **Output:** lista de archivos bajo-representados + causa de cada exclusión

### Why
- `node_0094` (manifestation silenciosa) + `homeomorphism.ts` (NUL bytes) son la misma clase
- Un preflight unificado previene regresiones sin parchear caso-por-caso

### Effort
- ~30 min: logic core
- ~30 min: tests + CLI surface

---

## 🔵 Priority 4: Documentar experimento `verify-refine-math` (baja urgencia)

**Folder untracked detectado hoy.**

### Status
- Nuevo folder: `experiments/verify-refine-math/`
- Contiene: Python pipeline + fixtures (USAMO/IMO)
- Ortogonal a Phase ε (no toca self-ingest, TS)

### Action
- Si es **experimental WIP:** añade a `.gitignore` y considera un README
- Si es **intencional para Phase ζ:** documenta en ROADMAP §51–56 (actualmente menciona "Open-Prompt" y "Wakeup Scanners", no esto)

---

## Timeline sugerido

| Hito | Esfuerzo | Bloqueadores | Timeline |
|---|---|---|---|
| **Behaviour checker v0** | 4–6 h | ninguno (spec listo) | Esta semana |
| **Arm C-cloud** | ~$5–10 + 4 h setup | dinero + infra | Semana próxima |
| **Síntesis 5-arm** | 30 min | Arm C-cloud completa | Tras C-cloud |
| **Preflight perimeter** | 1–2 h | ninguno | Prioridad media |
| **Alineación ROADMAP** | 15 min | Decisión sobre `verify-refine-math` | Prioridad baja |

---

## Tabla de state post-fixes (2026-05-26)

| Item | Status | Verificación | Acción |
|---|---|---|---|
| NUL byte `homeomorphism.ts:618` | ✅ fixed | `tr -d -c '\000' | wc -c → 0` | None |
| Guard `check-nul-bytes.sh` | ✅ fixed | `bash --all → exit 0` | None |
| Ortografía `behaviour`/`behavior` | ✅ aligned | spec + código ambos `behavior` | None |
| Behaviour checker v0 (spec) | ✅ ready | `docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md` | Implementar (~4–6 h) |
| Arm C-cloud (devstral-24b) | 🟡 pending | Blocked on $$ | Rent GPU + run |
| Síntesis 5-arm | 🟡 ready to extend | 4-arm driver existe | Extender al landing de C-cloud |
| Preflight perimeter | 🟡 designed | Spec arriba (no-code) | Build (~1–2 h) |
| Phase ε overall | 🟡 on track | Matriz 1/5 columnas, 4 brazos | C-cloud gate + checker v0 |

---

## Resumen en una frase

Phase ε se mantiene en muy buen ritmo: dos fixes de bugs se entregaron ayer (NUL, ortografía), el movimiento 3α tiene sus 4 brazos locales listos, el próximo paso es el behaviour checker v0 (sin bloqueadores, 4–6 h), seguido por el gate pagado Arm C-cloud (~$5–10) que cerrará un cierre de Phase ε defensible y publicable. **No hay deuda técnica nueva; solo tareas de ejecución clara.**

---

*Resumen ejecutivo generado 2026-05-26. Basado en verificación de HEAD `ad5f148`, roadmap oficial `ROADMAP.md`, y milestone reviews 05-24 + 05-25. Próxima revisión: tras Arm C-cloud y/o comportamiento v0 shipped.*
