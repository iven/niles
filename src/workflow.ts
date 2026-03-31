import type { LlmConfig, SourceConfig } from "./lib/config";
import { createLlmClient } from "./lib/llm";
import { logger } from "./lib/logger";
import { applyProcessItems, loadPlugins, type PluginContext } from "./plugin";
import type { FeedItem } from "./types";

const PIPELINE_PREFIX = ["builtin/deduplicate", "builtin/clean-text"];

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
    now: new Date(),
    llm(tier) {
      return createLlmClient(llmConfig, llmConfig.models[tier]);
    },
    logger,
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

  // beforeRun：并行检查所有插件，有一个返回 false 则跳过
  const beforeResults = await Promise.all(
    plugins.map(({ name, plugin, options }) =>
      plugin.beforeRun(options, {
        ...context,
        logger: context.logger.withTag(name),
      }),
    ),
  );
  if (beforeResults.some((allowed) => !allowed)) return;

  // collect：并行执行所有 collect，合并结果
  const collectResults = await Promise.all(
    plugins.map(({ name, plugin, options }) =>
      plugin.collect(options, {
        ...context,
        logger: context.logger.withTag(name),
      }),
    ),
  );

  let collectedTitle: string | undefined;
  let allItems: FeedItem[] = [];
  for (const result of collectResults) {
    if (result.title) collectedTitle = result.title;
    allItems = allItems.concat(result.items);
  }

  // processItems：先执行前置插件，再顺序执行 source 插件
  let items = allItems;
  for (const loadedPlugin of prefixPlugins) {
    items = await applyProcessItems(items, loadedPlugin, context);
  }
  for (const loadedPlugin of plugins) {
    items = await applyProcessItems(items, loadedPlugin, context);
  }

  const reporterOptions = {
    sourceName,
    title: sourceConfig.title || collectedTitle,
  };

  for (const { name, plugin, options } of plugins) {
    await plugin.report(
      items,
      { ...reporterOptions, ...options },
      { ...context, logger: context.logger.withTag(name) },
    );
  }

  // afterRun：并行通知所有插件 workflow 已完成
  await Promise.all(
    plugins.map(({ name, plugin, options }) =>
      plugin.afterRun(options, {
        ...context,
        logger: context.logger.withTag(name),
      }),
    ),
  );
}
