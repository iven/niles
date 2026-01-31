# Niles

智能 RSS 新闻聚合器，使用 Claude AI 根据个人兴趣自动筛选和聚合新闻内容。

## 功能特性

- 🤖 **AI 智能筛选**：使用 Claude AI 根据兴趣主题自动过滤内容
- 📰 **多种来源支持**：支持 Hacker News、RSS feeds 等多种新闻源
- 📝 **深度内容聚合**：为 Hacker News 等讨论平台生成原文和讨论双重摘要
- ⏰ **自动化执行**：通过 GitHub Actions 定时抓取，无需服务器
- 📡 **免费托管**：使用 GitHub Pages 托管 RSS 输出

## 架构设计

详细设计文档见 [docs/plans/2026-01-31-niles-design.md](docs/plans/2026-01-31-niles-design.md)

### 抓取策略

**discussion-aggregator（讨论聚合）**
- 适用于有原文链接 + 讨论区的网站（如 Hacker News）
- 抓取原文内容和所有评论
- 生成原文摘要和讨论摘要

**rss-filter（RSS 筛选）**
- 适用于标准 RSS feed
- 基于标题进行 AI 筛选
- 保留原始内容结构

### 目录结构

```
niles/
├── .github/
│   └── workflows/          # GitHub Actions 工作流
│       ├── fetch-30min.yml
│       ├── fetch-hourly.yml
│       ├── fetch-daily.yml
│       └── fetch-weekly.yml
├── prompts/                # Claude AI 提示词
│   ├── discussion-aggregator.md
│   └── rss-filter.md
├── docs/                   # 文档
│   └── plans/
└── README.md
```

## 快速开始

### 前置要求

- GitHub 账户
- AWS 账户（用于 Bedrock）
- 已配置的 AWS Bedrock Claude 模型访问权限

### 部署步骤

1. **Fork 或 Clone 此仓库**

2. **创建 gh-pages 分支**
   ```bash
   git checkout --orphan gh-pages
   echo "# RSS Feeds" > README.md
   git add README.md
   git commit -m "Initialize gh-pages"
   git push -u origin gh-pages
   git checkout main
   ```

3. **配置 GitHub Variables**

   进入仓库 Settings → Secrets and variables → Actions → Variables，添加：

   - `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
     - 示例: `人工智能和机器学习,Rust 编程语言,开源项目,开发工具和效率`
   - `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）
     - 示例: `加密货币和 NFT,Web3,政治新闻`

4. **配置 GitHub Secrets**

   进入仓库 Settings → Secrets and variables → Actions → Secrets，添加：

   - `AWS_ACCESS_KEY_ID`: AWS 访问密钥 ID
   - `AWS_SECRET_ACCESS_KEY`: AWS 秘密访问密钥
   - `BEDROCK_HAIKU_MODEL_ID`: Bedrock Haiku 模型 ID
   - `BEDROCK_SONNET_MODEL_ID`: Bedrock Sonnet 模型 ID
   - `BEDROCK_OPUS_MODEL_ID`: Bedrock Opus 模型 ID

5. **启用 GitHub Pages**

   进入仓库 Settings → Pages：
   - Source: Deploy from a branch
   - Branch: gh-pages / root

6. **手动触发 Workflow 测试**

   进入 Actions 标签，选择一个 workflow，点击 "Run workflow" 进行测试。

### 访问 RSS

部署成功后，RSS 地址为：
```
https://<username>.github.io/<repo-name>/hacker-news.xml
https://<username>.github.io/<repo-name>/cnbeta.xml
https://<username>.github.io/<repo-name>/sspai.xml
```

## 配置说明

### 添加新的 RSS 源

1. 确定抓取频率（30min/hourly/daily/weekly）
2. 确定抓取策略（discussion-aggregator/rss-filter）
3. 编辑对应的 workflow 文件，在 `matrix.include` 中添加：

```yaml
- name: your-source-name
  strategy: rss-filter
  url: https://example.com/feed
```

### 修改兴趣配置

1. 进入仓库 Settings → Secrets and variables → Actions → Variables
2. 编辑 `INTERESTS_TOPICS` 或 `INTERESTS_EXCLUDE`
3. 下次 workflow 执行时自动生效

## 技术栈

- **Claude AI**：内容理解和摘要生成
- **GitHub Actions**：自动化执行
- **GitHub Pages**：RSS 托管
- **AWS Bedrock**：Claude API 访问

## 成本估算

- **GitHub Actions**：免费账户每月 2,000 分钟（通常足够）
- **GitHub Pages**：完全免费
- **AWS Bedrock**：按 token 计费，具体取决于使用量

## 故障排查

### Workflow 执行失败

1. 检查 Actions 日志
2. 确认所有 Secrets/Variables 已正确配置
3. 验证 AWS 凭证是否有效

### RSS 未更新

1. 检查 gh-pages 分支是否有新 commit
2. 确认 GitHub Pages 是否启用
3. 清除浏览器缓存

### 筛选结果不理想

1. 检查 INTERESTS_TOPICS 和 INTERESTS_EXCLUDE 配置
2. 考虑调整主题描述（更具体或更宽泛）

## 后续优化

- [ ] 动态 matrix（从配置文件读取源列表）
- [ ] 错误通知机制
- [ ] RSS 条目去重和历史管理
- [ ] 更多抓取策略（Reddit、Twitter 等）
- [ ] Web UI 展示筛选日志

## 许可证

MIT

## 致谢

本项目使用 [Claude Code](https://claude.ai/code) 和 [superpowers](https://github.com/superpowersai/superpowers) 插件开发。
