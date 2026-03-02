/**
 * 网页 meta description 抓取插件
 */

import { parseHTML } from "linkedom";
import { http } from "../../lib/http";
import { logger } from "../../lib/logger";
import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

const plugin = {
  ...basePlugin,
  async processItems(items: FeedItem[]): Promise<FeedItem[]> {
    return Promise.all(items.map((item) => processOne(item)));
  },
};

async function processOne(item: FeedItem): Promise<FeedItem> {
  const url = item.link;
  if (!url) return item;

  try {
    const html = await http.get(url).text();
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
    logger.warn(`抓取 meta ${url} 失败: ${error}`);
    item.extra.meta = "";
  }

  return item;
}

export default plugin;
