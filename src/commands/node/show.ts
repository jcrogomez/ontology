import { assertOntologyProject, loadNodeById } from "../../core/project/load.js";
import { box, kvLines } from "../../core/render/box.js";
import { bold, dim, byKind, byLevel, byStatus, byManifestation, color } from "../../core/render/style.js";

export async function nodeShowCommand(id: string, options: { json?: boolean } = {}): Promise<void> {
  assertOntologyProject();
  const node = loadNodeById(id);

  if (!node) {
    console.error(`✖ Node not found: ${id}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({ node }, null, 2));
    return;
  }

  const identity = kvLines([
    ["ID",            node.id],
    ["Label",         node.label],
    ["Kind",          byKind(node.kind)],
    ["Status",        byStatus(node.status)],
    ["Abstraction",   byLevel(node.coordinates.abstraction)],
    ["Plane",         color(node.coordinates.plane, "cyan")],
    ["Manifestation", byManifestation(node.coordinates.manifestation)],
    ["Time",          String(node.coordinates.time)],
    ["Branch",        color(node.coordinates.branch, "cyan")],
    ["Frozen",        node.integrity.frozen ? color("yes", "yellow") : dim("no")],
    ["Hash",          dim(node.integrity.hash)],
  ]);

  const renderContextList = (title: string, list: ReadonlyArray<unknown>): string[] => {
    if (list.length === 0) return [`${bold(title)}: ${dim("none")}`];
    const lines = [`${bold(title)}:`];
    for (const item of list) {
      const obj = item as Record<string, unknown>;
      const key = (obj.key as string | undefined) ?? (obj.source as string | undefined);
      lines.push(`  ${color("-", "gray")} ${key ?? JSON.stringify(item)}`);
    }
    return lines;
  };

  const contextLines = [
    bold("Context"),
    ...renderContextList("Provides", node.context.provides).map((l) => `  ${l}`),
    ...renderContextList("Requires", node.context.requires).map((l) => `  ${l}`),
    ...renderContextList("Forbids", node.context.forbids).map((l) => `  ${l}`),
    ...renderContextList("Optional", node.context.optional).map((l) => `  ${l}`),
  ];

  const rulesLines: string[] = [bold("Rules")];
  if (node.rules.length === 0) {
    rulesLines.push(`  ${dim("none")}`);
  } else {
    node.rules.forEach((rule, idx) => {
      const cleanRule = rule.replace(/^\d+\.\s*/, "");
      rulesLines.push(`  ${dim(`${idx + 1}.`)} ${cleanRule}`);
    });
  }

  console.log(box(
    [...identity, null, ...contextLines, null, ...rulesLines],
    { title: bold(`NODE  ${node.id}`), footer: dim(node.integrity.hash.slice(0, 16)) },
  ));
}
