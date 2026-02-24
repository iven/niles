/**
 * Grade 逻辑：对 RSS 条目进行分级
 */

import { chat } from "@tanstack/ai";
import { z } from "zod";
import { buildGradeUserPrompt, GRADE_SYSTEM_PROMPT } from "./grade.prompt";
import type { GlobalConfig, LlmConfig, SourceConfig } from "./lib/config";
import { createLlmClient, handleStreamWithToolCall } from "./lib/llm";
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

export async function gradeItems(
  options: GradeOptions,
): Promise<GradedRssItem[]> {
  const { llmConfig, globalConfig, sourceConfig, items } = options;

  if (items.length === 0) {
    return [];
  }

  const userMessage = buildGradeUserPrompt(sourceConfig, globalConfig, items);
  const adapter = createLlmClient(llmConfig, llmConfig.models.grade);
  const { tool, getResult } = createGradeTool(items);

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
  try {
    return await handleStreamWithToolCall({ stream, getResult });
  } catch (_error) {
    throw new Error("分级失败：AI 未成功调用工具");
  }
}
