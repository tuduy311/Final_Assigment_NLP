"""
utils/nlp_utils.py — Pure NLP helper functions (no HTTP, no FastAPI).
"""
import json
import os
import re
from collections import Counter
from typing import Optional

# ── spaCy (optional) ──────────────────────────────────────────────────────────
try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
except Exception:
    _nlp = None

# ── Stop names loaded from config ─────────────────────────────────────────────
_DEFAULT_STOP_NAMES = {"i", "me", "you", "he", "she", "it", "we", "they"}
_STOP_NAMES: set[str] = set(_DEFAULT_STOP_NAMES)


def load_stop_names(configs_dir: str) -> None:
    """Load speaker extraction stop names from nlp_rules.json. Call once at startup."""
    global _STOP_NAMES
    path = os.path.join(configs_dir, "nlp_rules.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                names = data.get("speaker_extraction", {}).get("stop_names")
                if names:
                    _STOP_NAMES = set(names)
        except Exception as e:
            print(f"[nlp_utils] Failed to load nlp_rules.json: {e}")


def extract_person_names(text: str) -> list[str]:
    """Use spaCy NER to extract PERSON entities from text."""
    if not _nlp or not text:
        return []
    try:
        doc = _nlp(text)
        counter = Counter(
            ent.text.strip().lower()
            for ent in doc.ents
            if ent.label_ == "PERSON"
            and len(ent.text.strip()) > 1
            and ent.text.lower() not in _STOP_NAMES
        )
        return [name.title() for name, _ in counter.most_common(10)]
    except Exception:
        return []


def parse_tasks_raw(raw: str) -> list:
    """Try to extract action_items list from raw LLM string output."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed.get("action_items", [])
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    try:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group(0)).get("action_items", [])
    except Exception:
        pass

    return []


def validate_action_items(items: list) -> list:
    """
    Sanitize LLM action item output.
    - Drops non-dict entries (malformed LLM output).
    - Ensures required fields exist with safe defaults.
    NOTE: Empty title/assignee/deadline are valid — LLM may not always extract all fields.
    """
    valid = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item.setdefault("title", None)
        item.setdefault("assignee", None)
        item.setdefault("assignees", [])
        item.setdefault("deadline", None)
        item.setdefault("priority", "medium")
        valid.append(item)
    return valid


def is_transcript_unusable(result: dict, configs_dir: str) -> tuple[bool, str]:
    """
    Pre-filtering guard: reject LLM calls if ASR quality is too poor.
    Triggers when BOTH confidence AND no_speech_prob exceed thresholds simultaneously.
    """
    confidence = result.get("confidence")
    no_speech_prob = result.get("no_speech_prob")

    conf_threshold = -0.7
    noise_threshold = 0.6
    thresholds_path = os.path.join(configs_dir, "metrics_thresholds.json")
    try:
        with open(thresholds_path, "r", encoding="utf-8") as f:
            t = json.load(f)
            conf_threshold = t.get("confidence_threshold", conf_threshold)
            noise_threshold = t.get("no_speech_prob_threshold", noise_threshold)
    except Exception:
        pass

    if confidence is not None and no_speech_prob is not None:
        if confidence < conf_threshold and no_speech_prob > noise_threshold:
            return True, (
                f"Audio quality is too poor for reliable analysis "
                f"(confidence={confidence:.2f}, no_speech_prob={no_speech_prob:.2f}). "
                "Please upload a cleaner recording."
            )

    return False, ""
