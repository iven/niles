import type { ConsolaInstance } from "consola";
import type { TextAdapter } from "./lib/llm";
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

/** dry-run 只为验证流水线，固定只保留少量样本，避免消耗 token */
const DRY_RUN_ITEM_LIMIT = 3;

/** collector 在返回条目之前调用：dry-run 时截断到固定条数 */
export function applyDryRunLimit<T>(items: T[], context: PluginContext): T[] {
  return context.isDryRun ? items.slice(0, DRY_RUN_ITEM_LIMIT) : items;
}

type PluginEntry = string | { name: string; options?: object };

type LoadedPlugin = {
  name: string;
  plugin: Plugin;
  options: object;
  /** 以插件名标记的上下文，插件的每个阶段都应使用它 */
  contextFor(context: PluginContext): PluginContext;
};

function taggedContext(context: PluginContext, name: string): PluginContext {
  return { ...context, logger: context.logger.withTag(name) };
}

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
      return {
        name,
        plugin,
        options,
        contextFor: (context) => taggedContext(context, name),
      };
    }),
  );
}

export async function applyProcessItems(
  items: FeedItem[],
  loadedPlugin: LoadedPlugin,
  context: PluginContext,
): Promise<FeedItem[]> {
  return loadedPlugin.plugin.processItems(
    items,
    loadedPlugin.options,
    loadedPlugin.contextFor(context),
  );
}
