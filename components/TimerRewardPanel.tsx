"use client";

import { useEffect, useState } from "react";
import { Gift, Play, X } from "lucide-react";
import type { RunningTimer, TimerRewardControls } from "./todo/useTimer";
import { DEFAULT_REWARD, rewardProgress, validRewardConfig, type RewardConfig } from "./todo/timerReward";

const PREF_KEY = "mytodo.reward.preferences.v1";
const button = "min-h-10 rounded-lg px-3 text-[12px] font-semibold transition-colors";
function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function TimerRewardPanel({ running, elapsedMs, controls }: {
  running: RunningTimer | null; elapsedMs: number; controls: TimerRewardControls;
}) {
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [config, setConfig] = useState<RewardConfig>(DEFAULT_REWARD);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
      if (saved && validRewardConfig(saved)) setConfig(saved);
    } catch { /* 默认 30 / 10 */ }
  }, []);
  const cycle = controls.reward;
  const progress = rewardProgress({ running, reward: cycle, updatedAt: 0 }, running ? running.startedAt + elapsedMs : Date.now());

  if (!cycle) {
    if (running && ["娱乐", "休息"].includes(running.title)) return null;
    if (!open) return <button type="button" onClick={() => setOpen(true)}
      className="flex min-h-10 w-fit items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-[var(--color-focus)] hover:bg-[var(--color-focus-light)]">
      <Gift className="h-3.5 w-3.5" />加个专注奖励<span className="text-[var(--color-text-tertiary)]">可选</span>
    </button>;
    return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-primary)]"><Gift className="h-4 w-4 text-[var(--color-focus)]" />给这一轮留个期待</span>
        <button type="button" aria-label="收起奖励设置" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[var(--color-text-secondary)]">
        <label className="flex items-center gap-2">投入<input aria-label="正事目标分钟" type="number" min={1} max={180} value={config.focusMinutes || ""}
          onChange={e => setConfig({ ...config, focusMinutes: Number(e.target.value) })}
          className="h-10 w-16 rounded-lg border border-[var(--color-border)] bg-white px-2 text-center text-[var(--color-text-primary)]" />分钟</label>
        <span aria-hidden="true">→</span>
        <label className="flex items-center gap-2">奖励<input aria-label="奖励分钟" type="number" min={1} max={60} value={config.rewardMinutes || ""}
          onChange={e => setConfig({ ...config, rewardMinutes: Number(e.target.value) })}
          className="h-10 w-16 rounded-lg border border-[var(--color-border)] bg-white px-2 text-center text-[var(--color-text-primary)]" />分钟</label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input aria-label="奖励内容" maxLength={80} value={config.title} placeholder="奖励自己做什么？"
          onChange={e => setConfig({ ...config, title: e.target.value })}
          className="h-10 min-w-0 flex-1 basis-40 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[13px] text-[var(--color-text-primary)]" />
        <div role="group" aria-label="奖励记录分类" className="flex rounded-lg bg-[var(--color-bg-gray-light)] p-0.5">
          {(["娱乐", "休息"] as const).map(category => <button key={category} type="button" aria-pressed={config.category === category}
            onClick={() => setConfig({ ...config, category })}
            className={`${button} ${config.category === category ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-text-secondary)]"}`}>{category}</button>)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-[12px] text-[var(--color-text-secondary)]">
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={config.focusSound} onChange={e => setConfig({ ...config, focusSound: e.target.checked })} />正事达标响一声</label>
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={config.rewardSound} onChange={e => setConfig({ ...config, rewardSound: e.target.checked })} />奖励时间到时提醒</label>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">本轮累计，停下不清零。达标不打断，点「开始奖励」才计时。{running ? "当前这段会计入正事。" : "普通计时不受影响。"}</p>
      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">声音不是系统推送；锁屏或浏览器暂停时可能无法响铃，回来仍可看到提示。</p>
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={!validRewardConfig(config)} onClick={() => {
          if (!validRewardConfig(config)) return;
          try { localStorage.setItem(PREF_KEY, JSON.stringify(config)); } catch { /* 可继续使用 */ }
          controls.enableReward(config, running?.startedAt); setOpen(false);
        }} className={`${button} bg-[var(--color-primary)] text-white disabled:opacity-40`}>
          {running ? "给本次计时加奖励" : "开始正事计时"}
        </button>
      </div>
    </div>;
  }

  const busyElsewhere = Boolean(running && !progress.active);
  const isReward = cycle.phase === "reward";
  const finished = cycle.phase === "finished";
  const highlighted = progress.ready || progress.rewardOver || finished;
  const targetMs = cycle.config.focusMinutes * 60000;
  const percent = Math.min(100, progress.focusMs / targetMs * 100);
  return <div className={`rounded-xl border px-3 py-2.5 ${highlighted
    ? "border-[var(--color-focus-border)] bg-[var(--color-focus-light)]" : "border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)]"}`}>
    <div className="flex items-start gap-2">
      <Gift className={`mt-2 h-4 w-4 shrink-0 text-[var(--color-focus)] ${progress.ready ? "motion-safe:animate-[daily-focus-sparkle_700ms_ease-out]" : ""}`} />
      <div className="min-w-0 flex-1 py-1">
        <div role="status" className="text-[13px] font-semibold text-[var(--color-text-primary)]">
          {finished ? "奖励已记录，要回到刚才的正事吗？" : isReward
            ? progress.rewardOver ? "奖励时间到了，接下来由你决定" : "正在享受奖励"
            : progress.ready ? "奖励已解锁，做得不错！" : "本轮专注奖励"}
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
          {isReward ? `${cycle.config.title} · ${progress.rewardOver ? `已超出 ${clock(progress.rewardMs - cycle.config.rewardMinutes * 60000)}` : `还剩 ${clock(cycle.config.rewardMinutes * 60000 - progress.rewardMs)}`}`
            : finished ? `继续「${cycle.focus.title}」，开启新一轮 ${cycle.config.focusMinutes} 分钟`
            : progress.ready ? `${cycle.config.title} · ${cycle.config.rewardMinutes} 分钟。可以现在享受，也可以继续做。`
            : `已投入 ${clock(progress.focusMs)} / ${cycle.config.focusMinutes}:00 · ${cycle.config.rewardMinutes} 分钟${cycle.config.title}在等你`}
        </p>
      </div>
      <button type="button" aria-label="结束本轮奖励" onClick={() => setConfirmClose(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-white"><X className="h-4 w-4" /></button>
    </div>
    {cycle.phase === "focus" && !progress.ready && <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-border)]" aria-label="本轮正事进度" role="progressbar" aria-valuenow={Math.floor(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[var(--color-focus)] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {progress.ready && <button type="button" disabled={busyElsewhere} onClick={() => controls.startReward(cycle.id)} className={`${button} bg-[var(--color-focus)] text-white disabled:opacity-40`}><Gift className="mr-1 inline h-3.5 w-3.5" />开始奖励</button>}
      {(isReward || finished || (!running && cycle.phase === "focus")) && <button type="button" disabled={busyElsewhere} onClick={() => controls.continueFocus(cycle.id)} className={`${button} bg-[var(--color-primary)] text-white disabled:opacity-40`}><Play className="mr-1 inline h-3.5 w-3.5" />{isReward || finished ? "回到正事" : "继续这一轮"}</button>}
      {isReward && <button type="button" onClick={() => controls.dismissReward(cycle.id)} className={`${button} text-[var(--color-text-secondary)] hover:bg-white`}>结束并记录奖励</button>}
      {busyElsewhere && <span className="text-[11px] text-[var(--color-text-secondary)]">先停止当前计时，再继续这一轮。</span>}
      {!running && cycle.phase === "focus" && !progress.ready && <span className="text-[11px] text-[var(--color-text-tertiary)]">已保留进度，不扣分</span>}
    </div>
    {confirmClose && <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-white p-2.5">
      <p className="text-[12px] text-[var(--color-text-secondary)]">结束这一轮？已记录时长保留，本轮奖励进度不再保留。{isReward ? "奖励会按实际用时记一笔。" : running ? "当前正事继续计时。" : ""}</p>
      <div className="mt-1 flex justify-end gap-1">
        <button type="button" onClick={() => setConfirmClose(false)} className={`${button} text-[var(--color-text-secondary)]`}>保留这一轮</button>
        <button type="button" onClick={() => { controls.dismissReward(cycle.id); setConfirmClose(false); }} className={`${button} text-[var(--color-danger)]`}>确认结束</button>
      </div>
    </div>}
  </div>;
}
