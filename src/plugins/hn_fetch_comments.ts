/**
 * Hacker News 评论抓取插件
 */

import type { Plugin, RssItem } from '../lib/plugin';

interface HNComment {
  author: string;
  text: string;
  points: number;
  depth: number;
}

interface HNApiChild {
  author?: string;
  text?: string;
  points?: number;
  children?: HNApiChild[];
}

interface HNApiResponse {
  children?: HNApiChild[];
}

const plugin: Plugin = {
  name: 'hn_fetch_comments',

  async processItem(item: RssItem): Promise<RssItem> {
    const url = item.guid || '';

    if (!url.includes('news.ycombinator.com')) {
      return item;
    }

    item.extra ??= {};

    const match = /id=(\d+)/.exec(url);
    if (!match) return item;

    const itemId = match[1];

    try {
      const apiUrl = `https://hn.algolia.com/api/v1/items/${itemId}`;

      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as HNApiResponse;
      const comments = extractComments(data.children || [], 0, 2);
      item.extra.comments = comments;
    } catch (error) {
      console.error(`抓取 HN 评论失败 ${itemId}: ${error}`);
      item.extra.comments = [];
    }

    return item;
  },
};

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
        author: child.author || '',
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
