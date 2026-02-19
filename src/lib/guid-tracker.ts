/**
 * GUID 历史记录跟踪器
 */

const HISTORY_RETENTION_DAYS = 4;

interface GuidHistory {
  guids: Record<string, string>;
  updated_at: string;
}

export class GuidTracker {
  private historyPath: string;
  private processedGuids: Map<string, string>;

  private constructor(historyPath: string, processedGuids: Map<string, string>) {
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
      if (!await file.exists()) return new Map();

      const data = await file.json() as GuidHistory;
      return new Map(Object.entries(data.guids || {}));
    } catch {
      return new Map();
    }
  }

  private async save(): Promise<void> {
    const data: GuidHistory = {
      guids: Object.fromEntries(
        [...this.processedGuids.entries()].sort(([a], [b]) => a.localeCompare(b))
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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS);

    const cleaned = new Map<string, string>();
    for (const [guid, processedTime] of this.processedGuids) {
      try {
        const processedDate = new Date(processedTime);
        if (processedDate >= cutoffDate) {
          cleaned.set(guid, processedTime);
        }
      } catch {
        cleaned.set(guid, processedTime);
      }
    }

    this.processedGuids = cleaned;
  }

  async persist(): Promise<void> {
    await this.save();
  }
}
