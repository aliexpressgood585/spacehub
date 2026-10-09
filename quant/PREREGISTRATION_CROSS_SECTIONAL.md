# Preregistration: cross-sectional relative-strength grid

Research only; no bot/account mutation. Frozen before the first result.

- Binance Vision USD-M 1m data aggregated to complete 5m bars; existing ten-symbol universe plus BTC reference.
- Window 2023-10-08 to 2026-10-07 exclusive; temporal split 2025-10-07.
- Rank alt return minus BTC return over fixed 1h or 4h windows.
- Momentum: LONG top two / SHORT bottom two. Contrarian: reverse the mapping.
- Entry at next 5m open; exit after 1h or 4h at completed 5m close; no overlapping same-symbol trades within a variant.
- Filters: none; fixed cross-sectional dispersion threshold; volume >=1.5x prior 24h mean; all filters plus BTC direction aligned with side.
- Fixed trial count: 2 modes × 2 sides × 2 lookbacks × 2 holds × 4 filters = 64.
- Cost: 0.16% round trip. Funding is a reserve, not realized history.
- Gate: PF >1.15, positive mean net, and >=300 trades separately in train and validation.
- Validation is already exposed. Any survivor still needs new forward Shadow, symbol robustness and overlapping-position portfolio analysis.
