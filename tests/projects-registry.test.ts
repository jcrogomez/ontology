import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadProjectRegistry,
  saveProjectRegistry,
  registerProject,
  touchProject,
  forgetProject,
  AmbiguousProjectNameError,
  projectsByRecency,
  partitionByLiveness,
  getProjectRegistryPath,
  ProjectRegistrySchema,
} from "../src/core/projects/registry.js";

// All tests redirect XDG_CONFIG_HOME to a tmp dir so they never touch the
// real ~/.config/ontology/projects.json.
let tmpHome: string;
let originalXdg: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "onto-registry-"));
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpHome;
});

afterEach(() => {
  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("project registry", () => {
  it("returns an empty registry when no file exists", () => {
    const reg = loadProjectRegistry();
    expect(reg.projects).toEqual([]);
    expect(reg.schemaVersion).toBe("0.1.0");
  });

  it("path resolves under XDG_CONFIG_HOME", () => {
    expect(getProjectRegistryPath()).toBe(path.join(tmpHome, "ontology", "projects.json"));
  });

  it("registers a new project and persists it", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-test-proj-"));
    try {
      const reg = registerProject({
        name: "demo",
        path: projectDir,
        rootNodeId: "node_0000_canon",
      });
      expect(reg.projects).toHaveLength(1);
      const entry = reg.projects[0]!;
      expect(entry.name).toBe("demo");
      expect(entry.path).toBe(path.resolve(projectDir));
      expect(entry.rootNodeId).toBe("node_0000_canon");

      // Round-trips through disk.
      const reloaded = loadProjectRegistry();
      expect(reloaded.projects).toHaveLength(1);
      expect(reloaded.projects[0]!.path).toBe(path.resolve(projectDir));
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("re-registering the same path updates the existing entry instead of duplicating", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-test-proj-"));
    try {
      registerProject({ name: "v1", path: projectDir });
      const reg = registerProject({ name: "v2", path: projectDir, rootNodeId: "node_0000_canon" });
      expect(reg.projects).toHaveLength(1);
      expect(reg.projects[0]!.name).toBe("v2");
      expect(reg.projects[0]!.rootNodeId).toBe("node_0000_canon");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("touchProject bumps lastOpenedAt", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-test-proj-"));
    try {
      const reg = registerProject({ name: "demo", path: projectDir });
      const before = reg.projects[0]!.lastOpenedAt;
      // Wait a millisecond so the timestamp string differs.
      await new Promise((r) => setTimeout(r, 5));
      const after = touchProject(projectDir);
      expect(after.projects[0]!.lastOpenedAt > before).toBe(true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("touchProject on unknown path is a no-op", () => {
    const reg = touchProject("/does/not/exist");
    expect(reg.projects).toEqual([]);
  });

  it("forgetProject removes by absolute path", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "onto-b-"));
    try {
      registerProject({ name: "a", path: a });
      registerProject({ name: "b", path: b });
      const { removed, registry } = forgetProject(a);
      expect(removed).toBe(1);
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0]!.name).toBe("b");
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
    }
  });

  it("forgetProject removes a unique name match", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "onto-b-"));
    try {
      registerProject({ name: "alpha", path: a });
      registerProject({ name: "beta", path: b });
      const { removed, registry } = forgetProject("alpha");
      expect(removed).toBe(1);
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0]!.name).toBe("beta");
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
    }
  });

  it("forgetProject throws AmbiguousProjectNameError on duplicate names", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "onto-b-"));
    const c = fs.mkdtempSync(path.join(os.tmpdir(), "onto-c-"));
    try {
      registerProject({ name: "duplicate", path: a });
      registerProject({ name: "duplicate", path: b });
      registerProject({ name: "keeper", path: c });
      expect(() => forgetProject("duplicate")).toThrow(AmbiguousProjectNameError);
      try {
        forgetProject("duplicate");
      } catch (err) {
        expect(err).toBeInstanceOf(AmbiguousProjectNameError);
        const e = err as AmbiguousProjectNameError;
        expect(e.projectName).toBe("duplicate");
        expect(e.matches.map((m) => m.path).sort()).toEqual(
          [path.resolve(a), path.resolve(b)].sort(),
        );
      }
      // Registry must be untouched on ambiguity.
      const reloaded = loadProjectRegistry();
      expect(reloaded.projects).toHaveLength(3);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
      fs.rmSync(c, { recursive: true, force: true });
    }
  });

  it("forgetProject prefers a path match over a coincidental name match", () => {
    // Two entries: one whose path is /<cwd>/conflict (matches path.resolve
    // of a bare argument from cwd), another whose name is "conflict". The
    // path match must win and only that entry is removed.
    const cwd = process.cwd();
    const pathHit = path.join(cwd, "conflict");
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "onto-other-"));
    try {
      registerProject({ name: "by-path", path: pathHit });
      registerProject({ name: "conflict", path: otherDir });
      const { removed, registry } = forgetProject("conflict");
      expect(removed).toBe(1);
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0]!.name).toBe("conflict");
      expect(registry.projects[0]!.path).toBe(path.resolve(otherDir));
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("forgetProject is a no-op when nothing matches", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    try {
      registerProject({ name: "alpha", path: a });
      const { removed, registry } = forgetProject("nonexistent");
      expect(removed).toBe(0);
      expect(registry.projects).toHaveLength(1);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
    }
  });

  it("projectsByRecency sorts most-recent-first without mutating input", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "onto-b-"));
    try {
      const reg = ProjectRegistrySchema.parse({
        projects: [
          { name: "old", path: a, createdAt: "2020-01-01T00:00:00.000Z", lastOpenedAt: "2020-01-01T00:00:00.000Z" },
          { name: "new", path: b, createdAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: "2026-05-09T00:00:00.000Z" },
        ],
      });
      const sorted = projectsByRecency(reg);
      expect(sorted.map((p) => p.name)).toEqual(["new", "old"]);
      // Input is preserved.
      expect(reg.projects.map((p) => p.name)).toEqual(["old", "new"]);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
    }
  });

  it("partitionByLiveness separates entries with a valid .ontology/state.json from those without", () => {
    const live = fs.mkdtempSync(path.join(os.tmpdir(), "onto-live-"));
    const stalePath = path.join(os.tmpdir(), "onto-stale-does-not-exist");
    fs.mkdirSync(path.join(live, ".ontology"));
    fs.writeFileSync(path.join(live, ".ontology", "state.json"), "{}\n");
    try {
      const reg = ProjectRegistrySchema.parse({
        projects: [
          { name: "live", path: live, createdAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
          { name: "stale", path: stalePath, createdAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
        ],
      });
      const { live: liveEntries, stale: staleEntries } = partitionByLiveness(reg);
      expect(liveEntries).toHaveLength(1);
      expect(liveEntries[0]!.name).toBe("live");
      expect(staleEntries).toHaveLength(1);
      expect(staleEntries[0]!.name).toBe("stale");
    } finally {
      fs.rmSync(live, { recursive: true, force: true });
    }
  });

  it("partitionByLiveness treats .ontology/ without state.json as stale", () => {
    // A hand-created `.ontology/` (or one whose state.json was deleted)
    // is not a usable project — onto open would crash or silently re-init.
    const shallow = fs.mkdtempSync(path.join(os.tmpdir(), "onto-shallow-"));
    fs.mkdirSync(path.join(shallow, ".ontology"));
    try {
      const reg = ProjectRegistrySchema.parse({
        projects: [
          { name: "shallow", path: shallow, createdAt: "2026-01-01T00:00:00.000Z", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
        ],
      });
      const { live, stale } = partitionByLiveness(reg);
      expect(live).toHaveLength(0);
      expect(stale).toHaveLength(1);
      expect(stale[0]!.name).toBe("shallow");
    } finally {
      fs.rmSync(shallow, { recursive: true, force: true });
    }
  });

  it("saveProjectRegistry creates the parent dir if missing", () => {
    const reg = ProjectRegistrySchema.parse({});
    saveProjectRegistry(reg);
    expect(fs.existsSync(getProjectRegistryPath())).toBe(true);
  });
});
