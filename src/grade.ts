/**
 * Grade 逻辑：对 RSS 条目进行分级
 */

import { chat } from "@tanstack/ai";
import { z } from "zod";
import { buildGradeUserPrompt, GRADE_SYSTEM_PROMPT } from "./grade.prompt";
import type { GlobalConfig, LlmConfig, SourceConfig } from "./lib/config";
import { createLlmClient, handleStreamWithToolCall } from "./lib/llm";
import { logger } from "./lib/logger";
import type { GradedRssItem, GradeResult, RssItem } from "./types";
import { gradeResultSchema } from "./types";

interface GradeOptions {
  llmConfig: LlmConfig;
  globalConfig: GlobalConfig;
  sourceConfig: SourceConfig;
  items: RssItem[];
}

/**
 * 合并分级结果到原始条目
 */
export function mergeGradeResults(
  originalItems: RssItem[],
  gradeResults: GradeResult[],
):
  | { success: true; items: GradedRssItem[] }
  | { success: false; error: string } {
  // 检查数量是否匹配
  if (gradeResults.length !== originalItems.length) {
    return {
      success: false,
      error: `条目数量不匹配：期望 ${originalItems.length} 个，实际 ${gradeResults.length} 个`,
    };
  }

  // 合并分级结果到原始数据
  const itemMap = new Map(originalItems.map((item) => [item.guid, item]));

  const gradedItems: GradedRssItem[] = [];
  for (const gradeResult of gradeResults) {
    const originalItem = itemMap.get(gradeResult.guid);
    if (!originalItem) {
      return {
        success: false,
        error: `找不到 GUID 为 ${gradeResult.guid} 的条目，请检查 guid 是否正确`,
      };
    }
    gradedItems.push({
      ...originalItem,
      graded: true as const,
      level: gradeResult.level,
      reason: gradeResult.reason,
    });
  }

  return { success: true, items: gradedItems };
}

function createGradeTool(items: RssItem[]) {
  let finalResult: GradedRssItem[];

  const gradeResultsInputSchema = z.object({
    items: z.array(gradeResultSchema),
  });

  const tool = {
    name: "write_grade_results",
    description: "写入分级结果",
    inputSchema: gradeResultsInputSchema,
    execute: async (params: { items: GradeResult[] }) => {
      const result = mergeGradeResults(items, params.items);
      if (result.success) {
        finalResult = result.items;
        return { success: true };
      }
      return result;
    },
  };

  return {
    tool,
    getResult: () => finalResult,
  };
}

function logBreakdown(items: GradedRssItem[]) {
  // 按 level 分组
  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.level]) {
        acc[item.level] = [];
      }
      acc[item.level]?.push(item);
      return acc;
    },
    {} as Record<string, GradedRssItem[]>,
  );

  const levelNames: Record<string, string> = {
    critical: "必看",
    recommended: "推荐",
    optional: "可选",
    rejected: "排除",
  };

  const order: Array<keyof typeof levelNames> = [
    "critical",
    "recommended",
    "optional",
    "rejected",
  ];

  logger.success(`分级完成 (${items.length} 个条目)`);

  let firstGroup = true;
  for (const level of order) {
    const levelItems = grouped[level];
    if (!levelItems || levelItems.length === 0) continue;

    // 非第一组前面加空行
    if (!firstGroup) {
      logger.log("");
    }
    firstGroup = false;

    const levelName = levelNames[level];
    logger.log(`  ${levelName}`);
    for (let i = 0; i < levelItems.length; i++) {
      const item = levelItems[i];
      if (!item) continue;
      logger.log(`    ${i + 1}. ${item.title}`);
      logger.log(`       理由: ${item.reason}`);
    }
  }
}

export async function gradeItems(
  options: GradeOptions,
): Promise<GradedRssItem[]> {
  const { llmConfig, globalConfig, sourceConfig, items } = options;

  if (items.length === 0) {
    return [];
  }

  logger.start(`开始分级 ${items.length} 个条目...`);

  // 预检查：标题包含 [NILES_REJECTED] 的直接标记为 rejected
  const preRejectedItems: GradedRssItem[] = [];
  const itemsToGrade: RssItem[] = [];

  for (const item of items) {
    if (item.title.includes("[NILES_REJECTED]")) {
      preRejectedItems.push({
        ...item,
        graded: true as const,
        level: "rejected",
        reason: "标题包含 [NILES_REJECTED] 标记",
      });
    } else {
      itemsToGrade.push(item);
    }
  }

  // 如果所有条目都被预排除，直接返回
  if (itemsToGrade.length === 0) {
    logBreakdown(preRejectedItems);
    return preRejectedItems;
  }

  const userMessage = buildGradeUserPrompt(
    sourceConfig,
    globalConfig,
    itemsToGrade,
  );
  const adapter = createLlmClient(llmConfig, llmConfig.models.grade);
  const { tool, getResult } = createGradeTool(itemsToGrade);

  // 调用 AI
  const stream = chat({
    adapter,
    systemPrompts: [GRADE_SYSTEM_PROMPT],
    messages: [
      {
        role: "user",
        content: [{ type: "text", content: userMessage }],
      },
    ],
    tools: [tool],
    maxTokens: 8192, // 基于实际测量：3条目输出972 tokens，推算20条目约6500 tokens，留余量
  });

  // 处理流式响应
  let result: GradedRssItem[];
  try {
    const { result: gradedItems, tokenStats } = await handleStreamWithToolCall({
      stream,
      getResult,
    });
    result = gradedItems;
    logger.log(
      `  Token 使用: 输入 ${tokenStats.promptTokens}, 输出 ${tokenStats.completionTokens}, 总计 ${tokenStats.totalTokens}`,
    );
  } catch (_error) {
    throw new Error("分级失败：AI 未成功调用工具");
  }

  // 合并预排除的条目和 AI 分级的条目
  const finalResult = [...preRejectedItems, ...result];

  logBreakdown(finalResult);

  return finalResult;
}
