import { parseFeed } from "feedsmith";
import type { Atom, DeepPartial } from "feedsmith/types";
import { withRetry } from "../../lib/retry";
import { basePlugin, type Plugin } from "../../plugin";
import type { FeedItem } from "../../types";

interface CollectRssOptions {
  url: string;
}

const plugin: Plugin<CollectRssOptions> = {
  ...basePlugin,
  async collect(options) {
    const { url } = options;
    if (!url) throw new Error("collect-rss: options.url 未指定");

    const response = await withRetry(() =>
      fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSS Reader/1.0)",
        },
        signal: AbortSignal.timeout(10000),
      }),
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
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

    return {
      title: feed.title,
      items,
    };
  },
};

export default plugin;
