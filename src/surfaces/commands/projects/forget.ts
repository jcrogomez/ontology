import { AmbiguousProjectNameError, forgetProject } from "../../../kernel/core/projects/registry.js";

export interface ProjectsForgetOptions {
  json?: boolean;
}

export async function projectsForgetCommand(
  pathOrName: string,
  options: ProjectsForgetOptions = {},
): Promise<void> {
  let removed: number;
  try {
    removed = forgetProject(pathOrName).removed;
  } catch (err) {
    if (err instanceof AmbiguousProjectNameError) {
      if (options.json) {
        console.log(
          JSON.stringify({
            ok: false,
            ambiguous: true,
            target: pathOrName,
            matches: err.matches.map((m) => ({ name: m.name, path: m.path })),
          }),
        );
      } else {
        console.error(`Multiple projects named "${pathOrName}" are registered:`);
        for (const m of err.matches) {
          console.error(`  - ${m.path}`);
        }
        console.error(`Re-run with an absolute path to disambiguate.`);
      }
      process.exit(1);
    }
    throw err;
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: removed > 0, removed, target: pathOrName }));
    return;
  }

  if (removed === 0) {
    console.log(`No registry entry matched "${pathOrName}" (nothing forgotten).`);
    return;
  }

  console.log(`Forgot ${removed} project entr${removed === 1 ? "y" : "ies"} matching "${pathOrName}".`);
  console.log(`(The project itself was not deleted — only the registry entry.)`);
}
