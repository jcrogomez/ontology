import { describe, it, expect } from "vitest";
import http from "node:http";
import { noTimeoutFetch } from "../src/runtime/llm/ollama/fetch-shim.js";

// Spin up an ephemeral loopback HTTP server for the duration of one
// test. Returns its base URL and a close() to tear it down.
function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("noTimeoutFetch (Ollama node:http shim)", () => {
  it("round-trips a GET into a parsed JSON Response", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: ["a", "b"] }));
    });
    try {
      const response = await noTimeoutFetch(`${server.url}/api/tags`);
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.json()).toEqual({ models: ["a", "b"] });
    } finally {
      await server.close();
    }
  });

  it("sends a POST body the server can read back", async () => {
    const server = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ received: Buffer.concat(chunks).toString("utf8") }),
        );
      });
    });
    try {
      const response = await noTimeoutFetch(`${server.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "m", messages: [] }),
      });
      const parsed = (await response.json()) as { received: string };
      expect(JSON.parse(parsed.received)).toEqual({
        model: "m",
        messages: [],
      });
    } finally {
      await server.close();
    }
  });

  it("resolves even when the server withholds response headers (no headers timeout)", async () => {
    // The whole point of the shim: a slow prefill delays the response
    // headers. undici's global fetch would eventually abort with
    // UND_ERR_HEADERS_TIMEOUT; node:http imposes no such default. We
    // delay a beat (proving headers-delay is tolerated, not the full
    // 300 s, which is impractical to wait for in a unit test).
    const server = await startServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ done: true }));
      }, 300);
    });
    try {
      const response = await noTimeoutFetch(`${server.url}/api/chat`, {
        method: "POST",
        body: "{}",
      });
      expect(await response.json()).toEqual({ done: true });
    } finally {
      await server.close();
    }
  });

  it("rejects with an AbortError when the signal aborts mid-flight", async () => {
    const server = await startServer((_req, res) => {
      // Never respond — the request can only end via the abort signal.
      void res;
    });
    try {
      const controller = new AbortController();
      const pending = noTimeoutFetch(`${server.url}/api/chat`, {
        method: "POST",
        body: "{}",
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await server.close();
    }
  });
});
