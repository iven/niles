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
    const historyPath = `output/${context.sourceName}-processed.json`;
    const tracker = await GuidTracker.create(historyPath);

    const newItems = items.filter((item) => !tracker.isProcessed(item.guid));

    tracker.markProcessed(newItems.map((item) => item.guid));
    tracker.cleanup();
    await tracker.persist();

    const newGuids = new Set(newItems.map((item) => item.guid));
    return items.map((item) =>
      newGuids.has(item.guid) ? item : { ...item, level: "rejected" as const },
    );
  },
};

export default plugin;
