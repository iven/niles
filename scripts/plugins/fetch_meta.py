"""网页 meta description 抓取插件"""

import sys
import httpx
from bs4 import BeautifulSoup


def process_item(item):
    """抓取网页 meta description

    Args:
        item: RSS 条目,包含 link 字段

    Returns:
        增强后的 item,meta 写入 item['extra']['meta']
    """
    url = item.get('link')
    if not url:
        return item

    # 初始化 extra 字典
    if 'extra' not in item:
        item['extra'] = {}

    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            response = client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
                },
            )
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # 提取 meta description
        meta = soup.find("meta", attrs={"name": "description"}) or soup.find(
            "meta", attrs={"property": "og:description"}
        )
        meta_desc = meta.get("content", "") if meta else ""

        item['extra']['meta'] = meta_desc

    except Exception as e:
        print(f"抓取 meta {url} 失败: {e}", file=sys.stderr)
        item['extra']['meta'] = ""

    return item
