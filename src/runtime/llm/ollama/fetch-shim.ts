import http from "node:http";
import https from "node:https";

// A `fetch`-compatible function over node:http/node:https that imposes
// NO headers timeout.
//
// Node's global `fetch` (undici) applies a 300 s `headersTimeout`: if
// the server takes longer than that to send response *headers*, the
// request aborts with `UND_ERR_HEADERS_TIMEOUT`. A large local Ollama
// model is prefill-bound on constrained hardware — a ~6.5 KB verify
// prompt on granite4.1:8b on an 8 GB Mac measured 360 s before the
// first byte — so the verify-refine loop dies mid-dispatch. `compile`
// dodges it only because its per-node prompts are shorter. undici is
// not importable here (not a dependency) and node has no public knob to
// raise the global dispatcher's headers timeout, so we route the Ollama
// client through node:http, which has no such default.
//
// We buffer the full response body and return a standard `Response`.
// That is faithful for the Ollama adapter, which only issues
// non-streaming chat calls (no `stream` flag) plus small GET probes
// (`/api/ps`, `/api/tags`); it would defeat incremental streaming, so
// do not reuse this for a streaming path. The optional `signal` is
// honored for cancellation; there is otherwise no timeout — a slow
// prefill simply waits.

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

function toPlainHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const obj: Record<string, string> = {};
    h.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...(h as Record<string, string>) };
}

function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

function noTimeoutFetchImpl(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const transport = url.protocol === "https:" ? https : http;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = toPlainHeaders(init?.headers ?? undefined);
  const body =
    init?.body === undefined || init?.body === null
      ? undefined
      : String(init.body);
  const signal = init?.signal ?? undefined;

  // node:http defaults to chunked transfer when no Content-Length is
  // set; set it explicitly so servers that prefer a length get one.
  if (body !== undefined && headers["Content-Length"] === undefined) {
    headers["Content-Length"] = String(Buffer.byteLength(body));
  }

  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const req = transport.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) responseHeaders.append(key, v);
          } else if (value !== undefined) {
            responseHeaders.set(key, value);
          }
        }
        const status = res.statusCode ?? 502;
        const payload = NULL_BODY_STATUS.has(status)
          ? null
          : Buffer.concat(chunks);
        resolve(
          new Response(payload, {
            status,
            statusText: res.statusMessage ?? "",
            headers: responseHeaders,
          }),
        );
      });
      res.on("error", reject);
    });

    req.on("error", reject);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => req.destroy(abortError()),
        { once: true },
      );
    }

    if (body !== undefined) req.write(body);
    req.end();
  });
}

// The Ollama client's `Config.fetch` is typed as `typeof fetch`. Our
// implementation satisfies the call signature it actually uses; the
// double cast sidesteps incidental shape differences (e.g. a
// `preconnect` method) between lib variants.
export const noTimeoutFetch = noTimeoutFetchImpl as unknown as typeof fetch;
