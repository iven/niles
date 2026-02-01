// Cloudflare Worker for triggering Niles RSS workflow
import configText from './config.json';

// 解析 JSON 字符串
const config = JSON.parse(configText);

export default {
  async scheduled(event, env, ctx) {
    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const GITHUB_REPO = env.GITHUB_REPO || 'iven/niles';
    const currentCron = event.cron; // 当前触发的 cron 表达式

    // 只为匹配当前 cron 的源触发 workflow
    for (const source of config.sources) {
      // 检查源的 cron 是否匹配当前触发的 cron
      if (source.cron !== currentCron) {
        continue;
      }
      const payload = {
        event_type: 'fetch-rss',
        client_payload: {
          source_name: source.name,
          source_url: source.url,
          global_high_interest: config.global.high_interest || '',
          global_interest: config.global.interest || '',
          global_uninterested: config.global.uninterested || '',
          global_exclude: config.global.exclude || '',
          source_high_interest: source.high_interest || '',
          source_interest: source.interest || '',
          source_uninterested: source.uninterested || '',
          source_exclude: source.exclude || ''
        }
      };

      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Niles-Worker'
        },
        body: JSON.stringify(payload)
      });
    }
  }
};
