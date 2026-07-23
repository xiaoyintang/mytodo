import { NextResponse } from "next/server";
import { hasLLM } from "@/components/todo/llmparse";
import { parseTasksWithLLM } from "@/components/todo/llmtask";

// 自然语言建任务：{ text, today, weekday } → { tasks: [...] }
export async function POST(req: Request) {
  if (!hasLLM()) {
    return NextResponse.json({ error: "no_api_key" }, { status: 501 });
  }

  let text = "";
  let today = "";
  let weekday = "";
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
    today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? String(body.today) : "";
    weekday = String(body.weekday ?? "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!text || !today) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const tasks = await parseTasksWithLLM(text, today, weekday);
  if (tasks === null) {
    return NextResponse.json({ error: "llm_error" }, { status: 502 });
  }
  return NextResponse.json({ tasks });
}
