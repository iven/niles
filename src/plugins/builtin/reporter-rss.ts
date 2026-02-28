import { generateRssFeed, parseRssFeed } from "feedsmith";
import type { Rss } from "feedsmith/types";
import { basePlugin } from "../../plugin";
import type { GradedRssItem } from "../../types";

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
      description: `<p><small style="opacity: 0.7;">[${item.level}] ${item.reason}</small></p>${item.description}`,
    };
  });
}

const reporter = {
  ...basePlugin,
  async report(items: GradedRssItem[], options: Record<string, unknown>) {
    const outputPath = options.outputPath as string;
    if (!outputPath) throw new Error("reporter-rss: options.outputPath 未指定");

    const sourceName = (options.sourceName as string) || "";
    const title = (options.title as string) || `${sourceName} - 精选`;

    const newItems = formatGradedItems(items);

    let existingItems: Rss.Item<string>[] = [];
    const file = Bun.file(outputPath);
    if (await file.exists()) {
      try {
        const content = await file.text();
        const feed = parseRssFeed(content);
        existingItems = (feed.items as Rss.Item<string>[]) || [];
      } catch (error) {
        throw new Error(
          `现有 RSS 文件损坏 ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const allItems = [...newItems, ...existingItems].slice(0, 50);

    const feed = {
      title,
      description: `基于个人兴趣筛选的 ${sourceName} 内容`,
      lastBuildDate: new Date(),
      items: allItems,
    };

    const rss = generateRssFeed(feed as Rss.Feed<Date>, { loose: true });
    await Bun.write(outputPath, rss);
  },
};

export default reporter;
