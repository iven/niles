import { basePlugin, type Plugin } from "../../plugin";
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
    _context: object,
  ): Promise<FeedItem[]> {
    const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

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
