import { NextResponse } from "next/server";
import { hasLLM, parseWithLLM } from "@/components/todo/llmparse";

// 自然语言时间记录 AI 解析（OpenAI 兼容接口：DeepSeek / 硅基流动均可）
// 环境变量：LLM_API_KEY（必填）、LLM_BASE_URL、LLM_MODEL，见 .env.local.example

export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 501 });
  }

  let text: string;
  let now: string | undefined;
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
    now = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(body.now)) ? String(body.now) : undefined;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  const entries = await parseWithLLM(text, now);
  if (entries === null) {
    return NextResponse.json({ error: "llm_error" }, { status: 502 });
  }
  return NextResponse.json({ entries });
}
