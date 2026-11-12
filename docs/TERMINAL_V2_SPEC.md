# Setl8 Terminal v2 — build spec

Status: Draft specification. Written 2026-11-09.
Scope: lev-trading terminal only (apps/trade + backend). Devnet/test tokens only.
Behavior reference: observed by using a third-party sandbox terminal. We copy **behavior**, not code, layout, branding or wording. Keep Setl8's own look.

## 1. Decisions (final, from the product owner)
IN: market/limit/stop/stop-limit orders; buy/sell; confirm/cancel; SL and TP each with own price and optional own quantity (partial); SL/TP as real linked working orders created per fill; OCO behavior; stop = market at stop price; netting (one position per market); Reverse, Close, Flatten All, Cancel All (all executed at the current tick/last price); position + working-order overlays and draft lines on the chart; Positions table (Open/Closed); Orders table (All/Open/Filled/Cancelled) with inline edit of working orders; toasts; fees shown per fill; top bar balance / realized / unrealized P&L; chart fullscreen + screenshot button.
OUT: bid/ask display, DOM, Scalp, Join Bid/Ask, trailing stops, tick/ticks presets, drawing tools, indicators, layout menu, AI features, sidebar extras.
ASSUMED defaults (user has not answered; adjust if told): Orders table CSV export = in; Accounts tab = out.
Price source: the current tick (last) price from the existing price feed. No spread modelling.
Sizing: existing model — order size is USD notional; position quantity is in asset units (units = sizeUsd / fillPrice); leverage/margin/fees use existing constants and functions (MAX_LEVERAGE, POSITION_FEE_RATE). Reuse existing fee and margin helpers; do not invent new fee rules.

## 2. Domain model (target behavior; schema details are the implementer's call)
- **Order**: id, attemptId, traderId, market, side (BUY|SELL), type (MARKET|LIMIT|STOP|STOP_LIMIT), sizeUsd, limitPrice?, stopPrice?, status (WORKING|FILLED|CANCELLED|REJECTED), role (ENTRY|STOP_LOSS|TAKE_PROFIT), reduceOnly, ocoGroupId?, fillPrice?, fee?, cancelReason?, createdAt, filledAt?.
- **Position**: exactly ONE open position per (attempt, market): side, units, avgEntry, margin, unrealizedPnl. Closed history = realized trade records (one per reduction/close) so the Positions "Closed" tab and P&L history keep working. Evaluator equity/drawdown/profit-target logic must keep its current semantics (equity = balance + sum of unrealized P&L over open positions).
- Keep existing events/endpoints working where other apps (mobile) use them, as thin wrappers if cheap; the web terminal moves to the new API.

## 3. Matching rules (evaluated on every evaluator tick, and at order placement)
Let `last` = current tick price.
1. MARKET: fills immediately at `last`.
2. LIMIT: BUY fills when last <= limit, SELL when last >= limit. **Fill price = better of (limit, last)**: BUY → min(limit,last), SELL → max(limit,last). A limit that is already marketable at placement fills immediately at `last`. (Fixes the current bug where limits always fill at the limit price.)
3. STOP: BUY triggers when last >= stop, SELL when last <= stop. On trigger it executes as a market order **at the stop price** (no slippage model; documented simplification). Validation at placement: BUY stop must be above `last`, SELL stop below `last`, else REJECT with a clear message.
4. STOP_LIMIT: stopPrice triggers it; it then becomes a WORKING LIMIT at limitPrice and follows rule 2. Validation: BUY stop-limit: limit >= stop; SELL: limit <= stop.
5. Orders for the same attempt are processed in creation order within a tick. Before executing any reduce-only order, re-read the position; clip to remaining units; if the position is flat, cancel the order (reason POSITION_FLAT) instead of filling.

## 4. Netting (one position per market)
A fill of side S, units q, price p against position P:
- no position: open S with q at avgEntry p.
- same side: add; avgEntry = total entry notional / total units (average-cost).
- opposite side: reduce by min(q, P.units), realize P&L at p vs avgEntry; if q > P.units, **flip**: close fully, open remainder on side S at p.
- Margin: reduction releases margin proportionally; flip recomputes. Increases must pass the existing available-margin check (reject, no partial fill). Fees via existing helpers on the notional opened and the notional closed.
- Note: average-cost netting is used instead of per-lot first-in-first-out (simpler and standard for perps). If lot-level FIFO is required later, it is an extension, not part of v2.

## 5. SL / TP exits
- An ENTRY order may carry `stopLoss: {price, sizeUsd?}` and `takeProfit: {price, sizeUsd?}`. Default exit size = full filled size.
- On each entry fill, create linked exits (reduce-only, opposite side, same ocoGroupId): SL = STOP, TP = LIMIT. Add-on fills create their own exits; earlier exits remain.
- **Reduce-only / resize rule (our improvement):** every exit order's effective size = min(its size, current position units). When the position shrinks (manual reduce, other exit fill) exits shrink with it; when it reaches zero, all exits for that market are cancelled (POSITION_FLAT). An exit can never open or flip a position.
- **OCO rule:** when an exit order fills and leaves the position flat, cancel all its siblings (reason OCO). If the fill is partial for the position (e.g. a 50% TP), siblings stay (clipped). This refines the "sibling auto-cancels" behavior so partial TPs do not strip protection.
- Reverse and Close cancel all exits for that market (the position is flat or new).
- Existing SL/TP validation relative to entry/last must be kept (SL below for longs, etc.), expressed against `last` for working orders.

## 6. Commands (all at current tick price)
- **Close** (position row ✕): market reduce-only for full position, or `sizeUsd` for partial; cancels exits when flat.
- **Reverse**: close the position and open the opposite side with the same units, at `last`; cancels exits; no SL/TP re-attached.
- **Flatten All**: close every open position and cancel every working order (all markets of the attempt).
- **Cancel All**: cancel every working order (entry and exit); positions untouched.
- **Cancel order** / **Edit order** (working only): edit limit/stop price and sizeUsd with the same validations as placement; reject edits that make an exit invalid. Type and side cannot be edited.
- When the attempt leaves ACTIVE (pass/fail/breach), cancel all working orders (existing close-all semantics).

## 7. API (suggested; keep names consistent with existing style)
- POST /api/orders — {market, side, type, sizeUsd, limitPrice?, stopPrice?, stopLoss?, takeProfit?}
- PATCH /api/orders/:id — {limitPrice?, stopPrice?, sizeUsd?}
- POST /api/orders/:id/cancel; POST /api/orders/cancel-all; GET /api/orders?status=ALL|WORKING|FILLED|CANCELLED
- GET /api/positions?status=OPEN|CLOSED; POST /api/positions/:market/close {sizeUsd?}; POST /api/positions/:market/reverse; POST /api/positions/flatten-all
- WebSocket (existing channel): order:create, order:update, order:fill, order:cancel, position:open, position:modify, position:close, balance:update. UI must update without reload.

## 8. UI (apps/trade) — own design, existing dark style
Order ticket: Buy/Sell toggle; type selector Market | Limit | Stop | Stop-Limit; price field(s) as the type requires; size (USD) field; SL block (checkbox, price, optional quantity); TP block (checkbox, price, optional quantity); Confirm / Cancel; show last price only (no bid/ask). Prefill: Limit = last; Stop and Stop-Limit stop = last nudged ~0.1% beyond (above for Buy, below for Sell); Stop-Limit limit = stop. Inline validation messages from §3/§5. Toasts: "Order working", "Order filled @ price", "Order cancelled", "Order rejected: reason".
Chart overlays (lightweight-charts v4 price lines + absolutely positioned DOM tags using series.priceToCoordinate, repositioned on pan/zoom/resize):
- Draft lines (dashed) for the order being composed (entry price, SL, TP); removed on Confirm/Cancel.
- Position tag at avgEntry: side, units/size, live P&L, TP/SL chips, Reverse button, ✕ Close.
- Working-order lines with labels like "BUY LIMIT $500" / "SELL STOP $500" and an ✕ to cancel; SL/TP lines labelled accordingly.
- Chart toolbar: fullscreen toggle and screenshot button (chart.takeScreenshot()). No drawing tools or indicators.
Bottom panel:
- Positions: Open | Closed. Columns: time, market, side, size, avg price, unrealized/realized P&L, actions (Reverse, Close).
- Orders: All | Open | Filled | Cancelled. Columns: time, market, size, side, type, limit price, stop price, execute price, charges, status, actions (Cancel). Working orders: size and prices editable inline; CSV export button.
- Buttons: Flatten All, Cancel All (with a confirm step; use in-page modals, never window.confirm/alert).
Top bar: balance, realized P&L, unrealized P&L (reuse AccountBar).

## 9. Acceptance tests (write as vitest tests for the matching/netting logic; manual checklist for UI)
Use a fake price feed. P = last price. Numbers below are exact.
1. Market BUY $1,000 @100 with SL 98 and TP 103 → LONG 10 units avg 100; two WORKING reduce-only exits sharing one OCO group: SELL STOP 98, SELL LIMIT 103.
2. Then last=98 → SL fills at 98 (stop price); position flat; realized = −20 before fees; TP cancelled (OCO).
3. Add-on: LONG 10 units @100 then BUY $500 @110 → units 14.5454, avgEntry 103.125.
4. Reduce: from test 3, SELL $600 @120 → sells 5 units; realized = 84.375 before fees; remaining 9.5454 units, avgEntry 103.125.
5. Flip: LONG 10 @100, SELL $1,500 @100 → closes 10, opens SHORT 5 @100.
6. Resize: LONG $1,000 @100 with SL 98 + TP 103 (full). SELL $400 market @100 → position 6 units; both exits now effective 6 units. last=98 → exactly 6 units sold, position flat, NO short opened, TP cancelled.
7. Same-tick double exits: two full-size SELL STOPs on a 10-unit long both triggered in one tick → first fills (flat), second is cancelled POSITION_FLAT, position never goes short.
8. Partial TP: LONG $1,000 @100; TP 103 for $500, SL 98 full. last=103 → 5 units sold at 103; position 5 units; TP FILLED; SL remains with effective size 5 (not cancelled).
9. Limit fill price: BUY LIMIT 99 with last 100 → WORKING. last gaps to 98 → fills at 98 (not 99). BUY LIMIT 101 with last 100 → fills immediately at 100.
10. Stop validation: BUY STOP 99 with last 100 → REJECTED ("buy stop must be above current price"); SELL STOP 101 → REJECTED.
11. Stop-limit: BUY STOP-LIMIT stop 102, limit 103. last=102 → becomes WORKING BUY LIMIT 103 and fills per test 9 rules.
12. Reverse: LONG 10 units → Reverse → SHORT 10 units at last; all exits cancelled.
13. Flatten All with two markets open and three working orders → all positions closed, all orders cancelled. Cancel All leaves positions open.
14. Edit: change a WORKING limit price and size; change an SL price; an invalid edit (e.g. SL above last for a long) is rejected with a message and leaves the order unchanged.
15. Margin: an add-on that exceeds available margin is rejected with no state change. Fees on fills use the existing fee helpers.
16. Evaluator regression: equity, trailing drawdown, profit target and attempt pass/fail behave as before (run dev routes /api/dev/create-challenge and /simulate-pass); on attempt failure all working orders are cancelled.
17. UI manual checklist: place each order type; see draft lines; see position tag with live P&L; cancel an order via its ✕ on the chart; edit a working order inline; Reverse and Close from the chart tag and from the table; Flatten All / Cancel All; refresh the page → state restored; no hydration errors in the console.

## 10. Phases and reporting
- Phase 0 (read-only): plan, list files to change, list risks to evaluator/payout logic. Stop for review.
- Phase 1 (backend + migration + vitest tests 1–16). Report: test output, migration name, endpoints, anything not verified. Stop for review.
- Phase 2 (UI + checklist 17). Report with screenshots of each checklist item.
- Lev-trading only: do not add options, prediction markets or other sectors.
