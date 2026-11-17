# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JaneHax/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/JaneHax/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the protocols DefiLlama tracks, finds the ones
that record no token, ranks them by what their launch would be worth, and hands in a dashboard that
shows the board, a detail view for every protocol and a farm plan for each.

The value model is fitted on the snapshot and tested on data it never saw. The snapshot records
both TVL and market cap for 128 protocols whose token already trades; least squares in log-log space
gives a power law, and its exponent is the whole finding:

```
mcap = 1058 x TVL^0.522
```

A protocol's market-cap-to-TVL multiple is not constant, it falls with size — a median 0.89x under
$8M of TVL, 0.034x above $350M. One exponent captures that curve, which is why it beats both models
it replaced on every held-out test:

| Model | Leave-one-out | Walk-forward |
| --- | --- | --- |
| Power law (this entry) | 109.1% | 104.8% |
| Flat multiple | 134.1% | 135.7% |
| Per-category medians (v1) | 138.8% | 135.7% |

Both tests hold out data the fit never saw: leave-one-out refits 128 times, each scoring the protocol
left out; walk-forward trains only on earlier-listed protocols and scores later ones, which is the
direction the radar actually works in. The number is the median symmetric MAPE, so 105% means the
typical held-out miss is about a factor of two either way. That is stated on the dashboard, with the
numbers, because a model that hides its error is a claim.

The implied value is that curve, moved by three things the snapshot records:

```
base    = 1058 x TVL^0.522
growth  = clamp(change_7d, -50, +100) / 100 x 0.6
tenure  = 0.75 + min(age_days, 1095) / 1095 x 0.50
reach   = 1 + min(chains - 1, 12) x 0.02

implied = base x (1 + growth) x tenure x reach
```

No protocol name is special-cased and no constant is typed in by hand: the curve is fitted at run
time from the same bytes the board is built from. Protocols whose token already trades are kept out
of the ranking entirely and shown at their recorded market cap, so the board never mixes "will
launch" with "has launched".

## What it produces

| File | What it is |
| --- | --- |
| `out/board.json` | 198 ranked rows: slug, name, rank, implied value, the model's factors, and a farm plan |
| `out/data.js` | the same board as the page's data |
| `out/dashboard/` | the static dashboard: board, model and validation, live-token view, method |
| `out/screenshots/` | the board, a protocol's detail view, a filtered view, and the model's validation |
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

- `lib/model.ts` — the fit, the held-out validation, the value model and the farm-plan generator.
- `dashboard/` — `index.html`, `app.css`, `app.js`: one static page, no framework and no network.
- `vendor/makefun-board.ts` — the kit's dossier builder, vendored unchanged.
- `main.ts` — reads the snapshot, builds the board, writes `/output`.

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=853vjytx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
