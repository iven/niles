import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const DEFAULT_MAX_ITEMS = 20;
const DRY_RUN_ITEMS = 3;

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
    const maxItems = context.isDryRun
      ? DRY_RUN_ITEMS
      : (options.maxItems ?? DEFAULT_MAX_ITEMS);

    const activeItems = items.filter((item) => item.level !== "rejected");
    const limitedGuids = new Set(
      activeItems.slice(0, maxItems).map((item) => item.guid),
    );

    return items.map((item) =>
      item.level === "rejected" || limitedGuids.has(item.guid)
        ? item
        : { ...item, level: "rejected" as const },
    );
  },
};

export default plugin;
