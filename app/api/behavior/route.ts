import { NextResponse } from "next/server";
import { hasLLM, judgeBehaviorWithLLM, magicWandWithLLM } from "@/components/todo/llmparse";

// 习惯实验室 · 行为集群的 AI 接口，两种用法：
//   { mode: "judge", text, aspiration? } → 判定这句话是愿望/结果/行为，不是行为就发散成候选行为
//   { mode: "wand", aspiration, existing? } → 魔法棒：从愿望直接发散一批候选行为
// 未配 LLM_API_KEY 返回 501，前端降级为"直接收进集群，不判定"。

export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 501 });
  }

  let mode: string;
  let text: string;
  let aspiration: string;
  let existing: string[];
  try {
    const body = await req.json();
    mode = String(body.mode ?? "judge");
    text = String(body.text ?? "").trim().slice(0, 200);
    aspiration = String(body.aspiration ?? "").trim().slice(0, 100);
    existing = Array.isArray(body.existing)
      ? (body.existing as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 30)
      : [];
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (mode === "wand") {
    if (!aspiration) return NextResponse.json({ error: "empty_aspiration" }, { status: 400 });
    const behaviors = await magicWandWithLLM(aspiration, existing);
    if (behaviors === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json({ behaviors });
  }

  if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
  const judgement = await judgeBehaviorWithLLM(text, aspiration || undefined);
  if (judgement === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
  return NextResponse.json(judgement);
}
