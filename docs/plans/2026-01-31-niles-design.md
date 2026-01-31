# Niles - 智能 RSS 新闻聚合器 - 设计文档

**日期：** 2026-01-31
**版本：** 1.0

## 1. 项目概览

**项目名称：** Niles

**核心功能：**
- 从多种来源（Hacker News、RSS feeds）自动提取新闻
- 使用 Claude AI 根据兴趣主题智能筛选内容
- 为 Hacker News 帖子生成原文摘要和讨论摘要
- 生成独立的 RSS feed 文件（每个源一个）
- 通过 GitHub Actions 定时执行，GitHub Pages 托管输出

**技术栈：**
- Claude Code（通过 Anthropic 官方 GitHub Action）
- GitHub Actions（自动化执行）
- GitHub Variables（配置管理）
- GitHub Pages（RSS 托管）
- AWS Bedrock（Claude API 访问）

**价值：**
- 自动过滤信息噪音，只保留感兴趣的内容
- 深度理解 Hacker News 内容（原文+讨论）
- 统一的 RSS 订阅体验
- 零成本部署和运行（除 AWS Bedrock 费用）

## 2. 目录结构

```
niles/
├── .github/
│   └── workflows/
│       ├── fetch-30min.yml      # 每 30 分钟执行
│       ├── fetch-hourly.yml     # 每小时执行
│       ├── fetch-daily.yml      # 每天执行
│       └── fetch-weekly.yml     # 每周执行
├── prompts/
│   ├── discussion-aggregator.md # 讨论聚合策略提示词
│   └── rss-filter.md            # RSS 筛选策略提示词
├── docs/
│   └── plans/
│       └── 2026-01-31-niles-design.md
├── output/                       # gh-pages 分支
│   ├── hacker-news.xml
│   ├── cnbeta.xml
│   └── sspai.xml
└── README.md
```

## 3. 配置管理

### GitHub Variables（在仓库 Settings → Variables 中配置）

- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
  - 示例: `人工智能和机器学习,Rust 编程语言,开源项目,开发工具和效率`
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）
  - 示例: `加密货币和 NFT,Web3,政治新闻`

### GitHub Secrets（在仓库 Settings → Secrets 中配置）

**AWS 认证：**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

**Bedrock 模型 ID：**
- `BEDROCK_HAIKU_MODEL_ID`
- `BEDROCK_SONNET_MODEL_ID`
- `BEDROCK_OPUS_MODEL_ID`

**GitHub Token（自动提供）：**
- `GITHUB_TOKEN`

## 4. 抓取策略

### 策略 A：discussion-aggregator（讨论聚合）

**适用场景：** 有原文链接 + 讨论区的网站

**典型应用：** Hacker News

**执行流程：**
1. 获取帖子列表（前 N 条热门帖子）
2. 基于标题 AI 筛选
   - 根据 INTERESTS_TOPICS 判断是否感兴趣
   - 根据 INTERESTS_EXCLUDE 排除不关心的内容
3. 对筛选通过的帖子：
   - 抓取原文内容
   - 抓取所有评论
4. 生成摘要：
   - 原文摘要（200-300 字，保留核心观点）
   - 讨论摘要（200-300 字，总结主要观点和争议点）
5. 输出 RSS

**输出格式：**
```xml
<item>
  <title>文章标题</title>
  <link>原文链接</link>
  <description><![CDATA[
    <h3>原文摘要</h3>
    <p>...</p>
    <h3>讨论摘要</h3>
    <p>...</p>
    <p><a href="HN讨论链接">查看 HN 讨论 (156 条评论)</a></p>
  ]]></description>
  <content:encoded><![CDATA[
    <h2>原文摘要</h2>
    <p>...</p>
    <h2>Hacker News 讨论摘要</h2>
    <p>...</p>
    <hr/>
    <p><strong>原文链接：</strong><a href="原文链接">原文链接</a></p>
    <p><strong>HN 讨论：</strong><a href="HN讨论链接">HN讨论链接</a> (156 条评论, 342 分)</p>
  ]]></content:encoded>
</item>
```

### 策略 B：rss-filter（RSS 筛选）

**适用场景：** 标准 RSS feed

**典型应用：** CNBeta、SSPai 等新闻网站

**执行流程：**
1. 读取 RSS feed
2. 基于标题 AI 筛选
   - 根据 INTERESTS_TOPICS 判断是否感兴趣
   - 根据 INTERESTS_EXCLUDE 排除不关心的内容
3. 保留原始条目，输出 RSS

**输出格式：**
保持原始 RSS 结构，只包含筛选后的条目

## 5. GitHub Actions Workflow

### Workflow 分组策略

按执行频率分为 4 个 workflow 文件：

- `fetch-30min.yml` - 每 30 分钟执行（高频源如 Hacker News）
- `fetch-hourly.yml` - 每小时执行（部分活跃 RSS 源）
- `fetch-daily.yml` - 每天执行（大部分 RSS 源）
- `fetch-weekly.yml` - 每周执行（低频源）

### Workflow 实现（以 fetch-30min.yml 为例）

```yaml
name: Fetch 30min Sources

on:
  schedule:
    - cron: '*/30 * * * *'  # 每 30 分钟
  workflow_dispatch:          # 支持手动触发

jobs:
  fetch:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - name: hacker-news
            strategy: discussion-aggregator
            url: https://news.ycombinator.com
            top_items: 30

    steps:
      - name: Checkout main branch
        uses: actions/checkout@v4

      - name: Checkout gh-pages branch
        uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: output

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2

      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        env:
          ANTHROPIC_DEFAULT_HAIKU_MODEL: ${{ secrets.BEDROCK_HAIKU_MODEL_ID }}
          ANTHROPIC_DEFAULT_SONNET_MODEL: ${{ secrets.BEDROCK_SONNET_MODEL_ID }}
          ANTHROPIC_DEFAULT_OPUS_MODEL: ${{ secrets.BEDROCK_OPUS_MODEL_ID }}
          SOURCE_NAME: ${{ matrix.name }}
          SOURCE_URL: ${{ matrix.url }}
          TOP_ITEMS: ${{ matrix.top_items }}
          INTERESTS_TOPICS: ${{ vars.INTERESTS_TOPICS }}
          INTERESTS_EXCLUDE: ${{ vars.INTERESTS_EXCLUDE }}
        with:
          use_bedrock: 'true'
          github_token: ${{ secrets.GITHUB_TOKEN }}
          prompt-file: prompts/${{ matrix.strategy }}.md

      - name: Commit and Push
        working-directory: output
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add ${{ matrix.name }}.xml
          git commit -m "Update ${{ matrix.name }} RSS" || exit 0
          git push
```

**关键点：**
- 使用 matrix 策略遍历该频率的所有源（初期硬编码）
- 直接在 gh-pages 分支操作
- 通过环境变量传递配置给提示词
- 支持手动触发（workflow_dispatch）

## 6. 提示词设计

### discussion-aggregator.md

```markdown
# 任务：讨论聚合源抓取

你需要从讨论聚合类网站（如 Hacker News）抓取内容并生成 RSS。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称（如 hacker-news）
- `SOURCE_URL`: 源 URL
- `TOP_ITEMS`: 抓取前 N 条热门帖子
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 获取帖子列表

访问 SOURCE_URL，获取前 TOP_ITEMS 条热门帖子。

提取信息：
- 标题
- 原文链接
- 评论区链接
- 分数
- 作者
- 发布时间

### 2. 基于标题 AI 筛选

对每个帖子：
- 根据 INTERESTS_TOPICS 判断是否相关
- 根据 INTERESTS_EXCLUDE 排除不关心的内容
- 输出筛选理由（用于调试）

只保留筛选通过的帖子。

### 3. 抓取原文和评论

对每个筛选通过的帖子：
- 访问原文链接，提取主要内容
- 访问评论区链接，获取所有评论

### 4. 生成摘要

为每个帖子生成：
- **原文摘要**：200-300 字，保留核心观点
- **讨论摘要**：200-300 字，总结热门评论的主要观点和争议点

### 5. 生成 RSS

输出到 `output/SOURCE_NAME.xml`。

RSS 格式：
- 使用标准 RSS 2.0 格式
- 每个条目包含：
  - 标题
  - 原文链接
  - description：原文摘要 + 讨论摘要 + HN 讨论链接（HTML 格式，用 CDATA 包裹）
  - content:encoded：完整格式化内容（包含摘要、链接、元数据等）
  - 发布时间
- 按发布时间倒序排列
```

### rss-filter.md

```markdown
# 任务：RSS 源筛选

你需要从 RSS feed 读取内容并根据兴趣筛选。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称（如 cnbeta）
- `SOURCE_URL`: RSS feed URL
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 读取 RSS feed

访问 SOURCE_URL，解析 RSS 内容，获取所有条目。

### 2. 基于标题 AI 筛选

对每个条目：
- 根据 INTERESTS_TOPICS 判断是否相关
- 根据 INTERESTS_EXCLUDE 排除不关心的内容
- 输出筛选理由（用于调试）

只保留筛选通过的条目。

### 3. 生成 RSS

输出到 `output/SOURCE_NAME.xml`。

保留原始条目的：
- 标题
- 链接
- 描述
- 发布时间

按发布时间倒序排列。
```

## 7. RSS 输出格式

### discussion-aggregator 策略输出

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Hacker News - 精选</title>
    <link>https://news.ycombinator.com</link>
    <description>基于个人兴趣筛选的 Hacker News 内容</description>
    <lastBuildDate>2026-01-31T08:30:00Z</lastBuildDate>

    <item>
      <title>Show HN: I built a Rust-based CLI tool</title>
      <link>https://example.com/article</link>
      <pubDate>2026-01-31T07:15:00Z</pubDate>
      <guid>https://news.ycombinator.com/item?id=12345678</guid>

      <description><![CDATA[
        <h3>原文摘要</h3>
        <p>作者介绍了一个用 Rust 开发的命令行工具，主要用于提升开发效率...</p>

        <h3>讨论摘要</h3>
        <p>社区主要讨论了以下几点：1) 性能对比现有工具的优势... 2) Rust 生态的成熟度...</p>

        <p><a href="https://news.ycombinator.com/item?id=12345678">查看 HN 讨论 (156 条评论)</a></p>
      ]]></description>

      <content:encoded><![CDATA[
        <h2>原文摘要</h2>
        <p>作者介绍了一个用 Rust 开发的命令行工具...</p>

        <h2>Hacker News 讨论摘要</h2>
        <p>社区主要讨论了以下几点...</p>

        <hr/>
        <p><strong>原文链接：</strong><a href="https://example.com/article">https://example.com/article</a></p>
        <p><strong>HN 讨论：</strong><a href="https://news.ycombinator.com/item?id=12345678">https://news.ycombinator.com/item?id=12345678</a> (156 条评论, 342 分)</p>
      ]]></content:encoded>
    </item>
  </channel>
</rss>
```

### rss-filter 策略输出

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CNBeta - 精选</title>
    <link>https://www.cnbeta.com.tw</link>
    <description>基于个人兴趣筛选的 CNBeta 内容</description>
    <lastBuildDate>2026-01-31T08:30:00Z</lastBuildDate>

    <item>
      <title>OpenAI 发布新模型</title>
      <link>https://www.cnbeta.com.tw/articles/tech/12345.htm</link>
      <pubDate>2026-01-31T07:00:00Z</pubDate>
      <description>OpenAI 今日宣布推出新一代语言模型...</description>
    </item>
  </channel>
</rss>
```

**关键特性：**
- discussion-aggregator：包含丰富的双重摘要（原文+讨论）
- rss-filter：保持原始 RSS 结构，仅筛选条目
- 都包含 `lastBuildDate` 表示更新时间
- 使用 CDATA 包裹 HTML 内容避免解析问题

## 8. 部署流程

### 初次部署步骤

1. **创建 GitHub 仓库**
   ```bash
   git init
   git remote add origin <仓库地址>
   ```

2. **创建 gh-pages 分支**
   ```bash
   git checkout --orphan gh-pages
   mkdir output
   echo "# RSS Feeds" > README.md
   git add .
   git commit -m "Initialize gh-pages"
   git push -u origin gh-pages
   git checkout main
   ```

3. **配置 GitHub Variables**
   - 进入仓库 Settings → Secrets and variables → Actions → Variables
   - 添加：
     - `INTERESTS_TOPICS`
     - `INTERESTS_EXCLUDE`

4. **配置 GitHub Secrets**
   - 进入仓库 Settings → Secrets and variables → Actions → Secrets
   - 添加：
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `BEDROCK_HAIKU_MODEL_ID`
     - `BEDROCK_SONNET_MODEL_ID`
     - `BEDROCK_OPUS_MODEL_ID`

5. **启用 GitHub Pages**
   - 进入仓库 Settings → Pages
   - Source: Deploy from a branch
   - Branch: gh-pages / root

6. **提交代码**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push -u origin main
   ```

7. **手动触发 workflow 测试**
   - 进入 Actions 标签
   - 选择 workflow
   - 点击 "Run workflow"

### 访问 RSS

部署成功后，RSS 地址为：
```
https://<username>.github.io/<repo-name>/hacker-news.xml
https://<username>.github.io/<repo-name>/cnbeta.xml
```

## 9. 使用示例

### 添加新的 RSS 源

1. 确定抓取频率（30min/hourly/daily/weekly）
2. 确定抓取策略（discussion-aggregator/rss-filter）
3. 编辑对应的 workflow 文件，在 matrix.include 中添加：

```yaml
- name: sspai
  strategy: rss-filter
  url: https://sspai.com/feed
```

4. 提交并等待下次执行

### 修改兴趣配置

1. 进入仓库 Settings → Secrets and variables → Actions → Variables
2. 编辑 `INTERESTS_TOPICS` 或 `INTERESTS_EXCLUDE`
3. 下次 workflow 执行时自动生效

### 手动触发更新

1. 进入 Actions 标签
2. 选择要执行的 workflow
3. 点击 "Run workflow"
4. 选择 branch（main）
5. 点击 "Run workflow" 按钮

## 10. 后续优化方向

### 短期优化（1-2 周）

1. **动态 matrix**
   - 创建 sources.json 配置文件
   - 使用两阶段 job 从配置文件生成 matrix
   - 避免在 workflow 中硬编码源列表

2. **错误处理**
   - 添加失败通知（邮件/Slack）
   - 记录失败原因
   - 失败时不更新 RSS（保留上次成功的版本）

3. **RSS 优化**
   - 添加条目去重逻辑
   - 限制 RSS 文件大小（保留最近 N 条）
   - 添加更多元数据（统计信息等）

### 中期优化（1-2 月）

4. **更多策略**
   - Reddit 讨论抓取
   - Twitter/X 话题聚合
   - GitHub Trending 项目筛选

5. **历史管理**
   - 记录所有处理过的条目
   - 避免重复处理
   - 提供历史查询接口

6. **Web UI**
   - 展示筛选日志
   - 统计信息（筛选率、来源分布等）
   - 配置管理界面

### 长期优化（3-6 月）

7. **个性化学习**
   - 基于用户反馈调整筛选策略
   - 自动发现新的兴趣主题
   - 推荐相关的新源

8. **性能优化**
   - 并行抓取多个源
   - 缓存机制
   - 增量更新

9. **多用户支持**
   - 支持多个用户配置
   - 私有 RSS feed
   - 用户认证

## 11. 技术限制和注意事项

### GitHub Actions 限制

- 免费账户每月 2,000 分钟
- 单个 job 最长运行 6 小时
- 并发 job 数量限制（免费账户 20 个）
- 建议：监控使用量，避免过于频繁的执行

### AWS Bedrock 成本

- 按 token 计费
- 建议：
  - 使用 Haiku 模型进行简单筛选
  - 只对筛选通过的内容使用 Sonnet 生成摘要
  - 设置月度预算告警

### 抓取限制

- 遵守目标网站的 robots.txt
- 避免过于频繁的请求
- 添加适当的延迟
- 使用合理的 User-Agent

### 数据存储

- gh-pages 分支大小限制 1GB
- RSS 文件不应过大（建议 < 1MB）
- 定期清理旧条目

## 12. 故障排查

### Workflow 执行失败

1. 检查 Actions 日志
2. 确认所有 Secrets/Variables 已正确配置
3. 验证 AWS 凭证是否有效
4. 检查 Bedrock 模型 ID 是否正确

### RSS 未更新

1. 检查 gh-pages 分支是否有新 commit
2. 确认 GitHub Pages 是否启用
3. 清除浏览器缓存
4. 等待 GitHub Pages 部署（可能需要几分钟）

### 筛选结果不理想

1. 检查 INTERESTS_TOPICS 和 INTERESTS_EXCLUDE 配置
2. 查看提示词是否清晰
3. 考虑调整主题描述（更具体或更宽泛）
4. 手动测试提示词

### 成本过高

1. 检查 AWS Bedrock 使用量
2. 减少抓取频率
3. 减少每次抓取的条目数
4. 优化提示词（减少 token 使用）

## 13. 总结

Niles 是一个轻量级、可扩展的智能 RSS 聚合器，核心优势在于：

1. **零服务器成本**：完全基于 GitHub 免费服务
2. **智能筛选**：利用 Claude AI 理解内容相关性
3. **深度内容**：为 Hacker News 等讨论平台生成双重摘要
4. **易于扩展**：模块化的策略设计，容易添加新源和新策略
5. **配置灵活**：通过 GitHub Variables 管理，无需修改代码

该设计已经考虑了初期实现的简单性（硬编码 matrix）和未来优化的空间（动态配置、更多策略等），是一个可以快速启动并逐步完善的方案。
