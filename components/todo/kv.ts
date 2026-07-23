// Upstash / Vercel KV 的 REST 读写（服务端用）。同步码 → { tasks, entries } JSON。
type Kv = { url: string; token: string };

export function kvConfig(): Kv | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function kvCommand(kv: Kv, command: string[]) {
  return fetch(kv.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
}

export async function kvGetSync(kv: Kv, code: string): Promise<unknown> {
  const res = await kvCommand(kv, ["GET", `sync:${code}`]);
  if (!res.ok) throw new Error("kv_read_failed");
  const json = await res.json();
  return json?.result ? JSON.parse(json.result) : null;
}

export async function kvSetSync(kv: Kv, code: string, payload: unknown): Promise<void> {
  const res = await kvCommand(kv, ["SET", `sync:${code}`, JSON.stringify(payload ?? {})]);
  if (!res.ok) throw new Error("kv_write_failed");
}
