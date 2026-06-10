import * as path from "node:path";

// These paths define the physical layout of the semantic network. Future commands must use this map instead of hardcoding .ontology paths.

export function getOntologyPaths(cwd = process.cwd()) {
  const ontologyDir = path.join(cwd, ".ontology");
  const nodesDir = path.join(ontologyDir, "nodes");
  const assetsDir = path.join(ontologyDir, "assets");
  const modelsDir = path.join(ontologyDir, "models");
  const processorsDir = path.join(ontologyDir, "processors");
  const contextsDir = path.join(ontologyDir, "contexts");
  const artifactsDir = path.join(ontologyDir, "artifacts");
  const reportsDir = path.join(ontologyDir, "reports");
  const runsDir = path.join(ontologyDir, "runs");
  const proposalsDir = path.join(ontologyDir, "proposals");
  const draftsDir = path.join(ontologyDir, "work", "drafts");

  return {
    cwd,
    ontologyDir,
    statePath: path.join(ontologyDir, "state.json"),
    eventsPath: path.join(ontologyDir, "events.jsonl"),
    edgesPath: path.join(ontologyDir, "edges.jsonl"),
    runsDir,
    proposalsDir,
    draftsDir,
    nodesDir,
    assetsDir,
    imagesDir: path.join(assetsDir, "images"),
    audioDir: path.join(assetsDir, "audio"),
    videoDir: path.join(assetsDir, "video"),
    filesDir: path.join(assetsDir, "files"),
    datasetsDir: path.join(assetsDir, "datasets"),
    modelsDir,
    modelsRegistryPath: path.join(modelsDir, "registry.json"),
    processorsDir,
    processorsRegistryPath: path.join(processorsDir, "registry.json"),
    presetsDir: path.join(ontologyDir, "presets"),
    contextsDir,
    contextSnapshotsDir: path.join(contextsDir, "snapshots"),
    artifactsDir,
    generatedArtifactsDir: path.join(artifactsDir, "generated"),
    buildsDir: path.join(ontologyDir, "builds"),
    driftDir: path.join(ontologyDir, "drift"),
    driftSnapshotPath: path.join(ontologyDir, "drift", "snapshot.json"),
    reportsDir,
    validationReportsDir: path.join(reportsDir, "validations"),
    compilationReportsDir: path.join(reportsDir, "compilations"),
  };
}
