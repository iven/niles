/**
 * cnBeta 网页正文内容抓取插件
 */

import { parseHTML } from 'linkedom';
import type { Plugin, RssItem } from '../lib/plugin';

const plugin: Plugin = {
  name: 'cnbeta_fetch_content',

  async processItem(item: RssItem): Promise<RssItem> {
    const url = item.link;
    if (!url) return item;

    item.extra ??= {};

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(\`HTTP \${response.status}\`);

      const html = await response.text();
      const { document } = parseHTML(html);

      const summary = document.querySelector('.article-summary');
      const content = document.querySelector('.article-content');

      const htmlParts: string[] = [];

      if (summary) {
        const topic = summary.querySelector('.topic');
        if (topic) topic.remove();
        htmlParts.push(summary.innerHTML);
      }

      if (content) {
        htmlParts.push(content.innerHTML);
      }

      if (htmlParts.length > 0) {
        item.description = htmlParts.join('');
      }
    } catch (error) {
      console.error(\`抓取内容 \${url} 失败: \${error}\`);
    }

    return item;
  },
};

export default plugin;
