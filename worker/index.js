// Cloudflare Worker for triggering Niles RSS workflow
import configText from './config.json';

// 解析 JSON 字符串
const config = JSON.parse(configText);

export default {
  async scheduled(event, env) {
    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const GITHUB_REPO = env.GITHUB_REPO || 'iven/niles';
    const currentCron = event.cron; // 当前触发的 cron 表达式

    console.log(`[${new Date().toISOString()}] 触发 cron: ${currentCron}`);

    // 只为匹配当前 cron 的源触发 workflow
    for (const source of config.sources) {
      // 检查源的 cron 是否匹配当前触发的 cron
      if (source.cron !== currentCron) {
        continue;
      }

      console.log(`触发源: ${source.name}`);

      const payload = {
        event_type: 'fetch-rss',
        client_payload: {
          timeout: source.timeout ?? config.global.timeout,
          config: JSON.stringify({
            source_name: source.name,
            source_url: source.url,
            global: {
              high_interest: config.global.high_interest,
              interest: config.global.interest,
              uninterested: config.global.uninterested,
              exclude: config.global.exclude,
              preferred_language: config.global.preferred_language
            },
            source: {
              high_interest: source.high_interest || '',
              interest: source.interest || '',
              uninterested: source.uninterested || '',
              exclude: source.exclude || ''
            },
            fetch_content: source.fetch_content ?? false,
            translate: source.translate ?? false
          })
        }
      };

      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Niles-Worker'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`失败: ${source.name} (${response.status})`);
      }
    }
  }
};
