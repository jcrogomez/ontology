import { forgetProject } from "../../core/projects/registry.js";

export interface ProjectsForgetOptions {
  json?: boolean;
}

export async function projectsForgetCommand(
  pathOrName: string,
  options: ProjectsForgetOptions = {},
): Promise<void> {
  const { removed } = forgetProject(pathOrName);

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
