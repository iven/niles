import { parseFeed } from "feedsmith";
import type { Atom, DeepPartial } from "feedsmith/types";
import { http } from "../../lib/http";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface CollectRssOptions {
  url: string;
  maxItems?: number;
}

const plugin: Plugin<CollectRssOptions> = {
  ...basePlugin,
  async collect(options, context: PluginContext) {
    const { url, maxItems } = options;
    if (!url) throw new Error("collect-rss: options.url 未指定");

    context.logger.start("开始获取新条目...");
    const xml = await http.get(url).text();
    const { format, feed } = parseFeed(xml);

    let rawItems: Array<{
      title?: string;
      link?: string;
      pubDate?: string;
      description?: string;
      guid?: { value?: string };
    }>;

    if (format === "atom") {
      rawItems = (feed.entries || []).map(
        (entry: DeepPartial<Atom.Entry<string>>) => ({
          title: entry.title || "",
          link: entry.links?.[0]?.href,
          pubDate: entry.updated,
          description: entry.content || entry.summary,
          guid: { value: entry.id || "" },
        }),
      );
    } else {
      rawItems = (feed.items || []) as typeof rawItems;
    }

    const items: FeedItem[] = rawItems.map((item) => ({
      title: item.title || "",
      link: item.link || "",
      pubDate: item.pubDate || "",
      description: item.description || "",
      guid: item.guid?.value || item.link || "",
      extra: {},
      level: "unknown" as const,
      reason: "未分级",
    }));

    const limited = maxItems ? items.slice(0, maxItems) : items;
    context.logger.success(`获取到 ${limited.length} 个条目`);
    return {
      title: feed.title,
      items: limited,
    };
  },
};

export default plugin;
