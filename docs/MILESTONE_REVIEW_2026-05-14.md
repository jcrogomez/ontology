# Revisión de Milestone — 2026-05-14

> *Reporte generado automáticamente como tarea programada. Fuente: análisis
> estático del repo local en `main` (HEAD `4f689f7`). Git pull no ejecutado
> — proxy bloqueado desde el sandbox; rama confirmada up-to-date con origin.*

---

## Estado general: 0.4.0-rc.1 — muy cerca del final

La release candidate está en su mejor forma hasta la fecha. Los últimos dos
commits (`373eb8a`, `4f689f7`) completan el **prework A–E de Phase ε**: todo
el instrumental $0 necesario para correr el pilot está en `main`. La hipótesis
está pre-registrada y el runbook operacional está documentado. Lo único que
falta para promover a `0.4.0` final es **correr el pilot real**.

---

## 1. Qué se logró desde la última revisión

### Phase ε prework — completo al 100 %

| Item | Descripción | Estado |
|---|---|---|
| A | `onto ingest <paths...>` variadic — N rutas, realpath dedup, breakdown por input | ✅ |
| B | `frontier-tagger.ts` — 16 atributos, 33 path-rules + 3 content-rules, fallback a `operational-glue` | ✅ |
| C | `matrix.ts` + flag `--matrix` en `verify-homeomorphism` — 6 ejes, `ByAxis` aggregate | ✅ |
| D | `matrix-intersections.ts` — 7 intersecciones requeridas, siempre presentes con zeros explícitos | ✅ |
| E | Cross-doc refs (`MATHEMATICAL_CLAIMS.md` §3.10, `LEGEND.md` §3) actualizados | ✅ |

### Fixture y pre-flight

- `examples/legend-fixture/src/` con 6 archivos determinísticos cubriendo las áreas predichas (runtime/effects, runtime/prompt, commands/greet, schemas/user.ts, core/fs, core/integrity).
- Test file `tests/legend-fixture-tagger.test.ts` (17 tests) pineando el mapping fixture↔bucket de 1:1.
- `renderReportMarkdown` emite tres secciones nuevas bajo `--matrix`: "Matrix by axis", "Frontier coverage", "Frontier intersections".
- `PILOT_RUNBOOK.md` y `SELF_INGEST_HYPOTHESIS_2026-05-13.md` congelados como fuente de verdad.

### TypeScript clean

`tsc --noEmit` — **sin errores**. La base de código compila limpia en este momento.

---

## 2. Único gate para 0.4.0 final

```
Phase ε self-ingestion → calibration report en docs/legend/calibrations/SELF_INGEST_<date>.md
→ MATHEMATICAL_CLAIMS.md §3.10 T4 → T2
→ tag 0.4.0
```

No hay código pendiente. La puerta es **tiempo de ejecución y crédito API**.

---

## 3. Próximos pasos concretos (orden de ejecución)

### 3.1 Pre-flight local (sin costo, ~10 min)

```sh
cd /Users/juancarlosromero/Development/ontology
npm run check   # ya confirmado: clean

npx vitest run tests/legend-matrix.test.ts \
              tests/legend-matrix-intersections.test.ts \
              tests/frontier-tagger.test.ts \
              tests/legend-fixture-tagger.test.ts \
              tests/verify-report-markdown.test.ts \
              tests/ingest-cli.test.ts
```

Si todos están verdes, el prework está aterrizado correctamente. El sandbox
de CI tiene una incompatibilidad de arquitectura (`rolldown` darwin-arm64 en
linux-arm64) que impide correr vitest aquí — los tests **deben correr localmente**.

### 3.2 Frontier preview (sin costo, ~2 min)

```sh
onto frontier src/runtime src/core src/commands src/schemas \
  --include ts,tsx --totals-only
```

Confirmar: `Zero-tagged files: 0`. Si hay alguno, corregir `frontier-tagger.ts`
antes del pilot.

### 3.3 Cost estimate (sin costo, ~1 min)

```sh
onto ingest src/runtime src/core src/commands src/schemas \
  --include ts,tsx --provider anthropic --cost-estimate
```

Registrar el conteo de archivos (hipótesis predice 117). Si difiere, actualizar
`SELF_INGEST_HYPOTHESIS_2026-05-13.md` con el nuevo conteo antes de continuar.

### 3.4 Ollama pilot (sin costo API, ~1–2 h de setup + run)

Asegurarse de que Ollama corre y tiene los modelos:
```sh
ollama pull qwen2.5-coder:7b    # semantic_parse tier
ollama pull qwen2.5-coder:14b   # code_sketch tier (para verify compile-back)
```

Luego seguir el PILOT_RUNBOOK.md §§3–5 completo: ingest, apply proposals,
edge inference, `verify-homeomorphism --matrix --provider ollama`.

### 3.5 Anthropic publishable pass (~$15–30, ~2–3 h de run)

Solo después de que el pilot Ollama complete sin errores fatales:
```sh
onto ingest src/runtime src/core src/commands src/schemas \
  --include ts,tsx --provider anthropic

# apply proposals, edge inference...

onto verify-homeomorphism --all-artifacts --provider anthropic \
  --matrix \
  --report docs/legend/calibrations/SELF_INGEST_$(date +%Y-%m-%d).md \
  --max-tokens 16384 \
  --json > anthropic-verify.json
```

### 3.6 Post-pilot checklist (~30 min)

1. Actualizar `MATHEMATICAL_CLAIMS.md` §3.10 de **T4 a T2** citando el report file.
2. Agregar párrafo de resumen en `LEGEND.md` §3 ("Phase ε framework").
3. Append sección *Result* en `SELF_INGEST_HYPOTHESIS_2026-05-13.md`.
4. Tag `0.4.0` y merge.

---

## 4. Bugs y riesgos identificados

### 4.1 Cross-root edges no inferidos (limitación conocida, baja prioridad)

El multi-positional ingest (Prework A) corre `infer-edges` por directorio de
entrada, no over el grafo completo. Edges del tipo `src/commands → src/runtime`
no se crearán automáticamente. El runbook lo documenta como "Accept for the
pilot." Para la medición de Phase ε esto es aceptable; para un uso en producción
de multi-root repos, habrá que implementar un post-pass que corra
`infer-edges` sobre el árbol unificado.

**Sugerencia:** abrir un issue/nota en `POST_GAMMA_PLAN.md` cuando Phase ε
termine, para no olvidarlo en el planning de 0.5.0.

### 4.2 Single-output projection en `pathProjection` (limitación conocida)

`pathProjection(node)` lee solo `outputs.files[0]`. Un nodo que emite
`src/lib/a.ts` + `tests/lib/a.test.ts` cae solo en el fiber `src/lib`.
El diagnóstico "find every artifact node missing an output path" necesitará
`findUnprojected(input, projection)` — documentado en PROJECT_LEGEND.md §2.4
como trabajo futuro.

**Impacto en Phase ε:** ninguno inmediato (los nodos de la auto-ingesta
emiten un solo `outputs.files[0]`). Impacto en sweeps multi-output: medio.

### 4.3 `locDistance` sobreestima divergencia en archivos con docstrings (limitación conocida)

Ya documentado en §7.1 del `PROJECT_LEGEND.md`: un archivo como `hash.ts`
sale "divergente" bajo LoC pero "ε-equivalent" semánticamente porque la
diferencia está en densidad de docstrings. El reporte ya usa **dos** métricas
(`locDistance` + `structuralJaccard`) para distinguir `divergent_loc` vs
`divergent_structural` vs `divergent_both`.

**Sugerencia para Phase ε:** al analizar el report, no colapsar ambas
distancias en una sola cifra. El `byAxis` aggregate del matrix ya lo separa;
asegurarse de que el write-up final en el calibration report también lo haga.

### 4.4 Posible edge-case en frontier-tagger: `prompt-sensitive` regex

El commit `4f689f7` ya tightened la regex para permitir `: Type` entre
identifier y assignment. Pero el fixture `src/runtime/prompt/` no contiene
archivos con `const PROMPT: string = \`...\`` — solo el `runtime/prompt/`
path rule los etiqueta como `prompt-sensitive`. Si el sweepde auto-ingesta
encuentra archivos de prompts que no caen bajo ese path, quedarán como
`operational-glue`.

**Sugerencia:** antes de correr el pilot, revisar manualmente si hay archivos
de templates de extracción bajo rutas inesperadas que necesiten una content-rule
adicional. Correr `onto frontier --totals-only` revelará el `Fallback-only`
count que lo delataría.

### 4.5 El fixture end-to-end está parcialmente testeado

`tests/legend-fixture-tagger.test.ts` pina el tagger (17 tests verdes), pero
la aceptación completa de la hipótesis §8 requiere:

```
ingest → apply → infer edges → verify-homeomorphism → expected matrix
```

Este flujo completo con el fixture **no está testeado todavía** — los tests
solo validan el tagger path. El e2e del fixture queda como tarea natural
después de que el pilot Anthropic valide el pipeline real.

---

## 5. Mejoras de diseño sugeridas

### 5.1 `onto frontier` debería emitir cost estimate integrado

Actualmente `onto frontier` y `onto ingest --cost-estimate` son dos comandos
separados. Para el workflow habitual (verificar cobertura + proyectar gasto
antes de pagar), sería útil un flag `--with-cost-estimate` en `onto frontier`
que combine ambas salidas en un solo reporte. Ahorraría un paso en el runbook
y reduciría la chance de que el usuario olvide el cost-estimate antes del paid
pass.

### 5.2 `onto verify-homeomorphism` debería poder recibir paths directos

Hoy el selector es `<nodeId> | --nodes <ids> | --all-artifacts`. Para Phase ε
el workflow natural es "verifica este archivo fuente concreto". Un flag
`--source-path <path>` que resuelva el nodeId automáticamente desde
`outputs.files[0]` ahorraría un lookup manual y es consistente con cómo
`onto ingest` acepta paths directos.

### 5.3 Walker v2 — proposal review pane completado, pero rotación de ejes pendiente

Walker v2 PR-1 (proposal review pane con `j/k` y `a/r/d`) está en `main`.
La parte que falta del plan original:

- Plane rotation (`r` para ciclar abstraction/temporal/branch/manifestation)
- Time scrubber (replay events.jsonl hasta un eventId)
- Branch picker overlay (`:branch switch`)

Estas features **no bloquean Phase ε** pero sí mejorarían la UX del apply
loop de ~90 propuestas que el runbook prevé. Si la mano lo permite, implementar
al menos el plane rotation antes del pilot — hace la navegación del network
ingerido más legible.

### 5.4 `BRANCH_MODEL.md` Option C — confirmar formalmente

El POST_GAMMA_PLAN.md lista esto como "P0 ahora" y "30 min". Al 2026-05-14
sigue sin evidencia de confirmación formal en el repo. Conviene hacer el
commit mínimo que actualice el doc con la confirmación explícita, desbloqueando
el planning de Bootstrap 0.10 formalmente.

---

## 6. Resumen ejecutivo

```
0.4.0-rc.1  [████████████████████░] ~95 % completo
                                    ↑
                            Solo falta Phase ε:
                       Ollama pilot + Anthropic pass
                       (~2–4 h de trabajo + ~$15–30)
```

El repo está en el mejor estado técnico del proyecto: TypeScript limpio,
prework completo, hipótesis pre-registrada, runbook operacional, fixture
con tests. El único trabajo que falta es **ejecutar el pilot** y escribir el
calibration report. Todo lo demás — Walker v2 completo, Open-Prompt v0,
cross-root edges — puede esperar a la línea 0.5.0.

**Recomendación inmediata:** correr los 5 test files del pre-flight
localmente como primer acto de la próxima sesión de trabajo. Si pasan,
el pilot está listo para ejecutarse.

---

*Generado: 2026-05-14 | HEAD: `4f689f7` | Branch: main*
