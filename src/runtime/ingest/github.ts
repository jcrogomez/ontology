// GitHub fetch wrapper for `onto ingest --from-pr/--from-issue`.
//
// Lifts a pull request or issue into a provider-agnostic `IntentSource`
// that the ingest prose path turns into a node_create proposal. Uses the
// `gh` CLI (already the user's authenticated GitHub surface) rather than
// re-implementing auth + REST. Fail-loud: a missing/unauthenticated `gh`
// produces a clear, actionable error instead of a cryptic spawn failure.

import { execFileSync } from "node:child_process";

export interface IntentSourceFile {
  path: string;
}

// A change/requirement lifted from GitHub, ready for prose extraction.
export interface IntentSource {
  kind: "pr" | "issue";
  number: number;
  title: string;
  body: string;
  url: string;
  state?: string;
  author?: string;
  // PRs only: the files the change touches (used for best-effort
  // structural edges to existing code nodes). Undefined for issues.
  files?: IntentSourceFile[];
}

// Raw shapes returned by `gh ... view --json`. Fields are best-effort —
// `gh` omits keys it can't populate, so everything is optional here.
interface GhAuthor {
  login?: string;
  name?: string;
}
interface GhPrJson {
  number?: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  author?: GhAuthor;
  files?: Array<{ path?: string }>;
}
interface GhIssueJson {
  number?: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  author?: GhAuthor;
}

// Run `gh <args>` and return stdout, mapping the common failure modes to
// actionable messages. Throws on any non-zero exit.
function runGh(args: string[]): string {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: unknown) {
    const e = err as { code?: string; status?: number; stderr?: Buffer | string };
    if (e?.code === "ENOENT") {
      throw new Error(
        "The GitHub CLI `gh` was not found on PATH. Install it (https://cli.github.com) and run `gh auth login` to ingest PRs/issues.",
      );
    }
    const stderr = typeof e?.stderr === "string" ? e.stderr : e?.stderr?.toString() ?? "";
    if (/auth|logged in|authentication/i.test(stderr)) {
      throw new Error(`\`gh\` is not authenticated. Run \`gh auth login\`. (gh said: ${stderr.trim()})`);
    }
    throw new Error(`\`gh ${args.join(" ")}\` failed: ${stderr.trim() || (err as Error).message}`);
  }
}

function parseGhJson<T>(raw: string, what: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Could not parse \`gh\` JSON output for ${what}.`);
  }
}

function repoArgs(repo?: string): string[] {
  return repo ? ["--repo", repo] : [];
}

export function fetchPullRequest(num: number, repo?: string): IntentSource {
  const raw = runGh([
    "pr", "view", String(num),
    ...repoArgs(repo),
    "--json", "number,title,body,url,state,author,files",
  ]);
  const j = parseGhJson<GhPrJson>(raw, `PR #${num}`);
  return {
    kind: "pr",
    number: j.number ?? num,
    title: j.title ?? `PR #${num}`,
    body: j.body ?? "",
    url: j.url ?? "",
    state: j.state,
    author: j.author?.login ?? j.author?.name,
    files: (j.files ?? [])
      .map((f) => f.path)
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .map((path) => ({ path })),
  };
}

export function fetchIssue(num: number, repo?: string): IntentSource {
  const raw = runGh([
    "issue", "view", String(num),
    ...repoArgs(repo),
    "--json", "number,title,body,url,state,author",
  ]);
  const j = parseGhJson<GhIssueJson>(raw, `issue #${num}`);
  return {
    kind: "issue",
    number: j.number ?? num,
    title: j.title ?? `Issue #${num}`,
    body: j.body ?? "",
    url: j.url ?? "",
    state: j.state,
    author: j.author?.login ?? j.author?.name,
  };
}
