import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const DEFAULT_MAX_ITEMS = 20;

interface LimitItemsOptions {
  maxItems?: number;
}

const plugin: Plugin<LimitItemsOptions> = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    options: LimitItemsOptions,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

    context.logger.start("开始限制条目数...");
    const activeItems = items.filter((item) => item.level !== "rejected");
    const limitedGuids = new Set(
      activeItems.slice(0, maxItems).map((item) => item.guid),
    );

    if (activeItems.length > maxItems) {
      context.logger.success(
        `限制完成，${activeItems.length} → ${maxItems} 个条目`,
      );
    } else {
      context.logger.success(
        `限制完成，${activeItems.length} 个条目（未超出上限）`,
      );
    }

    return items.map((item) =>
      item.level === "rejected" || limitedGuids.has(item.guid)
        ? item
        : { ...item, level: "rejected" as const },
    );
  },
};

export default plugin;
