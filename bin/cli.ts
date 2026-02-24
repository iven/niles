#!/usr/bin/env bun

/**
 * Niles CLI 入口：解析命令行参数
 */

import { parseArgs } from "node:util";
import { loadConfig } from "../src/lib/config";
import { runWorkflow } from "../src/workflow";

interface ParsedArgs {
  values: {
    config?: string;
    "output-dir"?: string;
    "max-items": string;
    "min-items": string;
    "dry-run"?: boolean;
  };
  positionals: string[];
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: "string", default: "config.json" },
      "output-dir": { type: "string", default: "output" },
      "max-items": { type: "string", default: "20" },
      "min-items": { type: "string", default: "0" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as ParsedArgs;

  const [sourceName] = positionals;

  if (!sourceName) {
    console.error("用法: niles <source-name> [--config <path>] [options]");
    process.exit(1);
  }

  const configPath = values.config || "config.json";
  const outputDir = values["output-dir"] || "output";
  const isDryRun = values["dry-run"] ?? false;

  // Dry run 模式：固定抓取 3 条
  let maxItems = parseInt(values["max-items"], 10);
  let minItems = parseInt(values["min-items"], 10);
  if (isDryRun) {
    maxItems = 3;
    minItems = 3;
  }

  // 加载配置
  const config = await loadConfig(configPath);
  const sourceConfig = config.sources.find((s) => s.name === sourceName);

  if (!sourceConfig) {
    throw new Error(`配置中未找到 source: ${sourceName}`);
  }

  // 运行工作流
  await runWorkflow({
    sourceName,
    sourceConfig,
    globalConfig: config.global,
    llmConfig: config.llm,
    outputDir,
    maxItems,
    minItems,
    isDryRun,
  });
}

main().catch((error) => {
  console.error(`错误: ${error}`);
  console.error(error.stack);
  process.exit(1);
});
