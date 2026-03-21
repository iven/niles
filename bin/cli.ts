#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { LogLevels } from "consola";
import { loadConfig } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { runWorkflow } from "../src/workflow";

interface ParsedArgs {
  values: {
    config?: string;
    "dry-run"?: boolean;
  };
  positionals: string[];
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: "string", default: "config.json" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: true,
  }) as ParsedArgs;

  const [sourceName] = positionals;

  if (!sourceName) {
    logger.error("用法: niles <source-name> [--config <path>] [--dry-run]");
    process.exit(1);
  }

  const configPath = values.config || "config.json";
  const isDryRun = values["dry-run"] ?? false;

  if (isDryRun) {
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
    llmConfig: config.llm,
    globalPluginOptions: config.plugins,
    isDryRun,
  });
}

main().catch((error) => {
  logger.error(error);
  process.exit(1);
});
