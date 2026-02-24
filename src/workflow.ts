/**
 * Niles 工作流：RSS 个性化处理流程
 */

import { gradeItems } from "./grade";
import type { GlobalConfig, LlmConfig, SourceConfig } from "./lib/config";
import { GuidTracker } from "./lib/guid-tracker";
import { loadRss } from "./rss/loader";
import { writeRss } from "./rss/writer";
import { summarizeItem } from "./summarize";
import type { GradedRssItem, UngradedRssItem } from "./types";

function logBreakdown(items: GradedRssItem[], label: string) {
  console.log(`${label}：`);

  // 按 level 分组
  const grouped = items.reduce(
    (acc, item) => {
      const level = item.level;
      if (!acc[level]) acc[level] = [];
      acc[level]?.push(item);
      return acc;
    },
    {} as Record<string, GradedRssItem[]>,
  );

  // 按优先级排序显示
  const levelNames = {
    critical: "必看",
    recommended: "推荐",
    optional: "可选",
    rejected: "排除",
  };
  const order: Array<keyof typeof levelNames> = [
    "critical",
    "recommended",
    "optional",
    "rejected",
  ];

  let groupIndex = 0;
  const totalGroups = order.filter(
    (level) => (grouped[level]?.length ?? 0) > 0,
  ).length;

  for (const level of order) {
    const levelItems = grouped[level];
    if (!levelItems || levelItems.length === 0) continue;

    const levelName = levelNames[level];
    console.log(`  [${levelName}] ${levelItems.length} 个条目`);
    for (const item of levelItems) {
      console.log(`    《${item.title}》`);
      console.log(`    └─ ${item.reason}`);
    }

    groupIndex++;
    // 最后一个分级组后面不加空行
    if (groupIndex < totalGroups) {
      console.log("");
    }
  }
}

async function summarizeAndRegrade(
  items: GradedRssItem[],
  originalItems: UngradedRssItem[],
  llmConfig: LlmConfig,
  globalConfig: GlobalConfig,
  sourceConfig: SourceConfig,
): Promise<GradedRssItem[]> {
  // 提取非 rejected 的条目
  const itemsToSummarize = items.filter((item) => item.level !== "rejected");

  console.log(`\n${"─".repeat(50)}`);
  console.log(`→ 开始总结 ${itemsToSummarize.length} 个条目...`);

  // 并行总结
  const summaryResults = await Promise.all(
    itemsToSummarize.map((item) =>
      summarizeItem({
        llmConfig,
        preferredLanguage: globalConfig.preferred_language,
        item,
      }),
    ),
  );

  console.log(`\n✓ 总结完成：${summaryResults.length} 个条目`);
  for (const summary of summaryResults) {
    console.log(`  《${summary.title}》`);
  }

  // 从原始数据补充 link 和 pubDate
  const rawItemMap = new Map(originalItems.map((item) => [item.guid, item]));

  const summarizedItems: UngradedRssItem[] = summaryResults.map((summary) => {
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
  console.log(`\n${"─".repeat(50)}`);
  console.log("→ 开始二次分级...");
  const regradedItems = await gradeItems({
    llmConfig,
    globalConfig,
    sourceConfig,
    items: summarizedItems,
  });

  logBreakdown(regradedItems, "✓ 二次分级完成");

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

  const { channelTitle, items: newItems } = await loadRss({
    url,
    tracker,
    maxItems,
    minItems,
    plugins: sourceConfig.plugins,
  });

  console.log(`\n✓ 获取到 ${newItems.length} 个新条目`);

  // 分级（简单模式或深度分析模式的第一次分级）
  console.log(`\n${"─".repeat(50)}`);
  console.log("→ 开始分级...");
  let finalItems = await gradeItems({
    llmConfig,
    globalConfig,
    sourceConfig,
    items: newItems,
  });

  logBreakdown(finalItems, "✓ 分级完成");

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
  console.log(`\n${"─".repeat(50)}`);
  console.log("→ 生成 RSS 文件...");
  const { rss, newCount } = await writeRss(
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

  console.log(`\n✓ 处理完成：${newCount} 个新条目`);
  console.log(`  源名称：${sourceName}`);
  console.log(`  模式：${sourceConfig.summarize ? "深度分析" : "简单模式"}`);
}
