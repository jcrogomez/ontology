import { verifyPersistedRun, loadPersistedRun } from "../../core/runs/persist.js";

export interface RunsVerifyOptions {
  json?: boolean;
}

export async function runsVerifyCommand(id: string, options: RunsVerifyOptions): Promise<void> {
  const run = loadPersistedRun(id);
  if (!run) {
    console.error(`✖ Run not found: ${id}`);
    process.exit(1);
  }

  const result = verifyPersistedRun(id);

  if (options.json) {
    console.log(JSON.stringify({
      id,
      ok: result.ok,
      idMatches: result.idMatches,
      hashMatches: result.hashMatches,
      expectedId: result.expectedId,
      expectedHash: result.expectedHash,
      storedId: run.id,
      storedHash: run.hash,
    }, null, 2));
    if (!result.ok) {
      process.exit(1);
    }
    return;
  }

  console.log(`=== ONTOLOGY RUN VERIFY ${id} ===`);
  console.log(`OK:           ${result.ok ? "✔" : "✖"}`);
  console.log(`Id matches:   ${result.idMatches ? "✔" : "✖"}`);
  console.log(`Hash matches: ${result.hashMatches ? "✔" : "✖"}`);
  if (!result.idMatches) {
    console.log("");
    console.log(`Stored id:    ${run.id}`);
    console.log(`Expected id:  ${result.expectedId}`);
  }
  if (!result.hashMatches) {
    console.log("");
    console.log(`Stored hash:    ${run.hash}`);
    console.log(`Expected hash:  ${result.expectedHash}`);
  }
  if (!result.ok) {
    process.exit(1);
  }
}
