# Niles

智能 RSS 新闻聚合器,使用 Claude AI 根据个人兴趣自动筛选和聚合新闻内容。

## 功能特性

- 🤖 **AI 智能筛选**:使用 Claude AI 根据 4 级兴趣层次自动过滤内容
- ⭐ **兴趣分级显示**:强烈感兴趣（⭐⭐）、一般感兴趣（⭐）、其他内容
- 🌐 **深度分析模式**:可选的内容翻译和结构化总结
- 🔌 **插件系统**:支持获取网页元信息、完整内容、Hacker News 评论等
- 🔧 **灵活配置**:通过 JSON 配置文件管理所有 RSS 源和兴趣主题
- 📡 **自动调度**:使用 Cloudflare Workers cron 自动触发
- 📰 **多源支持**:支持任意 RSS feed
- 📡 **免费托管**:使用 GitHub Pages 托管 RSS 输出

## 分类规则

AI 根据配置中的兴趣主题,将条目分类为 4 种类型:

1. **强烈感兴趣** (`high_interest`) - 出现在 RSS 中,标题显示 ⭐⭐
2. **一般感兴趣** (`interest`) - 出现在 RSS 中,标题显示 ⭐
3. **其他** (`other`) - 标题模糊或不太感兴趣但也不排除,出现在 RSS 中但无星标
4. **明确不感兴趣** (`excluded`) - 不出现在 RSS 中

## 快速开始

### 前置要求

- GitHub 账户
- AWS 账户(用于 Bedrock)
- Cloudflare 账户(用于 Workers cron)
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

进入仓库 Settings → Secrets and variables → Actions → Secrets,添加:

- `AWS_ACCESS_KEY_ID`:AWS 访问密钥 ID
- `AWS_SECRET_ACCESS_KEY`:AWS 秘密访问密钥
- `BEDROCK_HAIKU_MODEL_ID`:Bedrock Haiku 模型 ID
- `BEDROCK_SONNET_MODEL_ID`:Bedrock Sonnet 模型 ID
- `BEDROCK_OPUS_MODEL_ID`:Bedrock Opus 模型 ID

#### 4. 启用 GitHub Pages

进入仓库 Settings → Pages:
- Source: Deploy from a branch
- Branch: gh-pages / root

#### 5. 配置 RSS 源和兴趣主题

编辑 `worker/config.json`:

```json
{
  "$schema": "./config.schema.json",
  "global": {
    "high_interest": "重大国内国际新闻,编程工具,编程效率",
    "interest": "重大市场动态,人工智能软件技术,编程语言,开源项目,科学前沿",
    "uninterested": "行业人物,历史,基础设施,加密货币,芯片技术,iPhone,自动驾驶",
    "exclude": "NFT,汽车,航空,游戏主机,开发板,人物传记",
    "preferred_language": "zh",
    "timeout": 5
  },
  "sources": [
    {
      "name": "cnbeta",
      "url": "https://www.cnbeta.com.tw/backend.php",
      "cron": "*/30 * * * *",
      "exclude": "健康贴士,娱乐明星日常",
      "plugins": [],
      "summarize": false
    },
    {
      "name": "hacker-news",
      "url": "https://hnrss.org/best",
      "cron": "0 0 * * *",
      "uninterested": "安全,隐私",
      "exclude": "政府政策,社会新闻,代码高尔夫",
      "plugins": ["fetch_meta", "fetch_content", "hacker_news_comments"],
      "summarize": true,
      "timeout": 20
    }
  ]
}
```

#### 6. 部署 Cloudflare Worker

1. 安装 Wrangler CLI:
```bash
npm install -g wrangler
```

2. 登录 Cloudflare:
```bash
wrangler login
```

3. 配置 secrets:
```bash
cd worker
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO  # 例如: iven/niles
```

4. 部署 worker:
```bash
wrangler deploy
```

5. 设置 cron triggers(在 Cloudflare Dashboard 的 Workers → Triggers → Cron Triggers):
   - 添加配置文件中定义的所有 cron 表达式
   - 例如: `*/30 * * * *` (每 30 分钟) 和 `0 0 * * *` (每天 0 点)

### 访问 RSS

部署成功后,RSS 地址为:
```
https://<username>.github.io/<repo-name>/cnbeta.xml
https://<username>.github.io/<repo-name>/hacker-news.xml
```

## 配置说明

### 全局配置

- `high_interest`:强烈感兴趣的主题(逗号分隔)
- `interest`:一般感兴趣的主题(逗号分隔)
- `uninterested`:不感兴趣的主题(逗号分隔)
- `exclude`:强烈排除的主题(逗号分隔)
- `preferred_language`:首选语言代码(如 zh, en)
- `timeout`:全局默认超时时间(分钟)

### RSS 源配置

每个源可以覆盖全局配置:

- `name`:源名称(必需)
- `url`:RSS feed URL(必需)
- `cron`:Cron 表达式(必需)
- `high_interest`:源特定的强烈感兴趣主题
- `interest`:源特定的一般感兴趣主题
- `uninterested`:源特定的不感兴趣主题
- `exclude`:源特定的强烈排除主题
- `plugins`:启用的插件列表(可选)
  - `fetch_meta`:获取网页 meta description
  - `fetch_content`:获取完整网页内容
  - `hacker_news_comments`:获取 Hacker News 评论
- `summarize`:是否启用深度分析模式(默认 false)
- `timeout`:源特定的超时时间(覆盖全局配置)


## 成本估算

- **GitHub Actions**:免费账户每月 2,000 分钟
- **GitHub Pages**:完全免费
- **AWS Bedrock**:按 token 计费
  - 简单模式:每个源每次约 $0.01-0.05
  - 深度分析模式:每个源每次约 $0.10-0.50(取决于条目数量)
- **Cloudflare Workers**:免费版每天 10 万次请求

## 开发

查看 [AGENTS.md](AGENTS.md) 了解项目架构、设计原则和开发指南。

## 许可证

MIT