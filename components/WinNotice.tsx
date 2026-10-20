"use client";

import { Check } from "lucide-react";
import TransientNotice from "@/components/TransientNotice";
import LevelBar from "@/components/LevelBar";
import type { GoalLevel } from "@/components/todo/goalXp";

export type Win = {
  headline: string;
  detail?: string;
  goal?: { title: string; color: string; before: GoalLevel; after: GoalLevel };
  /** 属于某个有终点的目标时的清单进度；有它就优先显示它，比等级更具体。 */
  progress?: { title: string; color: string; done: number; total: number };
  expiresAt: number;
};

/**
 * 做完那一下的庆祝（福格 Shine）。项目里所有"赢"——启动、完成一步、完成任务、打卡——共用这一个出口，
 * 挂了目标就顺带告诉你这个目标涨了多少、到哪一级了：不用专门去目标页才知道自己在往前走。
 */
export default function WinNotice({ win, contextKey, onDismiss }: { win: Win; contextKey: string; onDismiss: () => void }) {
  const gained = win.goal ? win.goal.after.xp - win.goal.before.xp : 0;
  const leveledUp = win.goal ? win.goal.after.level > win.goal.before.level : false;
  return (
    <TransientNotice key={win.expiresAt} expiresAt={win.expiresAt} onDismiss={onDismiss} contextKey={contextKey}
      className="fixed bottom-16 left-1/2 z-[140] w-[min(400px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-[var(--color-success)] bg-[var(--color-success-light)] py-1 pl-3 pr-1 shadow-lg">
      <div className="flex items-center gap-2.5">
        <span className="daily-focus-sparkle flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)] text-white">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{win.headline}</p>
          {win.progress ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[var(--color-text-secondary)]">
              <span className="truncate font-medium" style={{ color: win.progress.color }}>{win.progress.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--color-text-primary)]">
                {win.progress.done}/{win.progress.total}
              </span>
              <span className="block h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
                <span className="block h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${win.progress.total ? (win.progress.done / win.progress.total) * 100 : 0}%`, backgroundColor: win.progress.color }} />
              </span>
              {gained > 0 && <span className="shrink-0 font-semibold text-[var(--color-success)]">+{gained}</span>}
            </div>
          ) : win.goal ? (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-[var(--color-text-secondary)]">
              <span className="truncate font-medium" style={{ color: win.goal.color }}>{win.goal.title}</span>
              <span className={`shrink-0 font-semibold ${leveledUp ? "daily-focus-sparkle text-[var(--color-success)]" : ""}`}>
                {leveledUp ? `升到 Lv${win.goal.after.level}！` : `Lv${win.goal.after.level}`}
              </span>
              <LevelBar level={win.goal.after} color={win.goal.color} className="min-w-8 flex-1" />
              {gained > 0 && <span className="shrink-0 font-semibold text-[var(--color-success)]">+{gained}</span>}
            </div>
          ) : win.detail ? (
            <p className="text-[11px] leading-4 text-[var(--color-text-secondary)]">{win.detail}</p>
          ) : null}
        </div>
      </div>
    </TransientNotice>
  );
}
