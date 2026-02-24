import { describe, expect, it } from "bun:test";
import { filterRecentGuids } from "./guid-tracker";

describe("filterRecentGuids", () => {
  it("should keep guids within retention period", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);

    const guids = new Map([
      ["guid-1", threeDaysAgo.toISOString()],
      ["guid-2", now.toISOString()],
    ]);

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(2);
    expect(result.has("guid-1")).toBe(true);
    expect(result.has("guid-2")).toBe(true);
  });

  it("should remove guids older than retention period", () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(now.getDate() - 5);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);

    const guids = new Map([
      ["guid-old", fiveDaysAgo.toISOString()],
      ["guid-recent", threeDaysAgo.toISOString()],
    ]);

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(1);
    expect(result.has("guid-old")).toBe(false);
    expect(result.has("guid-recent")).toBe(true);
  });

  it("should handle guids exactly at cutoff date", () => {
    const now = new Date();
    const fourDaysAgo = new Date(now);
    fourDaysAgo.setDate(now.getDate() - 4);

    const guids = new Map([["guid-cutoff", fourDaysAgo.toISOString()]]);

    const result = filterRecentGuids(guids, 4);

    // >= cutoffDate,所以应该保留
    expect(result.size).toBe(1);
    expect(result.has("guid-cutoff")).toBe(true);
  });

  it("should preserve guids with invalid date format", () => {
    const now = new Date();
    const guids = new Map([
      ["guid-invalid", "invalid-date-string"],
      ["guid-empty", ""],
      ["guid-valid", now.toISOString()],
    ]);

    const result = filterRecentGuids(guids, 4);

    // 日期解析失败时保留
    expect(result.size).toBe(3);
    expect(result.has("guid-invalid")).toBe(true);
    expect(result.has("guid-empty")).toBe(true);
    expect(result.has("guid-valid")).toBe(true);
  });

  it("should handle empty map", () => {
    const guids = new Map<string, string>();

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(0);
  });

  it("should handle all old guids", () => {
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(now.getDate() - 10);
    const twentyDaysAgo = new Date(now);
    twentyDaysAgo.setDate(now.getDate() - 20);

    const guids = new Map([
      ["guid-1", tenDaysAgo.toISOString()],
      ["guid-2", twentyDaysAgo.toISOString()],
    ]);

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(0);
  });

  it("should handle different retention periods", () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(now.getDate() - 5);

    const guids = new Map([["guid-1", fiveDaysAgo.toISOString()]]);

    // 保留 7 天:应该保留
    const result7 = filterRecentGuids(guids, 7);
    expect(result7.size).toBe(1);

    // 保留 3 天:应该删除
    const result3 = filterRecentGuids(guids, 3);
    expect(result3.size).toBe(0);
  });

  it("should handle mixed valid and invalid dates", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    const sixDaysAgo = new Date(now);
    sixDaysAgo.setDate(now.getDate() - 6);

    const guids = new Map([
      ["guid-recent", threeDaysAgo.toISOString()],
      ["guid-old", sixDaysAgo.toISOString()],
      ["guid-invalid", "not-a-date"],
    ]);

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(2);
    expect(result.has("guid-recent")).toBe(true);
    expect(result.has("guid-old")).toBe(false);
    expect(result.has("guid-invalid")).toBe(true);
  });

  it("should preserve original timestamps", () => {
    const now = new Date();
    const timestamp = now.toISOString();
    const guids = new Map([["guid-1", timestamp]]);

    const result = filterRecentGuids(guids, 4);

    expect(result.get("guid-1")).toBe(timestamp);
  });
});
