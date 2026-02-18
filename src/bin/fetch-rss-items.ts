#!/usr/bin/env bun
/**
 * 从 RSS feed 中提取新条目（去重）
 */

import { parseArgs } from 'util';
import { XMLParser } from 'fast-xml-parser';
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

async function fetchRss(url: string): Promise<string> {
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

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRssItems(rssContent: string): { channelTitle: string | null; items: RssItem[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '#cdata',
    trimValues: true,
  });

  const parsed = parser.parse(rssContent);
  const channel = parsed.rss?.channel;

  if (!channel) {
    throw new Error('Invalid RSS format: no channel found');
  }

  const channelTitle = channel.title || null;

  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

  const items: RssItem[] = rawItems.map((item: any) => {
    const getText = (value: any): string => {
      if (!value) return '';
      if (typeof value === 'string') return value.trim().replace(/^[\u200b\s]+|[\u200b\s]+$/g, '');
      if (value['#cdata']) return value['#cdata'].trim().replace(/^[\u200b\s]+|[\u200b\s]+$/g, '');
      if (value['#text']) return value['#text'].trim().replace(/^[\u200b\s]+|[\u200b\s]+$/g, '');
      return String(value).trim().replace(/^[\u200b\s]+|[\u200b\s]+$/g, '');
    };

    const title = getText(item.title);
    const link = getText(item.link);
    const pubDate = getText(item.pubDate);
    const description = getText(item.description);
    const guid = getText(item.guid) || link;

    return {
      title,
      link,
      pubDate,
      description,
      guid,
    };
  });

  return { channelTitle, items };
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

  const rssContent = await fetchRss(url);
  const { channelTitle, items: allItems } = parseRssItems(rssContent);

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
