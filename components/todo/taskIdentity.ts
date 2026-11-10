import type { ParsedTask } from "./llmtask";
import type { Aspiration } from "./types";

type Identity = Pick<Aspiration, "id" | "title" | "archived">;
const split = /[，,。；;！!？?\n]|(?=然后(?:归属|归入|归到|放到|挂到|计入))/u;
const normalize = (s: string) => s.normalize("NFKC").replace(/[\s「」『』“”"《》]/gu, "").toLowerCase();

// Match explicit assignment clauses, never task topic words. Resolve locally;
// the model does not need access to the user's full list of identities.
function clause(value: string, identity: Identity): boolean {
  const s = normalize(value).replace(/^(?:然后|并且|并)?(?:把它|把这个任务)?(?:帮我|请)?/u, "");
  const match = /^(?:归属(?:于|到)?|归到|归入|算到|放到|放在|挂到|计入)[:：]?(.*)$/u.exec(s);
  if (!match) return false;
  const name = normalize(identity.title);
  return !!name && (match[1] === name || match[1].startsWith(name) &&
    /^(?:的)?(?:这个|那个)?(?:身份|主线)(?:里[面边]?|下[面边]?|中)?$/u.test(match[1].slice(name.length)));
}

// A short title followed by a known identity is already a complete form.
// Leave dates, steps, ambiguous prose and multiple tasks to the existing parser.
export function simpleIdentityDraft(input: string, date: string, identities: Identity[]) {
  const bits = input.split(split).map(s => s.trim()).filter(Boolean);
  if (bits.length !== 2) return null;
  const [title, assignment] = bits;
  if (!/^[\p{Script=Han}A-Za-z ]{2,24}$/u.test(title) ||
    /今|明[天早晚上下午年]|后天|昨|周|星期|礼拜|月|日|号|晨|早[上晨]|午|晚|点|时|分钟|刻|每天|每年|每隔|每次|小时|下班|上班前|优先|高优|重要|紧急|务必|步骤|流程|然后|再|并|以及|和|先|接着|加一个|提醒|还有|记得|等会/u.test(title)) return null;
  const matches = identities.filter(a => !a.archived && clause(assignment, a));
  return matches.length === 1 ? { title, date, aspirationId: matches[0].id } : null;
}

export function assignTaskIdentities(tasks: ParsedTask[], input: string, identities: Identity[]) {
  const active = identities.filter(a => !a.archived);
  const explicit = active.filter(a => input.split(split).some(part => clause(part, a)));
  const oneTask = (tasks.length === 1 || new Set(tasks.map(t => t.title)).size === 1 &&
    new Set(tasks.map(t => t.date)).size === tasks.length) && explicit.length === 1;
  return tasks.map(t => {
    const parts = t.title.split(split);
    const candidates = explicit.filter(a => parts.some(p => clause(p, a)) ||
      (t.identityName ? normalize(t.identityName) === normalize(a.title) : oneTask));
    if (candidates.length !== 1) return { ...t, aspirationId: undefined };
    const a = candidates[0];
    const unique = active.filter(x => normalize(x.title) === normalize(a.title)).length === 1;
    if (!unique) return { ...t, aspirationId: undefined };
    // Keep punctuation inside the actual title intact.
    const suffix = parts.filter(p => p.trim()).at(-1);
    const head = suffix && clause(suffix, a) ? t.title.slice(0, t.title.lastIndexOf(suffix)).replace(/[，,。；;！!？?\s]+$/u, "") : "";
    const title = head || t.title;
    return { ...t, title, aspirationId: a.id };
  });
}
