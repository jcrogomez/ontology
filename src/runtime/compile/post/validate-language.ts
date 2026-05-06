import { spawnSync } from "node:child_process";

// Post-write validation: parse-check a compiled artifact against its declared
// `technical.language`.
//
// Axiom 8: "contradictions must become explicit as validation failures".
// Without this step, when a model returns text that does not parse as the
// declared language (the chat-tuned models' favorite failure mode — see
// PR #103 for fence extraction; this PR is the second half), the broken
// `.py` lands silently on disk and only blows up later when someone runs
// it. Promote that to an explicit compile-time validation failure so the
// audit trail (events.jsonl + persisted run) records *why* the compile
// stopped, not just that an artifact was written.
//
// Validators shell out to the canonical parser for each language because
// reimplementing parsers in-process would be a rabbit hole and a moving
// target. If the parser binary is not on PATH the result is `skipped` —
// CI runs without `python3` should not fail this step; that's the user's
// environment talking, not a real validation outcome.

export interface ValidateLanguageOptions {
  // Absolute path to the artifact written by writeArtifact.
  absolutePath: string;
  // The node's declared language (node.technical.language). Compared
  // case-insensitively.
  language?: string;
}

export type ValidateLanguageResult =
  | { status: "ok" }
  | { status: "failed"; message: string; stderr?: string }
  | { status: "skipped"; reason: string };

export function validateLanguage(options: ValidateLanguageOptions): ValidateLanguageResult {
  const lang = options.language?.toLowerCase().trim();
  if (!lang) {
    return { status: "skipped", reason: "no language declared" };
  }

  const validator = VALIDATORS[lang];
  if (!validator) {
    return { status: "skipped", reason: `no validator registered for language=${lang}` };
  }

  return validator(options.absolutePath);
}

type Validator = (absolutePath: string) => ValidateLanguageResult;

const VALIDATORS: Record<string, Validator> = {
  python: (p) => syntaxCheckExternal({
    bin: "python3",
    // ast.parse raises SyntaxError on malformed sources; non-zero exit is
    // the failure signal. The script reads the file itself rather than
    // piping content through stdin so file paths in error messages are
    // pointable.
    args: [
      "-c",
      "import ast, sys; ast.parse(open(sys.argv[1]).read(), filename=sys.argv[1])",
      p,
    ],
    notFoundMessage: "python3 not on PATH",
  }),
};

interface ExternalCheck {
  bin: string;
  args: string[];
  notFoundMessage: string;
}

function syntaxCheckExternal(check: ExternalCheck): ValidateLanguageResult {
  const r = spawnSync(check.bin, check.args, { encoding: "utf-8" });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    return { status: "skipped", reason: check.notFoundMessage };
  }
  if (r.error) {
    return { status: "failed", message: r.error.message };
  }
  if (r.status === 0) {
    return { status: "ok" };
  }
  const stderr = (r.stderr || "").trim();
  return {
    status: "failed",
    message: stderr.split("\n").pop() || `exit code ${r.status}`,
    stderr: stderr || undefined,
  };
}
