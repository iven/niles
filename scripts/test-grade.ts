/**
 * 手动测试 grade 功能
 *
 * 运行方式: bun run scripts/test-grade.ts
 */

import { gradeItems } from "../src/grade";
import { loadConfig } from "../src/lib/config";

// 固定的测试数据 - 包含不同主题的条目
const TEST_SAMPLES = [
  {
    title: "AMD's HIP Moves To Using LLVM's New Offload Driver By Default",
    link: "https://www.phoronix.com/news/AMD-HIP-Default-New-Offload",
    pubDate: "Tue, 24 Feb 2026 08:09:31 -0500",
    description:
      "A change merged to upstream LLVM Git yesterday for LLVM 23 is moving AMD's HIP to using the new/modern offload driver by default...",
    guid: "https://www.phoronix.com/news/AMD-HIP-Default-New-Offload",
    extra: {
      meta: "A change merged to upstream LLVM Git for LLVM 23 is moving AMD's HIP to using the new/modern offload driver by default.",
    },
    graded: false as const,
  },
  {
    title: "New Python 3.13 Performance Improvements",
    link: "https://example.com/python-313",
    pubDate: "Tue, 24 Feb 2026 10:00:00 -0500",
    description:
      "Python 3.13 brings significant performance improvements to the interpreter...",
    guid: "https://example.com/python-313",
    extra: {
      meta: "Python 3.13 introduces major performance optimizations including JIT compilation and faster startup times.",
    },
    graded: false as const,
  },
  {
    title: "Latest iPhone 16 Pro Camera Features",
    link: "https://example.com/iphone-16",
    pubDate: "Tue, 24 Feb 2026 11:00:00 -0500",
    description: "Apple announces new camera features for iPhone 16 Pro...",
    guid: "https://example.com/iphone-16",
    extra: {
      meta: "Apple's iPhone 16 Pro features advanced camera capabilities with improved night mode and AI enhancements.",
    },
    graded: false as const,
  },
];

async function main() {
  const config = await loadConfig("./config.json");
  const sourceConfig = config.sources.find((s) => s.name === "phoronix");

  if (!sourceConfig) {
    throw new Error("找不到 phoronix 源配置");
  }

  await gradeItems({
    llmConfig: config.llm,
    globalConfig: config.global,
    sourceConfig: sourceConfig,
    items: TEST_SAMPLES,
  });
}

main().catch(console.error);
