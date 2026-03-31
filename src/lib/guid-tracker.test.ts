import { describe, expect, it } from "bun:test";
import { filterRecentGuids } from "./guid-tracker";

describe("filterRecentGuids", () => {
  it("should keep all guids when under max size", () => {
    const guids = new Map([
      ["guid-1", "2024-01-01T00:00:00Z"],
      ["guid-2", "2024-01-02T00:00:00Z"],
      ["guid-3", "2024-01-03T00:00:00Z"],
    ]);

    const result = filterRecentGuids(guids, 5);

    expect(result.size).toBe(3);
  });

  it("should keep the most recent guids when over max size", () => {
    const guids = new Map([
      ["guid-old", "2024-01-01T00:00:00Z"],
      ["guid-mid", "2024-01-02T00:00:00Z"],
      ["guid-new", "2024-01-03T00:00:00Z"],
    ]);

    const result = filterRecentGuids(guids, 2);

    expect(result.size).toBe(2);
    expect(result.has("guid-old")).toBe(false);
    expect(result.has("guid-mid")).toBe(true);
    expect(result.has("guid-new")).toBe(true);
  });

  it("should handle empty map", () => {
    const guids = new Map<string, string>();

    const result = filterRecentGuids(guids, 4);

    expect(result.size).toBe(0);
  });

  it("should preserve original timestamps", () => {
    const timestamp = "2024-01-01T00:00:00Z";
    const guids = new Map([["guid-1", timestamp]]);

    const result = filterRecentGuids(guids, 4);

    expect(result.get("guid-1")).toBe(timestamp);
  });
});
