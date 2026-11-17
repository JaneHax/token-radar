# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JaneHax/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/JaneHax/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the protocols DefiLlama tracks, finds the ones
that record no token, ranks them by what their launch would be worth, and hands in a dashboard that
shows the board, a detail view for every protocol and a farm plan for each.

The value model is calibrated, not assumed. The snapshot records both TVL and market cap for 128
protocols whose token already trades; for each category the model takes the median market-cap-to-TVL
multiple those protocols carry and applies it to the pre-token protocols in the same category. A
category needs three trading peers to calibrate on its own and falls back to the median across all of
them (0.214x in this snapshot) otherwise.

```
base    = tvl_usd x categoryMultiple(category)
growth  = clamp(change_7d, -50, +100) / 100 x 0.6
tenure  = 0.75 + min(age_days, 1095) / 1095 x 0.50
reach   = 1 + min(chains - 1, 12) x 0.02

implied = base x (1 + growth) x tenure x reach
```

No protocol name is special-cased: one function scores all 198 launch candidates, and the board is
that function's output sorted. Protocols whose token already trades are kept out of the ranking
entirely and shown at their recorded market cap, so the board never mixes "will launch" with "has
launched".

## What it produces

| File | What it is |
| --- | --- |
| `out/board.json` | 198 ranked rows: slug, name, rank, implied value, the model's factors, and a farm plan |
| `out/data.js` | the same board as the page's data |
| `out/dashboard/` | the static dashboard: board, calibration table, live-token view, method |
| `out/screenshots/` | the board, a protocol's detail view, a filtered view |
| `out/dossier.json` | the dossier the judge reads, written by `vendor/makefun-board.ts` |

## Run it

```sh
node --experimental-strip-types main.ts --input input/snapshot.json
```

`MAKEFUN_OUTPUT_DIR` stands in for `/output` outside the grader's container. The program writes
`board.json`, `data.js`, the dashboard and the dossier; `screenshots/` is captured from the rendered
page by `shoot.py`, which needs a Chromium.

`gate_check.py` checks the entry against the seven gate rows the competition publishes.

## Layout

- `lib/model.ts` — the calibration, the value model and the farm-plan generator.
- `dashboard/` — `index.html`, `app.css`, `app.js`: one static page, no framework and no network.
- `vendor/makefun-board.ts` — the kit's dossier builder, vendored unchanged.
- `main.ts` — reads the snapshot, builds the board, writes `/output`.

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=853vjytx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
