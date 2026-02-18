#!/usr/bin/env bun
/**
 * RSS 生成脚本
 */

import { parseArgs } from 'util';
import { existsSync, readFileSync } from 'fs';

interface ParsedArgs {
  values: {
    title?: string;
  };
  positionals: string[];
}

interface FilterResult {
  title: string;
  type: string;
  reason: string;
  description?: string;
}

interface FilterResults {
  source_name: string;
  source_url: string;
  results: Record<string, FilterResult>;
}

interface ItemsData {
  source_title?: string;
  items: Array<{
    guid: string;
    title: string;
    link: string;
    pubDate: string;
    description?: string;
    [key: string]: unknown;
  }>;
}

interface MergedItem {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  type: string;
  reason: string;
}

function escapeXml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseExistingRss(rssPath: string): string[] {
  try {
    if (!existsSync(rssPath)) return [];

    const content = readFileSync(rssPath, 'utf-8');
    const matches = content.matchAll(/<item>([\s\S]*?)<\/item>/g);
    return Array.from(matches, m => m[1]);
  } catch {
    return [];
  }
}













function generateRssItem(item: MergedItem): string {
  let title = item.title;

  if (item.type === 'high_interest') {
    title = `⭐⭐ ${title}`;
  } else if (item.type === 'interest') {
    title = `⭐ ${title}`;
  }

  const escapedTitle = escapeXml(title);
  const escapedLink = escapeXml(item.link);
  const escapedGuid = escapeXml(item.guid || item.link);

  const description = `${item.description}<p><small>[${item.type}] ${item.reason}</small></p>`;

  return `    <item>
      <title>${escapedTitle}</title>
      <link>${escapedLink}</link>
      <pubDate>${item.pubDate}</pubDate>
      <guid>${escapedGuid}</guid>
      <description><![CDATA[${description}]]></description>
    </item>`;
}

function generateRss(
  data: { source_name: string; source_url: string; title?: string; items: MergedItem[] },
  existingRssPath: string
): { rss: string; newCount: number } {
  const rssTitle = data.title || data.source_name + ' - 精选';

  const matchedItems = data.items.filter(item =>
    ['high_interest', 'interest', 'other'].includes(item.type)
  );

  const newItemsXml = matchedItems.map(generateRssItem).join('\n');

  const existingItems = parseExistingRss(existingRssPath);

  let allItemsXml = newItemsXml;
  if (existingItems.length > 0) {
    allItemsXml += '\n' + existingItems.map(item => `    <item>${item}</item>`).join('\n');
  }

  const allItemsList = allItemsXml.split('<item>').filter(item => item.trim());
  const limitedItems = allItemsList.slice(0, 50).map(item => `<item>${item}`).join('\n');

  const now = new Date().toUTCString();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(rssTitle)}</title>
    <link>${escapeXml(data.source_url)}</link>
    <description>基于个人兴趣筛选的 ${escapeXml(data.source_name)} 内容</description>
    <lastBuildDate>${now}</lastBuildDate>

${limitedItems}
  </channel>
</rss>`;

  return { rss, newCount: matchedItems.length };
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      title: { type: 'string' },
    },
    allowPositionals: true,
  }) as ParsedArgs;

  const [itemsPath, resultsPath, outputPath] = positionals;

  if (!itemsPath || !resultsPath || !outputPath) {
    console.error('用法: generate-rss <items> <results> <output> [--title <title>]');
    process.exit(1);
  }

  const itemsData: ItemsData = await Bun.file(itemsPath).json();
  const resultsData: FilterResults = await Bun.file(resultsPath).json();

  const mergedItems: MergedItem[] = itemsData.items.map(item => {
    const result = resultsData.results[item.guid] || {
      type: 'exclude',
      title: '',
      reason: '未找到筛选结果',
    };

    return {
      ...item,
      title: result.title || item.title,
      description: result.description || item.description || '',
      type: result.type,
      reason: result.reason,
    };
  });

  const data = {
    source_name: resultsData.source_name,
    source_url: resultsData.source_url,
    items: mergedItems,
    title: values.title?.trim() || itemsData.source_title,
  };

  const { rss, newCount } = generateRss(data, outputPath);

  await Bun.write(outputPath, rss);

  console.log(`RSS 生成成功: ${outputPath}`);
  console.log(`- 源名称: ${data.source_name}`);
  console.log(`- 新增条目: ${newCount}`);
}

main().catch(error => {
  console.error(`错误: ${error}`);
  process.exit(1);
});
