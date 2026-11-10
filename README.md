# Niles

智能 RSS 新闻聚合器，使用 AI 根据个人兴趣自动筛选和聚合新闻内容。

## 功能特性

- 🤖 **AI 智能筛选**：根据 4 级兴趣层次自动过滤内容。
- 🎯 **多 AI 支持**：支持 Anthropic、OpenAI、Gemini、OpenRouter、Grok、OpenCode Go 等多个 provider。
- ⭐ **兴趣分级显示**：强烈感兴趣（⭐⭐）、一般感兴趣（⭐）、其他内容。
- 🌐 **深度分析模式**：可选的内容结构化总结（输出为首选语言）。
- 🔌 **插件系统**：支持获取网页元信息、完整内容、Hacker News 评论等。
- 🔧 **灵活配置**：通过 JSON 配置文件管理所有 RSS 源和兴趣主题。
- 📡 **自动调度**：使用 GitHub Actions schedule 每 1 小时自动执行。
- 📰 **多源支持**：支持任意 RSS feed 和 RSSHub 路由。
- 📡 **免费托管**：使用 GitHub Pages 托管 RSS 输出。

## 分级规则

AI 按 `config.json` 里的兴趣关键词给每条内容定级，共四级：

| 等级 | 含义 | RSS 中的显示 |
| --- | --- | --- |
| `critical` | 强烈感兴趣，必看 | 标题前缀 ⭐⭐ |
| `recommended` | 感兴趣，推荐阅读 | 标题前缀 ⭐ |
| `optional` | 标题含义模糊或兴趣不明确 | 无前缀 |
| `rejected` | 不感兴趣 | 不出现在 RSS 中 |

关键词分四档，分别把相关内容推向对应等级：`highInterest` → `critical`、`interest` → `recommended`、`uninterested` → `optional`、`avoid` → `rejected`。全局关键词（`globalHighInterest` 等）对所有源生效，源内可再补充不带前缀的关键词，两者叠加，源级权重更高。

## 快速开始

### 前置要求

- GitHub 账户。
- 至少一个 AI provider 的 API key（Anthropic、OpenAI、Gemini、OpenRouter、Grok 或 OpenCode Go）。

### 部署步骤

#### 1. Fork 此仓库

#### 2. 创建 gh-pages 分支

```bash
git checkout --orphan gh-pages
echo "# RSS Feeds" > README.md
git add README.md
git commit -m "Initialize gh-pages"
git push -u origin gh-pages
git checkout main
```

#### 3. 配置 GitHub Secrets

进入仓库 Settings → Secrets and variables → Actions → Secrets，根据使用的 AI provider 添加对应的 API key：

- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`
- Grok: `GROK_API_KEY`
- OpenCode Go: `OPENCODE_API_KEY`（需在 Console 的 Settings › Privacy 把 Regions 设为 Global，否则 GitHub Actions 的请求会被拒绝）

#### 4. 启用 GitHub Pages

进入仓库 Settings → Pages：
- Source: Deploy from a branch。
- Branch: gh-pages / root。

#### 5. 配置 RSS 源和兴趣主题

编辑 `config.json`:

```json
{
  "llm": {
    "provider": "opencode-go",
    "models": {
      "fast": "deepseek-v4.1-flash",
      "balanced": "deepseek-v4.1-flash",
      "powerful": "deepseek-v4.1-flash"
    }
  },
  "plugins": {
    "builtin/collect-rss": { "maxItems": 20 },
    "builtin/llm-grade": {
      "globalHighInterest": "编程工具发布/分享,编程效率改进经验,新AI模型发布公告",
      "globalInterest": "国内/国际必读新闻,AI软件技术进展,开源项目,软件新功能",
      "globalUninterested": "行业公司/人物,历史/旧闻,基础设施,加密货币",
      "globalAvoid": "NFT,汽车,航空,游戏主机"
    },
    "builtin/llm-summarize": { "preferredLanguage": "zh" }
  },
  "sources": [
    {
      "name": "cnbeta",
      "title": "cnBeta.com - 中文业界资讯站",
      "plugins": [
        {
          "name": "builtin/collect-rss",
          "options": { "url": "https://www.cnbeta.com.tw/backend.php" }
        },
        {
          "name": "builtin/llm-grade",
          "options": { "avoid": "健康贴士,娱乐明星日常" }
        },
        {
          "name": "builtin/reporter-rss",
          "options": { "outputPath": "output/cnbeta.xml" }
        }
      ]
    },
    {
      "name": "hacker-news",
      "context": "Hacker News 首页精选",
      "plugins": [
        {
          "name": "builtin/collect-rss",
          "options": { "url": "https://hnrss.org/best" }
        },
        "builtin/fetch-meta",
        "builtin/fetch-content",
        {
          "name": "builtin/llm-grade",
          "options": { "uninterested": "安全,隐私" }
        },
        "builtin/llm-summarize",
        {
          "name": "builtin/reporter-rss",
          "options": { "outputPath": "output/hacker-news.xml" }
        }
      ]
    }
  ]
}
```

提交配置到 main 分支后，GitHub Actions 将每 1 小时自动执行所有源。

### 访问 RSS

部署成功后，RSS 地址为：
```
https://<username>.github.io/<repo-name>/cnbeta.xml
https://<username>.github.io/<repo-name>/hacker-news.xml
```

## 配置说明

### LLM 配置

- `provider`：AI provider 类型（anthropic、openai、gemini、openrouter、grok、opencode-go）。
- `baseUrl`：可选，自定义 API 端点；不填时使用 provider 的默认端点。
- `models`：按能力等级配置模型名称。
  - `fast`：用于轻量任务的模型。
  - `balanced`：用于一般任务的模型。
  - `powerful`：用于复杂任务的模型。

### 顶层 plugins 配置

为所有源提供插件默认 options，source 内同名插件的 options 会覆盖（合并）全局值：

- `builtin/collect-rss`：`maxItems` 每个 feed 最多抓取的条数。
- `builtin/collect-rsshub`：`maxItems` 每个路由最多抓取的条数。
- `builtin/llm-grade`：`globalHighInterest` / `globalInterest` / `globalUninterested` / `globalAvoid` 为全局兴趣关键词，逗号分隔。
- `builtin/llm-summarize`：`preferredLanguage` 总结语言，`maxConcurrency` 逐条总结的并发数。

### RSS 源配置

- `name`：源名称（必需），用于日志、插件上下文以及 feed 的标题和描述；输出文件名由 `builtin/reporter-rss` 的 `outputPath` 决定。
- `title`：RSS 标题（可选，默认使用原 feed 标题）。
- `context`：源级别的背景说明，注入到该源所有插件的 LLM 上下文。
- `plugins`：插件列表。元素可以写插件名（使用全局 options），也可以写 `{ "name": ..., "options": {...} }`。`collect` 阶段所有插件并行执行、结果合并；`processItems` 和 `report` 阶段按列表顺序串行执行。
  - `builtin/collect-rss`：`url` 为 RSS / Atom 地址。
  - `builtin/collect-rsshub`：`route` 为 RSSHub 路由（如 `/zhihu/hot`）。
  - `builtin/llm-grade`：可用 `highInterest` / `interest` / `uninterested` / `avoid` 补充兴趣关键词，优先级高于全局配置。
  - `builtin/llm-summarize`：启用深度总结。
  - `builtin/reporter-rss`：`outputPath` 为输出 RSS 文件路径。


## 成本估算

- **GitHub Actions**：免费账户每月 2,000 分钟。
- **GitHub Pages**：完全免费。
- **AI API**：按 token 计费，具体费用取决于选择的 provider 和模型。
  - 简单模式：每个源每次约 $0.01-0.05。
  - 深度分析模式：每个源每次约 $0.10-0.50（取决于条目数量和模型）。

## 开发

查看 [AGENTS.md](AGENTS.md) 了解项目架构、设计原则和开发指南。

## 许可证

MIT
