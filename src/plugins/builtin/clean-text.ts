/**
 * 内置插件：清理文本中的零宽字符和多余空白
 */

import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

function cleanZeroWidth(text: string): string {
  return text.replace(/^[\u200b\s]+|[\u200b\s]+$/g, "");
}

const plugin = {
  ...basePlugin,
  async processItems(items: FeedItem[]): Promise<FeedItem[]> {
    return items.map((item) => ({
      ...item,
      title: cleanZeroWidth(item.title),
      description: cleanZeroWidth(item.description),
    }));
  },
};

export default plugin;
