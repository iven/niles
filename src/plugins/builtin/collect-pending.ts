import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface CollectPendingOptions {
  pendingPath: string;
  sourceName?: string;
}

const plugin: Plugin<CollectPendingOptions> = {
  ...basePlugin,
  async collect(options: CollectPendingOptions, context: PluginContext) {
    const { pendingPath, sourceName } = options;
    if (!pendingPath)
      throw new Error("collect-pending: options.pendingPath 未指定");

    const file = Bun.file(pendingPath);
    if (!(await file.exists())) {
      context.logger.info(`${pendingPath} 不存在，跳过`);
      return { items: [] };
    }

    const data = await file.json();
    const items: FeedItem[] = (data.items ?? []).map((item: FeedItem) => ({
      ...item,
      extra: {
        ...item.extra,
        _source: sourceName ?? pendingPath,
      },
    }));

    context.logger.success(`从 ${pendingPath} 读取到 ${items.length} 个条目`);
    return { items };
  },
};

export default plugin;
