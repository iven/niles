/**
 * Source 连续失败跟踪（纯逻辑，便于测试）
 */

/** 连续失败达到阈值时的提醒 */
interface FailureNotification {
  source: string;
  count: number;
  message: string;
}

interface FailureUpdateResult {
  count: number;
  notification?: FailureNotification;
}

/** 连续失败达到该次数时在 Issue 中提醒 */
export const FAILURE_THRESHOLD = 3;

/**
 * 根据上次计数和本次状态计算新计数，达到阈值的整数倍时生成提醒
 */
export function updateFailureCount(
  prevCount: number,
  source: string,
  status: "success" | "failure",
  runUrl?: string,
  threshold: number = FAILURE_THRESHOLD,
): FailureUpdateResult {
  if (status === "success") {
    return { count: 0 };
  }

  const count = prevCount + 1;
  if (count % threshold !== 0) {
    return { count };
  }

  return {
    count,
    notification: {
      source,
      count,
      message: runUrl
        ? `Source \`${source}\` 连续失败 ${count} 次，最近一次运行：${runUrl}`
        : `Source \`${source}\` 连续失败 ${count} 次。`,
    },
  };
}
