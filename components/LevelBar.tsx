import type { GoalLevel } from "@/components/todo/goalXp";

export default function LevelBar({ level, color, className = "" }: { level: GoalLevel; color: string; className?: string }) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)] ${className}`}>
      <span className="block h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.min(100, (level.into / level.need) * 100)}%`, backgroundColor: color }} />
    </span>
  );
}
