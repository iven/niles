import { describe, expect, it } from "bun:test";
import { FAILURE_THRESHOLD, updateFailureCount } from "./failure-tracker";

describe("updateFailureCount", () => {
  it("should do nothing below threshold", () => {
    const result = updateFailureCount(1, "a", "failure");

    expect(result.count).toBe(2);
    expect(result.notification).toBeUndefined();
  });

  it("should notify at threshold", () => {
    const result = updateFailureCount(
      FAILURE_THRESHOLD - 1,
      "a",
      "failure",
      "https://run/1",
    );

    expect(result.count).toBe(FAILURE_THRESHOLD);
    expect(result.notification?.source).toBe("a");
    expect(result.notification?.count).toBe(FAILURE_THRESHOLD);
    expect(result.notification?.message).toContain("https://run/1");
  });

  it("should notify without run url", () => {
    const result = updateFailureCount(2, "a", "failure");

    expect(result.notification?.message).toBe("Source `a` 连续失败 3 次。");
  });

  it("should not notify between heartbeats", () => {
    const result = updateFailureCount(FAILURE_THRESHOLD, "a", "failure");

    expect(result.count).toBe(FAILURE_THRESHOLD + 1);
    expect(result.notification).toBeUndefined();
  });

  it("should notify again on every multiple of threshold", () => {
    const result = updateFailureCount(
      2 * FAILURE_THRESHOLD - 1,
      "a",
      "failure",
    );

    expect(result.count).toBe(2 * FAILURE_THRESHOLD);
    expect(result.notification?.count).toBe(2 * FAILURE_THRESHOLD);
  });

  it("should reset count on success without notification", () => {
    const result = updateFailureCount(5, "a", "success");

    expect(result.count).toBe(0);
    expect(result.notification).toBeUndefined();
  });
});
