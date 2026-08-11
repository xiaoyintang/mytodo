import { TYPE_LABEL } from "./behavior";
import type { Aspiration, BehaviorCard, BehaviorType, GoalResult } from "./types";

export type AIImportDraft = {
  text: string;
  type: BehaviorType;
  resultTitle?: string;
  operation: "add" | "replace";
  /**
   * 外部 AI 返回的是这条行为最终、完整、有序的固定流程，而不是逐步补丁。
   * 未提供 stepsMode = 保留原流程；replace = 用 steps 整体替换；clear = 明确清空。
   */
  stepsMode?: "replace" | "clear";
  steps?: string[];
  /** 替换时必须指向已有行为；保留原文是为了让用户核对，而不是让 AI 直接覆盖。 */
  replacesText?: string;
};

export type AIResultImportDraft = {
  title: string;
  evidence?: string;
  operation: "add" | "replace";
  /** 替换时逐字引用现有关键结果，导回时据此匹配，绝不让 AI 直接猜 id。 */
  replacesTitle?: string;
};

export type AIResultImportApply = {
  clientId: string;
  operation: "add" | "replace";
  replaceId?: string;
  title: string;
  evidence?: string;
};

export type AIBehaviorImportApply = {
  operation: "add" | "replace";
  replaceId?: string;
  text: string;
  type: BehaviorType;
  stepsMode?: "replace" | "clear";
  steps?: string[];
  /** 归属已有结果，或归属本批次新建/替换后的结果。 */
  resultId?: string;
  resultImportClientId?: string;
};

const ACTION_TYPES: BehaviorType[] = ["unsorted", "onetime", "habit", "stop"];

function parseType(value: unknown): BehaviorType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/一次性|单次|任务|onetime|one[- ]?time/.test(raw)) return "onetime";
  if (/停止|戒掉|减少|不再|stop/.test(raw)) return "stop";
  if (/重复|习惯|每天|每周|habit|repeat/.test(raw)) return "habit";
  return "unsorted";
}

function parseOperation(value: unknown): "add" | "replace" {
  return /替换|更新|改写|replace|update/i.test(String(value ?? "")) ? "replace" : "add";
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^(?:行为|行动)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanStep(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

function uniqueSteps(values: unknown[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];
  values.forEach((value) => {
    const step = cleanStep(value);
    const key = normalizeBehaviorText(step);
    if (!step || !key || seen.has(key)) return;
    seen.add(key);
    steps.push(step);
  });
  return steps.slice(0, 12);
}

function parseInlineSteps(value: unknown): { stepsMode: "replace" | "clear"; steps: string[] } {
  if (Array.isArray(value)) {
    const steps = uniqueSteps(value);
    return { stepsMode: steps.length > 0 ? "replace" : "clear", steps };
  }
  const raw = String(value ?? "").trim();
  if (!raw || /^(?:无|没有|清空|删除|取消|none|empty|clear|remove)$/i.test(raw)) {
    return { stepsMode: "clear", steps: [] };
  }
  let parts = raw.split(/\s*(?:→|⟶|=>|->|；|;)\s*/).filter(Boolean);
  if (parts.length === 1) {
    const numbered = raw.split(/\s+(?=\d+[.)、]\s*)/).filter(Boolean);
    if (numbered.length > 1) parts = numbered;
  }
  const steps = uniqueSteps(parts);
  return { stepsMode: steps.length > 0 ? "replace" : "clear", steps };
}

function parseJson(raw: string): AIImportDraft[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [raw.trim(), fenced].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { behaviors?: unknown[] }).behaviors)
          ? (parsed as { behaviors: unknown[] }).behaviors
          : null;
      if (!list) continue;

      return list
        .map((entry): AIImportDraft | null => {
          if (typeof entry === "string") {
            const text = cleanText(entry);
            return text ? { text, type: "unsorted", operation: "add" } : null;
          }
          if (!entry || typeof entry !== "object") return null;
          const item = entry as Record<string, unknown>;
          const text = cleanText(item.text ?? item.behavior ?? item.action ?? item.title);
          if (!text) return null;
          const resultTitle = cleanText(
            item.resultTitle ?? item.result ?? item.keyResult ?? item.kr,
          );
          const replacesText = cleanText(
            item.replacesText ?? item.originalText ?? item.original ?? item.oldText ?? item.replaces,
          );
          const operation = replacesText
            ? "replace"
            : parseOperation(item.operation ?? item.mode ?? item.changeType);
          const hasSteps = ["steps", "procedure", "workflow", "fixedSteps"].some((key) =>
            Object.prototype.hasOwnProperty.call(item, key),
          );
          const stepChange = hasSteps
            ? parseInlineSteps(item.steps ?? item.procedure ?? item.workflow ?? item.fixedSteps)
            : undefined;
          return {
            text,
            type: parseType(item.type ?? item.kind),
            operation,
            ...(resultTitle ? { resultTitle } : {}),
            ...(replacesText ? { replacesText } : {}),
            ...(stepChange ?? {}),
          };
        })
        .filter((item): item is AIImportDraft => item !== null);
    } catch {
      // 不是 JSON 就继续按自然语言列表解析。
    }
  }

  return [];
}

function stripInlineMetadata(value: string, inheritedResult?: string): AIImportDraft | null {
  let text = value.trim().replace(/^\[[ xX]\]\s*/, "");
  if (!text || /^[-:|\s]+$/.test(text)) return null;

  let stepChange: { stepsMode: "replace" | "clear"; steps: string[] } | undefined;
  const stepsMatch = text.match(
    /(?:\||｜|；|;|—)\s*(?:固定流程|执行流程|流程步骤|流程|步骤)\s*[:：]\s*(.+?)\s*$/i,
  );
  if (stepsMatch) {
    stepChange = parseInlineSteps(stepsMatch[1]);
    text = text.slice(0, stepsMatch.index).trim();
  }

  let resultTitle = inheritedResult;
  const resultMatch = text.match(
    /(?:\||｜|；|;|—)\s*(?:关键结果|结果|KR)\s*[:：]\s*([^|｜；;]+)\s*$/i,
  ) ?? text.match(/\s*[（(](?:关键结果|结果|KR)\s*[:：]\s*([^)）]+)[)）]\s*$/i);
  if (resultMatch) {
    resultTitle = cleanText(resultMatch[1]);
    text = text.slice(0, resultMatch.index).trim();
  }

  const operationTag = text.match(/^[【[]\s*(新增|替换|add|replace)\s*[\]】]\s*/i);
  const operation = parseOperation(operationTag?.[1]);
  if (operationTag) text = text.slice(operationTag[0].length).trim();

  let replacesText: string | undefined;
  if (operation === "replace") {
    const replacement = text.match(
      /^(?:原行为|原|替换)\s*[:：]\s*(.+?)\s*(?:=>|->|→|⟶|改为|替换为)\s*(?:新行为\s*[:：]\s*)?(.+)$/i,
    ) ?? text.match(/^(.+?)\s*(?:=>|->|→|⟶|改为|替换为)\s*(.+)$/i);
    if (replacement) {
      replacesText = cleanText(replacement[1]);
      text = replacement[2].trim();
    }
  }

  const typeTag = text.match(/^[【[]\s*([^\]】]+)\s*[\]】]\s*/);
  const typeMeta = text.match(/(?:\||｜|；|;|—)\s*类型\s*[:：]\s*([^|｜；;]+)\s*$/i);
  const type = parseType(typeTag?.[1] ?? typeMeta?.[1]);
  if (typeTag) text = text.slice(typeTag[0].length).trim();
  if (typeMeta) text = text.slice(0, typeMeta.index).trim();

  text = cleanText(text);
  if (text.length < 2 || text.length > 160) return null;
  return {
    text,
    type,
    operation,
    ...(resultTitle ? { resultTitle } : {}),
    ...(replacesText ? { replacesText } : {}),
    ...(stepChange ?? {}),
  };
}

function stripResultMetadata(value: string): AIResultImportDraft | null {
  let text = value.trim().replace(/^\[[ xX]\]\s*/, "");
  if (!text || /^[-:|\s]+$/.test(text)) return null;

  let evidence: string | undefined;
  const evidenceMatch = text.match(
    /(?:\||｜|；|;)\s*(?:达成证据|达成信号|证据)\s*[:：]\s*(.+?)\s*$/i,
  ) ?? text.match(/\s*[（(](?:达成证据|达成信号|证据)\s*[:：]\s*([^)）]+)[)）]\s*$/i);
  if (evidenceMatch) {
    evidence = cleanText(evidenceMatch[1]);
    text = text.slice(0, evidenceMatch.index).trim();
  }

  const operationTag = text.match(/^[【[]\s*(新增|替换|add|replace)\s*[\]】]\s*/i);
  const operation = parseOperation(operationTag?.[1]);
  if (operationTag) text = text.slice(operationTag[0].length).trim();

  let replacesTitle: string | undefined;
  if (operation === "replace") {
    const replacement = text.match(
      /^(?:原关键结果|原结果|原)\s*[:：]\s*(.+?)\s*(?:=>|->|→|⟶|改为|替换为)\s*(?:(?:新关键结果|新结果)\s*[:：]\s*)?(.+)$/i,
    );
    if (!replacement) return null;
    replacesTitle = cleanText(replacement[1]);
    text = replacement[2].trim();
  } else {
    text = text.replace(/^(?:关键结果|结果|KR)\s*[:：]\s*/i, "");
  }

  const title = cleanText(text);
  if (title.length < 2 || title.length > 160) return null;
  return {
    title,
    operation,
    ...(evidence ? { evidence } : {}),
    ...(replacesTitle ? { replacesTitle } : {}),
  };
}

export function parseAIGoalResultImport(raw: string): AIResultImportDraft[] {
  const allLines = raw.split(/\r?\n/);
  const marker = allLines.findIndex((line) =>
    /可导入关键结果|importable\s+(?:key\s+)?results/i.test(line),
  );
  const behaviorMarker = allLines.findIndex((line, index) =>
    index > marker && /可导入行为|importable behaviors/i.test(line),
  );
  const lines = marker >= 0
    ? allLines.slice(marker + 1, behaviorMarker >= 0 ? behaviorMarker : undefined)
    : allLines;
  const parsed: AIResultImportDraft[] = [];

  for (const source of lines) {
    const line = source.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]\s+|\d+[.)、]\s+)(.+)$/);
    const tagged = line.match(/^([【[]\s*(?:新增|替换|add|replace)\s*[\]】]\s*.+)$/i);
    const candidate = bullet?.[1] ?? tagged?.[1];
    if (!candidate) continue;
    // 没有专用区块时也能救回显式写着“关键结果”的变更，但不把行为误收进来。
    if (marker < 0 && !/(?:原|新)?关键结果\s*[:：]|(?:key\s+)?result\s*:/i.test(candidate)) {
      continue;
    }
    const item = stripResultMetadata(candidate);
    if (item) parsed.push(item);
  }

  const seen = new Set<string>();
  return parsed.filter((item) => {
    const key = [
      item.operation,
      normalizeBehaviorText(item.replacesTitle ?? ""),
      normalizeBehaviorText(item.title),
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isGoalResultChangeLine(value: string) {
  return /^(?:[【[]\s*(?:新增|替换|add|replace)\s*[\]】]\s*)?(?:原|新)?关键结果\s*[:：]|^(?:[【[]\s*(?:add|replace)\s*[\]】]\s*)?(?:key\s+)?result\s*:/i.test(
    value.trim(),
  );
}

export function parseAIBehaviorImport(raw: string): AIImportDraft[] {
  const jsonItems = parseJson(raw);
  if (jsonItems.length > 0) return uniqueDrafts(jsonItems);

  const allLines = raw.split(/\r?\n/);
  const marker = allLines.findIndex((line) => /可导入行为|importable behaviors/i.test(line));
  const resultMarker = allLines.findIndex((line) =>
    /可导入关键结果|importable\s+(?:key\s+)?results/i.test(line),
  );
  if (marker < 0 && resultMarker >= 0) return [];
  const lines = marker >= 0 ? allLines.slice(marker + 1) : allLines;
  const parsed: AIImportDraft[] = [];
  let inheritedResult: string | undefined;

  for (const source of lines) {
    const line = source.trim();
    if (!line) continue;

    const heading = line.match(
      /^(?:#{1,6}\s*)?(?:关键结果|结果|KR)\s*[:：]\s*(.+?)\s*$/i,
    );
    if (heading && !/^[-*•]|^\d+[.)、]/.test(line)) {
      inheritedResult = cleanText(heading[1]);
      continue;
    }

    // 聊天模型经常省略 Markdown 项目符号，直接逐行输出「[新增] / [替换]」。
    // 这种显式变更标签已经足够可靠，即使用户粘贴了很长的完整对话也应该识别。
    const taggedChange = line.match(
      /^(?:[-*•]\s+|\d+[.)、]\s+)?([【[]\s*(?:新增|替换|add|replace)\s*[\]】]\s*.+)$/i,
    );
    if (taggedChange) {
      if (isGoalResultChangeLine(taggedChange[1])) continue;
      const item = stripInlineMetadata(taggedChange[1], inheritedResult);
      if (item) parsed.push(item);
      continue;
    }

    const bullet = line.match(/^(?:[-*•]\s+|\d+[.)、]\s+)(.+)$/);
    if (!bullet) continue;
    if (isGoalResultChangeLine(bullet[1])) continue;
    const item = stripInlineMetadata(bullet[1], inheritedResult);
    if (item) parsed.push(item);
  }

  // 用户只粘贴了纯文本清单时，允许一行一条；长段说明不贸然当行为。
  if (parsed.length === 0) {
    const plain = lines.map((line) => line.trim()).filter(Boolean);
    if (plain.length <= 20) {
      for (const line of plain) {
        if (/^(?:#{1,6}\s*)?(?:说明|分析|建议|总结|可导入行为)\s*[:：]?$/.test(line)) continue;
        if (isGoalResultChangeLine(line)) continue;
        const item = stripInlineMetadata(line, inheritedResult);
        if (item) parsed.push(item);
      }
    }
  }

  return uniqueDrafts(parsed);
}

function uniqueDrafts(items: AIImportDraft[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalizedText = normalizeBehaviorText(item.text);
    if (!normalizedText) return false;
    const key = [
      item.operation,
      normalizeBehaviorText(item.replacesText ?? ""),
      normalizedText,
      item.stepsMode ?? "preserve",
      ...(item.steps ?? []).map(normalizeBehaviorText),
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchBehaviorCard(title: string | undefined, cards: BehaviorCard[]) {
  if (!title) return undefined;
  const needle = normalizeBehaviorText(title);
  const exact = cards.find((card) => normalizeBehaviorText(card.text) === needle);
  if (exact || needle.length < 4) return exact;
  return cards.find((card) => {
    const candidate = normalizeBehaviorText(card.text);
    return candidate.includes(needle) || needle.includes(candidate);
  });
}

export function normalizeBehaviorText(text: string) {
  return text.toLowerCase().replace(/[\s，。！？、,.!?;；:：'"“”‘’（）()\[\]【】_-]+/g, "");
}

export function matchGoalResult(title: string | undefined, results: GoalResult[]) {
  if (!title) return undefined;
  const needle = normalizeBehaviorText(title);
  return results.find((result) => {
    const candidate = normalizeBehaviorText(result.title);
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
  });
}

export function buildAIHandoffPrompt({
  aspiration,
  focusTitle,
  results,
  cards,
}: {
  aspiration: Aspiration;
  focusTitle: string;
  results: GoalResult[];
  cards: BehaviorCard[];
}) {
  const resultLines = results.length > 0
    ? results.map((result, index) => `${index + 1}. ${result.title}${result.evidence ? `（达成信号：${result.evidence}）` : ""}`)
    : ["- 当前没有设置关键结果，可以在讨论中建议是否需要增加结果层。"];
  const cardLines = cards.length > 0
    ? cards.map((card) => {
        const result = results.find((item) => item.id === card.resultId);
        const resultLabel = result ? ` · 关键结果：${result.title}` : " · 未归属关键结果";
        const stepsLabel = card.steps?.length
          ? ` · 固定流程：${card.steps.map((step, index) => `${index + 1}. ${step.title}`).join(" → ")}`
          : "";
        return `- [${TYPE_LABEL[card.type]}] ${card.text}${resultLabel}${stepsLabel}`;
      })
    : ["- 还没有行为备选。"];

  return `我正在为下面这个目标寻找真正可执行的行为备选。请把自己当作行为设计的讨论伙伴，不要一上来直接给清单。

## 目标
${aspiration.title}

## 当前正在聚焦
${focusTitle}

## 关键结果
${resultLines.join("\n")}

## 已有行为备选
${cardLines.join("\n")}

## 我希望你怎么帮助我
1. 先问我 3～5 个真正影响方案质量的问题，了解我的阶段、资源、限制、已经尝试过什么，以及我为什么会卡住。如果当前对话中已有足够上下文，可以跳过提问，直接简要说明你依据的已知信息，然后进入下一步。
2. 先检查关键结果是否真的是“发生什么变化才算推进”，是否覆盖主要成功条件、彼此重复或误写成了活动。必要时可以建议新增或替换，但不要为了显得有建议而硬改。
3. 在关键结果结构合理之后，再和我一起发散行为。不要只把目标换一种说法，也不要把成果冒充成行为。
4. 行为必须是某个具体时刻可以开始做的动作；太大的行为请给出最小可执行版本，并把最小版本直接写在同一条行为里。
5. 如果一个行为本身是必须按顺序完成的固定方法，可以为这个父行为设计“固定流程”。这些步骤共同构成一个行为包，不是互相竞争的行为备选，不要分别评价影响力。
6. 可以说明它为什么可能有效、可行性取决于什么，但不要替我生成精确的 0～100 分。影响力和“我能不能做到”最终由我自己判断。
7. 避免重复上面的已有关键结果和行为；不要直接删除任何内容，只能提议新增或替换。
8. 两个导入区块合计不超过 12 条。关键结果按结构关系排列；行为按建议的尝试顺序排列，但该顺序仅供参考，不替代焦点地图中的影响力和可行性判断。宁可少而准，不要为了铺满而凑数。

讨论结束后，请把最终变更严格放在下面两个区块中，方便我导回 App。即使其中一类没有变更，也请保留对应标题并写“- 无”。

新增或改写关键结果时，写清楚怎样确认有进展；替换必须逐字引用上方已有关键结果的原文：

## 可导入关键结果
- [新增] 关键结果：新的关键结果 | 达成证据：怎样确认有进展
- [替换] 原关键结果：已有关键结果原文 → 新关键结果：改写后的关键结果 | 达成证据：怎样确认有进展

新增行为标为「新增」；改写已有行为标为「替换」，并逐字引用上方已有行为的原文。行为归属必须使用应用关键结果变更后的最终标题：

## 可导入行为
- [新增] [可重复] 行为内容 | 关键结果：对应的关键结果原文
- [新增] [一次性] 行为内容 | 关键结果：对应的关键结果原文
- [新增] [停止] 要停止的具体行为 | 关键结果：对应的关键结果原文
- [替换] 原行为：已有行为原文 → [可重复] 改写后的行为 | 关键结果：对应的关键结果原文
- [替换] 原行为：已有行为原文 → [停止] 改写后的行为 | 关键结果：对应的关键结果原文

「停止」只用于目前确实会发生、并且能够观察到的具体行为，例如刷手机、反复查看消息；不要把情绪、念头或结果写成“停止焦虑”“停止自我否定”。

固定流程是可选的，必须放在该行为同一行的最后，用“→”给出**完整最终顺序**：
- [新增] [可重复] 难受时做15分钟第三人称书写 | 关键结果：减少焦虑 | 固定流程：写下事实 → 改用他/她称呼自己 → 写下身体感受
- [替换] 原行为：难受时写点东西 → [可重复] 难受时做15分钟第三人称书写 | 关键结果：减少焦虑 | 固定流程：写下事实 → 改用他/她称呼自己 → 写下身体感受

如果只调整已有行为的流程，替换前后可以写同一个父行为；App 会只更新流程。省略“固定流程”表示保留已有流程；只有确实要删掉时才写“| 固定流程：清空”。不要把流程中的每一步另写成新的可导入行为。

如果某条暂时无法归属关键结果，也可以省略“| 关键结果：…”；不要在这两个区块里放解释性段落。`;
}

export const IMPORT_TYPE_OPTIONS = ACTION_TYPES;
