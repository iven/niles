/**
 * 手动测试 summarize 功能
 *
 * 运行方式: bun run scripts/test-summarize.ts
 */

import { summarizeItem } from "../src/summarize";
import { loadConfig } from "../src/lib/config";

// 固定的测试数据 - 包含各种格式元素(引号、图片等)
const TEST_SAMPLE = {
  "title": "New Python Development Tool Improves Coding Efficiency",
  "link": "https://example.com/python-tool",
  "pubDate": "Tue, 24 Feb 2026 08:09:31 -0500",
  "description": "A new Python development tool has been released with significant improvements...",
  "guid": "https://example.com/python-tool",
  "extra": {
    "content": "New Python Development Tool Improves Coding Efficiency. A new Python development tool called \"FastCode\" has been released, bringing significant improvements to developer productivity. The tool introduces several key features: automatic code completion with AI assistance, integrated debugging with \"smart breakpoints\", and real-time performance profiling. According to the developers, FastCode can reduce development time by up to 40% compared to traditional IDEs. The tool supports Python 3.10+ and includes built-in support for popular frameworks like Django and Flask. Users can enable the AI assistant with the \"--enable-ai\" flag or disable it with \"--no-ai\". [IMAGE_0] The tool has received positive feedback from early adopters, with many praising its \"intuitive interface\" and \"powerful features\". One user commented: \"This is a game-changer for Python development.\" The free tier includes basic features, while the \"Pro\" subscription unlocks advanced capabilities including team collaboration and cloud sync.",
    "images": [
      {
        "src": "https://example.com/images/fastcode-screenshot.png",
        "alt": "FastCode IDE screenshot showing the main interface"
      }
    ]
  },
  "graded": false as const
};

async function main() {
  console.log("加载配置...");
  const config = await loadConfig("./config.json");

  console.log("开始总结测试...");
  const result = await summarizeItem({
    llmConfig: config.llm,
    preferredLanguage: config.global.preferred_language,
    item: TEST_SAMPLE,
  });

  console.log("\n总结结果:");
  console.log("标题:", result.title);
  console.log("\n描述:");
  console.log(result.description);
  console.log("\n描述长度:", result.description.length);
}

main().catch(console.error);
