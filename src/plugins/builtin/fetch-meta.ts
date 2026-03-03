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
    context.logger.start("开始抓取 meta...");
    const results = await Promise.all(
      items.map((item) =>
        item.level === "rejected" ? item : processOne(item, context),
      ),
    );
    const count = results.filter((item) => item.level !== "rejected").length;
    context.logger.success(`抓取 meta 完成（${count} 个条目）`);
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
    context.logger.warn(`抓取 meta ${url} 失败: ${error}`);
    item.extra.meta = "";
  }

  return item;
}

export default plugin;
