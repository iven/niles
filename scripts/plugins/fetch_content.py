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
        if main:
            # 提取图片信息
            images = []
            img_tags = main.find_all("img")
            filter_keywords = ["category", "categories", "tag", "topic", "icon", "avatar"]
            img_index = 0

            for idx, img in enumerate(img_tags):
                img_src = img.get("src", "").lower()

                # 过滤第一张图片（如果是分类/主题图标）
                if idx == 0 and any(keyword in img_src for keyword in filter_keywords):
                    img.decompose()
                    continue

                # 保留图片
                img_data = {
                    "src": img.get("src", ""),
                    "alt": img.get("alt", "")
                }
                # 保留尺寸信息（如果有）
                if img.get("width"):
                    img_data["width"] = img.get("width")
                if img.get("height"):
                    img_data["height"] = img.get("height")
                if img.get("title"):
                    img_data["title"] = img.get("title")

                images.append(img_data)

                # 替换 img 标签为占位符
                placeholder = f"[IMAGE_{img_index}]"
                img.replace_with(placeholder)
                img_index += 1

            # 提取纯文本
            text = main.get_text(separator=" ", strip=True)
            text = " ".join(text.split())[:15000]  # 限制长度
            item['extra']['content'] = text
            item['extra']['images'] = images

        else:
            item['extra']['content'] = ""
            item['extra']['images'] = []

    except Exception as e:
        print(f"抓取内容 {url} 失败: {e}", file=sys.stderr)
        item['extra']['content'] = ""
        item['extra']['images'] = []

    return item
