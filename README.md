# Niles

智能 RSS 新闻聚合器，使用 AI 根据个人兴趣自动筛选和聚合新闻内容。

## 功能特性

- 🤖 **AI 智能筛选**：根据 4 级兴趣层次自动过滤内容。
- 🎯 **多 AI 支持**：支持 Anthropic、OpenAI、Gemini、OpenRouter、Grok 等多个 provider。
- ⭐ **兴趣分级显示**：强烈感兴趣（⭐⭐）、一般感兴趣（⭐）、其他内容。
- 🌐 **深度分析模式**：可选的内容结构化总结（输出为首选语言）。
- 🔌 **插件系统**：支持获取网页元信息、完整内容、Hacker News 评论等。
- 🔧 **灵活配置**：通过 JSON 配置文件管理所有 RSS 源和兴趣主题。
- 📡 **自动调度**：使用 GitHub Actions schedule 每 1 小时自动执行。
- 📰 **多源支持**：支持任意 RSS feed 和 RSSHub 路由。
- 📡 **免费托管**：使用 GitHub Pages 托管 RSS 输出。

## 分类规则

AI 根据配置中的兴趣主题，将条目分类为 4 种类型：

1. **强烈感兴趣** (`high_interest`) - 出现在 RSS 中，标题显示 ⭐⭐。
2. **一般感兴趣** (`interest`) - 出现在 RSS 中，标题显示 ⭐。
3. **其他** (`other`) - 标题模糊或不太感兴趣但也不排除，出现在 RSS 中但无星标。
4. **明确不感兴趣** (`exclude`) - 不出现在 RSS 中。

## 快速开始

### 前置要求

- GitHub 账户。
- 至少一个 AI provider 的 API key（Anthropic、OpenAI、Gemini、OpenRouter 或 Grok）。

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

#### 4. 启用 GitHub Pages

进入仓库 Settings → Pages：
- Source: Deploy from a branch。
- Branch: gh-pages / root。

#### 5. 配置 RSS 源和兴趣主题

编辑 `config.json`:

```json
{
  "llm": {
    "provider": "anthropic",
    "models": {
      "grade": "claude-3-5-haiku-20241022",
      "summarize": "claude-3-5-sonnet-20241022"
    }
  },
  "global": {
    "high_interest": "重大国内国际新闻,编程工具,编程效率",
    "interest": "重大市场动态,人工智能软件技术,编程语言,开源项目,科学前沿",
    "uninterested": "行业人物,历史,基础设施,加密货币,芯片技术,iPhone,自动驾驶",
    "avoid": "NFT,汽车,航空,游戏主机,开发板,人物传记",
    "preferred_language": "zh",
    "timeout": 5
  },
  "sources": [
    {
      "name": "cnbeta",
      "title": "cnBeta.com - 中文业界资讯站",
      "url": "https://www.cnbeta.com.tw/backend.php",
      "avoid": "健康贴士,娱乐明星日常",
      "plugins": [],
      "summarize": false
    },
    {
      "name": "hacker-news",
      "url": "https://hnrss.org/best",
      "uninterested": "安全,隐私",
      "avoid": "政府政策,社会新闻,代码高尔夫",
      "plugins": ["fetch_content", "hn_fetch_comments"],
      "summarize": true,
      "timeout": 20
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

- `provider`：AI provider 类型（anthropic、openai、gemini、openrouter、grok）。
- `baseUrl`：可选，自定义 API 端点（仅 OpenAI 支持）。
- `models`：各任务使用的模型名称。
  - `grade`：用于分级的模型。
  - `summarize`：用于总结的模型。

### 全局配置

- `high_interest`：强烈感兴趣的主题（逗号分隔）。
- `interest`：一般感兴趣的主题（逗号分隔）。
- `uninterested`：不感兴趣的主题（逗号分隔）。
- `avoid`：强烈排除的主题（逗号分隔）。
- `preferred_language`：首选语言代码（如 zh, en）。
- `timeout`：全局默认超时时间（分钟）。

### RSS 源配置

每个源可以补充全局配置：

- `name`：源名称（必需）。
- `title`：RSS 标题（可选，默认使用原 RSS 标题）。
- `url`：RSS feed URL（必需）。支持 RSSHub 路由格式（如 `rsshub:///telegram/channel/zaihuapd`）。
- `high_interest`：补充全局配置的强烈感兴趣主题（优先级更高）。
- `interest`：补充全局配置的一般感兴趣主题（优先级更高）。
- `uninterested`：补充全局配置的不感兴趣主题（优先级更高）。
- `avoid`：补充全局配置的强烈排除主题（优先级更高）。
- `plugins`：启用的插件列表（可选）。
  - `clean_text`：清理文本中的零宽字符和多余空白（内置，自动应用）。
  - `fetch_content`：获取完整网页内容。
  - `hn_fetch_comments`：获取 Hacker News 评论。
  - `zaihuapd_clean_description`：清理在花频道 description 中的固定链接和图片。
- `summarize`：是否启用深度分析模式（默认 false）。
- `timeout`：源特定的超时时间（覆盖全局配置）。


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
