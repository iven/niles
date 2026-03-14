/**
 * GUID 历史记录跟踪器
 */

import { z } from "zod";

const HISTORY_MAX_SIZE = 500;

export function filterRecentGuids(
  guids: Map<string, string>,
  maxSize: number,
): Map<string, string> {
  if (guids.size <= maxSize) return guids;

  const sorted = [...guids.entries()].sort(([, a], [, b]) =>
    b.localeCompare(a),
  );
  return new Map(sorted.slice(0, maxSize));
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
    const file = Bun.file(historyPath);
    if (!(await file.exists())) return new Map();

    const json = await file.json();
    const parseResult = guidHistorySchema.safeParse(json);

    if (!parseResult.success) {
      throw new Error(`GUID 历史文件格式错误: ${historyPath}`);
    }

    return new Map(Object.entries(parseResult.data.guids || {}));
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
      HISTORY_MAX_SIZE,
    );
  }

  async persist(): Promise<void> {
    await this.save();
  }
}
