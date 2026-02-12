# Niles RSS Trigger Worker

Cloudflare Worker 定时触发 Niles RSS workflow。

## 设置步骤

1. 安装依赖：
```bash
pnpm install
```

2. 登录 Cloudflare：
```bash
pnpm wrangler login
```

3. 设置密钥：
```bash
pnpm wrangler secret put GITHUB_TOKEN
# 输入你的 GitHub Personal Access Token

pnpm wrangler secret put GITHUB_REPO
# 输入：iven/niles
```

4. 部署：
```bash
pnpm deploy
```

## 配置

编辑 `wrangler.toml` 修改触发频率：
- `0 * * * *` - 每小时。
- `0 */2 * * *` - 每 2 小时。
- `0 0 * * *` - 每天午夜。

## 本地测试

```bash
pnpm dev
```

然后手动触发：
```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```
