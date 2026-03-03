/**
 * LLM 分级插件
 * 对 level === "unknown" 的条目调用 LLM 进行分级
 */

import { chat } from "@tanstack/ai";
import { z } from "zod";
import { handleStreamWithToolCall } from "../../lib/llm";

import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem, GradeResult } from "../../types";
import { gradeResultSchema } from "../../types";

const GRADE_SYSTEM_PROMPT = `# 任务：内容分级

根据用户兴趣配置，基于标题和摘要对文章进行分级。

## 分级规则

按以下步骤进行分级：

1. **理解用户兴趣**：
   - 兴趣分为四类：high_interest（很感兴趣）、interest（感兴趣）、uninterested（不太感兴趣）、avoid（想要避开）
   - 全局配置和来源配置都要考虑，来源配置权重更高

2. **进行分级**：根据文章的标题、摘要，判断文章主题，再判断用户对该主题的兴趣程度
   - **level 字段的 4 个合法值（必须精确匹配）**：
     - critical：用户会强烈感兴趣，必看内容
     - recommended：用户会感兴趣，推荐阅读
     - optional：标题含义模糊或兴趣不明确，可选
     - rejected：用户不感兴趣，应该被排除
   - **综合判断示例**：
     - 例 1：文章主要讲主题 A，顺便提到主题 B → 主要主题是 A → 即使全局配置 B 是 high_interest、A 是 avoid，也应判断为 rejected（主要主题权重更高）
     - 例 2：全局配置主题 X 为 interest，来源配置主题 Y 为 high_interest → 文章同时讲 X 和 Y → 两个配置都在起作用，都是高兴趣，应判断为 critical 或 recommended（根据主题占比判断）
     - 例 3：全局配置主题 X 为 high_interest，来源配置主题 Y 为 uninterested → 文章同时讲 X 和 Y，两者比重相当 → 综合评定可能为 recommended 或 optional（X 加分，Y 减分，需根据主题占比和配置综合权衡，权衡时来源配置的权重更高）

**重要**：
- 禁止编写脚本、禁止匹配关键词，要理解标题和摘要实际在讲什么
- 直接根据理解判断分级

## 输出

**必须**使用 write_grade_results 工具写入分级结果，禁止直接输出 JSON 或其他格式。

参数格式：
- items: 数组，每个元素包含 guid、level、reason
- reason 字段格式：简要说明主题及分级原因，避免重复标题内容。例如「虽然涉及 A，但主要是讲 B，故排除」

**调用工具后，等待工具返回结果。如果工具返回错误，请根据错误信息修正参数并重新调用工具，最多尝试 5 次。**`;

interface LlmGradeOptions {
  globalHighInterest?: string;
  globalInterest?: string;
  globalUninterested?: string;
  globalAvoid?: string;
  highInterest?: string;
  interest?: string;
  uninterested?: string;
  avoid?: string;
  context?: string;
}

function buildUserPrompt(
  options: LlmGradeOptions,
  items: FeedItem[],
  sourceContext: string | undefined,
): string {
  const itemsText = items
    .map((item) => {
      const meta = (item.extra.meta as string) || "";
      return `### 文章
- GUID: ${item.guid}
- 标题: ${item.title}
- 摘要: ${meta}`;
    })
    .join("\n\n");

  const contextParts = [sourceContext, options.context]
    .filter(Boolean)
    .join("\n\n");
  const contextSection = contextParts
    ? `## 来源说明\n\n${contextParts}\n\n`
    : "";

  const globalSection = [
    options.globalHighInterest &&
      `- 很感兴趣 (high_interest): ${options.globalHighInterest}`,
    options.globalInterest && `- 感兴趣 (interest): ${options.globalInterest}`,
    options.globalUninterested &&
      `- 不太感兴趣 (uninterested): ${options.globalUninterested}`,
    options.globalAvoid && `- 想要避开 (avoid): ${options.globalAvoid}`,
  ]
    .filter(Boolean)
    .join("\n");

  const sourceSection = [
    options.highInterest &&
      `- 很感兴趣 (high_interest): ${options.highInterest}`,
    options.interest && `- 感兴趣 (interest): ${options.interest}`,
    options.uninterested &&
      `- 不太感兴趣 (uninterested): ${options.uninterested}`,
    options.avoid && `- 想要避开 (avoid): ${options.avoid}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `## 内容来源

${contextSection}## 用户兴趣配置

### 全局配置
${globalSection || "无"}

### 针对当前来源的配置（权重更高）
${sourceSection || "无"}

## 待分级内容
共 ${items.length} 篇文章：

${itemsText}

请对每篇文章进行分级，并调用 write_grade_results 工具写入结果。`;
}

function createGradeTool(items: FeedItem[]) {
  let finalResult: GradeResult[];

  const gradeResultsInputSchema = z.object({
    items: z.array(gradeResultSchema),
  });

  const tool = {
    name: "write_grade_results",
    description: "写入分级结果",
    inputSchema: gradeResultsInputSchema,
    execute: async (params: { items: GradeResult[] }) => {
      if (params.items.length !== items.length) {
        return {
          success: false,
          error: `条目数量不匹配：期望 ${items.length} 个，实际 ${params.items.length} 个`,
        };
      }
      const itemGuids = new Set(items.map((item) => item.guid));
      for (const result of params.items) {
        if (!itemGuids.has(result.guid)) {
          return {
            success: false,
            error: `找不到 GUID 为 ${result.guid} 的条目，请检查 guid 是否正确`,
          };
        }
      }
      finalResult = params.items;
      return { success: true };
    },
  };

  return {
    tool,
    getResult: () => finalResult,
  };
}

const plugin: Plugin<LlmGradeOptions> = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    options: LlmGradeOptions,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    const itemsToGrade = items.filter((item) => item.level !== "rejected");

    if (itemsToGrade.length === 0) {
      return items;
    }

    context.logger.start(`开始分级 ${itemsToGrade.length} 个条目...`);

    const userMessage = buildUserPrompt(
      options,
      itemsToGrade,
      context.sourceContext,
    );
    const adapter = context.llm("balanced");
    const { tool, getResult } = createGradeTool(itemsToGrade);

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
      maxTokens: 8192,
    });

    let gradeResults: GradeResult[];
    try {
      const { result, tokenStats } = await handleStreamWithToolCall({
        stream,
        getResult,
        logger: context.logger,
      });
      gradeResults = result;
      context.logger.log(
        `  Token 使用: 输入 ${tokenStats.promptTokens}, 输出 ${tokenStats.completionTokens}, 总计 ${tokenStats.totalTokens}`,
      );
    } catch (_error) {
      throw new Error("分级失败：AI 未成功调用工具");
    }

    const gradeMap = new Map(gradeResults.map((r) => [r.guid, r]));

    const result = items.map((item) => {
      const gradeResult = gradeMap.get(item.guid);
      if (!gradeResult) return item;
      return { ...item, level: gradeResult.level, reason: gradeResult.reason };
    });

    const grouped = gradeResults.reduce(
      (acc, r) => {
        if (!acc[r.level]) acc[r.level] = [];
        acc[r.level]?.push(r);
        return acc;
      },
      {} as Record<string, GradeResult[]>,
    );

    const levelNames: Record<string, string> = {
      critical: "必看",
      recommended: "推荐",
      optional: "可选",
      rejected: "排除",
    };

    context.logger.success(`分级完成 (${gradeResults.length} 个条目)`);
    let firstGroup = true;
    for (const level of ["critical", "recommended", "optional", "rejected"]) {
      const levelItems = grouped[level];
      if (!levelItems || levelItems.length === 0) continue;
      if (!firstGroup) context.logger.log("");
      firstGroup = false;
      context.logger.log(`  ${levelNames[level]}`);
      for (let i = 0; i < levelItems.length; i++) {
        const r = levelItems[i];
        if (!r) continue;
        const item = items.find((it) => it.guid === r.guid);
        context.logger.log(`    ${i + 1}. ${item?.title ?? r.guid}`);
        context.logger.log(`       理由: ${r.reason}`);
      }
    }

    return result;
  },
};

export default plugin;
