import { NextResponse } from "next/server";
import { hasLLM, magicWandWithLLM, shrinkWithLLM, sortBehaviorsWithLLM } from "@/components/todo/llmparse";

// 习惯实验室 · 行为集群的 AI 接口，两种用法：
//   { mode: "sort", items: [{id,text}], goal? } → 批量判定：愿望/成果/一次性/可重复/要戒掉
//   { mode: "wand", aspiration, existing?, context? } → 魔法棒：发散一批候选行为
// 未配 LLM_API_KEY 一律返回 501，前端各自降级。

const MAX_ITEMS = 40;

export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 501 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const mode = String(body.mode ?? "sort");

  if (mode === "wand") {
    const aspiration = String(body.aspiration ?? "").trim().slice(0, 120);
    if (!aspiration) return NextResponse.json({ error: "empty_aspiration" }, { status: 400 });
    const context = String(body.context ?? "").trim().slice(0, 120);
    const existing = Array.isArray(body.existing)
      ? (body.existing as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 30)
      : [];
    const behaviors = await magicWandWithLLM(aspiration, existing, context || undefined);
    if (behaviors === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json({ behaviors });
  }

  if (mode === "shrink") {
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
    const goal = String(body.goal ?? "").trim().slice(0, 120);
    const behaviors = await shrinkWithLLM(text, goal || undefined);
    if (behaviors === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json({ behaviors });
  }

  const items = Array.isArray(body.items)
    ? (body.items as unknown[])
        .map((it) => {
          const o = it as Record<string, unknown>;
          return { id: String(o?.id ?? "").trim(), text: String(o?.text ?? "").trim().slice(0, 200) };
        })
        .filter((it) => it.id && it.text)
        .slice(0, MAX_ITEMS)
    : [];
  if (items.length === 0) return NextResponse.json({ error: "empty_items" }, { status: 400 });

  const goal = String(body.goal ?? "").trim().slice(0, 120);
  const results = await sortBehaviorsWithLLM(items, goal || undefined);
  if (results === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
  return NextResponse.json({ results });
}
