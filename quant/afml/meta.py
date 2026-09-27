"""Meta-labeling (AFML ch. 3.6): CHAN decides the SIDE, a secondary classifier decides WHETHER to act and HOW MUCH.

The classifier predicts P(meta = 1) = P(the signal clears its costs). A signal is taken only when p > threshold.
Optional sizing turns p into a bet size in [0, 1] (AFML ch. 10): z = (p - 1/2) / sqrt(p(1-p)), m = 2*Phi(z) - 1,
rounded down to steps of 0.1. The size MULTIPLIES the existing risk budget, so it can only shrink a trade; every
risk cap of the base system still applies on top.
Models: Random Forest (bagging on average uniqueness, balanced classes, large leaves) and LightGBM. Both are fitted
with uniqueness sample weights. Feature importance: MDI (RF, in-sample, biased) and MDA (permutation on purged
out-of-sample folds, neg log-loss) — MDA is the one to read.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import norm
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import log_loss


def make_model(kind: str, avg_u: float, seed: int = 7):
    if kind == "rf":
        return RandomForestClassifier(n_estimators=300, min_samples_leaf=50, max_features="sqrt",
                                      max_samples=float(np.clip(avg_u, 0.05, 1.0)), class_weight="balanced_subsample",
                                      n_jobs=-1, random_state=seed)
    if kind == "lgbm":
        from lightgbm import LGBMClassifier
        return LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=100,
                              subsample=float(np.clip(avg_u, 0.1, 1.0)), subsample_freq=1, colsample_bytree=0.7,
                              reg_lambda=1.0, class_weight="balanced", random_state=seed, verbose=-1)
    raise ValueError(kind)


def fit_predict(kind, X, y, w, tr, te, avg_u):
    if len(np.unique(y[tr])) < 2:
        return np.full(len(te), float(y[tr].mean()) if len(tr) else 0.5)
    m = make_model(kind, avg_u)
    m.fit(np.nan_to_num(X[tr], nan=0.0), y[tr], sample_weight=w[tr])
    return m.predict_proba(np.nan_to_num(X[te], nan=0.0))[:, 1]


def bet_size(p: np.ndarray, step: float = 0.1) -> np.ndarray:
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    z = (p - 0.5) / np.sqrt(p * (1 - p))
    m = np.clip(2 * norm.cdf(z) - 1, 0, 1)
    return np.floor(m / step) * step


def mda(kind, X, y, w, splits, avg_u, names, seed=7) -> dict:
    rng = np.random.default_rng(seed)
    base, drops = [], {n: [] for n in names}
    Xn = np.nan_to_num(X, nan=0.0)
    for tr, te in splits:
        if len(np.unique(y[tr])) < 2 or len(np.unique(y[te])) < 2:
            continue
        m = make_model(kind, avg_u)
        m.fit(Xn[tr], y[tr], sample_weight=w[tr])
        b = -log_loss(y[te], m.predict_proba(Xn[te])[:, 1], sample_weight=w[te])
        base.append(b)
        for j, nme in enumerate(names):
            Xp = Xn[te].copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            drops[nme].append(b - (-log_loss(y[te], m.predict_proba(Xp)[:, 1], sample_weight=w[te])))
    return {n: {"mean": float(np.mean(v)), "std": float(np.std(v))} for n, v in drops.items() if v}


def mdi(kind, X, y, w, avg_u, names) -> dict:
    m = make_model("rf", avg_u)
    m.fit(np.nan_to_num(X, nan=0.0), y, sample_weight=w)
    return {n: float(v) for n, v in zip(names, m.feature_importances_)}
