// Breakout rider for the make.fun BTC race (btc-race-24h-20261123-0511).
//
// One asset, CBBTC, long only, $1,000 of paper money, 1,440 one-minute bars.
// The dev window taught one lesson: one-minute BTC bars are mostly noise,
// and every round trip pays ~26 bps in fees, slippage and impact, so a bot
// that trades often bleeds to death. This bot trades rarely and holds:
//
//   - Entry: the close breaks above the highest high of the last 120 bars
//     (a 2-hour breakout — a real move, not a one-minute flicker) AND the
//     close sits above its 60-bar EMA (the medium trend points up too).
//     Both filters must agree; a breakout into a falling trend is skipped.
//   - One position at a time, full equity (the caps allow it, one slot).
//   - Exit: a 2% trailing stop below the highest close since entry — wide
//     enough to ride through the plateau noise, tight enough to bank most
//     of a move — or a 3% hard stop below the entry price as a disaster
//     guard. No take-profit: the trail banks the move, and capping the
//     upside would throw away the one big rally a window may hold.
//   - At most 3 round trips per window and a 60-bar cooldown after an exit,
//     so a choppy window cannot turn into a fee bleed. No new entries in
//     the last 30 bars of the 1,440-bar window (an entry there pays a round
//     trip for nothing before the final flatten).
//
// Deterministic: float64 EMA and comparisons on bar data only — no clock,
// no environment, no randomness. Every order caps its slippage at 1% past
// the close it was decided on, so a fill into a liquidity gap is refused
// (and retried on the next bar while the signal still holds) rather than
// filled for almost nothing.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Breakout lookback: the highest high of this many prior bars. */
const BREAKOUT_BARS = 120;
/** Trend confirmation: the close must sit above this EMA. */
const EMA_BARS = 60;
/** Trailing stop: exit when the close falls this far below the peak since entry (bps). */
const TRAIL_BPS = 200;
/** Hard stop: exit when the close falls this far below the entry price (bps). */
const HARD_STOP_BPS = 300;
/** Fee-bleed guard: at most this many round trips per window. */
const MAX_TRIPS = 3;
/** Bars to wait after an exit before a new entry. */
const COOLDOWN_BARS = 60;
/** The window is 1,440 bars; no entries in its last 30 bars. */
const NO_ENTRY_AFTER_SEQ = 1410;
/** Slippage cap on every order: 1% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** The highs of the prior bars, oldest first (at most BREAKOUT_BARS of them). */
const priorHighs: number[] = [];
/** The 60-bar EMA of closes, seeded on the first close. */
let ema: number | null = null;
/** Entry price (close) and the highest close since entry, while holding. */
let entryClose = 0;
let peakClose = 0;
/** Completed round trips, and the seq of the last exit (for the cooldown). */
let trips = 0;
let lastExitSeq = -COOLDOWN_BARS - 1;
/** Whether the exit for the current position was already sent (a rejected
 * sell is re-sent on the next bar, but the trip is counted only once). */
let exitSent = false;

/** Fold a bar into the indicators; whether the entry signal holds on its close. */
function push(bar: Bar): boolean {
  const h = Number(bar.h);
  const c = Number(bar.c);
  // The breakout reads the prior bars only: the current bar's high joins
  // the window after the signal is read, so a bar can never break itself.
  let breakout = false;
  if (priorHighs.length >= BREAKOUT_BARS) {
    let top = priorHighs[0]!;
    for (const x of priorHighs) if (x > top) top = x;
    breakout = c > top;
  }
  priorHighs.push(h);
  if (priorHighs.length > BREAKOUT_BARS) priorHighs.shift();

  const k = 2 / (EMA_BARS + 1);
  ema = ema === null ? c : c * k + ema * (1 - k);
  return breakout && ema !== null && c > ema;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const orders: (SellInput | BuyInput)[] = [];
    const { fees } = state.hello;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const signal = push(bar);
      const held = state.positions.get(SYMBOL);
      const close = Number(bar.c);
      if (held !== undefined) {
        if (close > peakClose) peakClose = close;
        const trail = close * 10000 < peakClose * (10000 - TRAIL_BPS);
        const stopped = close * 10000 < entryClose * (10000 - HARD_STOP_BPS);
        if (trail || stopped) {
          orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          if (!exitSent) {
            trips++;
            lastExitSeq = state.seq;
            exitSent = true;
          }
        }
      } else if (
        signal &&
        trips < MAX_TRIPS &&
        state.seq - lastExitSeq >= COOLDOWN_BARS &&
        state.seq < NO_ENTRY_AFTER_SEQ &&
        !state.warmingUp
      ) {
        const room = state.weightRoom(SYMBOL);
        let slice = state.cash < room ? state.cash : room;
        if (slice >= BigInt(fees.min_notional_quote_units) && slice > 0n) {
          orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
          entryClose = close;
          peakClose = close;
          exitSent = false;
        }
      }
    }
    return orders;
  },
});
