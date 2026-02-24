/**
 * RSS 加载模块：提供处理好的 RSS 条目（输入端）
 */

import { parseRssFeed } from "feedsmith";
import { init as rsshubInit, request as rsshubRequest } from "rsshub";
import { z } from "zod";
import type { GuidTracker } from "../lib/guid-tracker";
import type { UngradedRssItem } from "../types";
import { applyPlugins } from "./plugin";

const rssFeedItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
  description: z.string().optional(),
  guid: z.object({ value: z.string().optional() }).optional(),
});

const rsshubResponseSchema = z.object({
  title: z.string().optional(),
  item: z.array(z.unknown()).optional(),
});

async function fetchRss(
  url: string,
): Promise<{ channelTitle: string | null; items: UngradedRssItem[] }> {
  let title: string | undefined;
  let rawItems: Array<{
    title?: string;
    link?: string;
    pubDate?: string;
    description?: string;
    guid?: { value?: string };
  }>;

  if (url.startsWith("rsshub://")) {
    await rsshubInit();
    const route = url.replace("rsshub://", "");
    const rsshubData = await rsshubRequest(route);

    const parseResult = rsshubResponseSchema.safeParse(rsshubData);
    if (!parseResult.success) {
      throw new Error(`RSSHub 响应格式错误: ${parseResult.error.message}`);
    }

    title = parseResult.data.title;
    rawItems = (parseResult.data.item || []).map((item) => {
      const itemResult = rssFeedItemSchema.safeParse(item);
      return itemResult.success
        ? itemResult.data
        : {
            title: undefined,
            link: undefined,
            pubDate: undefined,
            description: undefined,
            guid: undefined,
          };
    });
  } else {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSS Reader/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const feed = parseRssFeed(xml);
    title = feed.title;
    rawItems = (feed.items || []) as typeof rawItems;
  }

  const items: UngradedRssItem[] = rawItems.map((item) => ({
    title: item.title || "",
    link: item.link || "",
    pubDate: item.pubDate || "",
    description: item.description || "",
    guid: item.guid?.value || item.link || "",
    extra: {},
    graded: false as const,
  }));

  return {
    channelTitle: title ?? null,
    items,
  };
}

function selectItems(
  allItems: UngradedRssItem[],
  tracker: GuidTracker,
  maxItems: number,
  minItems: number,
): UngradedRssItem[] {
  const unprocessedItems = allItems
    .filter((item) => !tracker.isProcessed(item.guid))
    .slice(0, maxItems);

  if (unprocessedItems.length >= minItems) {
    return unprocessedItems;
  }

  const selectedItems = [...unprocessedItems];
  const selectedGuids = new Set(selectedItems.map((item) => item.guid));

  for (const item of allItems) {
    if (selectedItems.length >= minItems) break;
    if (!selectedGuids.has(item.guid)) {
      selectedItems.push(item);
      selectedGuids.add(item.guid);
    }
  }

  return selectedItems;
}

interface LoadRssOptions {
  url: string;
  tracker: GuidTracker;
  maxItems: number;
  minItems: number;
  plugins?: string[];
}

interface LoadRssResult {
  channelTitle: string | null;
  items: UngradedRssItem[];
}

const BUILTIN_PLUGINS = ["clean_text"];

export async function loadRss(options: LoadRssOptions): Promise<LoadRssResult> {
  const { url, tracker, maxItems, minItems, plugins = [] } = options;

  // 获取 RSS
  const { channelTitle, items: allItems } = await fetchRss(url);

  // 选择条目
  const selectedItems = selectItems(allItems, tracker, maxItems, minItems);

  // 应用插件（内置 + 用户）
  const allPlugins = [...BUILTIN_PLUGINS, ...plugins];
  const processedItems = await applyPlugins(selectedItems, allPlugins);

  return {
    channelTitle,
    items: processedItems,
  };
}
