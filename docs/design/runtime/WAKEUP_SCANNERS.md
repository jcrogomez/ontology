# RFC: Wakeup Scanners

> **Status: RFC only — NOT IMPLEMENTED (verified 2026-06-10).** No `onto wakeup` commands exist; Phase 1 substrate has not shipped. Do not build against this spec without checking src/ first.

**Status:** Draft
**Bootstrap target:** post-0.9 / Phase ε+ (extension on top of Proposal System 0.5)
**Depends on:** [`PROPOSAL_SYSTEM.md`](../kernel/PROPOSAL_SYSTEM.md) (shipped), [`RUN_PERSISTENCE.md`](../kernel/RUN_PERSISTENCE.md) (shipped)
**Prerequisite for LLM-using scanners:** Prompt Generators RFC (pending)
**Date:** 2026-05-18

---

## 1. Motivación

Hoy toda propuesta en `.ontology/proposals/` se origina en el humano: `onto propose node`, `onto propose link`, o `run prompt --as-proposal`. El grafo no se mira a sí mismo. Las contradicciones detectables programáticamente —un nodo sin descendientes, dos nodos con la misma intención bajo distinto fraseo, una arista de dependencia implícita por contexto compartido— viven hasta que un humano las encuentra leyendo nodos uno por uno.

**Wakeup** pone *scanners* encima del sistema de propuestas existente. Un scanner es una función del grafo que emite propuestas `pending` para que el humano las ratifique. Schema, lifecycle, eventos, y la primitiva `parentHash` son los de [`PROPOSAL_SYSTEM.md`](../kernel/PROPOSAL_SYSTEM.md) — no se duplican ni se renombran.

`onto ingest` y `onto wakeup` son dos stances epistemológicos distintos sobre quién origina la intención:

- **`ingest`**: el humano apunta a un archivo, el sistema extrae intención de ese código. Una propuesta por archivo.
- **`wakeup`**: el sistema recorre el grafo sin target específico, detecta intents de alto nivel (fusionar, dividir, deprecar), y los materializa como **bundles** de propuestas atómicas existentes.

El comando es nuevo. El sistema de propuestas no.

---

## 2. Anatomía: scanner, intent, bundle

### 2.1 Scanner

Función `(graph, scope) → Intent[]`. Pura, sin side effects. Cada scanner declara:

- `id` estable (ej. `scanner_orphan_v1`).
- `requiresLlm: boolean`.
- `costEstimate(scope)` para `--budget` y `--cost-estimate`.

Scanners topológicos (`orphan`, `missing_edge`) no necesitan Prompt Generators. Scanners LLM (`split`, `merge`, `extract_canon`, `supersede`) sí los necesitan para que el hash del prompt forme parte de la cadena causal verificable, y son por eso bloqueados hasta que ese RFC aterrice.

### 2.2 Intent

Un intent es una intención de alto nivel detectada por un scanner. **No es un nuevo `mutation.kind`**: es un agrupador semántico que se desazucara en una secuencia de propuestas atómicas existentes bajo el schema actual.

| Intent             | Desazucara a                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `orphan_warning`   | 1× `node_supersede` (sin reemplazo — marca deprecated)                                                             |
| `missing_edge`     | 1× `edge_create`                                                                                                   |
| `merge_nodes` N→1  | 1× `node_create` (canónico) + N× `node_supersede` apuntando al canónico + M× `edge_create` (rewire)               |
| `split_node` 1→N   | N× `node_create` (hijos) + 1× `node_supersede` con `supersededBy` al primero + M× `edge_create` (rewire)          |
| `extract_canon`    | 1× `node_create` en `abstraction: canon` + N× `edge_create` tipo `refines`                                         |
| `supersede`        | 1× `node_supersede` con `supersededBy: <existing>` + opcional 1× `edge_create` tipo `supersedes`                   |

Cada propuesta atómica resultante es individualmente válida bajo PROPOSAL_SYSTEM.md y se ratifica con el lifecycle existente (`pending → applied | rejected | staled`).

### 2.3 Bundle

Un `split_node` genera ~5 propuestas hijas. El humano podría aceptar el `node_supersede` y rechazar uno de los `node_create`, dejando referencias colgando. Cada propuesta es individualmente válida pero el conjunto no.

Un **bundle** es el agrupador transaccional. Vive en `.ontology/proposals/bundles/bundle_<id>.json`, referencia N `proposalId` hijas, y obliga apply/reject all-or-nothing:

```json
{
  "id": "bundle_a3f2b1c8",
  "createdAt": 1763424000,
  "intent": "split_node",
  "intentPayload": { "originalNodeId": "node_0042", "intoLabels": [...] },
  "proposalIds": ["proposal_0099", "proposal_0100", "proposal_0101"],
  "source": { "runId": "run_8c4e7d12", "scannerId": "scanner_split_v1" },
  "rationale": "El nodo 0042 carga dos intenciones distinguibles.",
  "status": "pending",
  "hash": "bundle:hash:..."
}
```

Las propuestas hijas viven donde siempre (`.ontology/proposals/proposal_<id>.json`) con su propio lifecycle. El bundle vive en `bundles/` para que `onto proposal list` siga reportando propuestas individuales sin contaminarse.

**Atomicidad sobre append-only.** `bundle apply` ejecuta `proposal apply --dry-run` (ya existe, CLI_COMMANDS.md §"proposal apply") sobre cada hija en orden topológico, proyectando cada dry-run contra el estado *que tendría el grafo* tras las hijas anteriores. Si todas pasan el pre-flight bajo el advisory lock (`.ontology/.lock`, CLI_COMMANDS.md §"Advisory lock"), apply real procede sin clase de fallo recuperable: cualquier fallo posterior es un bug del kernel, no concurrencia. La transaccionalidad emerge de *dry-run completo + lock*, no de rollback.

### 2.4 Eventos nuevos

- `wakeup_scanned` — payload `{ scannerId, scope, intentsEmitted, runIds }`. Uno por scanner ejecutado.
- `bundle_created` — `{ bundleId, intent, proposalIds }`.
- `bundle_applied` — `{ bundleId, resultingEventIds }`.
- `bundle_rejected` — `{ bundleId, reason? }`.
- `bundle_aborted` — `{ bundleId, failedAt: proposalId, reason }` (apply abortado en pre-flight).

Los `proposal_*` existentes siguen emitiéndose por cada hija ratificada. El log de wakeup es estrictamente aditivo respecto al de propuestas.

---

## 3. CLI surface

```
onto wakeup [--scope <selector>]              # recorre subgrafo
            [--scanners <list>]                # filtra qué scanners corren
            [--budget <n>]                     # tope de runs LLM
            [--cost-estimate]                  # pre-flight $0
            [--dry-run] [--json]

onto bundle list   [--status <s>] [--intent <i>] [--json]
onto bundle show   <bundleId> [--json]
onto bundle apply  <bundleId> [--dry-run]
onto bundle reject <bundleId> [--reason "..."]
```

**No se introducen** `proposal_accepted`, `proposal_branched`, ni `proposal verify` (este último ya está cubierto por `onto runs verify`). El namespace `proposal` queda intocado.

---

## 4. Catálogo de scanners v0

| Scanner                    | Intent           | LLM | Fase |
| -------------------------- | ---------------- | --- | ---- |
| `scanner_orphan_v1`        | `orphan_warning` | no  | 1    |
| `scanner_missing_edge_v1`  | `missing_edge`   | no  | 1    |
| `scanner_split_v1`         | `split_node`     | sí  | 3    |
| `scanner_merge_v1`         | `merge_nodes`    | sí  | 3    |
| `scanner_extract_canon_v1` | `extract_canon`  | sí  | 4    |
| `scanner_supersede_v1`     | `supersede`      | sí  | 4    |

Los topológicos shippean primero porque validan el bundle pipeline sin la incertidumbre del LLM. Los LLM shippean tras el RFC de Prompt Generators.

---

## 5. Roadmap

### Fase 1 — Bundle substrate + scanners topológicos

- Schema Zod de `bundle_<id>.json` + validator.
- Eventos `bundle_*` y `wakeup_scanned`.
- `onto wakeup --scanners orphan,missing_edge` (sin LLM, sin budget).
- `onto bundle list/show/apply/reject` con dry-run pre-flight.
- Tests: grafo con N huérfanos conocidos → exactamente N bundles emitidos; `bundle apply` aplica las hijas con éxito; `bundle reject` deja las hijas en `rejected` con razón consistente.

**Critical milestone:** el ciclo wakeup → bundle → apply funciona contra el grafo real sin LLM. Primera vez que el sistema *opina* sobre sí mismo bajo supervisión.

**Tamaño:** una semana.

### Fase 2 — Prompt Generators (RFC propio)

Prerrequisito de cualquier scanner LLM. Documentado aparte; aquí solo se justifica el porqué: el sistema actual no los necesitó porque el humano invoca un único prompt en el momento. El scanner los invoca programáticamente sobre N nodos y necesita versionado + composición + hash de procedencia para que la cadena causal cierre.

### Fase 3 — Scanners LLM básicos

- `scanner_split_v1`, `scanner_merge_v1` — los dos que más obviamente desazucaran a bundles multi-propuesta.
- `--budget <n>` tope duro de runs LLM por invocación.
- Tests con mock determinista + golden tests con Ollama local.

**Critical milestone:** el demo comercial se vuelve grabable — *"un scanner analizó tu grafo, propuso un split con confidence 0.78, aquí está el bundle, aquí está el hash del razonamiento, apply o reject"*.

**Tamaño:** dos semanas tras Fase 2.

### Fase 4 — Resto del catálogo + policy

- `scanner_extract_canon_v1`, `scanner_supersede_v1`.
- Policy declarativa en `.ontology/state.json` para auto-apply de bundles con `confidence === 1.0` (opt-in, default off). Auto-apply emite los mismos eventos que apply manual.

**Tamaño:** ~una semana por scanner; policy ~una semana.

---

## 6. Decisiones de diseño justificadas

### 6.1 ¿Por qué bundles y no un `mutation.kind: "split_node"` compuesto?

- **Atomicidad por hija**: cada propuesta sigue siendo individualmente verificable. La maquinaria existente (`parentHash`, `proposal apply --dry-run`, `proposal_staled`) funciona sin cambios.
- **Compatibilidad con `out of scope` §8 de PROPOSAL_SYSTEM.md ("multi-step proposals"):** los bundles no son propuestas que generan propuestas. Son orquestación externa de propuestas atómicas. La regla *"cada propuesta es una mutación atómica"* se mantiene.
- **Reusabilidad del staleness primitive**: una `mutation.kind` compuesta tendría que reinventar la concurrencia optimista; los bundles la heredan por descomposición.

### 6.2 ¿Por qué el topológico va antes que el LLM?

Para separar clases de bugs. Si la primera vez que probamos el bundle pipeline es con propuestas generadas por LLM, los bugs de pipeline y los bugs de prompting se mezclan. Resolver primero el ciclo determinista con `orphan_warning` da un baseline contra el cual comparar cuando el LLM entre en Fase 3.

### 6.3 ¿Por qué wakeup nunca commitea directamente?

Misma razón que el sistema de propuestas existente: *"models may speak; only explicit graph commands may mutate the network"* (CLI_COMMANDS.md §`run prompt`). Wakeup emite candidates; el humano firma. La única diferencia con `onto propose` y `run --as-proposal` es que el iniciador del candidate es el sistema, no el humano. El contrato de ratificación es idéntico.

---

## 7. Out of scope (v0)

- **Wakeup en background.** No daemon, no watcher. Invocación explícita.
- **Bundles que generen otros bundles.** Sin cadenas recursivas.
- **Auto-rebase de bundles cuando el grafo cambia entre emisión y apply.** El dry-run pre-flight detecta divergencia y aborta; el humano re-corre el scanner.
- **Branching.** Materializar un bundle como branch nuevo (CLI_COMMANDS.md §"branch fiber") es extensión natural pero queda post-MVP.
- **Encriptación.** Mismas asunciones que `.ontology/proposals/` y `.ontology/runs/`.

---

## 8. Preguntas abiertas

1. **`bundle apply --partial`** — aceptar las primeras k hijas y rechazar las restantes. Lean: no en v0.
2. **Confidence agregado por bundle** — el sistema actual lo carga en `validation.score` por propuesta. Lean: derivar en `bundle show`, no agregar campo.
3. **El reemplazante en `supersede` puede ser un nodo creado en el mismo bundle** — sí, ese es exactamente el caso de `split_node`. La validación pre-flight por orden topológico lo cubre.

---

## 9. Resumen ejecutivo

1. **Fase 1**: bundle substrate + `scanner_orphan_v1` + `scanner_missing_edge_v1`. Sin LLM. Una semana. Único deliverable que no depende de RFCs no escritos.
2. **Esperar RFC de Prompt Generators**.
3. **Fase 3**: `scanner_split_v1`, `scanner_merge_v1`. Aquí nace el demo comercial.
4. **Fase 4**: resto del catálogo + policy.

Toda la maquinaria de propuestas individuales (`proposal_<id>.json`, eventos `proposal_*`, `parentHash`, `proposal apply`, `proposal apply --dry-run`) se reutiliza sin cambios. Lo nuevo de este RFC es estrictamente: scanners, intents, bundles, el comando `onto wakeup`, y los eventos `wakeup_scanned` + `bundle_*`.

**Si alguna decisión de implementación entra en conflicto con [`PROPOSAL_SYSTEM.md`](../kernel/PROPOSAL_SYSTEM.md), [`RUN_PERSISTENCE.md`](../kernel/RUN_PERSISTENCE.md), o el invariante *"models may speak; only explicit graph commands may mutate"*, gana el doc previo.**
