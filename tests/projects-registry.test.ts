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

  it("forgetProject removes by name (all matches)", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "onto-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "onto-b-"));
    try {
      registerProject({ name: "duplicate", path: a });
      registerProject({ name: "duplicate", path: b });
      registerProject({ name: "keeper", path: fs.mkdtempSync(path.join(os.tmpdir(), "onto-c-")) });
      const { removed, registry } = forgetProject("duplicate");
      expect(removed).toBe(2);
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0]!.name).toBe("keeper");
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
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

  it("partitionByLiveness separates entries with a real .ontology/ from those without", () => {
    const live = fs.mkdtempSync(path.join(os.tmpdir(), "onto-live-"));
    const stalePath = path.join(os.tmpdir(), "onto-stale-does-not-exist");
    fs.mkdirSync(path.join(live, ".ontology"));
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

  it("saveProjectRegistry creates the parent dir if missing", () => {
    const reg = ProjectRegistrySchema.parse({});
    saveProjectRegistry(reg);
    expect(fs.existsSync(getProjectRegistryPath())).toBe(true);
  });
});
