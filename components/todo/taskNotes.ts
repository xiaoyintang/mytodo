import type { Aspiration, GoalResult, Task, TaskNote } from "./types";

export function createTaskNote(task: Task, text: string, goal?: Aspiration, result?: GoalResult): TaskNote | undefined {
  if (!text.trim()) return undefined;
  const step = task.status === "done" ? undefined : task.subtasks?.find((item) => !item.done);
  const createdAt = Date.now();
  return {
    id: `note-${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
    text: text.trim(),
    createdAt,
    context: {
      taskId: task.id, taskTitle: task.title, taskDate: task.date,
      aspirationId: task.aspirationId, aspirationTitle: goal?.title,
      resultId: result?.id ?? task.resultId, resultTitle: result?.title,
      stepId: step?.id, stepTitle: step?.title,
    },
  };
}

export function editTaskNote(notes: TaskNote[], id: string, text: string): TaskNote[] {
  if (!text.trim()) return notes;
  return notes.map((note) => note.id === id ? { ...note, text: text.trim(), updatedAt: Date.now() } : note);
}
