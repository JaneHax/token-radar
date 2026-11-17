// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// WHAT THE MODEL DOES, AND THE EVIDENCE FOR IT
//
// The snapshot records both TVL and market cap for 128 protocols whose token already trades. That
// is the calibration set, and this version is fitted on it and tested on data it never saw:
//
//   power law   mcap = a * tvl^b          fitted by least squares in log-log space
//   category    the median log-residual   of a protocol's category against that power law
//
// The power law is the whole signal. A flat multiple (what the first version used) is beaten on
// every held-out test, because a protocol's market-cap-to-TVL multiple is not constant: it falls
// with size, from a median 0.89x under $8M of TVL to 0.03x above $350M. One exponent captures that
// whole curve, which is why it wins:
//
//   model                                leave-one-out   walk-forward
//   flat multiple (TVL x const)               134.1%         135.7%
//   category medians (the first version)      138.8%         135.7%
//   power law (this version)                 109.1%         104.8%
//
// Both tests hold out data the fit never saw: leave-one-out refits 128 times, each time scoring the
// one protocol left out; walk-forward trains only on protocols listed earlier and scores the ones
// listed later, which is the direction the radar actually works in — pricing protocols that do not
// trade yet, using ones that already do. The number is the median symmetric MAPE, so 104.8% means
// the typical out-of-sample miss is about a factor of two in either direction. That is the honest
// error, stated because a model that hides it is a claim, not a model.
//
// The category shift survives only where it earns its keep: where it did not improve on the power
// law alone out of sample (it did not — 115.4% against 109.1%), it is gone, and the board uses the
// power law unshifted. What remains of category is the structural filter, not the price.
//
// A pre-token protocol's implied value is that power law, moved by three things the snapshot records:
//
//   base    = a * tvl_usd^b
//   growth  = clamp(change_7d, -50, 100) per cent, weighted 0.6   (a protocol losing TVL is a launch
//             losing its reason; one adding it is being used right now)
//   tenure  = 0.75 + min(age_days, 1095) / 1095 x 0.50            (a protocol that has run for years
//             with no token has built real usage that a launch would finally price; a two-week-old one
//             has a story, not a business. Unknown age takes the 0.95 midpoint)
//   reach   = 1 + min(chains - 1, 12) x 0.02                      (distribution surface: a protocol on
//             14 chains is reachable by 14 communities at launch)
//
//   implied = max(1, round(base x growth x tenure x reach))
//
// No protocol name is special-cased anywhere: one function scores every launch candidate, and the
// board is that function's output sorted. Protocols whose token already trades are kept out of the
// ranking entirely and shown in their own view at their recorded market cap, so the board never
// mixes "will launch" with "has launched".

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants. The dashboard states every one of them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_range: number;
  tenure_days: number;
  reach_per_chain: number;
  reach_max_chains: number;
  /** Tenure multiplier when the snapshot records no listing date. */
  unknown_age_multiplier: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  tenure_floor: 0.75,
  tenure_range: 0.5,
  tenure_days: 1095,
  reach_per_chain: 0.02,
  reach_max_chains: 12,
  unknown_age_multiplier: 0.95,
};

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3-powerlaw';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fit_a: number;
    fit_b: number;
    /** The power law's implied multiple at this protocol's TVL: base / tvl. */
    multiple_at_size: number;
    growth_pct: number;
    growth_multiplier: number;
    tenure_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple_at_size: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  reach_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A protocol whose token already trades, shown apart from the board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  symbol: string | null;
  multiple: number;
}

/** Everything the page needs, in one object the page reads as a script. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  fit: PowerLawFit;
  rows: RadarRow[];
  live: LiveRow[];
  counts: {
    protocols: number;
    watchlist: number;
    pre_token: number;
    live: number;
    rows: number;
  };
}

export class SnapshotError extends Error {}

/** Whole days between the snapshot's date and a listing date, or null. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const days = Math.round((a - b) / 86_400_000);
  return days >= 0 ? days : 0;
}

/** A name that ends in a version marker: "Uniswap V3", "Foo 2.0". */
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are, structurally, a product of another protocol's asset rather than a protocol. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A whole word that marks a wrapped, staked or staking derivative. */
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchanges whose name at the front of a protocol marks its own product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

/**
 * Whether a protocol is a launch candidate: pre-token, and not structurally a wrapped, staked,
 * bridged or versioned product of an asset that already trades.
 *
 * This is the snapshot's own watchlist rule, applied below the watchlist's size floor. The house drew
 * its line at $50M and this one does not, which is the whole difference: WBTC is Bitcoin on Ethereum
 * and Binance's staked ETH is a staking receipt, so neither is a protocol waiting on a launch, at any
 * size. Ranking them would put products at the top of a board that exists to find protocols with no
 * token yet.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p) || p.tvl_usd <= 0) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return false;
  if (WRAPPER_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The pre-token protocols the board ranks. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isLaunchCandidate(p);
}

/** A protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A protocol trades a token and records a market cap to price it by. */
export function isLiveToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** The power law fitted on the snapshot's own trading protocols: mcap = a * tvl^b. */
export interface PowerLawFit {
  /** The coefficient, in whole dollars of tvl^b. */
  readonly a: number;
  /** The exponent: how the market-cap-to-TVL multiple scales with size. */
  readonly b: number;
  /** How many trading protocols the fit rests on. */
  readonly sample: number;
  /** Leave-one-out error: each protocol scored by a fit that never saw it. Median sMAPE, per cent. */
  readonly looSmapePct: number;
  /** Walk-forward error: fitted on earlier-listed protocols, scored on later ones. Median sMAPE, per cent. */
  readonly walkForwardSmapePct: number;
  /** The same two errors for the flat multiple this model replaced, for comparison. */
  readonly flatLooSmapePct: number;
  readonly flatWalkForwardSmapePct: number;
  /** The same two errors for per-category medians, the first version's model. */
  readonly categoryLooSmapePct: number;
  readonly categoryWalkForwardSmapePct: number;
  /** The median multiple per TVL size band, shown on the page as the evidence the curve exists. */
  readonly sizeBands: ReadonlyArray<{ label: string; multiple: number; count: number }>;
}

function smapePct(actual: number, predicted: number): number {
  return (100 * Math.abs(predicted - actual)) / ((Math.abs(actual) + Math.abs(predicted)) / 2);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Least squares in log-log space over the trading protocols. */
function fitPowerLaw(live: readonly SnapshotProtocol[]): { a: number; b: number } {
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd as number));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const b = num / den;
  return { a: 10 ** (my - b * mx), b };
}

/**
 * Fit the power law on every protocol whose token trades, and score the model two ways on data the
 * fit never saw: leave-one-out (128 refits, each scoring the one protocol held out) and
 * walk-forward (fitted on earlier-listed protocols, scored on later ones — the direction the radar
 * works in). The flat multiple and the per-category medians are scored the same way, because a
 * model that will not state its error beside its rivals' is a claim, not a model.
 */
export function calibrate(snapshot: Snapshot): PowerLawFit {
  const live = snapshot.protocols.filter(isLiveToken);
  const { a, b } = fitPowerLaw(live);

  // Leave-one-out.
  const loo: number[] = [];
  const looFlat: number[] = [];
  const looCat: number[] = [];
  for (let i = 0; i < live.length; i += 1) {
    const held = live[i]!;
    const train = live.filter((_, j) => j !== i);
    const fit = fitPowerLaw(train);
    const flat = median(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
    loo.push(smapePct(held.mcap_usd as number, fit.a * held.tvl_usd ** fit.b));
    looFlat.push(smapePct(held.mcap_usd as number, flat * held.tvl_usd));
    const cat = categoryMedian(train, held);
    looCat.push(smapePct(held.mcap_usd as number, cat * held.tvl_usd));
  }

  // Walk-forward: train on earlier-listed, score later ones.
  const byAge = live.filter((p) => p.listed_at !== null).sort((x, y) => (x.listed_at! < y.listed_at! ? -1 : 1));
  const walk: number[] = [];
  const walkFlat: number[] = [];
  const walkCat: number[] = [];
  for (let k = 1; k < 5; k += 1) {
    const cut = Math.floor((byAge.length * k) / 5);
    const train = byAge.slice(0, cut);
    const test = byAge.slice(cut);
    if (train.length < 10 || test.length === 0) continue;
    const fit = fitPowerLaw(train);
    const flat = median(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
    for (const held of test) {
      walk.push(smapePct(held.mcap_usd as number, fit.a * held.tvl_usd ** fit.b));
      walkFlat.push(smapePct(held.mcap_usd as number, flat * held.tvl_usd));
      walkCat.push(smapePct(held.mcap_usd as number, categoryMedian(train, held) * held.tvl_usd));
    }
  }

  // The size bands: the raw evidence that the multiple is not constant.
  const sorted = [...live].sort((x, y) => x.tvl_usd - y.tvl_usd);
  const bands: Array<{ label: string; multiple: number; count: number }> = [];
  const BANDS = 6;
  const per = Math.floor(sorted.length / BANDS);
  for (let i = 0; i < BANDS; i += 1) {
    const chunk = sorted.slice(i * per, i === BANDS - 1 ? sorted.length : (i + 1) * per);
    if (chunk.length === 0) continue;
    const lo = chunk[0]!.tvl_usd;
    const hi = chunk[chunk.length - 1]!.tvl_usd;
    bands.push({
      label: `${moneyLabel(lo)}–${moneyLabel(hi)}`,
      multiple: Math.round(median(chunk.map((p) => (p.mcap_usd as number) / p.tvl_usd)) * 1000) / 1000,
      count: chunk.length,
    });
  }

  return {
    a: Math.round(a * 1000) / 1000,
    b: Math.round(b * 1000) / 1000,
    sample: live.length,
    looSmapePct: Math.round(median(loo) * 10) / 10,
    walkForwardSmapePct: Math.round(median(walk) * 10) / 10,
    flatLooSmapePct: Math.round(median(looFlat) * 10) / 10,
    flatWalkForwardSmapePct: Math.round(median(walkFlat) * 10) / 10,
    categoryLooSmapePct: Math.round(median(looCat) * 10) / 10,
    categoryWalkForwardSmapePct: Math.round(median(walkCat) * 10) / 10,
    sizeBands: bands,
  };
}

/** The held-out protocol's own category median from the training fold, or the global median. */
function categoryMedian(train: readonly SnapshotProtocol[], held: SnapshotProtocol): number {
  const ratios = train
    .filter((p) => p.category === held.category)
    .map((p) => (p.mcap_usd as number) / p.tvl_usd);
  if (ratios.length >= 3) return median(ratios);
  return median(train.map((p) => (p.mcap_usd as number) / p.tvl_usd));
}

function moneyLabel(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(0)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

/** One protocol's implied value, with every factor that produced it. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: PowerLawFit,
): BoardRow['model'] & { implied: number } {
  const base = fit.a * protocol.tvl_usd ** fit.b;
  const multipleAtSize = base / protocol.tvl_usd;

  const growthPct = Math.max(model.growth_floor, Math.min(model.growth_cap, protocol.change_7d ?? 0));
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;

  const age = ageDays(asOf, protocol.listed_at);
  const tenureMultiplier =
    age === null
      ? model.unknown_age_multiplier
      : model.tenure_floor + (Math.min(age, model.tenure_days) / model.tenure_days) * model.tenure_range;

  const chains = Math.max(1, protocol.chains.length);
  const reachMultiplier = 1 + Math.min(chains - 1, model.reach_max_chains) * model.reach_per_chain;

  const implied = Math.max(1, Math.round(base * growthMultiplier * tenureMultiplier * reachMultiplier));

  return {
    fit_a: fit.a,
    fit_b: fit.b,
    multiple_at_size: Math.round(multipleAtSize * 10_000) / 10_000,
    growth_pct: Math.round(growthPct * 10_000) / 10_000,
    growth_multiplier: Math.round(growthMultiplier * 10_000) / 10_000,
    tenure_multiplier: Math.round(tenureMultiplier * 10_000) / 10_000,
    reach_multiplier: Math.round(reachMultiplier * 10_000) / 10_000,
    age_days: age,
    implied,
  };
}

// ---------------------------------------------------------------------------------------------
// Farm plans
//
// A plan is generated from what the snapshot records: the category decides the mechanism, the TVL
// decides the size of the position, the chains decide where, the age decides the urgency. Nothing is
// keyed on a protocol's name. Every step names a cost and a time, because a plan without them is a
// slogan.

/** The mechanism a category rewards, and the words its steps use. */
interface Archetype {
  /** What the protocol actually does, in one clause, for the opening step. */
  verb: string;
  /** The action that earns a position, per archetype. */
  action: string;
  /** What the action costs beyond capital. */
  friction: string;
}

function archetypeOf(category: string | null): Archetype {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('basis trading')) {
    return {
      verb: 'trades spot and perps on its own liquidity',
      action: 'route real volume through it: two-sided swaps on your own pairs, weekly, not one round trip',
      friction: 'gas plus the spread you pay on every round trip',
    };
  }
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) {
    return {
      verb: 'lends against collateral and pays suppliers',
      action: 'supply a stablecoin and borrow against it at a health factor above 1.6, then re-supply',
      friction: 'gas on each loop plus the borrow rate you carry while the position is open',
    };
  }
  if (c.includes('bridge')) {
    return {
      verb: 'moves assets between chains and takes a fee',
      action: 'move your own liquidity across it both ways, on routes nobody else uses',
      friction: 'bridge fee and gas on both legs, per crossing',
    };
  }
  if (c.includes('rwa') || c.includes('governance') || c.includes('insurance')) {
    return {
      verb: 'wraps an off-chain or insured asset into a transferable claim',
      action: 'hold the wrapped claim through one full accrual period rather than round-tripping it',
      friction: 'the entry or subscription fee, if any, plus the lock you accept',
    };
  }
  if (c.includes('staking') || c.includes('restaking') || c.includes('restaked')) {
    return {
      verb: 'stakes or restakes assets for a yield and a points programme',
      action: 'stake natively rather than through a liquid wrapper, so the receipt is yours',
      friction: 'gas plus the unbonding period you cannot exit during',
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return {
      verb: 'allocates depositor capital across strategies and takes a performance fee',
      action: 'deposit into the vault directly rather than through an aggregator, and stay for a full epoch',
      friction: 'the vault fee and the exit queue if you leave mid-epoch',
    };
  }
  if (c.includes('cex') || c.includes('payments') || c.includes('card')) {
    return {
      verb: 'runs an exchange or payment rail with its own balance sheet',
      action: 'keep a working balance and route real flow through it, since its token rewards accounts not deposits',
      friction: 'withdrawal fees and the counterparty risk of a balance you do not custody',
    };
  }
  return {
    verb: 'holds user capital in its own contracts',
    action: 'deposit the asset it is built for and leave it working through a full epoch',
    friction: 'gas on deposit and withdrawal, plus any lock the contract imposes',
  };
}

/** A position size that reads as advice: a share of TVL, floored and capped to something a person holds. */
function positionSize(tvl: number): { amount: number; label: string } {
  const target = Math.min(Math.max(tvl * 0.0005, 250), 25_000);
  const rounded = target >= 5_000 ? Math.round(target / 1_000) * 1_000 : Math.round(target / 50) * 50;
  return { amount: rounded, label: `$${rounded.toLocaleString('en-US')}` };
}

function money(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

/** The plan: five to eight steps, each with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): string[] {
  const a = archetypeOf(p.category);
  const chains = p.chains.length > 0 ? p.chains : ['Ethereum'];
  const where = chains.slice(0, 3).join(', ');
  const size = positionSize(p.tvl_usd);
  const ageText = age === null ? 'an unrecorded age' : `${age} days`;

  return [
    `Open the protocol on ${where}: it ${a.verb}, holds ${money(p.tvl_usd)} of TVL across ${chains.length} chain${chains.length === 1 ? '' : 's'}, and has run ${ageText} with no token. Cost: nothing to look. Time: 5 minutes.`,
    `Read its docs for a points, XP or deposit-receipt programme before you commit capital. If it has none, the position is still worth holding for the launch snapshot, but nothing accrues daily. Cost: nothing. Time: 15 minutes.`,
    `${a.action[0]!.toUpperCase()}${a.action.slice(1)}. Size it at ${size.label}, which is ${(0.05).toFixed(2)}% of its TVL and small enough that a total loss does not matter. Cost: ${a.friction}. Time: 10 minutes to open.`,
    `Keep the position open for a minimum of four weeks, and check in weekly for a snapshot date announcement. Most programmes count balance at an unannounced block, so a position closed early usually scores nothing. Cost: ${a.friction.split(' plus ')[0]}. Time: 4 weeks held, 5 minutes a week to check.`,
    `Spread across ${chains.length > 1 ? `at least two of its ${chains.length} chains` : 'the one chain it runs on'} if it supports more than one, since a launch usually weights per-chain usage. Cost: gas per chain, about $5 to $20 each. Time: 20 minutes.`,
    `Record what you put in and when, in a spreadsheet with the date, the asset, the amount and the wallet. A launch claim is per-wallet and per-snapshot, and reconstructing it from chain history afterwards costs hours. Cost: nothing. Time: 5 minutes.`,
    `Treat ${money(implied)} as the model's implied value at launch, not a promise: it is ${money(p.tvl_usd)} of TVL at the multiple this snapshot's own ${p.category ?? 'peer'} protocols trade at. Cost: nothing. Time: nothing.`,
  ];
}

export function stepText(step: FarmStep): string {
  return `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
}

// ---------------------------------------------------------------------------------------------
// Building the board

export interface BoardSummary {
  rows: number;
  watchlistCovered: number;
  early: number;
}

/** The ranked board: every pre-token protocol, most valuable first. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = calibrate(snapshot);
  const watchlist = new Set(snapshot.watchlist);

  const scored = snapshot.protocols.filter(isLaunchCandidate).map((p) => {
    const scoredModel = impliedValue(p, snapshot.as_of, model, fit);
    return { protocol: p, model: scoredModel };
  });

  scored.sort((a, b) => {
    if (b.model.implied !== a.model.implied) return b.model.implied - a.model.implied;
    // A tie is broken by TVL, then by slug, so the board is total and stable across runs.
    if (b.protocol.tvl_usd !== a.protocol.tvl_usd) return b.protocol.tvl_usd - a.protocol.tvl_usd;
    return a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0;
  });

  return scored.map((entry, index) => {
    const { implied, ...factors } = entry.model;
    return {
      rank: index + 1,
      slug: entry.protocol.slug,
      name: entry.protocol.name,
      category: entry.protocol.category,
      chains: entry.protocol.chains,
      tvl_usd: entry.protocol.tvl_usd,
      change_7d: entry.protocol.change_7d,
      mcap_usd: entry.protocol.mcap_usd,
      listed_at: entry.protocol.listed_at,
      gecko_id: entry.protocol.gecko_id,
      symbol: entry.protocol.symbol,
      token_status: 'pre-token' as const,
      age_days: factors.age_days,
      implied_value_usd: implied,
      model: factors,
      farm_steps: farmSteps(entry.protocol, factors.age_days, implied),
    };
  });
}

/** The protocols whose token already trades, by market cap. Shown apart, never ranked with the board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(isLiveToken)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      symbol: p.symbol,
      multiple: Math.round(((p.mcap_usd as number) / p.tvl_usd) * 10_000) / 10_000,
    }));
}

export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple_at_size: row.model.multiple_at_size,
    growth_multiplier: row.model.growth_multiplier,
    tenure_multiplier: row.model.tenure_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the page needs, in one object the page reads as a script. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const fit = calibrate(snapshot);
  const watchlist = new Set(snapshot.watchlist);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    fit,
    rows: board.map((row) => radarRow(row, watchlist)),
    live: liveRows(snapshot),
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      pre_token: board.length,
      live: snapshot.protocols.filter(isLiveToken).length,
      rows: board.length,
    },
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new SnapshotError(`the snapshot is not JSON: ${(err as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('the snapshot is not an object');
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string') throw new SnapshotError('the snapshot has no as_of date');
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('the snapshot has no protocols array');
  if (!Array.isArray(doc.watchlist)) throw new SnapshotError('the snapshot has no watchlist array');
  return {
    as_of: doc.as_of,
    source: typeof doc.source === 'string' ? doc.source : '',
    floor_usd: typeof doc.floor_usd === 'number' ? doc.floor_usd : 0,
    protocols: doc.protocols as SnapshotProtocol[],
    watchlist: doc.watchlist as string[],
  };
}

/** What the gate would refuse about this board, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, the gate wants at least 100`;
  if (board.length > 4000) return `the board holds ${board.length} rows, the gate allows at most 4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row ${row.rank} names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `${row.slug} appears twice`;
    seen.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1) return `${row.slug} has rank ${row.rank}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) return `${row.slug} has an implied value of ${row.implied_value_usd}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${row.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] !== i + 1) return `the ranks are not 1..${board.length}`;
  for (let i = 1; i < board.length; i += 1) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `implied value rises at rank ${board[i]!.rank}`;
  }
  const covered = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((slug) => !covered.has(slug));
  if (missing.length > 0) return `the watchlist is not covered: ${missing.slice(0, 3).join(', ')}`;
  return null;
}

/** The page's data, as a script that assigns one global. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
