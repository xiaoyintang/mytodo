"use client";

import { formatMinutes } from "@/components/todo/time";

export type DonutSlice = { label: string; minutes: number; color: string };

const SIZE = 116;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const CENTER = SIZE / 2;

/** 时间去向环形图 + 右侧图例（正事/娱乐/休息各占多少） */
export default function CategoryDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  let offset = 0; // 累积弧长，决定每段从哪儿开始画

  return (
    <div className="w-full flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={R}
              fill="none"
              stroke="var(--color-bg-gray-light)"
              strokeWidth={STROKE}
            />
            {slices.map((s) => {
              const len = total > 0 ? (s.minutes / total) * C : 0;
              const dashOffset = -offset;
              offset += len;
              return (
                <circle
                  key={s.label}
                  cx={CENTER}
                  cy={CENTER}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[15px] font-bold text-[var(--color-text-primary)] leading-tight">
            {formatMinutes(total)}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">合计</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{s.label}</span>
            <div className="flex-1" />
            <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">
              {formatMinutes(s.minutes)}
            </span>
            <span className="text-[11px] text-[var(--color-text-tertiary)] w-[34px] text-right tabular-nums">
              {total > 0 ? Math.round((s.minutes / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
