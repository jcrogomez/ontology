import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { ensureDir, writeJson } from "../fs/json.js";

// Global project registry: a small JSON file outside any single .ontology/
// project so the launcher (`onto open`) can list previously created or opened
// projects. The path follows XDG_CONFIG_HOME with a fallback to ~/.config —
// the same convention git, ripgrep and most modern CLIs use, and it keeps
// the registry out of the repo so cloning a project does not pollute another
// machine's list.
//
// What is in the registry:
//   - one entry per project the user has init'd or opened with this CLI
//   - the absolute path is the canonical key (a project moved on disk gets
//     a new entry; the old one becomes stale)
//   - lastOpenedAt is bumped on every open so the picker can sort by recency
//
// What is NOT in the registry:
//   - the contents of any project (those still live in `.ontology/` per
//     project)
//   - any secret or credential
//   - any process state (the registry is durable, not session)

export const ProjectRegistryEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  rootNodeId: z.string().startsWith("node_").optional(),
  createdAt: z.string(),
  lastOpenedAt: z.string(),
});

export type ProjectRegistryEntry = z.infer<typeof ProjectRegistryEntrySchema>;

export const ProjectRegistrySchema = z.object({
  schemaVersion: z.literal("0.1.0").default("0.1.0"),
  projects: z.array(ProjectRegistryEntrySchema).default([]),
});

export type ProjectRegistry = z.infer<typeof ProjectRegistrySchema>;

export function getProjectRegistryPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "ontology", "projects.json");
}

export function loadProjectRegistry(): ProjectRegistry {
  const registryPath = getProjectRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return ProjectRegistrySchema.parse({});
  }
  const raw = fs.readFileSync(registryPath, "utf-8");
  if (raw.trim().length === 0) {
    return ProjectRegistrySchema.parse({});
  }
  const parsed = JSON.parse(raw);
  return ProjectRegistrySchema.parse(parsed);
}

export function saveProjectRegistry(registry: ProjectRegistry): void {
  const registryPath = getProjectRegistryPath();
  ensureDir(path.dirname(registryPath));
  writeJson(registryPath, registry);
}

// Add or refresh a project entry. Path is the canonical key — adding the
// same path twice updates the existing entry rather than duplicating it.
// Returns the registry after the change.
export function registerProject(input: {
  name: string;
  path: string;
  rootNodeId?: string;
}): ProjectRegistry {
  const absPath = path.resolve(input.path);
  const registry = loadProjectRegistry();
  const now = new Date().toISOString();

  const existingIdx = registry.projects.findIndex((p) => p.path === absPath);
  if (existingIdx >= 0) {
    const existing = registry.projects[existingIdx]!;
    registry.projects[existingIdx] = {
      ...existing,
      name: input.name,
      rootNodeId: input.rootNodeId ?? existing.rootNodeId,
      lastOpenedAt: now,
    };
  } else {
    registry.projects.push({
      name: input.name,
      path: absPath,
      rootNodeId: input.rootNodeId,
      createdAt: now,
      lastOpenedAt: now,
    });
  }

  saveProjectRegistry(registry);
  return registry;
}

// Bump lastOpenedAt without touching name/rootNodeId — used by `onto open`
// when the user picks an existing entry.
export function touchProject(absPath: string): ProjectRegistry {
  const registry = loadProjectRegistry();
  const idx = registry.projects.findIndex((p) => p.path === path.resolve(absPath));
  if (idx < 0) return registry;
  registry.projects[idx] = {
    ...registry.projects[idx]!,
    lastOpenedAt: new Date().toISOString(),
  };
  saveProjectRegistry(registry);
  return registry;
}

// Thrown by forgetProject when the argument is a name that matches more
// than one entry. The caller can inspect `matches` to render the
// conflicting paths and prompt the user to re-run with an absolute path.
export class AmbiguousProjectNameError extends Error {
  public readonly projectName: string;
  public readonly matches: ReadonlyArray<ProjectRegistryEntry>;
  constructor(projectName: string, matches: ReadonlyArray<ProjectRegistryEntry>) {
    super(
      `Multiple projects named "${projectName}" are registered — re-run with an absolute path to disambiguate.`,
    );
    this.name = "AmbiguousProjectNameError";
    this.projectName = projectName;
    this.matches = matches;
  }
}

// Drop a project from the registry. Does NOT delete the project itself —
// only the registry entry. Accepts either an absolute path or a name:
//
//   - Path-first: if the argument resolves to a path that matches an
//     entry's `path`, exactly that entry is removed (even if other
//     entries share its name).
//   - Otherwise, name match: exactly one match → remove it; zero matches
//     → no-op; two or more → throw AmbiguousProjectNameError so the
//     caller can disambiguate, rather than silently deleting all of them.
export function forgetProject(pathOrName: string): { removed: number; registry: ProjectRegistry } {
  const registry = loadProjectRegistry();
  const absCandidate = path.resolve(pathOrName);

  const pathMatchIdx = registry.projects.findIndex((p) => p.path === absCandidate);
  if (pathMatchIdx >= 0) {
    registry.projects.splice(pathMatchIdx, 1);
    saveProjectRegistry(registry);
    return { removed: 1, registry };
  }

  const nameMatches = registry.projects.filter((p) => p.name === pathOrName);
  if (nameMatches.length === 0) {
    return { removed: 0, registry };
  }
  if (nameMatches.length > 1) {
    throw new AmbiguousProjectNameError(pathOrName, nameMatches);
  }
  registry.projects = registry.projects.filter((p) => p.name !== pathOrName);
  saveProjectRegistry(registry);
  return { removed: 1, registry };
}

// Sort projects by lastOpenedAt descending (most recent first). Returns a
// new array; does not mutate the input.
export function projectsByRecency(registry: ProjectRegistry): ProjectRegistryEntry[] {
  return [...registry.projects].sort((a, b) =>
    a.lastOpenedAt < b.lastOpenedAt ? 1 : a.lastOpenedAt > b.lastOpenedAt ? -1 : 0,
  );
}

// Filter the registry to entries whose path still has a valid Ontology
// project (`.ontology/` plus `state.json`). Stale entries are reported
// alongside the live ones so the picker can render them differently. The
// state.json check guards against hand-created or partially-deleted
// `.ontology/` dirs that would crash `onto open` or silently re-init.
export function partitionByLiveness(
  registry: ProjectRegistry,
): { live: ProjectRegistryEntry[]; stale: ProjectRegistryEntry[] } {
  const live: ProjectRegistryEntry[] = [];
  const stale: ProjectRegistryEntry[] = [];
  for (const entry of registry.projects) {
    const ontologyDir = path.join(entry.path, ".ontology");
    const stateFile = path.join(ontologyDir, "state.json");
    if (fs.existsSync(ontologyDir) && fs.existsSync(stateFile)) {
      live.push(entry);
    } else {
      stale.push(entry);
    }
  }
  return { live, stale };
}
