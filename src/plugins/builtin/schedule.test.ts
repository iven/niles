import { afterEach, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { logger } from "../../lib/logger";
import type { PluginContext } from "../../plugin";
import schedulePlugin from "./schedule";

let counter = 0;

function makeContext(now = new Date()): PluginContext {
  counter++;
  return {
    sourceName: `test-schedule-${Date.now()}-${counter}`,
    sourceContext: undefined,
    isDryRun: false,
    now,
    llm: () => {
      throw new Error("llm not available in test");
    },
    logger,
  };
}

function processedPath(sourceName: string): string {
  return `output/${sourceName}-processed.json`;
}

async function writeProcessedAt(sourceName: string, updatedAt: Date) {
  await Bun.write(
    processedPath(sourceName),
    JSON.stringify({ guids: {}, updated_at: updatedAt.toISOString() }),
  );
}

const createdFiles: string[] = [];

afterEach(() => {
  for (const f of createdFiles.splice(0)) {
    try {
      rmSync(f);
    } catch {}
  }
});

describe("builtin/schedule plugin", () => {
  it("should return true in dry-run mode regardless of schedule", async () => {
    const context = { ...makeContext(), isDryRun: true };
    const result = await schedulePlugin.beforeRun(
      { cron: "0 6 * * *" },
      context,
    );
    expect(result).toBe(true);
  });

  it("should return true when no processed.json exists (first run)", async () => {
    // now 设为 8 点，确保 6 点触发点存在
    const now = new Date("2025-01-01T08:00:00+08:00");
    const context = makeContext(now);
    const result = await schedulePlugin.beforeRun(
      { cron: "0 6 * * *" },
      context,
    );
    expect(result).toBe(true);
  });

  it("should return false when last run is after the last trigger", async () => {
    const now = new Date("2025-01-01T08:00:00+08:00");
    const context = makeContext(now);
    createdFiles.push(processedPath(context.sourceName));

    // 上次执行在 7 点，最近触发点是 6 点，lastRun > lastTrigger，跳过
    const lastRun = new Date("2025-01-01T07:00:00+08:00");
    await writeProcessedAt(context.sourceName, lastRun);

    const result = await schedulePlugin.beforeRun(
      { cron: "0 6 * * *" },
      context,
    );
    expect(result).toBe(false);
  });

  it("should return true when last run is before the last trigger", async () => {
    const now = new Date("2025-01-02T08:00:00+08:00");
    const context = makeContext(now);
    createdFiles.push(processedPath(context.sourceName));

    // 上次执行是昨天 7 点，最近触发点是今天 6 点，lastRun < lastTrigger，执行
    const lastRun = new Date("2025-01-01T07:00:00+08:00");
    await writeProcessedAt(context.sourceName, lastRun);

    const result = await schedulePlugin.beforeRun(
      { cron: "0 6 * * *" },
      context,
    );
    expect(result).toBe(true);
  });
});
