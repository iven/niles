import { describe, expect, it } from "bun:test";
import { GuidTracker } from "./lib/guid-tracker";
import type { UngradedRssItem } from "./types";

// 从 loader.ts 复制 selectItems 函数用于测试
function selectItems(
  allItems: UngradedRssItem[],
  tracker: GuidTracker,
  maxItems: number,
  minItems: number,
): UngradedRssItem[] {
  const unprocessedItems = allItems
    .filter((item) => !tracker.isProcessed(item.guid))
    .slice(0, maxItems);

  if (unprocessedItems.length >= minItems) {
    return unprocessedItems;
  }

  const selectedItems = [...unprocessedItems];
  const selectedGuids = new Set(selectedItems.map((item) => item.guid));

  for (const item of allItems) {
    if (selectedItems.length >= minItems) break;
    if (!selectedGuids.has(item.guid)) {
      selectedItems.push(item);
      selectedGuids.add(item.guid);
    }
  }

  return selectedItems;
}

function createItem(guid: string, title: string): UngradedRssItem {
  return {
    title,
    link: `http://example.com/${guid}`,
    pubDate: "2024-02-24",
    description: `Description for ${title}`,
    guid,
    extra: {},
    graded: false,
  };
}

async function createTracker(processedGuids: string[]): Promise<GuidTracker> {
  const tracker = await GuidTracker.create("/tmp/test-guid-tracker.json");
  if (processedGuids.length > 0) {
    tracker.markProcessed(processedGuids);
  }
  return tracker;
}

describe("selectItems", () => {
  it("should return unprocessed items up to maxItems", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
      createItem("guid-5", "Item 5"),
    ];
    const tracker = await createTracker([]);

    const result = selectItems(allItems, tracker, 3, 1);

    expect(result.length).toBe(3);
    expect(result[0]?.guid).toBe("guid-1");
    expect(result[1]?.guid).toBe("guid-2");
    expect(result[2]?.guid).toBe("guid-3");
  });

  it("should skip processed items", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
    ];
    const tracker = await createTracker(["guid-1", "guid-3"]);

    const result = selectItems(allItems, tracker, 3, 1);

    expect(result.length).toBe(2);
    expect(result[0]?.guid).toBe("guid-2");
    expect(result[1]?.guid).toBe("guid-4");
  });

  it("should backfill with processed items if below minItems", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
      createItem("guid-5", "Item 5"),
    ];
    // 只有 1 个未处理,但 minItems 是 3
    const tracker = await createTracker([
      "guid-1",
      "guid-2",
      "guid-3",
      "guid-4",
    ]);

    const result = selectItems(allItems, tracker, 10, 3);

    expect(result.length).toBe(3);
    expect(result[0]?.guid).toBe("guid-5"); // 唯一未处理的
    // 后面两个从已处理的补充
    expect(result[1]?.guid).toBe("guid-1");
    expect(result[2]?.guid).toBe("guid-2");
  });

  it("should return all items if total less than minItems", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
    ];
    const tracker = await createTracker([]);

    const result = selectItems(allItems, tracker, 10, 5);

    expect(result.length).toBe(2);
  });

  it("should not backfill if unprocessed meets minItems", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
      createItem("guid-5", "Item 5"),
    ];
    const tracker = await createTracker(["guid-4", "guid-5"]);

    const result = selectItems(allItems, tracker, 10, 3);

    expect(result.length).toBe(3);
    expect(result[0]?.guid).toBe("guid-1");
    expect(result[1]?.guid).toBe("guid-2");
    expect(result[2]?.guid).toBe("guid-3");
    // 不应该包含 guid-4 和 guid-5
  });

  it("should respect maxItems even when backfilling", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
      createItem("guid-3", "Item 3"),
      createItem("guid-4", "Item 4"),
      createItem("guid-5", "Item 5"),
    ];
    const tracker = await createTracker([
      "guid-2",
      "guid-3",
      "guid-4",
      "guid-5",
    ]);

    const result = selectItems(allItems, tracker, 2, 3);

    // maxItems=2 限制了未处理的只有 1 个(guid-1)
    // minItems=3 要求补充到 3 个
    expect(result.length).toBe(3);
    expect(result[0]?.guid).toBe("guid-1");
  });

  it("should handle all items processed", async () => {
    // 所有条目都处理过,但需要至少返回 minItems 个
    const allItems = [
      createItem("news-2024-02-24-1", "Breaking News 1"),
      createItem("news-2024-02-24-2", "Breaking News 2"),
      createItem("news-2024-02-23-1", "Yesterday News 1"),
      createItem("news-2024-02-23-2", "Yesterday News 2"),
      createItem("news-2024-02-22-1", "Old News"),
    ];
    const tracker = await createTracker([
      "news-2024-02-24-1",
      "news-2024-02-24-2",
      "news-2024-02-23-1",
      "news-2024-02-23-2",
      "news-2024-02-22-1",
    ]);

    const result = selectItems(allItems, tracker, 10, 3);

    expect(result.length).toBe(3);
    // 从头开始补充
    expect(result[0]?.guid).toBe("news-2024-02-24-1");
    expect(result[1]?.guid).toBe("news-2024-02-24-2");
    expect(result[2]?.guid).toBe("news-2024-02-23-1");
  });

  it("should backfill when having partial new items", async () => {
    // 有 2 个新条目,需要补充到 5 个
    const allItems = [
      createItem("news-2024-02-24-1", "New Item 1"),
      createItem("news-2024-02-24-2", "New Item 2"),
      createItem("news-2024-02-23-1", "Old Item 1"),
      createItem("news-2024-02-23-2", "Old Item 2"),
      createItem("news-2024-02-23-3", "Old Item 3"),
      createItem("news-2024-02-22-1", "Very Old Item"),
    ];
    const tracker = await createTracker([
      "news-2024-02-23-1",
      "news-2024-02-23-2",
      "news-2024-02-23-3",
      "news-2024-02-22-1",
    ]);

    const result = selectItems(allItems, tracker, 10, 5);

    expect(result.length).toBe(5);
    // 前 2 个是新的
    expect(result[0]?.guid).toBe("news-2024-02-24-1");
    expect(result[1]?.guid).toBe("news-2024-02-24-2");
    // 后 3 个从已处理补充
    expect(result[2]?.guid).toBe("news-2024-02-23-1");
    expect(result[3]?.guid).toBe("news-2024-02-23-2");
    expect(result[4]?.guid).toBe("news-2024-02-23-3");
  });

  it("should handle minItems = 0", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
    ];
    const tracker = await createTracker(["guid-1", "guid-2"]);

    const result = selectItems(allItems, tracker, 5, 0);

    expect(result.length).toBe(0);
  });

  it("should handle maxItems = 0", async () => {
    const allItems = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
    ];
    const tracker = await createTracker([]);

    const result = selectItems(allItems, tracker, 0, 2);

    // maxItems=0 限制了未处理为 0,需要补充到 minItems=2
    expect(result.length).toBe(2);
    expect(result[0]?.guid).toBe("guid-1");
    expect(result[1]?.guid).toBe("guid-2");
  });
});
