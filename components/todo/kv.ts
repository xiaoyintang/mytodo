// Upstash / Vercel KV 的 REST 读写（服务端用）。同步码 → { tasks, entries } JSON。
import { createHash } from "node:crypto";
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
  return (await kvReadSync(kv, code)).data;
}

export async function kvReadSync(kv: Kv, code: string): Promise<{ data: unknown; revision: string | null }> {
  const res = await kvCommand(kv, ["GET", `sync:${code}`]);
  if (!res.ok) throw new Error("kv_read_failed");
  const json = await res.json();
  if (json.error) throw new Error("kv_read_failed");
  const raw = json?.result;
  return { data: raw ? JSON.parse(raw) : null, revision: raw ? createHash("sha1").update(raw).digest("hex") : null };
}

// Compare and write atomically, including data produced by older clients.
export async function kvCompareAndSetSync(kv: Kv, code: string, payload: unknown, revision: string | null): Promise<boolean> {
  const script = `local old = redis.call('GET', KEYS[1])
if old then
  if redis.sha1hex(old) ~= ARGV[1] then return 0 end
elseif ARGV[1] ~= '' then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;
  const res = await kvCommand(kv, ["EVAL", script, "1", `sync:${code}`, revision ?? "", JSON.stringify(payload ?? {})]);
  if (!res.ok) throw new Error("kv_write_failed");
  const json = await res.json();
  if (json.error || (json.result !== 0 && json.result !== 1)) throw new Error("kv_write_failed");
  return json.result === 1;
}
