import * as fs from "node:fs";
import * as path from "node:path";

// IO adapter fixture. Predicted: io-bound + operational-glue via
// /src/core/fs/. Touches filesystem, encodes implicit ordering
// (read → maybe parse → maybe write), and carries cache-invalidation
// semantics that resist intent extraction — small timing and
// concurrency details are precisely the kind of operational
// specificity Phase ε expects to be intent-resistant.

export interface CacheEntry<T> {
  storedAt: string;
  payload: T;
}

export function readCache<T>(cacheDir: string, key: string): T | undefined {
  const filePath = path.join(cacheDir, `${key}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed.payload;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(cacheDir: string, key: string, payload: T): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const entry: CacheEntry<T> = {
    storedAt: new Date().toISOString(),
    payload,
  };
  const filePath = path.join(cacheDir, `${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
}
