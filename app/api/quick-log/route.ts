import { NextResponse } from "next/server";
import { kvConfig, kvGetSync, kvSetSync } from "@/components/todo/kv";
import { parseWithLLM } from "@/components/todo/llmparse";
import { parseTimeEntries } from "@/components/todo/nlparse";
import { matchTaskByTitle, formatMinutes } from "@/components/todo/time";
import type { ISODate, Task, TimeEntry } from "@/components/todo/types";

// 一步到位记录接口（给 iOS 快捷指令 / Siri 用）：
//   收到 { code, text, date?, now? } → 解析（AI 优先，规则兜底）→ 追加到该同步码的云端数据
//   → 返回一句可朗读的中文小结 { ok, message }
// date/now 由快捷指令传入手机本地时间（yyyy-MM-dd / HH:mm）；缺省按 UTC+8 兜底。

const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function nowInUTC8(): { date: string; time: string } {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export async function POST(req: Request) {
  const kv = kvConfig();
  if (!kv) return NextResponse.json({ ok: false, message: "云同步未配置" }, { status: 501 });

  let code = "";
  let text = "";
  let date = "";
  let now = "";
  try {
    const body = await req.json();
    code = String(body.code ?? "").trim();
    text = String(body.text ?? "").trim();
    date = String(body.date ?? "").trim();
    now = String(body.now ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  if (!CODE_RE.test(code)) return NextResponse.json({ ok: false, message: "同步码无效" }, { status: 400 });
  if (!text) return NextResponse.json({ ok: false, message: "没听到内容" }, { status: 400 });

  const fallback = nowInUTC8();
  const targetDate = DATE_RE.test(date) ? date : fallback.date;
  const nowTime = TIME_RE.test(now) ? now : fallback.time;

  // 解析：AI 优先，规则兜底
  let parsed = await parseWithLLM(text, nowTime);
  if (!parsed) parsed = parseTimeEntries(text, nowTime);
  if (!parsed || parsed.length === 0) {
    return NextResponse.json({ ok: false, message: "没识别出时间记录，可以说得具体点，比如“看书两小时”" });
  }

  // 读云端 → 追加 → 写回
  let data: unknown;
  try {
    data = await kvGetSync(kv, code);
  } catch {
    return NextResponse.json({ ok: false, message: "读取云端失败" }, { status: 502 });
  }
  const cloud = (data ?? {}) as { tasks?: Task[]; entries?: TimeEntry[] };
  const tasks: Task[] = Array.isArray(cloud.tasks) ? cloud.tasks : [];
  const entries: TimeEntry[] = Array.isArray(cloud.entries) ? cloud.entries : [];

  const added: TimeEntry[] = parsed.map((p, i) => {
    const matched = matchTaskByTitle(p.title, targetDate, tasks);
    return {
      id: `e-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      date: targetDate as ISODate,
      title: p.title,
      minutes: p.minutes,
      startTime: p.startTime,
      endTime: p.endTime,
      taskId: matched?.id,
    };
  });

  try {
    await kvSetSync(kv, code, { tasks, entries: [...entries, ...added], updatedAt: Date.now() });
  } catch {
    return NextResponse.json({ ok: false, message: "写入云端失败" }, { status: 502 });
  }

  const summary = added.map((e) => `${e.title} ${formatMinutes(e.minutes)}`).join("，");
  return NextResponse.json({
    ok: true,
    count: added.length,
    message: `已记录 ${added.length} 笔：${summary}`,
  });
}
