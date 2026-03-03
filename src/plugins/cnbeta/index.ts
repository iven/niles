import { parseHTML } from "linkedom";
import { http } from "../../lib/http";
import { basePlugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const plugin = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    _options: object,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    context.logger.start("开始抓取内容...");
    const results = await Promise.all(
      items.map((item) =>
        item.level === "rejected" ? item : processOne(item, context),
      ),
    );
    const count = results.filter((item) => item.level !== "rejected").length;
    context.logger.success(`抓取内容完成（${count} 个条目）`);
    return results;
  },
};

async function processOne(
  item: FeedItem,
  context: PluginContext,
): Promise<FeedItem> {
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
      context.logger.debug(`  抓取内容: ${item.title}`);
    }
  } catch (error) {
    context.logger.warn(`抓取内容 ${url} 失败: ${error}`);
  }

  return item;
}

export default plugin;
