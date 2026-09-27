"""Purged K-fold with embargo and Combinatorial Purged CV (AFML ch. 7 and 12).

Events are (t0, t1) intervals in ms, sorted by t0. A training event is PURGED if its interval overlaps any test
event's interval (its label would contain information from the test period), and EMBARGOED if it starts within
`embargo_ms` after a test block ends (serial correlation leaks forward). Groups are contiguous in time.
CPCV: N groups, every combination of k test groups is a split; the per-group OOS predictions are stitched into
phi = C(N,k)*k/N complete backtest PATHS, giving a distribution of OOS performance instead of one number.
"""
from __future__ import annotations

from itertools import combinations

import numpy as np


def _groups(n: int, n_groups: int) -> list[np.ndarray]:
    return [g for g in np.array_split(np.arange(n), n_groups)]


def _train_mask(t0, t1, test_idx: np.ndarray, embargo_ms: int, blocks: list[np.ndarray]) -> np.ndarray:
    keep = np.ones(len(t0), bool)
    keep[test_idx] = False
    for b in blocks:
        a, e = t0[b].min(), t1[b].max()
        overlap = (t0 <= e) & (t1 >= a)
        emb = (t0 > e) & (t0 <= e + embargo_ms)
        keep &= ~(overlap | emb)
    return keep


def purged_kfold(t0: np.ndarray, t1: np.ndarray, n_splits: int = 6, embargo_ms: int = 86_400_000):
    """Yields (train_idx, test_idx). t0 must be sorted."""
    for g in _groups(len(t0), n_splits):
        keep = _train_mask(t0, t1, g, embargo_ms, [g])
        yield np.flatnonzero(keep), g


def cpcv(t0: np.ndarray, t1: np.ndarray, n_groups: int = 6, k: int = 2, embargo_ms: int = 86_400_000):
    """Returns (splits, paths). splits = [(train_idx, test_groups)], paths[p] = {group: split_no}."""
    groups = _groups(len(t0), n_groups)
    splits, members = [], {g: [] for g in range(n_groups)}
    for s, comb in enumerate(combinations(range(n_groups), k)):
        test = np.concatenate([groups[g] for g in comb])
        keep = _train_mask(t0, t1, test, embargo_ms, [groups[g] for g in comb])
        splits.append((np.flatnonzero(keep), list(comb)))
        for g in comb:
            members[g].append(s)
    n_paths = len(members[0])
    paths = [{g: members[g][p] for g in range(n_groups)} for p in range(n_paths)]
    return splits, paths, groups
