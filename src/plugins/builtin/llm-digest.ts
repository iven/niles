import { chat } from "@tanstack/ai";
import { z } from "zod";
import { handleStreamWithToolCall } from "../../lib/llm";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const digestItemSchema = z.object({
  index: z.number().int().min(1),
  level: z.string(),
});

const digestThemeSchema = z.object({
  theme: z.string().min(1),
  items: z.array(digestItemSchema).min(1),
});

const digestGroupSchema = z.object({
  topic: z.string().min(1),
  themes: z.array(digestThemeSchema).min(1),
});

const digestResultSchema = z.object({
  groups: z.array(digestGroupSchema).min(1),
});

type DigestResult = z.infer<typeof digestResultSchema>;

const DIGEST_SYSTEM_PROMPT = `# 任务：新闻分组整理

对一批新闻条目进行分组和归类，为生成日报做准备。

## 第一步：按领域分组

将条目按领域分组（如「AI 技术」「科学探索」「国际政治」「国内政策」等）。

分组规则：
- 分组名称必须是通用领域名称，不能包含公司名、人名、事件名、地名
- 分组名不能是「XX 与 XX」的拼凑形式（比如「国内教育与劳动政策」），而应该将其归类为「国内政策」
- 每组新闻数量控制在 5-10 条左右
- level 为 critical 或 recommended 的条目不能归入「其他」分组，必须给它们找到合适的领域分组
- level 为 optional 且无法归入任何有意义领域的条目，归入「其他」分组

## 第二步：按主题归类

每个分组内，将相关联的条目归入同一主题（如「Anthropic 五角大楼风波」「十五五规划」）。

主题规则：
- 主题名称简洁明确，反映这组条目的共同事件或话题
- 只有一条的条目也需要主题
- 「其他」分组内同样需要归主题

## 第三步：排序

- 分组内按主题排序，根据主题内新闻的 level 和新闻含金量（大事件、一手新闻等含金量更高）来排序
- 主题内按 level 排序：critical > recommended > 其余

## 输出

**必须**使用 write_digest 工具写入结果，禁止直接输出 JSON 或其他格式。

**调用工具后，等待工具返回结果。如果工具返回错误，请根据错误信息修正并重新调用，最多尝试 5 次。**`;

function buildPrompt(items: FeedItem[]): string {
  const itemsText = items
    .map((item, i) => {
      const source = (item.extra._source as string) || "未知来源";
      return `#${i + 1} [${item.level}] ${item.title}（${source}）`;
    })
    .join("\n");

  return `以下是今日待整理的新闻条目，共 ${items.length} 条：

${itemsText}

请按任务说明进行分组和归类，然后调用 write_digest 工具写入结果。条目序号从 #1 开始。`;
}

function createDigestTool(totalCount: number) {
  let result: DigestResult;

  const tool = {
    name: "write_digest",
    description: "写入分组结果",
    inputSchema: digestResultSchema,
    execute: async (params: DigestResult) => {
      const seenIndexes = new Set<number>();
      for (const group of params.groups) {
        for (const theme of group.themes) {
          for (const item of theme.items) {
            if (item.index < 1 || item.index > totalCount) {
              return {
                success: false,
                error: `序号 #${item.index} 超出范围（共 ${totalCount} 条）`,
              };
            }
            if (seenIndexes.has(item.index)) {
              return {
                success: false,
                error: `序号 #${item.index} 重复出现在多个分组/主题中`,
              };
            }
            seenIndexes.add(item.index);
          }
        }
      }
      const missing = [];
      for (let i = 1; i <= totalCount; i++) {
        if (!seenIndexes.has(i)) missing.push(`#${i}`);
      }
      if (missing.length > 0) {
        return {
          success: false,
          error: `以下条目未被归入任何分组：${missing.join(", ")}`,
        };
      }
      result = params;
      return { success: true };
    },
  };

  return { tool, getResult: () => result };
}

function renderGroupHtml(
  group: DigestResult["groups"][0],
  indexToItem: Map<number, FeedItem>,
): string {
  const parts: string[] = [];

  for (const theme of group.themes) {
    parts.push(`<h3>${theme.theme}</h3>`);
    for (const digestItem of theme.items) {
      const item = indexToItem.get(digestItem.index);
      if (!item) continue;
      const star =
        item.level === "critical"
          ? "⭐⭐ "
          : item.level === "recommended"
            ? "⭐ "
            : "";
      parts.push(`<p>${star}<a href="${item.link}">${item.title}</a></p>`);
    }
  }

  return parts.join("\n");
}

interface LlmDigestOptions {
  maxConcurrency?: number;
}

const plugin: Plugin<LlmDigestOptions> = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    _options: LlmDigestOptions,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    const nonRejected = items.filter((item) => item.level !== "rejected");
    if (nonRejected.length === 0) return items;

    context.logger.start(`开始整理 ${nonRejected.length} 个条目...`);

    const { tool, getResult } = createDigestTool(nonRejected.length);

    const stream = chat({
      adapter: context.llm("balanced"),
      systemPrompts: [DIGEST_SYSTEM_PROMPT],
      messages: [
        {
          role: "user",
          content: [{ type: "text", content: buildPrompt(nonRejected) }],
        },
      ],
      tools: [tool],
      maxTokens: 8192,
    });

    let digestResult: DigestResult;
    try {
      const { result, tokenStats } = await handleStreamWithToolCall({
        stream,
        getResult,
        logger: context.logger,
      });
      digestResult = result;
      context.logger.log(
        `  Token 使用: 输入 ${tokenStats.promptTokens}, 输出 ${tokenStats.completionTokens}, 总计 ${tokenStats.totalTokens}`,
      );
    } catch (error) {
      throw new Error("日报整理失败：AI 未成功调用工具", { cause: error });
    }

    context.logger.success(`整理完成，共 ${digestResult.groups.length} 个分组`);
    for (const group of digestResult.groups) {
      const total = group.themes.reduce((acc, t) => acc + t.items.length, 0);
      context.logger.log(
        `  ${group.topic}（${group.themes.length} 个主题，${total} 条）`,
      );
    }

    const indexToItem = new Map(nonRejected.map((item, i) => [i + 1, item]));
    const now = context.now;
    const dateStr = now.toISOString().slice(0, 10);

    // 每个分组生成一个 FeedItem
    const digestItems: FeedItem[] = digestResult.groups.map((group, i) => {
      const firstIndex = group.themes[0]?.items[0]?.index;
      const firstItem = firstIndex ? indexToItem.get(firstIndex) : undefined;

      return {
        title: `${dateStr} ${group.topic}`,
        link: firstItem?.link ?? "",
        pubDate: now.toUTCString(),
        guid: `${context.sourceName}-${dateStr}-${i}`,
        description: renderGroupHtml(group, indexToItem),
        extra: {},
        level: "unknown" as const,
        reason: "",
      };
    });

    return digestItems;
  },
};

export default plugin;
