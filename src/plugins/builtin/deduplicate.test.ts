import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import type { PluginContext } from "../../plugin";
import { createTestContext, createTestItem } from "../../test-fixtures";
import deduplicatePlugin from "./deduplicate";

let counter = 0;
const createdFiles: string[] = [];

/**
 * deduplicate 会写 output/<sourceName>-processed.json；每个用例用独立名字，
 * 避免读到别的用例或上次运行留下的 GUID。名字由本函数拥有——overrides 里
 * 不收 sourceName，否则真实写入的文件会和 createdFiles 记的路径不一致，
 * 清理静默落空。
 */
function makeContext(
  overrides: Partial<Omit<PluginContext, "sourceName">> = {},
): PluginContext {
  counter++;
  const sourceName = `test-deduplicate-${Date.now()}-${counter}`;
  createdFiles.push(`output/${sourceName}-processed.json`);
  return createTestContext({ sourceName, ...overrides });
}

afterEach(() => {
  for (const f of createdFiles.splice(0)) {
    try {
      rmSync(f);
    } catch {}
  }
});

describe("builtin/deduplicate plugin", () => {
  it("should return all items as non-rejected in dry run mode", async () => {
    const context = makeContext({ isDryRun: true });
    const items = Array.from({ length: 10 }, (_, i) =>
      createTestItem({ guid: `guid-${i}`, title: `Item ${i}` }),
    );

    const result = await deduplicatePlugin.processItems(items, {}, context);
    expect(result.filter((i) => i.level !== "rejected").length).toBe(10);
  });

  it("should mark already-processed items as rejected", async () => {
    const context = makeContext();
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
