import pLimit from "p-limit";
import { logger } from "./lib/logger";
import type { GradedRssItem, UngradedRssItem } from "./types";

interface Plugin {
  collect(
    options: Record<string, unknown>,
  ): Promise<{ title?: string; items: UngradedRssItem[] }>;
  processItem(
    item: UngradedRssItem,
    options?: Record<string, unknown>,
  ): Promise<UngradedRssItem>;
  report(
    items: GradedRssItem[],
    options: Record<string, unknown>,
  ): Promise<void>;
}

export const basePlugin: Plugin = {
  async collect() {
    return { items: [] };
  },
  async processItem(item) {
    return item;
  },
  async report() {},
};

type PluginEntry = string | { name: string; options?: Record<string, unknown> };

type LoadedPlugin = { plugin: Plugin; options: Record<string, unknown> };

async function loadPlugin(pluginName: string): Promise<Plugin> {
  try {
    const module = await import(`./plugins/${pluginName}.ts`);
    return module.default as Plugin;
  } catch {
    try {
      const module = await import(`./plugins/${pluginName}/index.ts`);
      return module.default as Plugin;
    } catch (error) {
      throw new Error(`无法加载插件 ${pluginName}: ${error}`);
    }
  }
}

export async function loadPlugins(
  pluginEntries: PluginEntry[],
): Promise<LoadedPlugin[]> {
  return Promise.all(
    pluginEntries.map(async (entry) => {
      const name = typeof entry === "string" ? entry : entry.name;
      const options =
        typeof entry === "object" && entry.options ? entry.options : {};
      const plugin = await loadPlugin(name);
      return { plugin, options };
    }),
  );
}

export async function applyTransform(
  items: UngradedRssItem[],
  { plugin, options }: LoadedPlugin,
  maxConcurrency = 10,
): Promise<UngradedRssItem[]> {
  const limit = pLimit(maxConcurrency);
  return Promise.all(
    items.map((item, index) =>
      limit(async () => {
        try {
          return await plugin.processItem(item, options);
        } catch (error) {
          logger.warn(`处理 item ${index} 失败: ${error}`);
          return item;
        }
      }),
    ),
  );
}
