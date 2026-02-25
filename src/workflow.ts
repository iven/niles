/**
 * Niles 工作流：RSS 个性化处理流程
 */

import { gradeItems } from "./grade";
import type { GlobalConfig, LlmConfig, SourceConfig } from "./lib/config";
import { GuidTracker } from "./lib/guid-tracker";
import { logger } from "./lib/logger";
import { loadRss } from "./rss/loader";
import { writeRss } from "./rss/writer";
import { summarizeItems } from "./summarize";
import type { GradedRssItem, UngradedRssItem } from "./types";

async function summarizeAndRegrade(
  items: GradedRssItem[],
  originalItems: UngradedRssItem[],
  llmConfig: LlmConfig,
  globalConfig: GlobalConfig,
  sourceConfig: SourceConfig,
): Promise<GradedRssItem[]> {
  // 提取非 rejected 的条目
  const itemsToSummarize = items.filter((item) => item.level !== "rejected");

  if (itemsToSummarize.length === 0) {
    logger.success("所有条目已被排除，跳过总结和二次分级");
    return [];
  }

  logger.log("");
  const { summaries } = await summarizeItems({
    llmConfig,
    preferredLanguage: globalConfig.preferred_language,
    items: itemsToSummarize,
  });

  // 从原始数据补充 link 和 pubDate
  const rawItemMap = new Map(originalItems.map((item) => [item.guid, item]));

  const summarizedItems: UngradedRssItem[] = summaries.map((summary) => {
    const rawItem = rawItemMap.get(summary.guid);
    return {
      title: summary.title,
      description: summary.description,
      guid: summary.guid,
      link: rawItem?.link || "",
      pubDate: rawItem?.pubDate || "",
      extra: {},
      graded: false as const,
    };
  });

  // 基于总结后的内容重新分级
  logger.log("");
  const regradedItems = await gradeItems({
    llmConfig,
    globalConfig,
    sourceConfig,
    items: summarizedItems,
  });

  return regradedItems;
}

interface WorkflowParams {
  sourceName: string;
  sourceConfig: SourceConfig;
  globalConfig: GlobalConfig;
  llmConfig: LlmConfig;
  outputDir: string;
  maxItems: number;
  minItems: number;
  isDryRun: boolean;
}

export async function runWorkflow(params: WorkflowParams) {
  const {
    sourceName,
    sourceConfig,
    globalConfig,
    llmConfig,
    outputDir,
    maxItems,
    minItems,
    isDryRun,
  } = params;

  const url = sourceConfig.url;
  const existingRss = `${outputDir}/${sourceName}.xml`;

  // 加载 RSS 条目（输入端）
  const historyPath = existingRss.replace(/\.xml$/, "-processed.json");
  const tracker = await GuidTracker.create(historyPath);

  logger.start("获取新条目...");

  const { channelTitle, items: newItems } = await loadRss({
    url,
    tracker,
    maxItems,
    minItems,
    plugins: sourceConfig.plugins,
  });

  logger.log("");
  logger.success(`获取到 ${newItems.length} 个新条目`);
  if (newItems.length > 0) {
    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      if (item) {
        logger.log(`  ${i + 1}. ${item.title}`);
      }
    }
  }

  if (newItems.length === 0) {
    logger.info("无新条目，跳过处理");
    if (!isDryRun) {
      tracker.cleanup();
      await tracker.persist();
    }
    return;
  }

  // 分级（简单模式或深度分析模式的第一次分级）
  logger.log("");
  let finalItems = await gradeItems({
    llmConfig,
    globalConfig,
    sourceConfig,
    items: newItems,
  });

  // 深度分析模式：总结后重新分级
  if (sourceConfig.summarize) {
    finalItems = await summarizeAndRegrade(
      finalItems,
      newItems,
      llmConfig,
      globalConfig,
      sourceConfig,
    );
  }

  // 生成 RSS（输出端）
  const { rss } = await writeRss(
    {
      source_name: sourceName,
      source_url: url,
      title: sourceConfig.title || channelTitle || undefined,
      items: finalItems,
    },
    existingRss,
  );

  // 写入输出
  if (!isDryRun) {
    await Bun.write(existingRss, rss);
    tracker.markProcessed(newItems.map((item) => item.guid));
    tracker.cleanup();
    await tracker.persist();
  }

  logger.log("");
  logger.success("处理完成");
  logger.log(`  源: ${sourceName}`);
  logger.log(`  模式: ${sourceConfig.summarize ? "深度分析" : "简单"}`);
  logger.log(`  输出: ${finalItems.length} 个条目`);
}
