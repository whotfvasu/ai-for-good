#!/usr/bin/env python3
"""Train the donor-pairing propensity model with XGBoost (locally — no SageMaker).

Label: will this donor actually convert when matched? We use the dataset's own
signal — an active donor who has converted at least one call into a donation.
The point of the model is to rank, within a patient's bridge, who is most
likely to actually show up.

Exports `models/pairing_model.json` as a *simple, walkable* tree dump so the
Lambda can score in pure Python with zero ML dependencies. Also prints feature
importances for the "why this donor" explanation in the UI.

Run:  python3 models/train_pairing.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.shared.pairing_features import FEATURE_NAMES, extract  # noqa: E402
from backend.shared.repository import CsvRepository  # noqa: E402

ANCHOR = date(2025, 8, 17)
# Write into backend/shared so the model ships inside the Lambda zip
# (deploy_lambdas.sh zips backend/). Keep a copy under models/ for the repo.
OUT = ROOT / "backend" / "shared" / "pairing_model.json"
OUT_COPY = ROOT / "models" / "pairing_model.json"


def build_dataset():
    repo = CsvRepository()
    X, y = [], []
    for d in repo.donors():
        X.append(extract(d, ANCHOR))
        # Positive = active donor who has converted at least one donation.
        converted = (d.donations_till_date or 0) > 0
        active = (d.active_status or "").lower() == "active"
        y.append(1 if (converted and active) else 0)
    return X, y


def main() -> int:
    import xgboost as xgb

    X, y = build_dataset()
    pos = sum(y)
    print(f"samples={len(y)} positives={pos} ({pos / max(len(y),1):.1%})")

    dtrain = xgb.DMatrix(X, label=y, feature_names=[f"f{i}" for i in range(len(FEATURE_NAMES))])
    params = {
        "objective": "binary:logistic",
        "eta": 0.3,
        "max_depth": 4,
        "eval_metric": "auc",
        "base_score": 0.5,
    }
    booster = xgb.train(params, dtrain, num_boost_round=40)

    # Walkable tree dump (list of per-tree JSON), zero-dep to score later.
    trees = [json.loads(t) for t in booster.get_dump(dump_format="json")]

    # Map xgboost feature-importance keys (f0, f1, …) to readable names.
    raw_importance = booster.get_score(importance_type="gain")
    importance = {
        FEATURE_NAMES[int(k[1:])]: round(v, 3)
        for k, v in sorted(raw_importance.items(), key=lambda kv: -kv[1])
    }

    model = {
        "version": 1,
        "objective": "binary:logistic",
        "base_score": 0.5,
        "feature_names": FEATURE_NAMES,
        "trees": trees,
        "importance": importance,
    }
    payload = json.dumps(model)
    OUT.write_text(payload)
    OUT_COPY.write_text(payload)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(trees)} trees)")
    print("top features:", json.dumps(dict(list(importance.items())[:5]), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
