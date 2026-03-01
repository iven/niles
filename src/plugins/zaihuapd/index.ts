/**
 * 在花频道 description 清理插件
 * 删除最后的固定链接和图片
 */

import { parseHTML } from "linkedom";
import { logger } from "../../lib/logger";
import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const emojiRe = /^\p{Extended_Pictographic}/u;

function trimLeadingEmoji(str: string): string {
  const segments = [...segmenter.segment(str)];
  const i = segments.findIndex(
    ({ segment: s }) => !emojiRe.test(s) && s.trim() !== "",
  );
  return i === -1
    ? ""
    : segments
        .slice(i)
        .map(({ segment }) => segment)
        .join("");
}

const plugin = {
  ...basePlugin,
  async processItems(items: FeedItem[]): Promise<FeedItem[]> {
    return Promise.all(items.map((item) => processOne(item)));
  },
};

async function processOne(item: FeedItem): Promise<FeedItem> {
  item.title = trimLeadingEmoji(item.title);

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
          "outerHTML" in node ? (node as { outerHTML: string }).outerHTML : "";
      }
    }

    item.description = result;
  } catch (error) {
    logger.warn(`清理 description 失败: ${error}`);
  }

  return item;
}

export default plugin;
