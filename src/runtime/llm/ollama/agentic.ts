// Agentic tool-loop for the Ollama adapter.
//
// Gives a LOCAL Ollama model real web access — no Anthropic/Gemini. The model
// (qwen2.5 / llama3.1 / granite, all tool-capable) decides when to call
// `web_search` and `fetch_page`; this module executes those tools against
// DuckDuckGo (no API key) and feeds the results back, looping until the model
// produces a final answer (or maxSteps is hit). Citations gathered along the
// way are appended as a FUENTES list — same contract as the frontier
// web_search paths, but 100% local + free.
//
// Wired in from createOllamaAdapter.generate() when request.webSearch is set
// (declared on a node via the WEB_SEARCH capability rule).

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface AgenticResult {
  text: string;
  steps: number;
  sources: string[];
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Busca en internet. Devuelve una lista de resultados con titulo, url y un fragmento. Usalo para encontrar datos, historia, recetas, cifras y fuentes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta de busqueda" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description:
        "Abre una URL y devuelve el texto principal de la pagina. Usalo para leer una fuente que encontraste con web_search.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "La URL completa a abrir" },
        },
        required: ["url"],
      },
    },
  },
];

// --- Tool implementations (DuckDuckGo HTML endpoint, sin API key) -----------

function decodeDdgHref(href: string): string {
  // DDG result hrefs look like //duckduckgo.com/l/?uddg=<encoded-url>&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return href;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function webSearch(
  query: string,
  sources: string[],
): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `q=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return `web_search error: HTTP ${res.status}`;
  const html = await res.text();

  const results: { title: string; url: string; snippet: string }[] = [];
  const anchorRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gs;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripTags(sm[1]));
  let am: RegExpExecArray | null;
  let i = 0;
  while ((am = anchorRe.exec(html)) !== null && results.length < 5) {
    const rawHref = am[1];
    // Salta anuncios (DDG los sirve via y.js / ad_domain / bing aclick).
    if (/\/y\.js|ad_domain=|ad_provider=|bing\.com\/aclick/i.test(rawHref)) continue;
    const realUrl = decodeDdgHref(rawHref);
    if (/duckduckgo\.com|bing\.com\/aclick/i.test(realUrl)) continue; // no resuelto / ad
    const title = stripTags(am[2]);
    if (!title) continue;
    results.push({ title, url: realUrl, snippet: snippets[i] ?? "" });
    i++;
  }
  if (results.length === 0) return "web_search: sin resultados.";

  for (const r of results) sources.push(`${r.title} (${r.url})`);
  return results
    .map((r, n) => `${n + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join("\n");
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OntologyBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `fetch_page error: HTTP ${res.status}`;
    const html = await res.text();
    // Quita script/style, luego tags. Trunca para no reventar el contexto.
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    return stripTags(cleaned).slice(0, 3000);
  } catch (e) {
    return `fetch_page error: ${(e as Error).message}`;
  }
}

// Fallback: muchos modelos locales (qwen2.5-coder, etc.) NO emiten tool_calls
// nativos — escupen la llamada como texto JSON en el contenido. Parseamos eso
// para que el loop funcione igual.
function parseToolCallsFromContent(content: string): ToolCall[] {
  if (!content) return [];
  let c = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const tryObj = (o: unknown): ToolCall | null => {
    if (o && typeof o === "object") {
      const r = o as { name?: unknown; arguments?: unknown; parameters?: unknown };
      if (typeof r.name === "string") {
        const args = (r.arguments ?? r.parameters ?? {}) as Record<string, unknown>;
        return { function: { name: r.name, arguments: args } };
      }
    }
    return null;
  };
  // 1) el contenido entero es el JSON de la llamada
  try {
    const o = JSON.parse(c);
    const t = tryObj(o);
    if (t) return [t];
    if (Array.isArray(o)) return o.map(tryObj).filter((x): x is ToolCall => x !== null);
  } catch {
    /* sigue */
  }
  // 2) hay un bloque {...} con "name" y "arguments" embebido en texto
  const m = c.match(/\{[\s\S]*?"name"[\s\S]*?"arguments"[\s\S]*?\}\s*\}?/);
  if (m) {
    try {
      const t = tryObj(JSON.parse(m[0]));
      if (t) return [t];
    } catch {
      /* nada */
    }
  }
  return [];
}

async function execTool(
  name: string,
  args: Record<string, unknown>,
  sources: string[],
): Promise<string> {
  if (name === "web_search") {
    return webSearch(String(args.query ?? ""), sources);
  }
  if (name === "fetch_page") {
    return fetchPage(String(args.url ?? ""));
  }
  return `Herramienta desconocida: ${name}`;
}

// --- The loop --------------------------------------------------------------

export async function runAgenticLoop(opts: {
  host: string;
  model: string;
  system?: string;
  prompt: string;
  maxSteps?: number;
  numCtx?: number;
}): Promise<AgenticResult> {
  const maxSteps = opts.maxSteps ?? 6;
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });

  const sources: string[] = [];
  let steps = 0;

  for (steps = 0; steps < maxSteps; steps++) {
    const res = await fetch(`${opts.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages,
        tools: TOOLS,
        stream: false,
        options: opts.numCtx ? { num_ctx: opts.numCtx } : {},
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama /api/chat HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { message: ChatMessage };
    const msg = data.message;
    // Nativos primero; si no, parsea la llamada del texto (modelos locales).
    const calls =
      msg.tool_calls && msg.tool_calls.length > 0
        ? msg.tool_calls
        : parseToolCallsFromContent(msg.content ?? "");

    if (calls.length === 0) {
      // Respuesta final.
      let text = msg.content ?? "";
      const uniq = [...new Set(sources)];
      if (uniq.length > 0) {
        text += `\n\nFUENTES:\n${uniq.map((s) => `- ${s}`).join("\n")}`;
      }
      return { text, steps: steps + 1, sources: uniq };
    }

    // El modelo pidio herramientas: ejecutalas y devuelve resultados.
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const out = await execTool(
        call.function.name,
        call.function.arguments ?? {},
        sources,
      );
      messages.push({ role: "tool", content: out, tool_name: call.function.name });
    }
  }

  // Tope alcanzado: pide una sintesis final sin mas herramientas.
  const res = await fetch(`${opts.host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Ya no busques mas. Con lo que tienes, escribe la respuesta final ahora.",
        },
      ],
      stream: false,
      options: opts.numCtx ? { num_ctx: opts.numCtx } : {},
    }),
  });
  const data = (await res.json()) as { message: ChatMessage };
  let text = data.message?.content ?? "";
  const uniq = [...new Set(sources)];
  if (uniq.length > 0) {
    text += `\n\nFUENTES:\n${uniq.map((s) => `- ${s}`).join("\n")}`;
  }
  return { text, steps: maxSteps, sources: uniq };
}
