"use client";

import { createContext, useContext } from "react";
import type { GoalLevel } from "./goalXp";

/** 各身份当前等级。TodoApp 提供，MainlineBar / 身份列表直接读，不用逐层传 props。 */
export const GoalLevelContext = createContext<Record<string, GoalLevel>>({});
export const useGoalLevels = () => useContext(GoalLevelContext);

/** 每个身份下进行中的目标（有终点）的清单进度，主线条点开时显示。 */
export type GoalSummary = { resultId: string; title: string; done: number; total: number };
export const GoalProgressContext = createContext<Record<string, GoalSummary[]>>({});
export const useGoalProgress = () => useContext(GoalProgressContext);
