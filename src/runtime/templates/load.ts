// Template loader + lister with referential + poset integrity checks.
//
// Templates ship as data under repoRoot/templates/*.json (added to
// package.json#files). The directory resolves the same way in dev
// (src/runtime/templates/load.ts) and in the published build
// (dist/runtime/templates/load.js): both sit three levels under the repo
// root, so `../../../templates` lands on repoRoot/templates either way.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TemplateSchema,
  CANON_KEY,
  type Template,
  type TemplateNode,
} from "./schema.js";
import { validateEdgeDirection, type AbstractionLevel } from "../graph/poset.js";

export function templatesDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../templates");
}

export interface TemplateSummary {
  name: string;
  description: string;
}

// List every valid template by name + description. Files that fail to parse
// are skipped (a malformed contributed template shouldn't break discovery).
export function listTemplates(): TemplateSummary[] {
  const dir = templatesDir();
  if (!fs.existsSync(dir)) return [];
  const out: TemplateSummary[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = TemplateSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")));
      if (parsed.success) out.push({ name: parsed.data.name, description: parsed.data.description });
    } catch {
      // skip unreadable / invalid JSON
    }
  }
  return out;
}

function availableNames(): string {
  const names = listTemplates().map((t) => t.name);
  return names.length > 0 ? names.join(", ") : "(none found)";
}

// Load one template by name and validate its internal integrity. Throws a
// clear, actionable error when the template is missing, malformed, or
// structurally inconsistent (so a bad --template never half-creates a project).
export function loadTemplate(name: string): Template {
  const dir = templatesDir();
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown template "${name}". Available: ${availableNames()}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err: unknown) {
    throw new Error(`Template "${name}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const parsed = TemplateSchema.safeParse(raw);
  if (!parsed.success) {
    const summary = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Template "${name}" failed schema validation: ${summary}`);
  }
  const template = parsed.data;

  if (template.name !== name) {
    throw new Error(`Template file ${name}.json declares name "${template.name}"; filename and name must match.`);
  }

  validateTemplateIntegrity(template);
  return template;
}

// Referential + poset integrity. Pure; throws on the first violation.
//   - keys are unique
//   - a node's `parent` (when a key) is defined EARLIER in the list
//   - every edge endpoint is "canon" or a known node key
//   - every edge satisfies the abstraction-poset direction rule
export function validateTemplateIntegrity(template: Template): void {
  const nodeByKey = new Map<string, TemplateNode>();
  const seen = new Set<string>();

  for (const node of template.nodes) {
    if (node.key === CANON_KEY) {
      throw new Error(`Template "${template.name}": node key "${CANON_KEY}" is reserved.`);
    }
    if (nodeByKey.has(node.key)) {
      throw new Error(`Template "${template.name}": duplicate node key "${node.key}".`);
    }
    if (node.parent !== undefined && node.parent !== CANON_KEY && !seen.has(node.parent)) {
      throw new Error(
        `Template "${template.name}": node "${node.key}" references parent "${node.parent}" which is not defined earlier (list parents before children).`,
      );
    }
    nodeByKey.set(node.key, node);
    seen.add(node.key);
  }

  const levelOf = (key: string): AbstractionLevel =>
    key === CANON_KEY ? "canon" : (nodeByKey.get(key)!.level as AbstractionLevel);

  for (const edge of template.edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (endpoint !== CANON_KEY && !nodeByKey.has(endpoint)) {
        throw new Error(`Template "${template.name}": edge endpoint "${endpoint}" is not a known node key or "canon".`);
      }
    }
    const direction = validateEdgeDirection({
      sourceLevel: levelOf(edge.from),
      targetLevel: levelOf(edge.to),
      edgeType: edge.type,
    });
    if (!direction.ok) {
      throw new Error(`Template "${template.name}": edge ${edge.from} →(${edge.type})→ ${edge.to} is invalid. ${direction.reason}`);
    }
  }
}
