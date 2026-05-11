import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eventTypeColor } from "../src/commands/events/tail.js";

// The colour helpers gate on colorsEnabled(), which inspects process.env
// and stdout.isTTY. Under vitest stdout is not a TTY, so we set
// FORCE_COLOR for the scope of the suite to make the SGR escapes
// observable in the returned string.
let originalForceColor: string | undefined;
beforeAll(() => {
  originalForceColor = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
});
afterAll(() => {
  if (originalForceColor === undefined) {
    delete process.env.FORCE_COLOR;
  } else {
    process.env.FORCE_COLOR = originalForceColor;
  }
});

// The function emits raw ANSI escape sequences. Tests assert on the
// embedded SGR code rather than the high-level colour name so we don't
// couple to the chalk-like helper's internal mapping.
const SGR = {
  red: "\x1b[31m",
  redBright: "\x1b[91m",
  green: "\x1b[32m",
  greenBright: "\x1b[92m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

describe("eventTypeColor — negative-outcome patterns win over the compilation_ catch-all", () => {
  it("compilation_failed is red, not green (regression for the prefix-catch-all foot-gun)", () => {
    const out = eventTypeColor("compilation_failed");
    expect(out).toContain(SGR.red);
    expect(out).not.toContain(SGR.greenBright);
  });

  it("compilation_rejected is red, not green", () => {
    const out = eventTypeColor("compilation_rejected");
    expect(out).toContain(SGR.red);
    expect(out).not.toContain(SGR.greenBright);
  });

  it("compilation_succeeded still hits the greenBright catch-all", () => {
    const out = eventTypeColor("compilation_succeeded");
    expect(out).toContain(SGR.greenBright);
  });

  it("run_persisted still hits the greenBright catch-all (suffix match)", () => {
    const out = eventTypeColor("run_persisted");
    expect(out).toContain(SGR.greenBright);
  });

  it("preserves existing mappings: system_init magenta", () => {
    expect(eventTypeColor("system_init")).toContain(SGR.magenta);
  });

  it("preserves existing mappings: node_created green", () => {
    expect(eventTypeColor("node_created")).toContain(SGR.green);
  });

  it("preserves existing mappings: proposal_rejected red", () => {
    expect(eventTypeColor("proposal_rejected")).toContain(SGR.red);
  });

  it("preserves existing mappings: node_updated yellow", () => {
    expect(eventTypeColor("node_updated")).toContain(SGR.yellow);
  });

  it("unknown event types pass through with no ANSI escape", () => {
    expect(eventTypeColor("totally_made_up_event")).toBe("totally_made_up_event");
  });
});
