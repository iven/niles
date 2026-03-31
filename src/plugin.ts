import type { ConsolaInstance } from "consola";
import type { TextAdapter } from "./lib/llm";
import { logger } from "./lib/logger";
import type { FeedItem } from "./types";

export interface PluginContext {
  sourceName: string;
  sourceContext: string | undefined;
  isDryRun: boolean;
  now: Date;
  llm(tier: "fast" | "balanced" | "powerful"): TextAdapter;
  logger: ConsolaInstance;
}

export interface Plugin<O extends object = object> {
  beforeRun(options: O, context: PluginContext): Promise<boolean>;
  afterRun(options: O, context: PluginContext): Promise<void>;
  collect(
    options: O,
    context: PluginContext,
  ): Promise<{ title?: string; items: FeedItem[] }>;
  processItems(
    items: FeedItem[],
    options: O,
    context: PluginContext,
  ): Promise<FeedItem[]>;
  report(items: FeedItem[], options: O, context: PluginContext): Promise<void>;
}

export const basePlugin: Plugin = {
  async beforeRun() {
    return true;
  },
  async afterRun() {},
  async collect() {
    return { items: [] };
  },
  async processItems(items) {
    return items;
  },
  async report() {},
};

type PluginEntry = string | { name: string; options?: object };

type LoadedPlugin = {
  name: string;
  plugin: Plugin;
  options: object;
};

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
      return { name, plugin, options };
    }),
  );
}

export async function applyProcessItems(
  items: FeedItem[],
  { name, plugin, options }: LoadedPlugin,
  context: PluginContext,
): Promise<FeedItem[]> {
  const pluginContext = { ...context, logger: logger.withTag(name) };
  return plugin.processItems(items, options, pluginContext);
}
