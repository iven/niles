/**
 * Summarize 逻辑：总结单个 RSS 条目
 */

import { chat } from "@tanstack/ai";
import type { LlmConfig } from "./lib/config";
import { createLlmClient, handleStreamWithToolCall } from "./lib/llm";
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

export async function summarizeItem(
  options: SummarizeOptions,
): Promise<SummaryResult> {
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
  });

  // 处理流式响应
  try {
    return await handleStreamWithToolCall({ stream, getResult });
  } catch (_error) {
    throw new Error("总结失败：AI 未成功调用工具");
  }
}
