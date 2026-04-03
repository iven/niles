import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface ReporterPendingOptions {
  outputPath?: string;
}

const plugin: Plugin<ReporterPendingOptions> = {
  ...basePlugin,
  async report(
    items: FeedItem[],
    options: ReporterPendingOptions,
    context: PluginContext,
  ) {
    const outputPath =
      options.outputPath ?? `output/${context.sourceName}-pending.json`;

    const newItems = items.filter((item) => item.level !== "rejected");
    if (newItems.length === 0) {
      context.logger.info("没有新条目需要缓存");
      return;
    }

    if (context.isDryRun) {
      context.logger.info(
        `dry-run: 跳过写入 ${newItems.length} 个条目到 ${outputPath}`,
      );
      return;
    }

    let existingItems: FeedItem[] = [];
    const file = Bun.file(outputPath);
    if (await file.exists()) {
      const data = await file.json();
      existingItems = data.items ?? [];
    }

    const existingGuids = new Set(existingItems.map((item) => item.guid));
    const dedupedNewItems = newItems.filter(
      (item) => !existingGuids.has(item.guid),
    );

    const allItems = [...existingItems, ...dedupedNewItems];
    await Bun.write(outputPath, JSON.stringify({ items: allItems }, null, 2));
    context.logger.success(
      `缓存完成，新增 ${dedupedNewItems.length} 个条目（共 ${allItems.length} 个）→ ${outputPath}`,
    );
  },
};

export default plugin;
