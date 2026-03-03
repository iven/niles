import { generateRssFeed, parseRssFeed } from "feedsmith";
import type { Rss } from "feedsmith/types";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

export function formatItems(
  items: FeedItem[],
  showReason = true,
): Rss.Item<string>[] {
  const matchedItems = items.filter((item) => item.level !== "rejected");

  return matchedItems.map((item) => {
    let title = item.title;
    if (item.level === "critical") {
      title = `⭐⭐ ${title}`;
    } else if (item.level === "recommended") {
      title = `⭐ ${title}`;
    }

    const levelNote = showReason
      ? `<p><small style="opacity: 0.7;">[${item.level}] ${item.reason}</small></p>`
      : "";

    return {
      title,
      link: item.link,
      pubDate: item.pubDate,
      guid: { value: item.guid || item.link, isPermaLink: false },
      description: `${levelNote}${item.description}`,
    };
  });
}

interface ReporterRssOptions {
  outputPath: string;
  sourceName?: string;
  title?: string;
  showReason?: boolean;
}

const reporter: Plugin<ReporterRssOptions> = {
  ...basePlugin,
  async report(
    items: FeedItem[],
    options: ReporterRssOptions,
    context: PluginContext,
  ) {
    const { outputPath, sourceName = "", title, showReason = true } = options;
    if (!outputPath) throw new Error("reporter-rss: options.outputPath 未指定");
    const feedTitle = title || `${sourceName} - 精选`;

    context.logger.start("开始生成报告...");
    const newItems = formatItems(items, showReason);

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
      title: feedTitle,
      description: `基于个人兴趣筛选的 ${sourceName} 内容`,
      lastBuildDate: new Date(),
      items: allItems,
    };

    const nonRejected = items.filter((item) => item.level !== "rejected");
    context.logger.log("");
    context.logger.success(`处理完成 (${nonRejected.length} 个条目)`);
    context.logger.log(`  源: ${sourceName}`);

    if (context.isDryRun) return;

    const rss = generateRssFeed(feed as Rss.Feed<Date>, { loose: true });
    await Bun.write(outputPath, rss);
    context.logger.log(`  写入 ${newItems.length} 个新条目 → ${outputPath}`);
  },
};

export default reporter;
