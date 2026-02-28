/**
 * Niles 工作流：RSS 个性化处理流程
 */

import { gradeItems } from "./grade";
import type { GlobalConfig, LlmConfig, SourceConfig } from "./lib/config";
import { GuidTracker } from "./lib/guid-tracker";
import { logger } from "./lib/logger";
import { applyTransform, loadPlugins } from "./plugin";
import { mergeSummaryResults, summarizeItems } from "./summarize";
import type { UngradedRssItem } from "./types";

const DEFAULT_TRANSFORMER_ENTRIES = ["builtin/clean-text"] as const;

function selectItems(
  allItems: UngradedRssItem[],
  tracker: GuidTracker,
  maxItems: number,
  minItems: number,
): UngradedRssItem[] {
  const unprocessedItems = allItems
    .filter((item) => !tracker.isProcessed(item.guid))
    .slice(0, maxItems);

  if (unprocessedItems.length >= minItems) {
    return unprocessedItems;
  }

  const selectedItems = [...unprocessedItems];
  const selectedGuids = new Set(selectedItems.map((item) => item.guid));

  for (const item of allItems) {
    if (selectedItems.length >= minItems) break;
    if (!selectedGuids.has(item.guid)) {
      selectedItems.push(item);
      selectedGuids.add(item.guid);
    }
  }

  return selectedItems;
}

interface WorkflowParams {
  sourceName: string;
  sourceConfig: SourceConfig;
  globalConfig: GlobalConfig;
  llmConfig: LlmConfig;
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
    maxItems,
    minItems,
    isDryRun,
  } = params;

  const historyPath = `.niles/${sourceName}-processed.json`;
  const tracker = await GuidTracker.create(historyPath);

  logger.start("获取新条目...");

  const plugins = await loadPlugins([
    ...DEFAULT_TRANSFORMER_ENTRIES,
    ...sourceConfig.plugins,
  ]);

  // collect
  const collectResults = await Promise.all(
    plugins.map(({ plugin, options }) => plugin.collect(options)),
  );
  let collectedTitle: string | undefined;
  let allItems: UngradedRssItem[] = [];
  for (const result of collectResults) {
    if (result.title) collectedTitle = result.title;
    allItems = allItems.concat(result.items);
  }

  // transform
  const selectedItems = selectItems(allItems, tracker, maxItems, minItems);
  let newItems = selectedItems;
  for (const loadedPlugin of plugins) {
    newItems = await applyTransform(newItems, loadedPlugin);
  }

  logger.log("");
  logger.success(`获取到 ${newItems.length} 个新条目`);
  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (item) logger.log(`  ${i + 1}. ${item.title}`);
  }

  if (newItems.length === 0) {
    logger.info("无新条目，跳过处理");
    if (!isDryRun) {
      tracker.cleanup();
      await tracker.persist();
    }
    return;
  }

  // 分级
  logger.log("");
  let finalItems = await gradeItems({
    llmConfig,
    globalConfig,
    sourceConfig,
    items: newItems,
  });

  // 深度分析模式
  if (sourceConfig.summarize) {
    const itemsToSummarize = finalItems.filter(
      (item) => item.level !== "rejected",
    );

    if (itemsToSummarize.length === 0) {
      logger.success("所有条目已被排除，跳过总结");
      finalItems = [];
    } else {
      logger.log("");
      const { summaries } = await summarizeItems({
        llmConfig,
        preferredLanguage: globalConfig.preferred_language,
        items: itemsToSummarize,
        sourceContext: sourceConfig.context,
      });

      finalItems = mergeSummaryResults({
        summaries,
        gradedItems: itemsToSummarize,
      });

      if (sourceConfig.regrade) {
        logger.log("");
        finalItems = await gradeItems({
          llmConfig,
          globalConfig,
          sourceConfig,
          items: finalItems,
        });
      }
    }
  }

  if (!isDryRun) {
    const reporterOptions = {
      sourceName,
      title: sourceConfig.title || collectedTitle,
    };

    // report
    for (const { plugin, options } of plugins) {
      await plugin.report(finalItems, { ...reporterOptions, ...options });
    }

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
