#!/usr/bin/env bun

/**
 * RSS 生成脚本
 */

import { parseArgs } from 'node:util';
import { generateRssFeed, parseRssFeed } from 'feedsmith';
import type { Rss } from 'feedsmith/types';

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

async function parseExistingRss(rssPath: string): Promise<Rss.Item<string>[]> {
  try {
    const file = Bun.file(rssPath);
    if (!(await file.exists())) return [];
    const content = await file.text();
    const feed = parseRssFeed(content);
    return (feed.items as Rss.Item<string>[]) || [];
  } catch {
    return [];
  }
}

async function generateRss(
  data: {
    source_name: string;
    source_url: string;
    title?: string;
    items: MergedItem[];
  },
  existingRssPath: string,
): Promise<{ rss: string; newCount: number }> {
  const rssTitle = data.title || `${data.source_name} - 精选`;

  const matchedItems = data.items.filter((item) =>
    ['high_interest', 'interest', 'other'].includes(item.type),
  );

  const newItems = matchedItems.map((item) => {
    let title = item.title;
    if (item.type === 'high_interest') {
      title = `⭐⭐ ${title}`;
    } else if (item.type === 'interest') {
      title = `⭐ ${title}`;
    }

    return {
      title,
      link: item.link,
      pubDate: item.pubDate,
      guid: { value: item.guid || item.link, isPermaLink: false },
      description: `${item.description}<p><small>[${item.type}] ${item.reason}</small></p>`,
    };
  });

  const existingItems = await parseExistingRss(existingRssPath);
  const allItems = [...newItems, ...existingItems].slice(0, 50);

  const feed = {
    title: rssTitle,
    link: data.source_url,
    description: `基于个人兴趣筛选的 ${data.source_name} 内容`,
    lastBuildDate: new Date(),
    items: allItems,
  };

  const rss = generateRssFeed(feed as Rss.Feed<Date>, { loose: true });
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
    console.error(
      '用法: generate-rss <items> <results> <output> [--title <title>]',
    );
    process.exit(1);
  }

  const itemsData: ItemsData = await Bun.file(itemsPath).json();
  const resultsData: FilterResults = await Bun.file(resultsPath).json();

  const mergedItems: MergedItem[] = itemsData.items.map((item) => {
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

  const { rss, newCount } = await generateRss(data, outputPath);

  await Bun.write(outputPath, rss);

  console.log(`RSS 生成成功: ${outputPath}`);
  console.log(`- 源名称: ${data.source_name}`);
  console.log(`- 新增条目: ${newCount}`);
}

main().catch((error) => {
  console.error(`错误: ${error}`);
  process.exit(1);
});
