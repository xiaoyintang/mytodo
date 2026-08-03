import { NextResponse } from "next/server";
import { classifyWithLLM, hasLLM } from "@/components/todo/llmparse";

// 事项名 → 大类（正事/娱乐/休息）AI 分类。
// 只在关键词规则认不出来时调用；未配 LLM_API_KEY 返回 501，前端降级为"未分类"。

const MAX_TITLES = 40;

export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 501 });
  }

  let titles: string[];
  try {
    const body = await req.json();
    if (!Array.isArray(body.titles)) throw new Error("bad titles");
    const cleaned = (body.titles as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean);
    titles = [...new Set(cleaned)].slice(0, MAX_TITLES);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (titles.length === 0) {
    return NextResponse.json({ error: "empty_titles" }, { status: 400 });
  }

  const categories = await classifyWithLLM(titles);
  if (categories === null) {
    return NextResponse.json({ error: "llm_error" }, { status: 502 });
  }
  return NextResponse.json({ categories });
}
