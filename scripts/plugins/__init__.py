"""插件加载器"""

def load_plugin(plugin_name):
    """动态加载插件模块

    Args:
        plugin_name: 插件名称,如 'fetch_meta', 'fetch_content', 'hacker_news_comments'

    Returns:
        插件模块对象
    """
    try:
        module = __import__(f'plugins.{plugin_name}', fromlist=[plugin_name])
        return module
    except ImportError as e:
        raise ImportError(f"无法加载插件 {plugin_name}: {e}")
