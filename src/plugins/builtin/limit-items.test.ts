import { describe, expect, it } from "bun:test";
import { logger } from "../../lib/logger";
import type { PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";
import limitItemsPlugin from "./limit-items";

const testContext: PluginContext = {
  sourceName: "test",
  sourceContext: undefined,
  isDryRun: false,
  llm: () => {
    throw new Error("llm not available in test");
  },
  logger,
};

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

describe("builtin/limit-items plugin", () => {
  it("should keep only maxItems non-rejected items", async () => {
    const context = testContext;
    const items = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
      createItem("guid-5", "Item 5"),
    ];

    const result = await limitItemsPlugin.processItems(
      items,
      { maxItems: 3 },
      context,
    );

    expect(result.filter((i) => i.level !== "rejected").length).toBe(3);
    expect(result.filter((i) => i.level === "rejected").length).toBe(2);
    expect(result[0]?.guid).toBe("guid-1");
    expect(result[1]?.guid).toBe("guid-2");
    expect(result[2]?.guid).toBe("guid-3");
  });

  it("should not re-reject already rejected items", async () => {
    const context = testContext;
    const items = [
      createItem("guid-1", "Item 1"),
      { ...createItem("guid-2", "Item 2"), level: "rejected" as const },
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
    ];

    const result = await limitItemsPlugin.processItems(
      items,
      { maxItems: 2 },
      context,
    );

    expect(result.filter((i) => i.level !== "rejected").length).toBe(2);
  });

  it("should return all items if fewer than maxItems", async () => {
    const context = testContext;
    const items = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
    ];

    const result = await limitItemsPlugin.processItems(
      items,
      { maxItems: 10 },
      context,
    );

    expect(result.filter((i) => i.level !== "rejected").length).toBe(2);
  });
});
