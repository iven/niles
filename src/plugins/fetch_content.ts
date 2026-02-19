/**
 * 网页正文内容抓取插件
 */

import { parseHTML } from 'linkedom';
import type { HTMLImageElement } from 'linkedom';
import type { Plugin, RssItem } from '../lib/plugin';

interface ImageData {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  title?: string;
}

const plugin: Plugin = {
  name: 'fetch_content',

  async processItem(item: RssItem): Promise<RssItem> {
    const url = item.link;
    if (!url) return item;

    item.extra ??= {};

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const { document } = parseHTML(html);

      for (const tag of document.querySelectorAll('script, style, nav, header, footer, aside')) {
        tag.remove();
      }

      const main = document.querySelector('article') || document.querySelector('main') || document.querySelector('body');

      if (main) {
        const images: ImageData[] = [];
        const imgTags = main.querySelectorAll('img');
        const filterKeywords = ['category', 'categories', 'tag', 'topic', 'icon', 'avatar'];
        let imgIndex = 0;

        imgTags.forEach((img: HTMLImageElement, idx: number) => {
          const imgSrc = img.getAttribute('src') || '';
          const imgSrcLower = imgSrc.toLowerCase();

          if (idx === 0 && filterKeywords.some(keyword => imgSrcLower.includes(keyword))) {
            img.remove();
            return;
          }

          if (imgSrc.startsWith('data:')) {
            img.remove();
            return;
          }

          const imgData: ImageData = {
            src: imgSrc,
            alt: img.getAttribute('alt') || '',
          };

          const width = img.getAttribute('width');
          const height = img.getAttribute('height');
          const title = img.getAttribute('title');

          if (width) imgData.width = width;
          if (height) imgData.height = height;
          if (title) imgData.title = title;

          images.push(imgData);

          const placeholder = document.createTextNode(`[IMAGE_${imgIndex}]`);
          img.replaceWith(placeholder);
          imgIndex++;
        });

        let text = main.textContent || '';
        text = text.replace(/\s+/g, ' ').trim().slice(0, 15000);

        item.extra.content = text;
        item.extra.images = images;
      } else {
        item.extra.content = '';
        item.extra.images = [];
      }
    } catch (error) {
      console.error(`抓取内容 ${url} 失败: ${error}`);
      item.extra.content = '';
      item.extra.images = [];
    }

    return item;
  },
};

export default plugin;
