/**
 * 网页正文内容抓取插件
 */

import type { HTMLImageElement } from "linkedom";
import { parseHTML } from "linkedom";
import { http } from "../../lib/http";
import { logger } from "../../lib/logger";
import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

interface ImageData {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  title?: string;
}

const FILTER_KEYWORDS = [
  "category",
  "categories",
  "tag",
  "topic",
  "icon",
  "avatar",
];

export function shouldFilterImage(src: string, isFirstImage: boolean): boolean {
  if (src.startsWith("data:")) {
    return true;
  }

  if (isFirstImage) {
    const srcLower = src.toLowerCase();
    return FILTER_KEYWORDS.some((keyword) => srcLower.includes(keyword));
  }

  return false;
}

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

    for (const tag of document.querySelectorAll(
      "script, style, nav, header, footer, aside",
    )) {
      tag.remove();
    }

    const main =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector("body");

    if (main) {
      const images: ImageData[] = [];
      const imgTags = main.querySelectorAll("img");
      let imgIndex = 0;

      imgTags.forEach((img: HTMLImageElement, idx: number) => {
        const imgSrc = img.getAttribute("src") || "";

        if (shouldFilterImage(imgSrc, idx === 0)) {
          img.remove();
          return;
        }

        const imgData: ImageData = {
          src: imgSrc,
          alt: img.getAttribute("alt") || "",
        };

        const width = img.getAttribute("width");
        const height = img.getAttribute("height");
        const title = img.getAttribute("title");

        if (width) imgData.width = width;
        if (height) imgData.height = height;
        if (title) imgData.title = title;

        images.push(imgData);

        const placeholder = document.createTextNode(`[IMAGE_${imgIndex}]`);
        img.replaceWith(placeholder);
        imgIndex++;
      });

      let text = main.textContent || "";
      text = text.replace(/\s+/g, " ").trim().slice(0, 15000);

      item.extra.content = text;
      item.extra.images = images;
    } else {
      item.extra.content = "";
      item.extra.images = [];
    }
  } catch (error) {
    logger.warn(`抓取内容 ${url} 失败: ${error}`);
    item.extra.content = "";
    item.extra.images = [];
  }

  return item;
}

export default plugin;
