# Legacy Audit

## Scope
This audit checks whether the current repository contains legacy code that contradicts Bootstrap 0.1/0.2.

## Canon
Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.

## Findings

| Area | Status | Notes |
|---|---|---|
| `src/generated/` | Not found | No generated React/JSX code currently included in kernel source. |
| `generated/` | Not found | No legacy generated output found. |
| `.generated/` | Not found | Should remain ignored as future compiler output. |
| `dist/` | Not found | Build output should remain ignored. |
| React/Vite/Tailwind dependencies | Not found | Kernel is not coupled to a frontend stack. |
| `yaml` dependency | Not found | No legacy context command dependency present. |
| `src/commands/context.ts` | Not found | Legacy context command not present. |
| `.tsx` / `.jsx` files | Not found | Kernel does not compile UI artifacts. |
| Legacy prompt-to-code commands | Not found | Current commands align with Bootstrap 0.1/0.2. |

## Actions Taken
- Confirmed the current repository is aligned with Bootstrap 0.1/0.2.
- Added generated and runtime directories (`.ontology/`, `.generated/`) to `.gitignore` if missing.

## Conclusion
No legacy code requiring removal was found in the current working tree.
