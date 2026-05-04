1. **Add optional `--validate` argument to `onto run context`:**
   - Modify `RunContextOptions` in `src/commands/run/context.ts` to include `validate?: boolean;`.
   - Ensure the Commander configuration in `src/cli.ts` passes the `--validate` flag (it might just be `.option("--validate", "...")`).

2. **Implement validation logic in `runContextCommand` when `--validate` is passed:**
   - Execute `assembleContext`.
   - *If `--validate` is true:*
     - Map `contextOutput.nodes` using `buildFragment` from `src/runtime/context/presheaf.js`.
     - Call `glueFragments` from `src/runtime/context/gluing.js` with the array of fragments.
     - Note: `buildFragment` requires an `OntologyNode`, but `assembleContext` returns an object where `nodes` is an array of node IDs (or maybe full nodes? I need to check `ContextAssemblyOutput`). I'll use `loadNodes` or fetch nodes to satisfy `buildFragment`. Actually, `assembleContext` might return the actual node IDs.
   - Dispatch the LLM request.
   - *If `--validate` is true:*
     - Call `validateIntent` with the assembled context, the result from `glueFragments`, and the candidate response.

3. **Format output appropriately:**
   - For human output, when `--validate` is true, append:
     ```text
     Validation:
       OK:       ${validationResult.ok}
       Score:    ${validationResult.score}
       Warnings: ${validationResult.warnings.length}
       Violations: ${validationResult.violations.length}
     ```
   - For JSON output, when `--validate` is true, add a `validation` object to the JSON payload matching the test criteria.

4. **Verify tests:**
   - Add the specified tests to `tests/run-context-cli.test.ts`.

5. **Pre-commit:**
   - Run typecheck, build, test, and `.ontology` non-mutation checks.
