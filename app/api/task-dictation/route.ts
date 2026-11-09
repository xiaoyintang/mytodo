import { createHash } from "node:crypto";
import { kvConfig } from "@/components/todo/kv";

export const runtime = "nodejs";
export const maxDuration = 45;

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
const maxBytes = 44 + 60 * 16000 * 2;
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  let source: URL;
  try { source = new URL(origin || ""); } catch { return fail("请从本应用开始听写", 403); }
  const local = process.env.NODE_ENV === "development" && loopback.has(source.hostname);
  if (source.host !== req.headers.get("host") || (!local && source.protocol !== "https:")) return fail("请从本应用开始听写", 403);
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) return fail("云端听写尚未配置", 503);
  if (req.headers.get("content-type") !== "audio/wav") return fail("需要 WAV 录音", 415);
  const size = Number(req.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 44 || size > maxBytes) return fail("录音为空或过长", 413);
  const audio = await req.blob();
  if (audio.size !== size) return fail("录音未收完整", 400);
  // Accept only the 16 kHz mono PCM that our recorder produces.
  const header = Buffer.from(await audio.slice(0, 44).arrayBuffer());
  if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 16) !== "WAVEfmt " ||
    header.readUInt32LE(16) !== 16 || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1 ||
    header.readUInt32LE(24) !== 16000 || header.readUInt16LE(34) !== 16 || header.toString("ascii", 36, 40) !== "data" ||
    header.readUInt32LE(40) !== size - 44) return fail("录音格式不正确", 415);
  if (!local) {
    const kv = kvConfig();
    if (!kv) return fail("听写服务暂不可用", 503);
    const ip = req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "anonymous";
    const bucket = Math.floor(Date.now() / 3600000);
    const client = createHash("sha256").update(bucket + ":" + ip).digest("hex").slice(0, 24);
    // Shared quotas across function instances; never store raw IPs or audio in KV.
    const script = "local a=tonumber(redis.call('GET',KEYS[1]) or '0'); local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if a>=60 or b>=600 then return 0 end; for i=1,2 do redis.call('INCR',KEYS[i]); redis.call('EXPIRE',KEYS[i],3700) end; return 1";
    try {
      const quota = await fetch(kv.url, { method: "POST", headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", script, 2, `voice:${bucket}:${client}`, `voice:${bucket}:all`]), cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!quota.ok) return fail("听写服务暂不可用", 503);
      const { result } = await quota.json();
      if (result === 0) return fail("听写次数较多，请稍后再试", 429);
      if (result !== 1) return fail("听写服务暂不可用", 503);
    } catch { return fail("听写服务暂不可用", 503); }
  }
  const form = new FormData();
  form.set("model", "FunAudioLLM/SenseVoiceSmall");
  form.set("file", audio, "task.wav");
  try {
    const res = await fetch("https://api.siliconflow.cn/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(30000)]), cache: "no-store",
    });
    if (!res.ok) return fail(res.status === 429 ? "转写服务繁忙，请稍后重试。" : "SenseVoice 暂未能转写，请重试。", 502);
    const data = await res.json();
    if (typeof data.text !== "string") return fail("转写服务未返回文字", 502);
    return Response.json({ text: data.text }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("转写服务连接失败或超时，请重试。", 502); }
}
