import { GuidTracker } from "../../lib/guid-tracker";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const plugin: Plugin = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    _options: object,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    context.logger.start("开始去重...");
    const historyPath = `output/${context.sourceName}-processed.json`;
    const tracker = await GuidTracker.create(historyPath);

    const newItems = items.filter((item) => !tracker.isProcessed(item.guid));

    tracker.markProcessed(newItems.map((item) => item.guid));
    tracker.cleanup();
    await tracker.persist();

    const skipped = items.length - newItems.length;
    if (skipped > 0) {
      context.logger.success(
        `去重完成，${skipped} 个已处理过跳过，剩余 ${newItems.length} 个`,
      );
    } else {
      context.logger.success(`去重完成，${newItems.length} 个新条目`);
    }

    if (context.isDryRun) {
      context.logger.debug("  dry-run 模式，返回原始输入（不过滤已处理条目）");
      return items;
    }

    const newGuids = new Set(newItems.map((item) => item.guid));
    return items.map((item) =>
      newGuids.has(item.guid) ? item : { ...item, level: "rejected" as const },
    );
  },
};

export default plugin;
