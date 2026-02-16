"""GUID 历史记录跟踪器"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

# GUID 历史记录保留天数
HISTORY_RETENTION_DAYS = 4


class GuidTracker:
    """GUID 历史记录跟踪器

    GUID 是字符串类型，用于唯一标识 RSS 条目
    保存 GUID 及其首次处理时间，用于自动清理过期记录
    """

    def __init__(self, history_path: Path | str) -> None:
        """初始化跟踪器

        Args:
            history_path: 历史记录文件路径
        """
        self.history_path = Path(history_path)
        self.processed_guids: dict[str, str] = self._load()

    def _load(self) -> dict[str, str]:
        """加载已处理的 GUID 历史记录

        Returns:
            GUID 到首次处理时间（ISO 格式字符串）的映射
        """
        if not self.history_path.exists():
            return {}

        try:
            with open(self.history_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("guids", {})
        except:
            return {}

    def _save(self) -> None:
        """保存已处理的 GUID 历史记录"""
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.history_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "guids": dict(sorted(self.processed_guids.items())),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

    def is_processed(self, guid: str) -> bool:
        """检查 GUID 是否已处理

        Args:
            guid: 条目的 GUID 字符串

        Returns:
            是否已处理
        """
        return guid in self.processed_guids

    def mark_processed(self, guids: str | list[str]) -> None:
        """标记 GUID 为已处理

        Args:
            guids: GUID 字符串或字符串列表
        """
        if isinstance(guids, str):
            guids = [guids]

        now = datetime.now(timezone.utc).isoformat()
        for guid in guids:
            # 只记录首次处理时间
            if guid not in self.processed_guids:
                self.processed_guids[guid] = now

    def cleanup(self) -> None:
        """清理超过保留期的 GUID

        只保留 3 天内处理的 GUID
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=HISTORY_RETENTION_DAYS)

        cleaned_guids: dict[str, str] = {}
        for guid, processed_time in self.processed_guids.items():
            try:
                processed_date = datetime.fromisoformat(processed_time)
                if processed_date >= cutoff_date:
                    cleaned_guids[guid] = processed_time
            except:
                # 时间解析失败，保守处理：保留
                cleaned_guids[guid] = processed_time

        self.processed_guids = cleaned_guids

    def save(self) -> None:
        """保存历史记录到文件"""
        self._save()
