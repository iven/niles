/**
 * 网页 meta description 抓取插件
 */

import { parseHTML } from "linkedom";
import type { Plugin, RssItem } from "../lib/plugin";

const plugin: Plugin = {
  name: "fetch_meta",

  async processItem(item: RssItem): Promise<RssItem> {
    const url = item.link;
    if (!url) return item;

    item.extra ??= {};

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const { document } = parseHTML(html);

      const metaDesc =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ||
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") ||
        "";

      item.extra.meta = metaDesc;
    } catch (error) {
      console.error(`抓取 meta ${url} 失败: ${error}`);
      item.extra.meta = "";
    }

    return item;
  },
};

export default plugin;
