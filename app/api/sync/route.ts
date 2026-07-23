import { NextResponse } from "next/server";
import { kvConfig, kvGetSync, kvSetSync } from "@/components/todo/kv";

// 同步码云存储：把 { tasks, entries } 整体 JSON 存在键值库里，用同步码当 key。
// 环境变量：KV_REST_API_URL / KV_REST_API_TOKEN（Vercel KV / Upstash，见 .env.local.example）
// 未配置时返回 501，前端提示"云同步未配置"，不影响本地使用。

const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

export async function GET(req: Request) {
  const kv = kvConfig();
  if (!kv) return NextResponse.json({ error: "sync_not_configured" }, { status: 501 });

  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "bad_code" }, { status: 400 });

  try {
    const data = await kvGetSync(kv, code);
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
    await kvSetSync(kv, code, payload);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "sync_write_failed" }, { status: 502 });
  }
}
