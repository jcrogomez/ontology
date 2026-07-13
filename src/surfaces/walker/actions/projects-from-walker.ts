import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadProjectRegistry,
  projectsByRecency,
  partitionByLiveness,
  registerProject,
  touchProject,
  type ProjectRegistryEntry,
} from "../../../kernel/core/projects/registry.js";
import { loadState } from "../../../kernel/core/project/load.js";
import { initCommand } from "../../commands/init.js";

export type WalkerProjectRow =
  | { kind: "project"; entry: ProjectRegistryEntry; live: boolean; current: boolean }
  | { kind: "create" };

export interface WalkerProjectsResult {
  ok: boolean;
  message?: string;
  rows: WalkerProjectRow[];
}

export interface OpenWalkerProjectResult {
  ok: boolean;
  message?: string;
  cwd?: string;
  rootNodeId?: string;
}

export interface CreateWalkerProjectResult extends OpenWalkerProjectResult {
  name?: string;
}

export function projectsForWalker(activeCwd: string): WalkerProjectsResult {
  try {
    const registry = loadProjectRegistry();
    const sorted = projectsByRecency(registry);
    const { live, stale } = partitionByLiveness({ ...registry, projects: sorted });
    const activePath = path.resolve(activeCwd);
    return {
      ok: true,
      rows: [
        ...live.map((entry) => ({
          kind: "project" as const,
          entry,
          live: true,
          current: path.resolve(entry.path) === activePath,
        })),
        ...stale.map((entry) => ({
          kind: "project" as const,
          entry,
          live: false,
          current: false,
        })),
        { kind: "create" as const },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      rows: [{ kind: "create" }],
    };
  }
}

export function openProjectFromWalker(projectPath: string): OpenWalkerProjectResult {
  const absPath = path.resolve(projectPath);
  const ontologyDir = path.join(absPath, ".ontology");
  if (!fs.existsSync(path.join(ontologyDir, "state.json"))) {
    return { ok: false, message: `No Ontology project at ${absPath}` };
  }

  try {
    const state = loadState(absPath);
    registerProject({
      name: path.basename(absPath),
      path: absPath,
      rootNodeId: state.rootNodeId,
    });
    touchProject(absPath);
    return { ok: true, cwd: absPath, rootNodeId: state.rootNodeId };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createProjectFromWalker(input: {
  name: string;
  baseDir: string;
}): Promise<CreateWalkerProjectResult> {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, message: "Project name is required" };
  }
  if (name.includes("/") || name.includes("\\")) {
    return { ok: false, message: "Use a simple folder name here; paths come later." };
  }

  const projectPath = path.resolve(input.baseDir, name);
  if (fs.existsSync(projectPath)) {
    return { ok: false, message: `Path already exists: ${projectPath}` };
  }

  fs.mkdirSync(projectPath, { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(projectPath);
    await initCommand({ name });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      name,
    };
  } finally {
    process.chdir(previousCwd);
  }

  const opened = openProjectFromWalker(projectPath);
  return { ...opened, name };
}
