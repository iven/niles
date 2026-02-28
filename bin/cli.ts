#!/usr/bin/env bun

/**
 * Niles CLI 入口：解析命令行参数
 */

import { parseArgs } from "node:util";
import { LogLevels } from "consola";
import { loadConfig } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { runWorkflow } from "../src/workflow";

interface ParsedArgs {
  values: {
    config?: string;
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
  const isDryRun = values["dry-run"] ?? false;

  let maxItems = parseInt(values["max-items"], 10);
  let minItems = parseInt(values["min-items"], 10);
  if (isDryRun) {
    maxItems = 3;
    minItems = 3;
    logger.level = LogLevels.debug;
  }

  const config = await loadConfig(configPath);
  const sourceConfig = config.sources.find((s) => s.name === sourceName);

  if (!sourceConfig) {
    throw new Error(`配置中未找到 source: ${sourceName}`);
  }

  await runWorkflow({
    sourceName,
    sourceConfig,
    globalConfig: config.global,
    llmConfig: config.llm,
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
