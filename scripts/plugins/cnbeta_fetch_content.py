"""cnBeta 网页正文内容抓取插件"""

import sys
import httpx
from bs4 import BeautifulSoup


def process_item(item):
    """抓取 cnBeta 网页正文内容

    Args:
        item: RSS 条目,包含 link 字段

    Returns:
        增强后的 item,正文替换 description 字段
    """
    url = item.get('link')
    if not url:
        return item

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

        # 查找 cnBeta 特定的正文容器
        summary = soup.find(class_="article-summary")
        content = soup.find(class_="article-content")

        html_parts = []
        if summary:
            html_parts.append(str(summary))
        if content:
            html_parts.append(str(content))

        html = "".join(html_parts)

        # 直接替换 description 字段
        item['description'] = html

    except Exception as e:
        print(f"抓取内容 {url} 失败: {e}", file=sys.stderr)
        # 失败时保持原 description 不变

    return item
