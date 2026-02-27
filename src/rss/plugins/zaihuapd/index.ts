/**
 * 在花频道 description 清理插件
 * 删除最后的固定链接和图片
 */

import { parseHTML } from "linkedom";
import { logger } from "../../../lib/logger";
import type { UngradedRssItem } from "../../../types";
import type { Plugin } from "../../plugin";

const plugin: Plugin = {
  name: "zaihuapd",

  async processItem(item: UngradedRssItem): Promise<UngradedRssItem> {
    // 清理标题前面的 emoji
    item.title = item.title.replace(/^[\p{Emoji}\s]+/u, "");

    if (!item.description) return item;

    try {
      const { document } = parseHTML(item.description);

      const links = document.querySelectorAll("a");
      for (const link of links) {
        const href = link.getAttribute("href");
        if (href?.includes("t.me/zaihuanews")) {
          const parent = link.parentElement;
          if (!parent) continue;

          const prev = link.previousSibling;

          if (prev && prev.nodeName === "SPAN" && prev.textContent === "🍀") {
            let current = prev;
            while (current) {
              const next = current.nextSibling;
              current.remove();
              current = next;
            }
          }

          while (parent.lastChild && parent.lastChild.nodeName === "BR") {
            parent.lastChild.remove();
          }
          while (
            parent.lastChild &&
            parent.lastChild.nodeType === 3 &&
            !parent.lastChild.textContent?.trim()
          ) {
            parent.lastChild.remove();
          }
        }
      }

      while (document.lastChild && document.lastChild.nodeName === "IMG") {
        document.lastChild.remove();
      }

      let result = "";
      for (const node of document.childNodes) {
        if (node.nodeName === "P" || node.nodeName === "DIV") {
          result +=
            "outerHTML" in node
              ? (node as { outerHTML: string }).outerHTML
              : "";
        }
      }

      item.description = result;
    } catch (error) {
      logger.warn(`清理 description 失败: ${error}`);
    }

    return item;
  },
};

export default plugin;
