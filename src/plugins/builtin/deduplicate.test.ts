import { describe, expect, it } from "bun:test";
import { logger } from "../../lib/logger";
import type { PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";
import deduplicatePlugin from "./deduplicate";

let counter = 0;

function createItem(guid: string, title: string): FeedItem {
  return {
    title,
    link: `http://example.com/${guid}`,
    pubDate: "2024-02-24",
    description: `Description for ${title}`,
    guid,
    extra: {},
    level: "unknown",
    reason: "未分级",
  };
}

function makeContext(isDryRun = false): PluginContext {
  counter++;
  return {
    sourceName: `test-deduplicate-${Date.now()}-${counter}`,
    sourceContext: undefined,
    isDryRun,
    llm: () => {
      throw new Error("llm not available in test");
    },
    logger,
  };
}

describe("builtin/deduplicate plugin", () => {
  it("should keep only DRY_RUN_ITEMS items in dry run mode", async () => {
    const context = makeContext(true);
    const items = Array.from({ length: 10 }, (_, i) =>
      createItem(`guid-${i}`, `Item ${i}`),
    );

    const result = await deduplicatePlugin.processItems(items, {}, context);
    expect(result.filter((i) => i.level !== "rejected").length).toBe(3);
  });

  it("should mark already-processed items as rejected", async () => {
    const context = makeContext();
    const items = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
    ];

    const first = await deduplicatePlugin.processItems(items, {}, context);
    expect(first.filter((i) => i.level !== "rejected").length).toBe(3);

    const second = await deduplicatePlugin.processItems(items, {}, context);
    expect(second.filter((i) => i.level === "rejected").length).toBe(3);
  });
});
