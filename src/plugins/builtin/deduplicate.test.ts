import { describe, expect, it } from "bun:test";
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

function makeContext(): PluginContext {
  counter++;
  return {
    sourceName: `test-deduplicate-${Date.now()}-${counter}`,
    sourceContext: undefined,
    isDryRun: false,
    llm: () => {
      throw new Error("llm not available in test");
    },
  };
}

describe("builtin/deduplicate plugin", () => {
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
