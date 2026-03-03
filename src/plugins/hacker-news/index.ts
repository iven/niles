import { z } from "zod";
import { http } from "../../lib/http";
import { basePlugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface HNComment {
  author: string;
  text: string;
  points: number;
  depth: number;
}

type HNApiChild = {
  author?: string;
  text?: string;
  points?: number | null;
  children?: HNApiChild[];
};

const hnApiChildSchema: z.ZodType<HNApiChild> = z.lazy(() =>
  z
    .object({
      author: z.string().optional(),
      text: z.string().optional(),
      points: z.number().nullable().optional(),
      children: z.array(hnApiChildSchema).optional(),
    })
    .passthrough(),
);

const hnApiResponseSchema = z
  .object({
    children: z.array(hnApiChildSchema).optional(),
  })
  .passthrough();

const plugin = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    _options: object,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    context.logger.start("开始抓取 HN 评论...");
    const results = await Promise.all(
      items.map((item) =>
        item.level === "rejected" ? item : processOne(item, context),
      ),
    );
    const total = results.reduce(
      (sum, item) => sum + ((item.extra.comments as unknown[])?.length ?? 0),
      0,
    );
    context.logger.success(`抓取 HN 评论完成（共 ${total} 条）`);
    return results;
  },
};

async function processOne(
  item: FeedItem,
  context: PluginContext,
): Promise<FeedItem> {
  const url = item.guid || "";

  if (!url.includes("news.ycombinator.com")) {
    return item;
  }

  const match = /id=(\d+)/.exec(url);
  if (!match) return item;

  const itemId = match[1];

  item.link = url;

  try {
    const apiUrl = `https://hn.algolia.com/api/v1/items/${itemId}`;

    const json = await http.get(apiUrl).json();
    const parseResult = hnApiResponseSchema.safeParse(json);

    if (!parseResult.success) {
      context.logger.warn(`HN API 响应格式错误: ${itemId}`);
      return item;
    }

    const comments = extractComments(parseResult.data.children || [], 0, 2);
    item.extra.comments = comments;
  } catch (error) {
    context.logger.warn(`抓取 HN 评论失败 ${itemId}: ${error}`);
    item.extra.comments = [];
  }

  return item;
}

function extractComments(
  children: HNApiChild[],
  depth: number,
  maxDepth: number,
): HNComment[] {
  const comments: HNComment[] = [];
  const limit = depth === 0 ? 10 : 2;

  for (let i = 0; i < Math.min(children.length, limit); i++) {
    const child = children[i];
    if (!child) continue;

    const text = child.text?.trim();

    if (text) {
      comments.push({
        author: child.author || "",
        text,
        points: child.points || 0,
        depth,
      });
    }

    if (depth < maxDepth && child.children) {
      const subComments = extractComments(child.children, depth + 1, maxDepth);
      comments.push(...subComments);
    }
  }

  return comments;
}

export default plugin;
