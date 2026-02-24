/**
 * GUID 历史记录跟踪器
 */

import { z } from "zod";

const HISTORY_RETENTION_DAYS = 4;

export function filterRecentGuids(
  guids: Map<string, string>,
  retentionDays: number,
): Map<string, string> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const filtered = new Map<string, string>();
  for (const [guid, processedTime] of guids) {
    const processedDate = new Date(processedTime);
    // Invalid Date 或解析失败时保留
    if (Number.isNaN(processedDate.getTime())) {
      filtered.set(guid, processedTime);
    } else if (processedDate >= cutoffDate) {
      filtered.set(guid, processedTime);
    }
  }

  return filtered;
}

const guidHistorySchema = z.object({
  guids: z.record(z.string(), z.string()),
  updated_at: z.string(),
});

type GuidHistory = z.infer<typeof guidHistorySchema>;

export class GuidTracker {
  private historyPath: string;
  private processedGuids: Map<string, string>;

  private constructor(
    historyPath: string,
    processedGuids: Map<string, string>,
  ) {
    this.historyPath = historyPath;
    this.processedGuids = processedGuids;
  }

  static async create(historyPath: string): Promise<GuidTracker> {
    const processedGuids = await GuidTracker.load(historyPath);
    return new GuidTracker(historyPath, processedGuids);
  }

  private static async load(historyPath: string): Promise<Map<string, string>> {
    try {
      const file = Bun.file(historyPath);
      if (!(await file.exists())) return new Map();

      const json = await file.json();
      const parseResult = guidHistorySchema.safeParse(json);

      if (!parseResult.success) {
        console.error(`GUID 历史文件格式错误，重新初始化: ${historyPath}`);
        return new Map();
      }

      return new Map(Object.entries(parseResult.data.guids || {}));
    } catch (error) {
      console.error(`读取 GUID 历史失败: ${error}`);
      return new Map();
    }
  }

  private async save(): Promise<void> {
    const data: GuidHistory = {
      guids: Object.fromEntries(
        [...this.processedGuids.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
      updated_at: new Date().toISOString(),
    };

    await Bun.write(this.historyPath, JSON.stringify(data, null, 2));
  }

  isProcessed(guid: string): boolean {
    return this.processedGuids.has(guid);
  }

  markProcessed(guids: string | string[]): void {
    const guidArray = Array.isArray(guids) ? guids : [guids];
    const now = new Date().toISOString();

    for (const guid of guidArray) {
      if (!this.processedGuids.has(guid)) {
        this.processedGuids.set(guid, now);
      }
    }
  }

  cleanup(): void {
    this.processedGuids = filterRecentGuids(
      this.processedGuids,
      HISTORY_RETENTION_DAYS,
    );
  }

  async persist(): Promise<void> {
    await this.save();
  }
}
