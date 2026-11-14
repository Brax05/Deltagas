import net from "node:net";
import tls from "node:tls";

export interface ChatStore {
  readonly backend: "upstash-rest" | "redis-resp" | "memory";
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<void>;
  incrWithExpire(key: string, ttlSeconds: number): Promise<number>;
  incr(key: string): Promise<number>;
}

interface MemoryEntry {
  value: string;
  expiresAtMs: number | null;
}

/**
 * Almacén en memoria compatible con TTL e incrementos atómicos para desarrollo
 * local, pruebas automatizadas o respaldo seguro si Redis no está disponible.
 */
export class InMemoryChatStore implements ChatStore {
  readonly backend = "memory" as const;
  private readonly map = new Map<string, MemoryEntry>();

  private cleanupIfExpired(key: string): MemoryEntry | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && Date.now() >= entry.expiresAtMs) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.cleanupIfExpired(key)?.value ?? null;
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    const expiresAtMs =
      ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.map.set(key, { value, expiresAtMs });
  }

  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.cleanupIfExpired(key);
    if (!existing) {
      await this.setEx(key, ttlSeconds, "1");
      return 1;
    }
    const next = (Number.parseInt(existing.value, 10) || 0) + 1;
    this.map.set(key, {
      value: String(next),
      expiresAtMs: existing.expiresAtMs,
    });
    return next;
  }

  async incr(key: string): Promise<number> {
    const existing = this.cleanupIfExpired(key);
    const next = (existing ? Number.parseInt(existing.value, 10) || 0 : 0) + 1;
    this.map.set(key, {
      value: String(next),
      expiresAtMs: existing?.expiresAtMs ?? null,
    });
    return next;
  }
}

/**
 * Cliente REST para Upstash Redis sin dependencias externas.
 */
export class UpstashRestChatStore implements ChatStore {
  readonly backend = "upstash-rest" as const;

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fallbackStore: ChatStore = new InMemoryChatStore(),
  ) {}

  private async pipeline(
    commands: Array<Array<string | number>>,
  ): Promise<Array<{ result: unknown; error?: string }>> {
    const endpoint = `${this.restUrl.replace(/\/$/, "")}/pipeline`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      throw new Error(`Upstash HTTP ${res.status}`);
    }
    return (await res.json()) as Array<{ result: unknown; error?: string }>;
  }

  async get(key: string): Promise<string | null> {
    try {
      const results = await this.pipeline([["GET", key]]);
      const val = results[0]?.result;
      return typeof val === "string" ? val : null;
    } catch {
      return this.fallbackStore.get(key);
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    try {
      await this.pipeline([["SET", key, value, "EX", ttlSeconds]]);
    } catch {
      await this.fallbackStore.setEx(key, ttlSeconds, value);
    }
  }

  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    try {
      const results = await this.pipeline([
        ["INCR", key],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]);
      const count = Number(results[0]?.result);
      if (Number.isFinite(count)) return count;
      throw new Error("Invalid INCR response");
    } catch {
      return this.fallbackStore.incrWithExpire(key, ttlSeconds);
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const results = await this.pipeline([["INCR", key]]);
      const count = Number(results[0]?.result);
      if (Number.isFinite(count)) return count;
      throw new Error("Invalid INCR response");
    } catch {
      return this.fallbackStore.incr(key);
    }
  }
}

function encodeRespCommand(args: Array<string | number>): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`, "utf8")];
  for (const arg of args) {
    const strBuf = Buffer.from(String(arg), "utf8");
    parts.push(Buffer.from(`$${strBuf.length}\r\n`, "utf8"));
    parts.push(strBuf);
    parts.push(Buffer.from("\r\n", "utf8"));
  }
  return Buffer.concat(parts);
}

type RespValue = string | number | null | RespValue[];

function parseRespReply(
  buf: Buffer,
  offset = 0,
): { value: RespValue; nextOffset: number } | null {
  if (offset >= buf.length) return null;
  const prefix = String.fromCharCode(buf[offset]!);
  const lineEnd = buf.indexOf("\r\n", offset);
  if (lineEnd === -1) return null;

  const line = buf.subarray(offset + 1, lineEnd).toString("utf8");
  const afterLine = lineEnd + 2;

  if (prefix === "+" || prefix === "-") {
    return { value: line, nextOffset: afterLine };
  }
  if (prefix === ":") {
    return { value: Number.parseInt(line, 10), nextOffset: afterLine };
  }
  if (prefix === "$") {
    const len = Number.parseInt(line, 10);
    if (len === -1) return { value: null, nextOffset: afterLine };
    if (afterLine + len + 2 > buf.length) return null;
    const str = buf.subarray(afterLine, afterLine + len).toString("utf8");
    return { value: str, nextOffset: afterLine + len + 2 };
  }
  if (prefix === "*") {
    const count = Number.parseInt(line, 10);
    if (count === -1) return { value: null, nextOffset: afterLine };
    const arr: RespValue[] = [];
    let cursor = afterLine;
    for (let i = 0; i < count; i++) {
      const parsed = parseRespReply(buf, cursor);
      if (!parsed) return null;
      arr.push(parsed.value);
      cursor = parsed.nextOffset;
    }
    return { value: arr, nextOffset: cursor };
  }
  return null;
}

/**
 * Cliente RESP2 liviano para REDIS_URL (`redis://` o `rediss://`) con failover
 * automático a memoria si la conexión falla en serverless o desarrollo.
 */
export class RespRedisChatStore implements ChatStore {
  readonly backend = "redis-resp" as const;

  constructor(
    private readonly redisUrl: string,
    private readonly fallbackStore: ChatStore = new InMemoryChatStore(),
  ) {}

  private async runPipeline(
    commands: Array<Array<string | number>>,
  ): Promise<RespValue[]> {
    const parsed = new URL(this.redisUrl);
    const useTls = parsed.protocol === "rediss:";
    const host = parsed.hostname;
    const port = Number.parseInt(parsed.port || "6379", 10);
    const password = parsed.password ? decodeURIComponent(parsed.password) : "";
    const username = parsed.username ? decodeURIComponent(parsed.username) : "";
    const dbStr = parsed.pathname.replace(/^\//, "");
    const db = dbStr ? Number.parseInt(dbStr, 10) : 0;

    const setupCount =
      (password ? 1 : 0) + (db > 0 ? 1 : 0);
    const allCommands: Array<Array<string | number>> = [];
    if (password) {
      allCommands.push(
        username ? ["AUTH", username, password] : ["AUTH", password],
      );
    }
    if (db > 0) {
      allCommands.push(["SELECT", db]);
    }
    allCommands.push(...commands, ["QUIT"]);

    return new Promise((resolve, reject) => {
      const socket = useTls
        ? tls.connect({ host, port, servername: host })
        : net.createConnection({ host, port });

      const chunks: Buffer[] = [];
      let settled = false;

      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      socket.setTimeout(2000, () => fail(new Error("Redis timeout")));
      socket.on("error", fail);

      socket.once("connect", () => {
        const payload = Buffer.concat(allCommands.map(encodeRespCommand));
        socket.write(payload);
      });

      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        const full = Buffer.concat(chunks);
        const replies: RespValue[] = [];
        let cursor = 0;
        while (replies.length < allCommands.length) {
          const item = parseRespReply(full, cursor);
          if (!item) return;
          replies.push(item.value);
          cursor = item.nextOffset;
        }
        settled = true;
        socket.destroy();
        resolve(replies.slice(setupCount, setupCount + commands.length));
      });
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      const res = await this.runPipeline([["GET", key]]);
      return typeof res[0] === "string" ? res[0] : null;
    } catch {
      return this.fallbackStore.get(key);
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    try {
      await this.runPipeline([["SET", key, value, "EX", ttlSeconds]]);
    } catch {
      await this.fallbackStore.setEx(key, ttlSeconds, value);
    }
  }

  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    try {
      const res = await this.runPipeline([
        ["INCR", key],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]);
      const count = Number(res[0]);
      if (Number.isFinite(count)) return count;
      throw new Error("Invalid INCR");
    } catch {
      return this.fallbackStore.incrWithExpire(key, ttlSeconds);
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const res = await this.runPipeline([["INCR", key]]);
      const count = Number(res[0]);
      if (Number.isFinite(count)) return count;
      throw new Error("Invalid INCR");
    } catch {
      return this.fallbackStore.incr(key);
    }
  }
}

let singletonStore: ChatStore | null = null;

export function getDefaultChatStore(): ChatStore {
  if (singletonStore) return singletonStore;

  const fallback = new InMemoryChatStore();
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    singletonStore = new UpstashRestChatStore(upstashUrl, upstashToken, fallback);
    return singletonStore;
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    if (redisUrl.startsWith("https://")) {
      const parsed = new URL(redisUrl);
      const token = decodeURIComponent(parsed.password || parsed.username);
      const cleanUrl = `${parsed.protocol}//${parsed.host}`;
      if (token) {
        singletonStore = new UpstashRestChatStore(cleanUrl, token, fallback);
        return singletonStore;
      }
    }
    if (redisUrl.startsWith("redis://") || redisUrl.startsWith("rediss://")) {
      singletonStore = new RespRedisChatStore(redisUrl, fallback);
      return singletonStore;
    }
  }

  singletonStore = fallback;
  return singletonStore;
}
