/**
 * cnBeta 网页正文内容抓取插件
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

    const summary = document.querySelector(".article-summary");
    const content = document.querySelector(".article-content");

    const htmlParts: string[] = [];

    if (summary) {
      const topic = summary.querySelector(".topic");
      if (topic) topic.remove();
      htmlParts.push(summary.innerHTML);
    }

    if (content) {
      htmlParts.push(content.innerHTML);
    }

    if (htmlParts.length > 0) {
      item.description = htmlParts.join("");
    }
  } catch (error) {
    logger.warn(`抓取内容 ${url} 失败: ${error}`);
  }

  return item;
}

export default plugin;
