/**
 * LLM 总结插件
 * 对非 rejected 条目调用 LLM 生成标题和摘要
 */

import { chat } from "@tanstack/ai";
import pLimit from "p-limit";
import { handleStreamWithToolCall } from "../../lib/llm";
import { logger } from "../../lib/logger";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem, SummaryResult } from "../../types";
import { summaryResultSchema } from "../../types";

const SUMMARIZE_SYSTEM_PROMPT = `# 角色

你是一个专业的内容总结专家，你的职责是为用户产出易于阅读的 RSS 标题和内容总结，少数情况下补充扩展阅读内容。

# 任务

深度理解一篇文章的内容，生成首选语言的标题和总结。

## 理解内容

- 标题
- 描述
- extra 中的所有额外数据（正文、评论等）
- 如果 extra.content 包含 [IMAGE_N] 占位符，说明文中有图片，位置信息已标记
- 如果有 extra.images 数组，包含图片的元数据（src、alt、尺寸等）

## 输出要求

- 所有输出使用首选语言
- 专有名词或缩写首次出现时，用括号标注原文，如：「错误检测与纠正（EDAC）」

## 生成标题

- 清晰表达内容主题
- 如果原标题模糊需根据实际内容重新生成

## 生成总结

总结包含正文和可选的「你知道吗？」章节。

**通用要求**：
- 使用 HTML 格式
- 风格要求：报道风格，客观准确，平实陈述，简洁凝练，自然流畅，易于阅读，避免冗余和夸张

**正文**：
- 总结文章的主要内容、重要信息和主要观点以及社区反馈等，以简化理解为目的，注意不是原样翻译
- 保留原文中重要内容的超链接（使用 <a href="..."> 标签）
- 如果 extra.images 存在，根据原文中 [IMAGE_N] 的位置和描述，猜测其作用，在总结中适当位置插入对应的 <img> 标签（禁止试图下载图片）
- 图片标签格式：<img src="..." alt="..." />（保留 width/height 属性如果有）

**「你知道吗？」章节（可选）**：
- 提供原文内容以外的扩展阅读
- 仅在需要解释文章中冷门小众的专业概念、知识，或有必要补充额外视角时，才需要在正文后添加此章节作为扩展补充，大多数文章不需要此章节
- 假设读者为相关领域的平均水平，无需解释领域常见概念和基础知识

## rejected 字段

如果文章内容（非标题）本身表明该条目实际上不值得阅读（如内容为空、严重误导、或与标题描述完全不符），将 rejected 设为 true。正常情况下设为 false。

## 输出

**必须**使用 write_summary 工具写入结果，禁止直接输出 JSON 或其他格式。

参数格式：
- guid: 条目的 GUID
- title: 首选语言标题
- description: HTML 格式的结构化总结
- rejected: 是否排除该条目

**调用工具后，等待工具返回结果。如果工具返回错误，请根据错误信息修正参数并重新调用工具，最多尝试 5 次。**`;

function buildUserPrompt(
  preferredLanguage: string,
  item: FeedItem,
  sourceContext: string | undefined,
  pluginContext: string | undefined,
): string {
  const extraFields = Object.entries(item.extra)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `- ${key}: ${value}`;
      }
      return `- ${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");

  const contextParts = [sourceContext, pluginContext]
    .filter(Boolean)
    .join("\n\n");
  const contextSection = contextParts
    ? `## 来源说明\n\n${contextParts}\n\n`
    : "";

  return `## 首选语言
${preferredLanguage}

${contextSection}## 条目内容

### 基本信息
- GUID: ${item.guid}
- 标题: ${item.title}

### 描述
${item.description}

### 额外信息
${extraFields || "无"}

请深度理解并总结这篇文章，然后调用 write_summary 工具写入结果。`;
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

async function summarizeOne(
  item: FeedItem,
  preferredLanguage: string,
  context: PluginContext,
  pluginContext: string | undefined,
): Promise<{
  result: SummaryResult;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}> {
  const userMessage = buildUserPrompt(
    preferredLanguage,
    item,
    context.sourceContext,
    pluginContext,
  );
  const adapter = context.llm("balanced");
  const { tool, getResult } = createSummarizeTool();

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
    temperature: 0.3,
    maxTokens: 4096,
  });

  try {
    const { result, tokenStats } = await handleStreamWithToolCall({
      stream,
      getResult,
    });
    return { result, ...tokenStats };
  } catch (_error) {
    throw new Error("总结失败：AI 未成功调用工具");
  }
}

interface SummarizeOptions {
  preferredLanguage?: string;
  context?: string;
  maxConcurrency?: number;
}

const plugin: Plugin<SummarizeOptions> = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    options: SummarizeOptions,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    const preferredLanguage = options.preferredLanguage || "zh-CN";
    const pluginContext = options.context;
    const maxConcurrency = options.maxConcurrency || 10;

    const itemsToSummarize = items.filter((item) => item.level !== "rejected");

    if (itemsToSummarize.length === 0) {
      return items;
    }

    logger.start(`开始总结 ${itemsToSummarize.length} 个条目...`);

    const limit = pLimit(maxConcurrency);
    const results = await Promise.all(
      itemsToSummarize.map((item) =>
        limit(() =>
          summarizeOne(item, preferredLanguage, context, pluginContext),
        ),
      ),
    );

    const totalTokens = results.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.promptTokens,
        completionTokens: acc.completionTokens + r.completionTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );

    logger.success(`总结完成 (${results.length} 个条目)`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r) continue;
      logger.log(`  ${i + 1}. ${r.result.title}`);
      logger.log(
        `     Token: 输入 ${r.promptTokens}, 输出 ${r.completionTokens}, 总计 ${r.totalTokens}`,
      );
    }
    logger.log(
      `  总计 Token: 输入 ${totalTokens.promptTokens}, 输出 ${totalTokens.completionTokens}, 总计 ${totalTokens.totalTokens}`,
    );

    const summaryMap = new Map(
      results.map((r, i) => [itemsToSummarize[i]?.guid, r.result]),
    );

    return items.map((item) => {
      const summary = summaryMap.get(item.guid);
      if (!summary) return item;
      if (summary.rejected) {
        return { ...item, level: "rejected" as const };
      }
      return {
        ...item,
        title: summary.title,
        description: summary.description,
      };
    });
  },
};

export default plugin;
