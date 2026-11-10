/**
 * 测试 fixture：`FeedItem` 与 `PluginContext` 的形状由 `types.ts` / `plugin.ts` 决定，
 * 测试只需要一个合法实例，再覆盖自己关心的字段。
 */

import { logger } from "./lib/logger";
import type { PluginContext } from "./plugin";
import type { FeedItem } from "./types";

export function createTestItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test",
    link: "https://example.com",
    pubDate: "2024-01-01",
    description: "Test description",
    guid: "test-guid",
    extra: {},
    level: "unknown",
    reason: "未分级",
    ...overrides,
  };
}

export function createTestContext(
  overrides: Partial<PluginContext> = {},
): PluginContext {
  return {
    sourceName: "test-source",
    sourceContext: undefined,
    isDryRun: false,
    now: new Date("2026-01-01T00:00:00Z"),
    llm: () => {
      throw new Error("测试不应调用 LLM");
    },
    logger,
    ...overrides,
  };
}
