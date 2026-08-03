// 记录的大类判定：正事 / 娱乐 / 休息
// 判定优先级：用户手动改过的（同名记录永久生效）→ 已分类的同名记录 → 关键词规则 → 交给 AI

import type { EntryCategory, TimeEntry } from "./types";

export const CATEGORY_LIST: EntryCategory[] = ["正事", "娱乐", "休息"];

type Style = { bg: string; border: string; text: string; solid: string };

export const CATEGORY_STYLE: Record<EntryCategory, Style> = {
  正事: { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB", solid: "#2563EB" },
  娱乐: { bg: "#FFF7ED", border: "#FED7AA", text: "#EA580C", solid: "#EA580C" },
  休息: { bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A", solid: "#16A34A" },
};

export const UNCATEGORIZED_STYLE: Style = {
  bg: "#F4F4F5",
  border: "#E4E4E7",
  text: "#71717A",
  solid: "#A1A1AA",
};

export function categoryStyle(c: EntryCategory | null): Style {
  return c ? CATEGORY_STYLE[c] : UNCATEGORIZED_STYLE;
}

// 关键词词典：AI 返回前先用它即时上色，没配 key / 断网时也能用。
const KEYWORDS: Record<EntryCategory, string[]> = {
  正事: [
    "正事", "工作", "上班", "加班", "学习", "复习", "预习", "看书", "读书", "阅读",
    "作业", "论文", "数学", "英语", "语文", "政治", "专业课", "背单词", "单词",
    "刷题", "做题", "考研", "上课", "听课", "网课", "复盘", "面试", "简历", "投递",
    "求职", "项目", "代码", "编程", "开发", "调试", "开会", "会议", "汇报", "周报",
    "日报", "文档", "写作", "剪辑", "运营", "养号", "健身", "锻炼", "跑步", "练琴",
    "背书", "笔记", "总结", "规划", "研究", "备课", "写文",
  ],
  娱乐: [
    "娱乐", "抖音", "快手", "小红书", "微博", "知乎", "b站", "哔哩", "视频", "短视频",
    "刷手机", "玩手机", "打游戏", "游戏", "王者", "原神", "电影", "电视剧", "追剧",
    "看剧", "刷剧", "短剧", "动漫", "番剧", "追番", "斗罗大陆", "综艺", "直播", "摸鱼", "逛淘宝",
    "购物", "小说", "漫画", "朋友圈", "闲逛", "刷帖",
  ],
  休息: [
    "休息", "吃饭", "早饭", "午饭", "晚饭", "早餐", "午餐", "晚餐", "睡觉", "午睡",
    "补觉", "洗澡", "洗漱", "发呆", "放空", "散步", "通勤", "坐车", "地铁", "打扫",
    "家务", "做饭", "买菜", "打盹", "喝水", "上厕所", "遛弯",
  ],
};

// 工作强信号词：出现就判正事，压过平台名。
// "小红书运营""剪抖音"是在干活，不能因为带了"小红书""抖音"就算娱乐。
const WORK_MARKERS = [
  "运营", "养号", "起号", "做号", "剪辑", "剪片", "复盘", "写稿", "投稿",
  "接单", "备课", "上课", "考研", "面试", "简历", "工作", "上班",
];

/**
 * 关键词规则判定。先看工作强信号词，再按"命中最长的关键词胜出"。
 * 认不出来返回 null（留给 AI）。
 */
export function ruleClassify(title: string): EntryCategory | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  if (WORK_MARKERS.some((kw) => t.includes(kw))) return "正事";
  let best: EntryCategory | null = null;
  let bestLen = 0;
  for (const cat of CATEGORY_LIST) {
    for (const kw of KEYWORDS[cat]) {
      if (kw.length > bestLen && t.includes(kw)) {
        best = cat;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

/**
 * 建"标题 → 分类"查表：手动改过的优先，其次任意一条已分类的同名记录。
 * 分类存在记录上，所以一次纠正会跟着云同步到所有设备，并对以后的同名记录生效。
 */
export function buildTitleCategoryMap(entries: TimeEntry[]): Map<string, EntryCategory> {
  const map = new Map<string, EntryCategory>();
  for (const e of entries) {
    if (!e.category) continue;
    const key = e.title.trim();
    if (e.categorySource === "user") {
      map.set(key, e.category); // 手动改过的直接覆盖（后写的赢）
    } else if (!map.has(key)) {
      map.set(key, e.category);
    }
  }
  return map;
}

/** 一条记录最终算哪一类；null = 未分类 */
export function categoryOf(entry: TimeEntry, titleMap: Map<string, EntryCategory>): EntryCategory | null {
  return titleMap.get(entry.title.trim()) ?? entry.category ?? ruleClassify(entry.title);
}
