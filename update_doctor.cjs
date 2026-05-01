const fs = require('fs');
let code = fs.readFileSync('src/commands/doctor.ts', 'utf8');

// Replace top imports
code = code.replace(
  `import * as fs from "node:fs";`,
  `import * as fs from "node:fs";\nimport { execFileSync } from "node:child_process";`
);

// Replace npm fetching
code = code.replace(
  `const checks = {
    runtime: {
      node: process.version,
      npm: process.env.npm_config_user_agent?.split(' ')[0] || "unknown",
    },
    project: {
      ontologyDir: fs.existsSync(paths.ontologyDir),
      state: fs.existsSync(paths.statePath),
      events: fs.existsSync(paths.eventsPath),
      edges: fs.existsSync(paths.edgesPath),
      nodes: fs.existsSync(paths.nodesDir),
      modelsRegistry: fs.existsSync(paths.modelsRegistryPath),
      processorsRegistry: fs.existsSync(paths.processorsRegistryPath),
    },`,
  `let npmVersion = "unknown";
  try {
    npmVersion = execFileSync("npm", ["-v"], { encoding: "utf8" }).trim();
  } catch (e) {
    // fallback
  }

  const checks = {
    runtime: {
      node: process.version,
      npm: npmVersion,
    },
    project: {
      ontologyDir: fs.existsSync(paths.ontologyDir) ? "found" : "missing",
      statePath: fs.existsSync(paths.statePath) ? "found" : "missing",
      eventsPath: fs.existsSync(paths.eventsPath) ? "found" : "missing",
      edgesPath: fs.existsSync(paths.edgesPath) ? "found" : "missing",
      nodesDir: fs.existsSync(paths.nodesDir) ? "found" : "missing",
      modelsRegistryPath: fs.existsSync(paths.modelsRegistryPath) ? "found" : "missing",
      processorsRegistryPath: fs.existsSync(paths.processorsRegistryPath) ? "found" : "missing",
    },`
);

// Replace initialization check
code = code.replace(
  `const isInitialized = checks.project.state && checks.project.events && checks.project.nodes;`,
  `const isInitialized = checks.project.statePath === "found" && checks.project.eventsPath === "found" && checks.project.nodesDir === "found";`
);

// Replace JSON output
code = code.replace(
  `    console.log(JSON.stringify({
      module: "doctor",
      checks
    }, null, 2));`,
  `    console.log(JSON.stringify({
      runtime: checks.runtime,
      project: checks.project,
      network: checks.network,
      status: {
        observabilityReady: isInitialized
      }
    }, null, 2));`
);

// Replace CLI checks
code = code.replace(
  `  const renderCheck = (name: string, found: boolean) => {
    const status = found ? "✔ found" : "✖ missing";
    console.log(\`  \${name.padEnd(34)} \${status}\`);
  };

  renderCheck(".ontology:", checks.project.ontologyDir);
  renderCheck(".ontology/state.json:", checks.project.state);
  renderCheck(".ontology/events.jsonl:", checks.project.events);
  renderCheck(".ontology/edges.jsonl:", checks.project.edges);
  renderCheck(".ontology/nodes/:", checks.project.nodes);
  renderCheck(".ontology/models/registry.json:", checks.project.modelsRegistry);
  renderCheck(".ontology/processors/registry.json:", checks.project.processorsRegistry);`,
  `  const renderCheck = (name: string, statusText: string) => {
    const status = statusText === "found" ? "✔ found" : "✖ missing";
    console.log(\`  \${name.padEnd(34)} \${status}\`);
  };

  renderCheck(".ontology:", checks.project.ontologyDir);
  renderCheck(".ontology/state.json:", checks.project.statePath);
  renderCheck(".ontology/events.jsonl:", checks.project.eventsPath);
  renderCheck(".ontology/edges.jsonl:", checks.project.edgesPath);
  renderCheck(".ontology/nodes/:", checks.project.nodesDir);
  renderCheck(".ontology/models/registry.json:", checks.project.modelsRegistryPath);
  renderCheck(".ontology/processors/registry.json:", checks.project.processorsRegistryPath);`
);

fs.writeFileSync('src/commands/doctor.ts', code);
