# RFC: Prompt Generators

**Status:** Draft
**Bootstrap target:** post-0.9 (prerequisite of [`WAKEUP_SCANNERS.md`](WAKEUP_SCANNERS.md) Fase 3+)
**Depends on:** [`RUN_PERSISTENCE.md`](RUN_PERSISTENCE.md) (shipped), `src/runtime/prompt/parse.ts` (existing AST parser)
**Lifts:** [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) Axiom 4 from T3 → T2 (actual rewriting via `@expand:` substitution)
**Date:** 2026-05-18

---

## 1. Motivación

Hoy los prompts no triviales del proyecto viven como **constantes hardcoded en `src/`** (`EXTRACTION_SYSTEM_PROMPT` en `src/commands/ingest/index.ts:192`, `INSPECTOR_SYSTEM_PROMPT` en `src/runtime/translator.ts:35`) o como **texto ensamblado dinámicamente sin versionado** (`assembleContext` en `src/runtime/context/assembler.ts:146`). Esto funciona mientras el iniciador es un humano que invoca *un* prompt en el momento (`onto run prompt --prompt "..."`); deja de funcionar en el momento en que un scanner programático tiene que invocar *el mismo prompt versionado* sobre N nodos del grafo.

Tres consecuencias concretas de seguir así:

- **Cadena causal verificable rota.** `runId` se deriva de `(promptHash, contextHash, modelHash)` (RUN_PERSISTENCE §3). Si un scanner emite 50 propuestas con el mismo prompt y alguien edita el string en `src/` entre run y review, los `promptHash` de los nuevos runs divergen sin que el log capture *por qué*. La auditoría posterior no puede distinguir "el modelo cambió de opinión" de "el ingeniero cambió el prompt".
- **Composición imposible.** Si dos scanners (`split` y `merge`) necesitan compartir el bloque "recuerda el canon del proyecto", hoy se copia-pega. La actualización de uno deja al otro divergente, silenciosamente.
- **Migración futura bloqueada.** Cuando los prompts hardcoded crezcan a tres o cuatro, refactorizarlos a un sistema requerirá un wave migration; hacerlo ahora, con dos consumidores, es barato.

Un **generator** es un artifact tipado y content-addressed que materializa a un string de prompt dado un set de parámetros. Su hash forma parte de la cadena causal, su body es versionable, y se compone con otros generators vía el marker `@expand:` que ya existe en el parser actual (pero hoy es metadata pura sin substitución, MATHEMATICAL_CLAIMS §Axiom 4).

### 1.1 Dos consumidores que justifican el RFC

- **WAKEUP_SCANNERS** (`split`, `merge`, `extract_canon`, `supersede`): cada uno carga su propio generator registrado; el scanner los invoca con parámetros derivados del nodo bajo análisis.
- **Migración opt-in de prompts hardcoded** (ingest extractor, inspector translator): no obligatoria, pero el sistema queda preparado.

---

## 2. Schema

Generators viven en `.ontology/generators/generator_<id>.json`:

```json
{
  "id": "gen_a3f2b1c8",
  "name": "split_detector_v1",
  "createdAt": 1763424000,
  "parameters": {
    "nodeId":      { "type": "string", "required": true },
    "nodePrompt":  { "type": "string", "required": true },
    "nodeContext": { "type": "string", "required": false, "default": "" }
  },
  "requires": ["gen_b1c2d3e4"],
  "body": "Recall the project canon:\n@expand: gen_canon_recall_v1\n\nAnalyze whether this node carries two distinguishable intents.\n\nNode {{nodeId}}:\n{{nodePrompt}}\n\nLocal context:\n{{nodeContext}}\n\nReturn JSON: { shouldSplit: bool, intoLabels: string[], confidence: number }",
  "hash": "gen:hash:..."
}
```

Notas de campo:

- `id` — derivado de `hash(name, parameters, requires, body)`. Dos generators estructuralmente idénticos producen el mismo id.
- `name` — handle estable + sufijo de versión explícito (`split_detector_v1`, `_v2`). Inmutable post-registro. Una nueva versión es un *nuevo* registro con `name: ..._v2`, no una mutación.
- `parameters` — schema declarativo. v0 soporta `type: "string"` solamente; otros tipos quedan para v1 (§10).
- `requires` — lista de `generatorId` que este invoca vía `@expand:`. Declarativo y verificable: el registro rechaza generators cuyo body usa `@expand: gen_xxx` sin tenerlo en `requires`. Esto previene dependencias implícitas y permite cómputo eficiente del dependency closure.
- `body` — el template. Sintaxis: `{{paramName}}` para substitución de parámetro, `@expand: gen_xxx` para composición con otro generator (línea-anclado, mismo parser que `@requires:` y `@provides:` ya implementado en `src/runtime/prompt/parse.ts`).
- `hash` — `gen:hash:sha256(canonicalJson({ name, parameters, requires, body }))`. Excluye `id`, `createdAt`, `hash` mismo. Sigue el patrón existente de `hashPrompt` / `hashContext` / `hashRun` (RUN_PERSISTENCE §3).

---

## 3. Materialización

`materialize(generatorId, parameters, registry) → { text, dependencyHash, materialHash }`. Función pura, sin acceso al grafo, sin side effects.

Pasos:

1. **Resolución.** Cargar el generator. Validar `parameters` contra el schema declarado (todos los `required: true` presentes; types correctos para v0 = "todos son strings").
2. **Expansion.** Para cada `@expand: gen_xxx` en `body`, validar que `gen_xxx ∈ requires`, materializar recursivamente con los *mismos* parámetros del padre (dynamic scoping, ver §9.2), y substituir el marker por el texto materializado. Cycle detection vía visited-set; ciclo aborta con error.
3. **Substitución de parámetros.** Reemplazar `{{paramName}}` por el valor correspondiente. Parámetros referenciados que no estén en el set aportado aborta con error (no silent fallback a string vacío).
4. **Salida.** El texto final. `dependencyHash = hash(canonicalJson({ rootId, paramsHash, expandedClosure: [{id, hash}, ...] }))` donde `expandedClosure` es la lista en orden topológico de todos los generators que participaron en la materialización con sus hashes congelados. `materialHash = hashPrompt(text)` — coincide con lo que `hashPrompt` produciría sobre el texto final, así el `promptHash` de RUN_PERSISTENCE queda consistente sin cambios.

**Determinismo:** dada la misma tupla `(registry snapshot, generatorId, parameters)`, `materialize` produce idéntico `(text, dependencyHash, materialHash)` byte por byte. Esto es lo que hace que el `runId` derivado siga siendo content-addressed.

---

## 4. Integración con RUN_PERSISTENCE

`PersistedRun.input` (RUN_PERSISTENCE §2) gana un campo opcional:

```json
"input": {
  "promptHash": "prompt:hash:...",
  "contextHash": null,
  "generator": {
    "id": "gen_a3f2b1c8",
    "parameters": { "nodeId": "node_0042", "nodePrompt": "...", "nodeContext": "..." },
    "dependencyHash": "gen:dep:hash:..."
  },
  ...
}
```

Reglas:

- Cuando `input.generator` está presente, `input.promptHash` debe ser exactamente el `materialHash` que el generator produce. Una verificación read-only puede re-materializar y comparar.
- Cuando ausente, comportamiento actual sin cambios — `run prompt --prompt "..."` directo sigue funcionando.
- `onto runs verify` (ya existente, CLI_COMMANDS.md §`runs verify`) extiende su check: si `input.generator` está presente, además de re-hashear el body del run, re-materializa el generator contra el registry actual y compara `materialHash` y `dependencyHash`. Divergencia = el generator fue mutado entre run y verify (no debería poder pasar por la inmutabilidad de §7, pero el check cierra el loop).

`runId` sigue derivándose de `(input, model)` con la misma fórmula. La presencia de `generator` en `input` lo hace participar del hash naturalmente sin schema migration del helper.

---

## 5. CLI surface

```
onto generator register <file.json>           # registra, calcula hash, asigna id, persiste
onto generator list [--name <pattern>] [--json]
onto generator show <id|name> [--json]
onto generator compile <id|name>              # materializa contra parámetros provistos
                       --param k=v [...]      # imprime texto + hashes; read-only
                       [--json]
onto generator verify <id>                    # recomputa hash del registro + integridad
```

No se introduce `onto generator update / delete` — los generators son inmutables (§7).

`onto generator compile` es la primitiva de debug y la base sobre la que los scanners construyen. Devuelve el text materializado y permite al desarrollador ver exactamente qué irá al modelo antes de dispatchearlo.

---

## 6. Lifecycle e inmutabilidad

Generators son **append-only e inmutables** por construcción:

- `register` rechaza si el `id` calculado ya existe (silent no-op con mensaje). Mismo content = mismo id = mismo registro.
- No hay `update`. Para evolucionar un generator, registrar uno nuevo con `name: <base>_v2` (o `_v3`, etc.). El sistema no impone naming — convención sugerida.
- No hay `delete`. Si un generator queda obsoleto, queda en disco; los runs que lo referencian siguen verificándose. Pruning explícito puede agregarse después, igual que en `.ontology/runs/` (RUN_PERSISTENCE §4).

Eventos en `events.jsonl`:

- `generator_registered` — payload `{ generatorId, name, hash }`.

No hay eventos de mutación porque no hay mutación. No hay evento de materialización porque eso emite un `run_persisted` aguas abajo si se dispatcha al modelo, y ese ya carga el `generator.id` en `input` (§4).

---

## 7. Composición con el AST parser existente

`src/runtime/prompt/parse.ts` reconoce hoy tres markers (`@requires:`, `@provides:`, `@expand:`) y los strippea del body sin substituir. Este RFC **agrega semántica a `@expand:` en el contexto de generators únicamente**, sin tocar el comportamiento existente para `node.prompt`:

- En `node.prompt.raw`, `@expand:` sigue siendo metadata declarativa (status quo). Un futuro RFC puede decidir extender la substitución a node-level si tiene sentido.
- En `generator.body`, `@expand: gen_xxx` se substituye al materializar. Esto es lo que MATHEMATICAL_CLAIMS §Axiom 4 §Rigor improvement nombra como el upgrade T3 → T2: *"implement the missing piece — `@expand: <nodeId>` resolves to the referenced node's compiled artifact and substitutes it inline"*. Aquí se hace en el dominio de generators, no de nodos, pero el mecanismo (regex existente del parser, marker idéntico) se reusa.

Costo de implementación: la regex del parser ya extrae el id post-marker. Lo nuevo es el resolver + visited-set + substitución textual.

---

## 8. Decisiones de diseño justificadas

### 8.1 ¿Por qué generators y no funciones TypeScript en `src/`?

Tres razones independientes:

- **Cadena causal.** Una función TS no tiene hash content-addressed verificable post-hoc; un commit edita el código sin que el log de runs lo registre. Un generator persistido en `.ontology/generators/` sí lo hace.
- **Versionado coexistente.** Múltiples versiones (`v1`, `v2`) viven simultáneamente en el registro. Una función TS solo tiene la versión actual; ejecutar runs viejos requiere `git checkout`.
- **Editabilidad sin recompilar.** Iterar un prompt sin `npm run build` es la diferencia entre 30 segundos y 30 minutos en feedback loop. Especialmente importante en la fase de Prompt engineering activa (Phase ε y la matriz del POSITIONING).

### 8.2 ¿Por qué dynamic scoping de parámetros y no binding explícito?

`@expand: gen_xxx(p=v)` con binding explícito es más correcto en PL design (evita shadowing, hace dependencias visibles). Pero v0 prioriza simplicidad de parser y materializador: `@expand: gen_xxx` hereda los parámetros del padre. Mismo nombre = mismo valor.

Trade-off conocido: si dos generators usan `{{nodeId}}` con semánticas distintas, el shadowing es silencioso. Mitigación v0: convención de nomenclatura clara (`nodeId` siempre el id del nodo bajo análisis). Mitigación v1: agregar sintaxis de binding explícito; los generators v0 siguen funcionando porque "no binding" = "inherit all".

### 8.3 ¿Por qué `requires` declarativo y no derivado del body?

Derivar del body es más simple (parsea `@expand:` y listo). Declararlo explícito permite que `register` lo *valide* contra el body (detecta `@expand:` huérfanos y `requires:` no usados). Catch bugs en registro, no en materialización.

### 8.4 ¿Por qué v0 limita `parameters.type` a `string`?

Los dos consumidores actuales (scanners de wakeup, prompts hardcoded migrables) solo necesitan strings. Agregar `number`, `boolean`, `array` es trivial pero requiere decidir cómo se serializan en el template (`{{count}}` para number es obvio; `{{nodes}}` para array no). v1 lo aborda con consumidores reales que pidan tipos no-string.

---

## 9. Out of scope (v0)

- **Substitución de `@expand: <nodeId>` en `generator.body`.** Solo se substituyen otros generators. Si un generator necesita el contenido de un nodo, el caller pasa los campos relevantes como parámetros. Lifting node-level substitution es v1.
- **Tipos de parámetro no-string.** Ver §8.4.
- **Binding explícito en `@expand:`.** Ver §8.2.
- **Generator runtime queries al grafo.** Generators son funciones puras de `(parameters, registry)`. Si necesitan estado del grafo, el caller lo lee y lo pasa.
- **Migración automática de prompts hardcoded.** El RFC habilita la migración; ejecutarla es trabajo separado, opt-in, una constante a la vez.
- **Pruning de generators no referenciados.** Append-only por defecto.
- **Branching de generators.** Generators son globales al repo, no por branch. Si un experimento necesita un generator distinto, registra un `_v2_experimental`.

---

## 10. Preguntas abiertas

1. **¿`onto generator register` valida que el `name` es único globalmente, o solo `(name, hash)` tuple?** Lean: único por `name` — dos registros con mismo `name` y body distinto es una mutación disfrazada. Forzar sufijo `_v2`.
2. **¿`@expand:` permite recursión mutua entre generators (A expand B, B expand A)?** Cycle detection aborta. Lean: prohibir; el grafo de dependencias entre generators es estrictamente acíclico.
3. **¿`parameters.default` se aplica antes o después del check de `required`?** Lean: defaults aplican primero, `required` se chequea sobre el set resultante. Un parámetro con `default` no necesita estar `required: true`.
4. **¿`onto runs verify` debe rehidratar el generator desde `dependencyHash` aunque el registro local lo haya borrado?** Lean: fallar con error claro. Generators referenciados por runs son inmunes a pruning, igual que la política sugerida para runs referenciados por proposals (WAKEUP_SCANNERS §6 implícito, RUN_PERSISTENCE §4).
5. **¿Hay valor en que el `register` corra un dry-run de materialización con `parameters.default` para detectar `{{params}}` huérfanos al registro?** Lean: sí, barato y útil. Si todos los `required` tienen default o el generator no tiene `required`, hace un dry-materialize y valida que no falten variables.

---

## 11. Roadmap

### Fase 1 — Substrate (sin consumidores)

- Zod schema de generator + validator.
- `.ontology/generators/` directorio + persistence layer (`src/core/generators/persist.ts`).
- `hashGenerator` helper en `src/core/integrity/hash.ts` (paralelo a `hashPrompt`, `hashContext`, `hashRun`).
- `materialize(...)` puro en `src/runtime/generators/materialize.ts`.
- `onto generator register / list / show / compile / verify`.
- Evento `generator_registered`.
- Tests: registro idempotente (mismo content → mismo id, no-op en segundo register); materialización determinista (mismo input → mismo output byte-exact); cycle detection; `@expand:` huérfano falla en register; parámetro faltante falla en materialize.

**Tamaño:** una semana.

### Fase 2 — Integración con RUN_PERSISTENCE

- Extensión opcional de `PersistedRunInput` con `generator: { id, parameters, dependencyHash }`.
- `onto runs verify` reconoce el campo y re-materializa contra el registry actual.
- `run prompt --generator <id> --param k=v` como surface CLI alternativa a `--prompt`.
- Tests: run con generator produce mismo `runId` ante misma `(generator, params, model)` (cache hit); `runs verify` detecta divergencia si el body del generator es manipulado en disco fuera del kernel.

**Tamaño:** tres a cinco días.

**Critical milestone:** al final de Fase 2, WAKEUP_SCANNERS Fase 3 puede empezar — el contrato de cadena causal verificable para scanners LLM está cerrado.

### Fase 3 — Migración opt-in de prompts hardcoded

Una constante a la vez, sin coordinación:

- `EXTRACTION_SYSTEM_PROMPT` → `gen_ingest_extractor_v1`. Tests existentes de `onto ingest` verifican que el behavior queda byte-idéntico (el promptHash no cambia si la migración preserva el texto).
- `INSPECTOR_SYSTEM_PROMPT` → `gen_inspector_translator_v1`.
- `buildInspectorPrompt()` (dinámico) → generator con parámetros.

Cada migración es independiente y no bloquea ninguna otra fase. Es una buena vía para validar que el sistema escala a generators no triviales sin afectar pipelines en producción.

**Tamaño:** ~medio día por constante migrada, opt-in según necesidad.

---

## 12. Resumen ejecutivo

1. **Fase 1**: substrate (~1 semana). No depende de nada.
2. **Fase 2**: integración con run persistence (~3-5 días). Desbloquea WAKEUP_SCANNERS Fase 3.
3. **Fase 3**: migración opt-in de prompts hardcoded (~medio día por constante). Sin urgencia.

Lo nuevo de este RFC es estrictamente: schema de generator, materializador puro con composición vía `@expand:`, hashing content-addressed, extensión opcional de `PersistedRunInput`, y comando `onto generator`. Todo lo demás (lifecycle de runs, lifecycle de proposals, validación, append-only log) se reusa sin cambios.

**Si alguna decisión de implementación entra en conflicto con [`RUN_PERSISTENCE.md`](RUN_PERSISTENCE.md) o con el contrato de hash content-addressed de [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) §4.1, gana el doc previo.**
