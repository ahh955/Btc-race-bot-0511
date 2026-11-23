# Breakout Rider — BTC race bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/ahh955/Btc-race-bot-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/ahh955/Btc-race-bot-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A bot for the [make.fun](https://make.fun/bounty/btc-race-24h-20261123-0511) BTC race: it trades
Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute on-chain prices with
$1,000 of paper money, long only, no leverage. Simulation only — no real
money is traded.

## Strategy

One-minute BTC bars are mostly noise, and every round trip pays ~26 bps in
fees, slippage and impact — so this bot trades rarely and holds:

- **Entry:** the close breaks above the highest high of the last 120 bars
  (a 2-hour breakout) **and** sits above its 60-bar EMA. Both filters must
  agree; a breakout into a falling trend is skipped.
- **One position at a time, full equity.**
- **Exit:** a 2% trailing stop below the highest close since entry, or a 3%
  hard stop below the entry price as a disaster guard. No take-profit — the
  trail banks the move.
- **Guards:** at most 3 round trips per window, a 60-bar cooldown after an
  exit, and no new entries in the last 30 bars of the 1,440-bar window.

## Layout

- `main.ts` — the bot (entrypoint; the grader runs `node /bot/main.ts`).
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, byte-identical.

## Dev-window grade

Graded locally with the kit (`makefun grade-local --driver process`):
net PnL **+$26.84** on the frozen 24-hour dev window, 1 round trip,
0 rejected orders, max drawdown 1.98%.
