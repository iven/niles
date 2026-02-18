/**
 * GUID 历史记录跟踪器
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const HISTORY_RETENTION_DAYS = 4;

interface GuidHistory {
  guids: Record<string, string>;
  updated_at: string;
}

export class GuidTracker {
  private historyPath: string;
  private processedGuids: Map<string, string>;

  constructor(historyPath: string) {
    this.historyPath = historyPath;
    this.processedGuids = this.load();
  }

  private load(): Map<string, string> {
    try {
      if (!existsSync(this.historyPath)) return new Map();

      const content = readFileSync(this.historyPath, 'utf-8');
      const data = JSON.parse(content) as GuidHistory;
      return new Map(Object.entries(data.guids || {}));
    } catch {
      return new Map();
    }
  }

  private save(): void {
    const data: GuidHistory = {
      guids: Object.fromEntries(
        [...this.processedGuids.entries()].sort(([a], [b]) => a.localeCompare(b))
      ),
      updated_at: new Date().toISOString(),
    };

    const dir = dirname(this.historyPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.historyPath, JSON.stringify(data, null, 2), 'utf-8');
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

  persist(): void {
    this.save();
  }
}
