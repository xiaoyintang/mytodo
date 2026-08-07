import { NextResponse } from "next/server";
import {
  breakdownTaskWithLLM,
  clarifyBehaviorWithLLM,
  clarifyNextActionWithLLM,
  concreteWithLLM,
  hasLLM,
  magicWandWithLLM,
  shrinkWithLLM,
  sortBehaviorsWithLLM,
} from "@/components/todo/llmparse";

// 习惯实验室 · 行为集群的 AI 接口，两种用法：
//   { mode: "sort", items: [{id,text}], goal? } → 批量判定：愿望/成果/一次性/可重复/要戒掉
//   { mode: "wand", aspiration, existing?, context? } → 魔法棒：发散一批候选行为
//   { mode: "breakdown", text, goal? } → 把一个任务拆成子步骤（穷尽，不筛选）
//   { mode: "clarify-next", text, parentTask } → 检查当前下一步，只给一个问题和一个改写
//   { mode: "clarify-behavior", text, goal, behaviorType? } → 检查焦点地图候选行为的表达
// 未配 LLM_API_KEY 一律返回 501，前端各自降级。

const MAX_ITEMS = 40;

// 开思考的判定要跑十几秒，别让平台在中途掐断
export const maxDuration = 60;

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

  if (mode === "breakdown") {
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
    const goal = String(body.goal ?? "").trim().slice(0, 120);
    const subtasks = await breakdownTaskWithLLM(text, goal || undefined);
    if (subtasks === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json({ subtasks });
  }

  if (mode === "clarify-next") {
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
    const parentTask = String(body.parentTask ?? "").trim().slice(0, 200);
    if (!parentTask) return NextResponse.json({ error: "empty_parent_task" }, { status: 400 });
    const result = await clarifyNextActionWithLLM(text, parentTask);
    if (result === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json(result);
  }

  if (mode === "clarify-behavior") {
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
    const goal = String(body.goal ?? "").trim().slice(0, 200);
    if (!goal) return NextResponse.json({ error: "empty_goal" }, { status: 400 });
    const behaviorType = String(body.behaviorType ?? "").trim().slice(0, 20);
    const result = await clarifyBehaviorWithLLM(text, goal, behaviorType || undefined);
    if (result === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
    return NextResponse.json(result);
  }

  if (mode === "shrink" || mode === "concrete") {
    const text = String(body.text ?? "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
    const goal = String(body.goal ?? "").trim().slice(0, 120);
    const behaviors =
      mode === "concrete"
        ? await concreteWithLLM(text, goal || undefined)
        : await shrinkWithLLM(text, goal || undefined);
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
  // 自动判定图快（关思考）；手动「重判」图准（开思考，慢一点无所谓）
  const results = await sortBehaviorsWithLLM(items, goal || undefined, body.think === true);
  if (results === null) return NextResponse.json({ error: "llm_error" }, { status: 502 });
  return NextResponse.json({ results });
}
