import { NextResponse } from "next/server";

// 同步码云存储：把 { tasks, entries } 整体 JSON 存在键值库里，用同步码当 key。
// 后端用 Upstash Redis / Vercel KV 的 REST 接口（二选一，环境变量名都兼容）：
//   KV_REST_API_URL / KV_REST_API_TOKEN           （Vercel KV / Marketplace 自动注入）
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN（直接用 Upstash 时）
// 未配置时返回 501，前端提示"云同步未配置"，不影响本地使用。

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

// 同步码：4-64 位字母数字，防止奇怪 key
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

async function kvCommand(kv: { url: string; token: string }, command: string[]) {
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

export async function GET(req: Request) {
  const kv = kvConfig();
  if (!kv) return NextResponse.json({ error: "sync_not_configured" }, { status: 501 });

  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "bad_code" }, { status: 400 });

  try {
    const res = await kvCommand(kv, ["GET", `sync:${code}`]);
    if (!res.ok) return NextResponse.json({ error: "sync_read_failed" }, { status: 502 });
    const json = await res.json();
    const data = json?.result ? JSON.parse(json.result) : null;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "sync_read_failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const kv = kvConfig();
  if (!kv) return NextResponse.json({ error: "sync_not_configured" }, { status: 501 });

  let code: string;
  let payload: unknown;
  try {
    const body = await req.json();
    code = String(body.code ?? "");
    payload = body.payload;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "bad_code" }, { status: 400 });

  try {
    const res = await kvCommand(kv, ["SET", `sync:${code}`, JSON.stringify(payload ?? {})]);
    if (!res.ok) return NextResponse.json({ error: "sync_write_failed" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "sync_write_failed" }, { status: 502 });
  }
}
