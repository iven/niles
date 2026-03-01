/**
 * Hacker News 评论抓取插件
 */

import { z } from "zod";
import { logger } from "../../lib/logger";
import { basePlugin } from "../../plugin";
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
  async processItems(items: FeedItem[]): Promise<FeedItem[]> {
    return Promise.all(items.map((item) => processOne(item)));
  },
};

async function processOne(item: FeedItem): Promise<FeedItem> {
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

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const parseResult = hnApiResponseSchema.safeParse(json);

    if (!parseResult.success) {
      logger.warn(`HN API 响应格式错误: ${itemId}`);
      return item;
    }

    const comments = extractComments(parseResult.data.children || [], 0, 2);
    item.extra.comments = comments;
  } catch (error) {
    logger.warn(`抓取 HN 评论失败 ${itemId}: ${error}`);
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
