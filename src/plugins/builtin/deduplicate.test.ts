import { describe, expect, it } from "bun:test";
import { createTestContext, createTestItem } from "../../test-fixtures";
import deduplicatePlugin from "./deduplicate";

let counter = 0;

describe("builtin/deduplicate plugin", () => {
  it("should return all items as non-rejected in dry run mode", async () => {
    // deduplicate 会写 output/<sourceName>-processed.json；每个用例用独立名字，避免读到别的用例或上次运行留下的 GUID
    const context = createTestContext({
      isDryRun: true,
      sourceName: `test-deduplicate-${Date.now()}-${counter++}`,
    });
    const items = Array.from({ length: 10 }, (_, i) =>
      createTestItem({ guid: `guid-${i}`, title: `Item ${i}` }),
    );

    const result = await deduplicatePlugin.processItems(items, {}, context);
    expect(result.filter((i) => i.level !== "rejected").length).toBe(10);
  });

  it("should mark already-processed items as rejected", async () => {
    const context = createTestContext({
      sourceName: `test-deduplicate-${Date.now()}-${counter++}`,
    });
    const items = [
      createTestItem({ guid: "guid-1", title: "Item 1" }),
      createTestItem({ guid: "guid-2", title: "Item 2" }),
      createTestItem({ guid: "guid-3", title: "Item 3" }),
    ];

    const first = await deduplicatePlugin.processItems(items, {}, context);
    expect(first.filter((i) => i.level !== "rejected").length).toBe(3);

    const second = await deduplicatePlugin.processItems(items, {}, context);
    expect(second.filter((i) => i.level === "rejected").length).toBe(3);
  });
});
