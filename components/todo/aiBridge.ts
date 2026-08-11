import { TYPE_LABEL } from "./behavior";
import type { Aspiration, BehaviorCard, BehaviorType, GoalResult } from "./types";

export type AIImportDraft = {
  text: string;
  type: BehaviorType;
  resultTitle?: string;
  operation: "add" | "replace";
  /** 替换时必须指向已有行为；保留原文是为了让用户核对，而不是让 AI 直接覆盖。 */
  replacesText?: string;
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
          return {
            text,
            type: parseType(item.type ?? item.kind),
            operation,
            ...(resultTitle ? { resultTitle } : {}),
            ...(replacesText ? { replacesText } : {}),
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
  };
}

export function parseAIBehaviorImport(raw: string): AIImportDraft[] {
  const jsonItems = parseJson(raw);
  if (jsonItems.length > 0) return uniqueDrafts(jsonItems);

  const allLines = raw.split(/\r?\n/);
  const marker = allLines.findIndex((line) => /可导入行为|importable behaviors/i.test(line));
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

    const bullet = line.match(/^(?:[-*•]\s+|\d+[.)、]\s+)(.+)$/);
    if (!bullet) continue;
    const item = stripInlineMetadata(bullet[1], inheritedResult);
    if (item) parsed.push(item);
  }

  // 用户只粘贴了纯文本清单时，允许一行一条；长段说明不贸然当行为。
  if (parsed.length === 0) {
    const plain = lines.map((line) => line.trim()).filter(Boolean);
    if (plain.length <= 20) {
      for (const line of plain) {
        if (/^(?:#{1,6}\s*)?(?:说明|分析|建议|总结|可导入行为)\s*[:：]?$/.test(line)) continue;
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
        return `- [${TYPE_LABEL[card.type]}] ${card.text}${resultLabel}`;
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
1. 先问我 3～5 个真正影响方案质量的问题，了解我的阶段、资源、限制、已经尝试过什么，以及我为什么会卡住。
2. 和我一起发散多个方向，不要只把目标换一种说法，也不要把成果冒充成行为。
3. 行为必须是某个具体时刻可以开始做的动作；太大的行为请给出最小可执行版本。
4. 可以说明它为什么可能有效、可行性取决于什么，但不要替我生成精确的 0～100 分。影响力和“我能不能做到”最终由我自己判断。
5. 避免重复上面的已有行为。

讨论结束后，请把最终变更严格放在下面这个区块中，方便我导回 App。新增行为标为「新增」；如果是在改写已有行为，必须标为「替换」，并逐字引用上方已有行为的原文：

## 可导入行为
- [新增] [可重复] 行为内容 | 关键结果：对应的关键结果原文
- [新增] [一次性] 行为内容 | 关键结果：对应的关键结果原文
- [替换] 原行为：已有行为原文 → [可重复] 改写后的行为 | 关键结果：对应的关键结果原文
- [替换] 原行为：已有行为原文 → [停止] 改写后的行为 | 关键结果：对应的关键结果原文

如果某条暂时无法归属关键结果，也可以省略“| 关键结果：…”；不要在这个区块里放解释性段落。`;
}

export const IMPORT_TYPE_OPTIONS = ACTION_TYPES;
