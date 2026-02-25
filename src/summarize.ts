/**
 * Summarize 逻辑：总结单个 RSS 条目
 */

import { chat } from "@tanstack/ai";
import type { LlmConfig } from "./lib/config";
import {
  createLlmClient,
  handleStreamWithToolCall,
  type StreamResult,
  type TokenStats,
} from "./lib/llm";
import { logger } from "./lib/logger";
import {
  buildSummarizeUserPrompt,
  SUMMARIZE_SYSTEM_PROMPT,
} from "./summarize.prompt";
import type { RssItem, SummaryResult } from "./types";
import { summaryResultSchema } from "./types";

interface SummarizeOptions {
  llmConfig: LlmConfig;
  preferredLanguage: string;
  item: RssItem;
}

function createSummarizeTool() {
  let result: SummaryResult;

  const tool = {
    name: "write_summary",
    description: "写入总结结果",
    inputSchema: summaryResultSchema,
    execute: async (params: SummaryResult) => {
      result = params;
      return { success: true };
    },
  };

  return {
    tool,
    getResult: () => result,
  };
}

async function summarizeItem(
  options: SummarizeOptions,
): Promise<StreamResult<SummaryResult>> {
  const { llmConfig, preferredLanguage, item } = options;

  const userMessage = buildSummarizeUserPrompt(preferredLanguage, item);
  const adapter = createLlmClient(llmConfig, llmConfig.models.summarize);
  const { tool, getResult } = createSummarizeTool();

  // 调用 AI
  const stream = chat({
    adapter,
    systemPrompts: [SUMMARIZE_SYSTEM_PROMPT],
    messages: [
      {
        role: "user",
        content: [{ type: "text", content: userMessage }],
      },
    ],
    tools: [tool],
    temperature: 0.3, // 低温度确保摘要稳定，减少随机性
    maxTokens: 4096, // 基于实际测量：单条目最大输出2782 tokens，留余量
  });

  // 处理流式响应
  try {
    return await handleStreamWithToolCall({ stream, getResult });
  } catch (_error) {
    throw new Error("总结失败：AI 未成功调用工具");
  }
}

interface SummarizeItemsOptions {
  llmConfig: LlmConfig;
  preferredLanguage: string;
  items: RssItem[];
}

interface SummarizeItemsResult {
  summaries: SummaryResult[];
  tokenStats: TokenStats;
}

export async function summarizeItems(
  options: SummarizeItemsOptions,
): Promise<SummarizeItemsResult> {
  const { llmConfig, preferredLanguage, items } = options;

  if (items.length === 0) {
    return {
      summaries: [],
      tokenStats: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  logger.start(`开始总结 ${items.length} 个条目...`);

  // 并行总结
  const results = await Promise.all(
    items.map((item) =>
      summarizeItem({
        llmConfig,
        preferredLanguage,
        item,
      }),
    ),
  );

  // 统计总 Token 使用量
  const tokenStats = results.reduce(
    (acc, { tokenStats }) => ({
      promptTokens: acc.promptTokens + tokenStats.promptTokens,
      completionTokens: acc.completionTokens + tokenStats.completionTokens,
      totalTokens: acc.totalTokens + tokenStats.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );

  const summaries = results.map(({ result }) => result);

  logger.success(`总结完成 (${summaries.length} 个条目)`);
  for (let i = 0; i < results.length; i++) {
    const { result: summary, tokenStats: itemTokenStats } = results[i] || {
      result: { title: "" },
      tokenStats: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    logger.log(`  ${i + 1}. ${summary.title}`);
    logger.log(
      `     Token: 输入 ${itemTokenStats.promptTokens}, 输出 ${itemTokenStats.completionTokens}, 总计 ${itemTokenStats.totalTokens}`,
    );
    logger.debug(`     描述: ${summary.description}`);
  }

  return { summaries, tokenStats };
}
