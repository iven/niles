/**
 * Niles 工作流：RSS 个性化处理流程
 */

import type { LlmConfig, SourceConfig } from "./lib/config";
import { createLlmClient } from "./lib/llm";
import { logger } from "./lib/logger";
import { applyProcessItems, loadPlugins, type PluginContext } from "./plugin";
import type { FeedItem } from "./types";

const PIPELINE_PREFIX = [
  "builtin/deduplicate",
  "builtin/limit-items",
  "builtin/clean-text",
];

interface WorkflowParams {
  sourceName: string;
  sourceConfig: SourceConfig;
  llmConfig: LlmConfig;
  globalPluginOptions: Record<string, object>;
  isDryRun: boolean;
}

export async function runWorkflow(params: WorkflowParams) {
  const { sourceName, sourceConfig, llmConfig, globalPluginOptions, isDryRun } =
    params;

  const context: PluginContext = {
    sourceName,
    sourceContext: sourceConfig.context,
    isDryRun,
    llm(tier) {
      return createLlmClient(llmConfig, llmConfig.models[tier]);
    },
  };

  // 合并全局 options 和 source options
  const pluginEntries = sourceConfig.plugins.map((entry) => {
    const name = typeof entry === "string" ? entry : entry.name;
    const sourceOptions =
      typeof entry === "object" && entry.options ? entry.options : {};
    const globalOptions = globalPluginOptions[name] ?? {};
    return { name, options: { ...globalOptions, ...sourceOptions } };
  });

  const plugins = await loadPlugins(pluginEntries);

  const prefixPlugins = await loadPlugins(
    PIPELINE_PREFIX.map((name) => ({
      name,
      options: globalPluginOptions[name] ?? {},
    })),
  );

  logger.start("获取新条目...");

  // collect：并行执行所有 collect，合并结果
  const collectResults = await Promise.all(
    plugins.map(({ plugin, options }) => plugin.collect(options, context)),
  );

  let collectedTitle: string | undefined;
  let allItems: FeedItem[] = [];
  for (const result of collectResults) {
    if (result.title) collectedTitle = result.title;
    allItems = allItems.concat(result.items);
  }

  logger.log(`  获取到 ${allItems.length} 个原始条目`);

  // processItems：先执行前置插件，再顺序执行 source 插件
  let items = allItems;
  for (const loadedPlugin of prefixPlugins) {
    items = await applyProcessItems(items, loadedPlugin, context);
  }
  for (const loadedPlugin of plugins) {
    items = await applyProcessItems(items, loadedPlugin, context);
  }

  // 统计最终结果
  const nonRejected = items.filter((item) => item.level !== "rejected");
  logger.log("");
  logger.success(`处理完成 (${nonRejected.length} 个条目)`);
  logger.log(`  源: ${sourceName}`);

  if (!isDryRun) {
    const reporterOptions = {
      sourceName,
      title: sourceConfig.title || collectedTitle,
    };

    for (const { plugin, options } of plugins) {
      await plugin.report(items, { ...reporterOptions, ...options }, context);
    }
  }
}
