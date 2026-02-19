#!/usr/bin/env bun
/**
 * 从 RSS feed 中提取新条目（去重）
 */

import { parseArgs } from 'util';
import { parseRssFeed } from 'feedsmith';
import { GuidTracker } from '../lib/guid-tracker';
import { applyPlugins, type RssItem } from '../lib/plugin';

interface ParsedArgs {
  values: {
    'source-name': string;
    'max-items': string;
    'min-items': string;
    output?: string;
    plugins?: string;
  };
  positionals: string[];
}

interface RssOutput {
  source_name: string;
  source_url: string;
  source_title: string | null;
  total_items: number;
  existing_items: number;
  new_items: number;
  items: RssItem[];
}

async function parseRssItems(url: string): Promise<{ channelTitle: string | null; items: RssItem[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const feed = parseRssFeed(xml);

    const cleanZeroWidth = (text: string): string => {
      return text.replace(/^[\u200b\s]+|[\u200b\s]+$/g, '');
    };

    const items: RssItem[] = (feed.items || []).map((item) => ({
      title: cleanZeroWidth(item.title || ''),
      link: item.link || '',
      pubDate: item.pubDate || '',
      description: cleanZeroWidth(item.description || ''),
      guid: item.guid?.value || item.link || '',
    }));

    return {
      channelTitle: feed.title ?? null,
      items,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'source-name': { type: 'string' },
      'max-items': { type: 'string', default: '20' },
      'min-items': { type: 'string', default: '0' },
      output: { type: 'string' },
      plugins: { type: 'string' },
    },
    allowPositionals: true,
  }) as ParsedArgs;

  const [url, existingRss] = positionals;

  if (!url || !existingRss || !values['source-name']) {
    console.error('用法: fetch-rss-items <url> <existing-rss> --source-name <name> [options]');
    process.exit(1);
  }

  const sourceName = values['source-name'];
  const maxItems = parseInt(values['max-items'], 10);
  const minItems = parseInt(values['min-items'], 10);

  const historyPath = existingRss.replace(/\.xml$/, '-processed.json');
  const tracker = new GuidTracker(historyPath);

  const { channelTitle, items: allItems } = await parseRssItems(url);

  const limitedItems = allItems.slice(0, maxItems);

  let newItems = limitedItems.filter(item => !tracker.isProcessed(item.guid));

  if (newItems.length < minItems) {
    for (const item of limitedItems) {
      if (newItems.length >= minItems) break;
      if (!newItems.some(ni => ni.guid === item.guid)) {
        newItems.push(item);
      }
    }
  }

  const pluginNames = values.plugins ? values.plugins.split(',') : [];
  newItems = await applyPlugins(newItems, pluginNames);

  tracker.markProcessed(newItems.map(item => item.guid));
  tracker.cleanup();
  tracker.persist();

  const result: RssOutput = {
    source_name: sourceName,
    source_url: url,
    source_title: channelTitle,
    total_items: limitedItems.length,
    existing_items: limitedItems.length - newItems.length,
    new_items: newItems.length,
    items: newItems,
  };

  if (values.output) {
    await Bun.write(values.output, JSON.stringify(result, null, 2));
    console.error(`提取完成: ${newItems.length} 个新条目`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(error => {
  console.error(`错误: ${error}`);
  process.exit(1);
});
