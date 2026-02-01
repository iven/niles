# Niles

智能 RSS 新闻聚合器，使用 Claude AI 根据个人兴趣自动筛选和聚合新闻内容。

## 功能特性

- 🤖 **AI 智能筛选**：使用 Claude AI 根据 4 级兴趣层次自动过滤内容
- ⭐ **兴趣分级显示**：强烈感兴趣（⭐⭐）、一般感兴趣（⭐）、其他内容
- 🔧 **灵活配置**：通过 YAML 配置文件管理所有 RSS 源和兴趣主题
- 📡 **外部触发**：支持通过 API 触发，可集成第三方定时服务
- 📰 **多源支持**：支持任意 RSS feed
- 📡 **免费托管**：使用 GitHub Pages 托管 RSS 输出

## 兴趣级别

系统支持 4 个兴趣级别，AI 会根据内容自动分类：

1. **强烈感兴趣** - 必须保留，RSS 标题显示 ⭐⭐
2. **一般感兴趣** - 必须保留，RSS 标题显示 ⭐
3. **不感兴趣** - 建议排除，但如果内容与感兴趣主题相关性高则保留
4. **强烈排除** - 必须排除

## 架构设计

### 目录结构

```
niles/
├── .github/
│   └── workflows/
│       └── fetch-rss.yml      # 主 workflow（外部触发）
├── scripts/
│   ├── extract-new-items.py   # 提取新条目
│   └── generate-rss.py        # 生成 RSS
├── worker/config.json                # RSS 源和兴趣配置
├── rss-prompt.md              # Claude AI 提示词
└── README.md
```

## 快速开始

### 前置要求

- GitHub 账户
- AWS 账户（用于 Bedrock）
- 已配置的 AWS Bedrock Claude 模型访问权限

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

进入仓库 Settings → Secrets and variables → Actions → Secrets，添加：

- `AWS_ACCESS_KEY_ID`: AWS 访问密钥 ID
- `AWS_SECRET_ACCESS_KEY`: AWS 秘密访问密钥
- `BEDROCK_HAIKU_MODEL_ID`: Bedrock Haiku 模型 ID
- `BEDROCK_SONNET_MODEL_ID`: Bedrock Sonnet 模型 ID
- `BEDROCK_OPUS_MODEL_ID`: Bedrock Opus 模型 ID

#### 4. 启用 GitHub Pages

进入仓库 Settings → Pages：
- Source: Deploy from a branch
- Branch: gh-pages / root

#### 5. 配置 RSS 源和兴趣主题

编辑 `worker/config.json`：

```json
{
  "global": {
    "high_interest": "人工智能技术进展,编程语言重大更新",
    "interest": "开源项目,开发工具和效率,科学前沿",
    "uninterested": "",
    "exclude": "加密货币,NFT,汽车,航空技术,游戏主机,行业人物"
  },
  "sources": [
    {
      "name": "cnbeta",
      "url": "https://www.cnbeta.com.tw/backend.php",
      "exclude": "健康贴士,娱乐明星日常,历史"
    },
    {
      "name": "sspai",
      "url": "https://sspai.com/feed"
    },
    {
      "name": "hacker-news",
      "url": "https://hnrss.org/best"
    }
  ]
}
```

#### 6. 设置外部触发

使用外部服务（如 Cloudflare Workers、cron-job.org、Pipedream 等）读取配置文件并触发 GitHub Actions：

```bash
curl -X POST \
  -H "Authorization: Bearer <GITHUB_TOKEN>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{
    "event_type": "fetch-rss",
    "client_payload": {
      "source_name": "cnbeta",
      "source_url": "https://www.cnbeta.com.tw/backend.php",
      "global_high_interest": "人工智能技术进展,编程语言重大更新",
      "global_interest": "开源项目,开发工具和效率",
      "global_uninterested": "",
      "global_exclude": "加密货币,NFT,汽车",
      "source_high_interest": "",
      "source_interest": "",
      "source_uninterested": "",
      "source_exclude": "健康贴士,娱乐明星日常"
    }
  }'
```

### 访问 RSS

部署成功后，RSS 地址为：
```
https://<username>.github.io/<repo-name>/cnbeta.xml
https://<username>.github.io/<repo-name>/sspai.xml
https://<username>.github.io/<repo-name>/hacker-news.xml
```

## 配置说明

### 添加新的 RSS 源

编辑 `worker/config.json`，在 `sources` 列表中添加：

```json
{
  "name": "your-source-name",
  "url": "https://example.com/feed",
  "high_interest": "特定主题",
  "exclude": "特定排除"
}
```

### 修改兴趣配置

编辑 `worker/config.json` 中的 `global` 部分，调整 4 个兴趣级别的主题列表。

### 外部触发方案

推荐的外部触发服务：

1. **Cloudflare Workers** - 完全免费，支持 cron triggers
2. **cron-job.org** - 免费，可视化配置
3. **Pipedream** - 免费额度充足，内置 GitHub 集成
4. **n8n** - 开源，自托管

外部服务需要：
1. 读取 `worker/config.json` 配置文件
2. 为每个源调用 GitHub API 触发 workflow
3. 传递完整的配置参数

## 技术栈

- **Claude AI**：内容理解和语义筛选
- **GitHub Actions**：自动化执行
- **GitHub Pages**：RSS 托管
- **AWS Bedrock**：Claude API 访问

## 成本估算

- **GitHub Actions**：免费账户每月 2,000 分钟
- **GitHub Pages**：完全免费
- **AWS Bedrock**：按 token 计费，每个源每次约 0.01-0.05 美元
- **外部触发服务**：Cloudflare Workers 免费版每天 10 万次请求

## 故障排查

### Workflow 执行失败

1. 检查 Actions 日志
2. 确认所有 Secrets 已正确配置
3. 验证 AWS 凭证是否有效
4. 检查外部触发的 payload 格式是否正确

### RSS 未更新

1. 检查 gh-pages 分支是否有新 commit
2. 确认 GitHub Pages 是否启用
3. 清除浏览器缓存

### 筛选结果不理想

1. 调整 `worker/config.json` 中的兴趣主题描述
2. 使用更具体或更宽泛的主题词
3. 调整不同兴趣级别的主题分类

## 许可证

MIT

## 致谢

本项目使用 [Claude Code](https://claude.ai/code) 和 [superpowers](https://github.com/superpowersai/superpowers) 插件开发。
