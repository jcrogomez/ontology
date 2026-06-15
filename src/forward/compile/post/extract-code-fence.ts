// Extracts the body of a fenced code block from an LLM response.
//
// Chat-tuned models often wrap generated code in markdown fences and surround
// it with prose ("Here's the code:", "Hope this helps!"). When the focal node
// declares `manifestation: "code"` the prose is not part of the artifact —
// it would land verbatim in a `.py` file and break `python3` at parse time.
//
// This helper is a pure projection: given the dispatcher's text and the
// node's declared language, return the most relevant fenced block, or the
// input unchanged when no fence is present. It never throws and never
// signals failure; "no fence" is a legitimate case (the mock provider's
// identity-functor output, or a model that emitted bare code).
//
// Selection rules, in order:
//   1. If `language` is provided AND a fence with the matching info string
//      exists, take the FIRST such fence's body.
//   2. Otherwise, take the FIRST fence's body regardless of info string
//      (covers fences with no info string, or with a non-matching one).
//   3. Otherwise return `text` unchanged.
//
// Body normalization: the fence's body is returned with any single trailing
// newline trimmed (markdown fences conventionally include one) so the
// artifact byte count matches the visible code.
//
// The mock provider's `code_sketch` path returns the prompt verbatim. For
// hello-world (`print("hello world")`) the prompt has no fence, so this
// helper returns the input unchanged and the mock's identity-functor
// behavior is preserved end-to-end.

const FENCE_RE = /^(`{3,}|~{3,})[ \t]*([^\n`~]*)\n([\s\S]*?)\n\1[ \t]*$/gm;

export interface ExtractCodeFenceOptions {
  // The dispatcher's response text.
  text: string;
  // The node's declared language tag (node.technical.language). Lower-cased
  // before matching against the fence info string.
  language?: string;
}

export interface ExtractCodeFenceResult {
  // The body of the chosen fence, or the input text unchanged.
  content: string;
  // Whether a fence was found and used.
  extracted: boolean;
  // The info string of the chosen fence, when extracted.
  fenceInfo?: string;
}

export function extractCodeFence(options: ExtractCodeFenceOptions): ExtractCodeFenceResult {
  const text = options.text;
  const lang = options.language?.toLowerCase().trim() || "";

  const matches: { info: string; body: string }[] = [];
  // Reset lastIndex per call — module-level regexes with /g remember state.
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(text)) !== null) {
    matches.push({ info: m[2].trim().toLowerCase(), body: m[3] });
  }

  if (matches.length === 0) {
    return { content: text, extracted: false };
  }

  let chosen = matches[0];
  if (lang) {
    const langMatch = matches.find((f) => fenceInfoMatches(f.info, lang));
    if (langMatch) chosen = langMatch;
  }

  return {
    content: chosen.body,
    extracted: true,
    fenceInfo: chosen.info,
  };
}

// Markdown fence info strings come in flavors: "python", "py", "python3",
// "python title=foo.py". Match conservatively on the first whitespace-delimited
// token, with a small alias table for the common case.
function fenceInfoMatches(info: string, lang: string): boolean {
  if (!info) return false;
  const head = info.split(/\s+/)[0];
  if (head === lang) return true;
  return ALIASES[lang]?.has(head) ?? false;
}

const ALIASES: Record<string, Set<string>> = {
  python: new Set(["py", "python3"]),
  typescript: new Set(["ts"]),
  javascript: new Set(["js", "node"]),
  shell: new Set(["sh", "bash", "zsh"]),
  bash: new Set(["sh", "shell", "zsh"]),
  rust: new Set(["rs"]),
  ruby: new Set(["rb"]),
  markdown: new Set(["md"]),
  yaml: new Set(["yml"]),
};
