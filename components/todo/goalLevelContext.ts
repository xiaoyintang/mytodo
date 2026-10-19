"use client";

import { createContext, useContext } from "react";
import type { GoalLevel } from "./goalXp";

/** 各目标当前等级。TodoApp 提供，MainlineBar / 目标列表直接读，不用逐层传 props。 */
export const GoalLevelContext = createContext<Record<string, GoalLevel>>({});
export const useGoalLevels = () => useContext(GoalLevelContext);
