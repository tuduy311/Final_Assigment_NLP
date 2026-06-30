"""
utils/config_loader.py — Safe JSON config loader with fallback defaults.
"""
import json
import os
from typing import Any


def load_json_config(path: str, defaults: dict) -> dict:
    """
    Load a JSON config file. Returns defaults silently if file is missing or malformed.
    """
    if not os.path.exists(path):
        return defaults
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[config_loader] Failed to load {path}: {e}")
        return defaults
