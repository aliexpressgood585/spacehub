"""Identity of the live book, and the one-shot STRATEGY_CHANGE event.

The desk stamps `state["strategy_set"]` after every cycle. The first cycle
whose config does not match that stamp appends one event and takes the fast
path (latest closed hour only, no history replay). Era, wallet and positions
are not part of the stamp.
"""


def strategy_set_view(cfg):
    sel = (cfg or {}).get("regime_selector") or {}
    sc = (cfg or {}).get("scanner") or {}
    on = bool(sc.get("enabled"))
    rng = sel.get("range_strategy") or None
    return {
        "id": "short_ema_fade_scan" if on else "short_ema_fade",
        "trend_strategy": sel.get("trend_strategy") or "ema_trend_4h",
        "range_strategy": rng if rng else None,
        "selector": bool(sel.get("enabled")),
        "scanner": on,
        "per_coin": bool(on and sc.get("per_coin")),
        "top_n": int(sc.get("top_n") or 18) if on else 0,
        "pullback": bool(on and sc.get("pullback")),
        "max_new_per_bar": int(sc.get("max_new_per_bar") or 2) if on else 0,
    }


def strategy_set_changed(state, cfg):
    prev = (state or {}).get("strategy_set")
    if not isinstance(prev, dict):
        return True
    return prev != strategy_set_view(cfg)


def needs_fast_path(state, cfg, prev_name, strat_name):
    """Latest closed hour only. No gap replay and no universe re-rank.

    A renamed primary strategy, a missing hour cursor, or a book stamp that
    does not match config all take this path. The account itself is not reset.
    """
    if prev_name != strat_name or (state or {}).get("last_1h_open") is None:
        return True
    return strategy_set_changed(state, cfg)


def strategy_change_event(state, cfg, now):
    """One STRATEGY_CHANGE dict, or None when the stamp already matches."""
    if not strategy_set_changed(state, cfg):
        return None
    cur = strategy_set_view(cfg)
    prev = (state or {}).get("strategy_set") if isinstance((state or {}).get("strategy_set"), dict) else {}
    prev_id = prev.get("id") or ((state or {}).get("strategy") or {}).get("name") or "ema_trend_4h"
    where = (
        "per-coin scanner on the cached monthly universe"
        if cur["scanner"] else "5-coin book, scanner off")
    rng = cur["range_strategy"] or "stand aside"
    return {
        "ts": int(now),
        "type": "STRATEGY_CHANGE",
        "symbol": "",
        "strategy": cur["trend_strategy"],
        "msg": (f"{prev_id} -> {cur['id']}: TREND {cur['trend_strategy']} "
                f"(short EMA), RANGE {rng}, {where}. "
                "Risk profile unchanged. Account not reset."),
        "book": cur["id"],
        "trend_strategy": cur["trend_strategy"],
        "range_strategy": cur["range_strategy"],
        "scanner": cur["scanner"],
        "previous": prev_id,
        "selector_enabled": cur["selector"],
    }
