"""网页正文内容抓取插件"""

import sys
import httpx
from bs4 import BeautifulSoup


def process_item(item):
    """抓取网页正文内容

    Args:
        item: RSS 条目,包含 link 字段

    Returns:
        增强后的 item,content 写入 item['extra']['content']
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

        # 提取正文
        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()

        main = soup.find("article") or soup.find("main") or soup.find("body")
        text = main.get_text(separator=" ", strip=True) if main else ""
        text = " ".join(text.split())[:10000]  # 限制长度

        item['extra']['content'] = text

    except Exception as e:
        print(f"抓取内容 {url} 失败: {e}", file=sys.stderr)
        item['extra']['content'] = ""

    return item
