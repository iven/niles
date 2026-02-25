/**
 * RSS 写入模块：生成 RSS XML（输出端）
 */

import { generateRssFeed, parseRssFeed } from "feedsmith";
import type { Rss } from "feedsmith/types";
import type { GradedRssItem } from "../types";

/**
 * 过滤并格式化分级后的条目为 RSS item
 */
export function formatGradedItems(items: GradedRssItem[]): Rss.Item<string>[] {
  const matchedItems = items.filter((item) => item.level !== "rejected");

  return matchedItems.map((item) => {
    let title = item.title;
    if (item.level === "critical") {
      title = `⭐⭐ ${title}`;
    } else if (item.level === "recommended") {
      title = `⭐ ${title}`;
    }

    return {
      title,
      link: item.link,
      pubDate: item.pubDate,
      guid: { value: item.guid || item.link, isPermaLink: false },
      description: `<p><small>[${item.level}] ${item.reason}</small></p>${item.description}`,
    };
  });
}

export async function writeRss(
  data: {
    source_name: string;
    source_url: string;
    title?: string;
    items: GradedRssItem[];
  },
  existingRssPath: string,
): Promise<{ rss: string; newCount: number }> {
  const rssTitle = data.title || `${data.source_name} - 精选`;

  const newItems = formatGradedItems(data.items);

  // 读取现有 RSS
  let existingItems: Rss.Item<string>[] = [];
  const file = Bun.file(existingRssPath);
  if (await file.exists()) {
    try {
      const content = await file.text();
      const feed = parseRssFeed(content);
      existingItems = (feed.items as Rss.Item<string>[]) || [];
    } catch (error) {
      throw new Error(
        `现有 RSS 文件损坏 ${existingRssPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const allItems = [...newItems, ...existingItems].slice(0, 50);

  const feed = {
    title: rssTitle,
    link: data.source_url,
    description: `基于个人兴趣筛选的 ${data.source_name} 内容`,
    lastBuildDate: new Date(),
    items: allItems,
  };

  const rss = generateRssFeed(feed as Rss.Feed<Date>, { loose: true });
  return { rss, newCount: newItems.length };
}
