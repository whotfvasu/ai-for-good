"""Pure-Python XGBoost scorer — runs the trained donor-pairing model inside a
dependency-free Lambda.

We never import xgboost at runtime. Instead we load the walkable tree dump that
train_pairing.py exported and traverse it by hand. If the model file is missing
or malformed, every function degrades to None so callers fall back to the rule
score — the demo never breaks because of the model.
"""
from __future__ import annotations

import json
import math
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from .models import Donor
from .pairing_features import extract

MODEL_PATH = Path(__file__).parent / "pairing_model.json"


@lru_cache(maxsize=1)
def _model() -> dict[str, Any] | None:
    try:
        model = json.loads(MODEL_PATH.read_text())
        # Pre-flatten each tree into an id→node map for O(depth) walks.
        for tree in model["trees"]:
            tree["_by_id"] = _flatten(tree)
        return model
    except Exception:
        return None


def _flatten(node: dict, acc: dict[int, dict] | None = None) -> dict[int, dict]:
    if acc is None:
        acc = {}
    acc[node["nodeid"]] = node
    for child in node.get("children", []):
        _flatten(child, acc)
    return acc


def _walk(tree: dict, feats: list[float]) -> float:
    by_id = tree["_by_id"]
    node = tree  # root
    while "leaf" not in node:
        fidx = int(node["split"][1:])  # "f5" → 5
        thr = node["split_condition"]
        val = feats[fidx] if fidx < len(feats) else 0.0
        # XGBoost: go "yes" when value < threshold; "missing" handled as yes.
        nxt_id = node["yes"] if val < thr else node["no"]
        node = by_id[nxt_id]
    return float(node["leaf"])


def score(donor: Donor, anchor_date: date) -> float | None:
    """Return P(donor converts) in [0,1], or None if the model is unavailable."""
    model = _model()
    if model is None:
        return None
    feats = extract(donor, anchor_date)
    base = model.get("base_score", 0.5)
    margin = math.log(base / (1 - base)) if 0 < base < 1 else 0.0
    margin += sum(_walk(tree, feats) for tree in model["trees"])
    return 1.0 / (1.0 + math.exp(-margin))


def importance() -> dict[str, float]:
    model = _model()
    return model.get("importance", {}) if model else {}
