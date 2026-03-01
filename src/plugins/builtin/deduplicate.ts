import { GuidTracker } from "../../lib/guid-tracker";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const DRY_RUN_ITEMS = 3;

const plugin: Plugin = {
  ...basePlugin,
  async processItems(
    items: FeedItem[],
    _options: object,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    const historyPath = `output/${context.sourceName}-processed.json`;
    const tracker = await GuidTracker.create(historyPath);

    const newItems = items.filter((item) => !tracker.isProcessed(item.guid));

    tracker.markProcessed(newItems.map((item) => item.guid));
    tracker.cleanup();
    await tracker.persist();

    const selectedGuids = context.isDryRun
      ? new Set(items.slice(0, DRY_RUN_ITEMS).map((item) => item.guid))
      : new Set(newItems.map((item) => item.guid));

    return items.map((item) =>
      selectedGuids.has(item.guid)
        ? item
        : { ...item, level: "rejected" as const },
    );
  },
};

export default plugin;
