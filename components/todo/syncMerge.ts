// Three-way merge: only differences from the last acknowledged snapshot are edits.
// Nested lists (e.g. a task's workflow) are atomic: conflicting edits require a choice.
export type SyncDocument = Record<string, unknown>;
export type SyncConflict = { path: string[]; local: unknown; cloud: unknown; signature: string };
export type SyncChoices = Record<string, "local" | "cloud">;

export function equalSync(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equalSync(v, b[i]));
  if (object(a) && object(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.every(k => equalSync(a[k], b[k]));
  }
  return false;
}
function object(v: unknown): v is SyncDocument { return !!v && typeof v === "object" && !Array.isArray(v); }
const collections = new Set(["tasks", "entries", "aspirations", "goalResults", "behaviors", "habits", "habitLogs", "taskTemplates"]);

export function mergeSync(base: SyncDocument, local: SyncDocument, cloud: SyncDocument, choices: SyncChoices = {}) {
  const conflicts: SyncConflict[] = [];
  function merge(b: unknown, l: unknown, r: unknown, path: string[]): unknown {
    if (equalSync(l, r)) return l;
    if (equalSync(l, b)) return r;
    if (equalSync(r, b)) return l;
    // Collection members have stable IDs; a record change must never dirty all tasks.
    if (path.length === 1 && collections.has(path[0]) && Array.isArray(l) && Array.isArray(r)) {
      const index = (items: unknown) => new Map((Array.isArray(items) ? items : []).filter(object).map(v => [String(v.id), v]));
      const bm = index(b), lm = index(l), rm = index(r);
      return [...new Set([...rm.keys(), ...lm.keys()])].map(id => merge(bm.get(id), lm.get(id), rm.get(id), [...path, id])).filter(v => v !== undefined);
    }
    if (object(l) && object(r) && (b === undefined || object(b))) {
      const result: SyncDocument = {};
      for (const k of new Set([...Object.keys(b ?? {}), ...Object.keys(l), ...Object.keys(r)])) {
        const v = merge(object(b) ? b[k] : undefined, l[k], r[k], [...path, k]);
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    const signature = JSON.stringify([path, b, l, r]);
    const choice = choices[signature];
    if (choice) return choice === "local" ? l : r;
    conflicts.push({ path, local: l, cloud: r, signature });
    return l; // Preview only; never upload or apply an unresolved merge.
  }
  const data: SyncDocument = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
    if (key === "updatedAt") continue;
    if (key === "timer") {
      const l = local.timer as { updatedAt?: number } | undefined;
      const r = cloud.timer as { updatedAt?: number } | undefined;
      data.timer = (r?.updatedAt ?? 0) > (l?.updatedAt ?? 0) ? r : l ?? r;
    } else {
      // Missing collections in legacy cloud data do not mean deletion.
      const v = Object.prototype.hasOwnProperty.call(cloud, key)
        ? merge(base[key], local[key], cloud[key], [key]) : local[key];
      if (v !== undefined) data[key] = v;
    }
  }
  return { data, conflicts };
}
