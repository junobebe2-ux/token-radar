// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// every rankable pre-token protocol the watchlist missed, whatever its TVL: the early rows the
// radar exists to find. A protocol is pre-token when its index entry records no token (no market
// cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown
// as the market's own values, never mixed into the ranked board.
//
// Implied value is a fitted log-log regression, calibrated from the snapshot itself, not asserted:
//
//   1. The calibration set is the snapshot's live-token protocols that already trade and are not a
//      wrapped, staked or bridged product of something else: market cap above zero, TVL above zero,
//      category not CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking or Restaked BTC,
//      and a name with no version marker.
//   2. The regression is log(market cap) = a + b * log(TVL) + c * log(chains), fitted by ordinary
//      least squares over that set at build time. Market cap scales as TVL^b with b near 0.38, not
//      in proportion to TVL: a protocol ten times larger in TVL is worth about two and a half times
//      as much, not ten times. Holding TVL fixed, more chains slightly lowers the fitted value
//      (c near -0.18): TVL spread thin across chains is worth less per dollar.
//   3. implied = round( exp(a + b * log(TVL) + c * log(max(1, chains))) )
//   The fit is honest and modest: TVL and chains explain only about a tenth of the variance in log
//   market cap, and the median fitted value lands about 79% from the actual market cap. The board
//   is a ranking, not a price. No protocol name is ever special-cased: the same function scores
//   every row, and the dashboard prints the fitted coefficients so a reader can check the arithmetic.

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

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols the watchlist missed the early radar carries. The gate caps the board
 *  at 4000 rows, so this is the gate's cap, not a second filter: every rankable protocol the
 *  watchlist missed is a row. */
export const EARLY_ROWS = 4000;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

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
    /** The fitted intercept a: log(market cap) when log(TVL) and log(chains) are both zero. */
    intercept: number;
    /** The fitted slope on log(TVL): market cap scales as TVL to this power. */
    log_tvl_slope: number;
    /** The fitted slope on log(chains): the chains term, holding TVL fixed. */
    log_chains_slope: number;
    /** This row's log(TVL), the value the regression is evaluated at. */
    log_tvl: number;
    /** This row's log(max(1, chains)), the value the regression is evaluated at. */
    log_chains: number;
    /** The fitted log value a + b*log(TVL) + c*log(chains); implied is round(exp(this)). */
    predicted_log_value: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan it carries. */
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
  intercept: number;
  log_tvl_slope: number;
  log_chains_slope: number;
  log_tvl: number;
  log_chains: number;
  predicted_log_value: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** The fitted log-log regression, derived from the snapshot's live-token protocols at build time. */
export interface Calibration {
  /** The fitted intercept a in log(market cap) = a + b*log(TVL) + c*log(chains). */
  intercept: number;
  /** The fitted slope b on log(TVL). */
  log_tvl_slope: number;
  /** The fitted slope c on log(chains). */
  log_chains_slope: number;
  /** R-squared of the fit in log space: the share of log market-cap variance TVL and chains explain. */
  r_squared_log: number;
  /** Live-token protocols in the calibration set. */
  comps_total: number;
}

/** How well the fitted regression fits the live-token market it is calibrated from. */
export interface ModelFit {
  /** Live-token protocols the fit is measured on (the calibration set). */
  comps: number;
  /** Median |implied - market cap| / market cap, in per cent, over the comps. */
  median_abs_pct_error: number;
  /** Share of comps whose implied value lands within twice their market cap. */
  within_2x_share: number;
  /** How many comps land within twice their market cap. */
  within_2x_count: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  calibration: Calibration;
  fit: ModelFit;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  early_above_floor: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length;
  if (mid % 2 === 1) return sorted[(mid - 1) / 2]!;
  return (sorted[mid / 2 - 1]! + sorted[mid / 2]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of something that already trades. */
const WRAPPED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name carrying a whole word wrapped, staked or staking names a product of a token that trades. */
const STAKING_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name is that exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A category that moves a token that already trades across chains, so the product is a bridge
 *  of a trading token, not a launch of its own. Board-only: the live-token bridges in this
 *  category stay in the calibration set, so the multiples do not change. */
const BOARD_ONLY_CATEGORIES = new Set(['Cross Chain Bridge']);

/** A name or slug that is a stablecoin ticker plus a suffix (USDCx, USDT0) names a wrapped or
 *  derived form of that stablecoin, which already trades. */
const STABLECOIN_WRAPPER = /^(usdc|usdt)[a-z0-9]/i;

/** Whether a protocol is one the board may rank: pre-token, not a wrapped, staked or bridged product
 *  of a token that already trades, not a bridge of a trading token, not a stablecoin wrapper, not
 *  an exchange's product, not an exchange, not a versioned pool.
 *  The watchlist applies the same kind test at its floor; the early radar applies it below the floor,
 *  so every row is a protocol that could plausibly launch a token of its own. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !BOARD_ONLY_CATEGORIES.has(p.category ?? '') &&
    !STAKING_WORD.test(p.name) &&
    !STABLECOIN_WRAPPER.test(p.name) &&
    !STABLECOIN_WRAPPER.test(p.slug) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** Whether a live-token protocol belongs in the calibration set: it trades, it is not a wrapped or
 *  staked product of another protocol, and its name carries no version marker. */
export function isComp(p: SnapshotProtocol): boolean {
  return (
    !isPreToken(p) &&
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Solve a small least-squares system by the normal equations with Gaussian elimination and
 *  partial pivoting. `rows` are the design rows (each one starts with 1 for the intercept) and
 *  `y` the targets; returns the coefficients and the R-squared in the target's space. */
function leastSquares(rows: number[][], y: number[]): { beta: number[]; rSquared: number } {
  const k = rows[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let n = 0; n < rows.length; n++) {
    const x = rows[n]!;
    for (let i = 0; i < k; i++) {
      b[i]! += x[i]! * y[n]!;
      for (let j = 0; j < k; j++) a[i]![j]! += x[i]! * x[j]!;
    }
  }
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    const tmp = m[col]!;
    m[col] = m[pivot]!;
    m[pivot] = tmp;
    const d = m[col]![col]!;
    if (d === 0) throw new SnapshotError('the calibration set cannot fit a regression');
    for (let r = col + 1; r < k; r++) {
      const f = m[r]![col]! / d;
      for (let c = col; c <= k; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = m[i]![k]!;
    for (let j = i + 1; j < k; j++) s -= m[i]![j]! * beta[j]!;
    beta[i] = s / m[i]![i]!;
  }
  const yMean = y.reduce((s, v) => s + v, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let n = 0; n < rows.length; n++) {
    const pred = rows[n]!.reduce((s, v, i) => s + v * beta[i]!, 0);
    ssTot += (y[n]! - yMean) ** 2;
    ssRes += (y[n]! - pred) ** 2;
  }
  return { beta, rSquared: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Fit the log-log regression from the snapshot's live-token protocols: log(market cap) against
 *  log(TVL) and log(chains). The coefficients are computed here, at build time, from the snapshot
 *  in front of the model — nothing about the fit is a constant. */
export function calibrate(snapshot: Snapshot): Calibration {
  const comps = snapshot.protocols.filter(isComp);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} live-token comps to fit the regression from`);
  const rows = comps.map((p) => [1, Math.log(p.tvl_usd), Math.log(Math.max(1, p.chains.length))]);
  const y = comps.map((p) => Math.log(p.mcap_usd as number));
  const { beta, rSquared } = leastSquares(rows, y);
  return {
    intercept: round4(beta[0]!),
    log_tvl_slope: round4(beta[1]!),
    log_chains_slope: round4(beta[2]!),
    r_squared_log: round4(rSquared),
    comps_total: comps.length,
  };
}

/** The fitted log value and the implied value one protocol gets under the calibration. The
 *  coefficients are the ones calibrate stored, rounded to four decimals, and the log inputs are
 *  the protocol's own figures, so the dashboard can recompute this row exactly from the same
 *  numbers and check it against board.json. */
export function impliedValue(
  protocol: SnapshotProtocol,
  calibration: Calibration,
): { implied: number; intercept: number; logTvlSlope: number; logChainsSlope: number; logTvl: number; logChains: number; predictedLogValue: number } {
  const logTvl = Math.log(protocol.tvl_usd);
  const logChains = Math.log(Math.max(1, protocol.chains.length));
  const predicted = calibration.intercept + calibration.log_tvl_slope * logTvl + calibration.log_chains_slope * logChains;
  const implied = Math.max(1, Math.round(Math.exp(predicted)));
  return {
    implied,
    intercept: calibration.intercept,
    logTvlSlope: calibration.log_tvl_slope,
    logChainsSlope: calibration.log_chains_slope,
    logTvl,
    logChains,
    predictedLogValue: predicted,
  };
}

/** The model's fit on the live-token protocols it is calibrated from: run the same scoring function
 *  over each comp and compare the implied value with the market cap it already has. This is an
 *  in-sample fit — the comps set the regression — so it measures how well TVL and chains explain
 *  the market, not out-of-sample prediction. A wide spread is expected: the board is a ranking,
 *  not a price. */
export function modelFit(snapshot: Snapshot, calibration: Calibration): ModelFit {
  const comps = snapshot.protocols.filter(isComp);
  const errors: number[] = [];
  let within2x = 0;
  for (const p of comps) {
    const v = impliedValue(p, calibration);
    const mcap = p.mcap_usd as number;
    errors.push(Math.abs(v.implied - mcap) / mcap);
    const ratio = v.implied / mcap;
    if (ratio >= 0.5 && ratio <= 2) within2x++;
  }
  const med = errors.length > 0 ? median(errors) : 0;
  return {
    comps: comps.length,
    median_abs_pct_error: Math.round(med * 1000) / 10,
    within_2x_share: comps.length > 0 ? Math.round((within2x / comps.length) * 1000) / 1000 : 0,
    within_2x_count: within2x,
  };
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol the watchlist missed, whatever its TVL. The
  // watchlist is the floor, never the ceiling: a protocol above the floor that the watchlist missed
  // is still a protocol the radar exists to find, and a TVL filter here would leave a gap no other
  // part of the board covers. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, calibration);
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, ...v, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      intercept: s.intercept,
      log_tvl_slope: s.logTvlSlope,
      log_chains_slope: s.logChainsSlope,
      log_tvl: s.logTvl,
      log_chains: s.logChains,
      predicted_log_value: s.predictedLogValue,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The chains a protocol names, up to three, as one phrase. */
function chainPhrase(p: SnapshotProtocol): string {
  const chains = p.chains.slice(0, 3);
  if (chains.length === 0) return 'its main chain';
  if (chains.length === 1) return chains[0]!;
  if (chains.length === 2) return `${chains[0]} and ${chains[1]}`;
  return `${chains[0]}, ${chains[1]} and ${chains[2]}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What gas costs on the protocol's first chain, in the words a farmer budgets with. */
function gasNote(chain: string): string {
  const cheap = new Set(['Base', 'Arbitrum', 'Optimism', 'Blast', 'Linea', 'Scroll', 'ZkSync Era', 'Polygon', 'BNB Chain', 'Avalanche', 'Gnosis', 'Celo', 'Mode', 'Unichain']);
  const tiny = new Set(['Solana', 'Sui', 'Aptos', 'Near', 'Sei', 'Movement']);
  if (chain === 'Ethereum') return 'Gas on Ethereum is usually $2 to $10 a transaction, so batch the setup into one visit';
  if (cheap.has(chain)) return `Gas on ${chain} is a few cents, so the weekly actions cost almost nothing`;
  if (tiny.has(chain)) return `Gas on ${chain} is a fraction of a cent, so the weekly actions cost almost nothing`;
  return 'Gas is usually a few dollars a transaction, so batch the setup into one visit';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curat')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and let the curator allocate it.`;
  if (c.includes('onchain capital') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('uncollateralized') || c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('basis trad')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the position.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s best vault on ${chain} and keep the shares.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('restak')) return `Restake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('stablecoin wrapper') || c.includes('algo-stables') || c.includes('dual-token') || c.includes('stablecoin issuer')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('launchpad')) return `Stake $${capital} of USDC in ${name}'s launch pool on ${chain} and join one sale.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Deposit $${capital} of USDC into ${name} on ${chain} and vote on one live proposal.`;
  if (c.includes('otc')) return `Buy $${capital} of the listing through ${name} on ${chain} and hold the asset.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use the chain's flagship app for a week.`;
  if (c.includes('token locker')) return `Lock $${capital} of USDC in ${name} on ${chain} for the shortest term it offers.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, fitted to the category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('uncollateralized') || c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow a small amount against the supply and repay it within the week, so the account shows both sides.';
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return 'Swap once through the pool and add a little more liquidity, so the account shows trading and providing.';
  if (c.includes('bridge') || c.includes('cross chain')) return 'Bridge a small amount back and forth once, so the account shows the route in both directions.';
  if (c.includes('restak') || c.includes('staking')) return 'Claim any staking rewards that have accrued and restake them.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic') || c.includes('options')) return 'Open and close one small hedge, so the account shows a full round trip.';
  if (c.includes('prediction')) return 'Place one small position on a new market.';
  if (c.includes('risk curat') || c.includes('onchain capital') || c.includes('allocator') || c.includes('yield')) return 'Rebalance a small amount between two vaults once.';
  if (c.includes('rwa')) return 'Check the yield that has accrued and mint a small top-up.';
  if (c.includes('stablecoin') || c.includes('algo-stables') || c.includes('dual-token')) return 'Mint a small amount of the stable asset and hold it for the week.';
  if (c.includes('insurance')) return 'Review the cover and renew it if it is close to expiry.';
  if (c.includes('basis trad')) return 'Check the funding rate and top up the basis position if it is still paying.';
  if (c.includes('chain')) return 'Use one flagship app on the chain, such as its main swap or lending market.';
  if (c.includes('payment')) return 'Make one payment through the protocol.';
  if (c.includes('governance')) return 'Vote on one live proposal.';
  if (c.includes('otc')) return 'Place one small order on a new listing.';
  if (c.includes('launchpad')) return 'Join one new sale or vote on one allocation.';
  return 'Make one qualifying action, such as a deposit, a swap or a vote.';
}

/** The check to run before claiming, fitted to the category. */
function claimNote(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('uncollateralized') || c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Check the borrow rate and the health of the position first.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('synthetic') || c.includes('options')) return 'Close the hedge first, then check the rewards.';
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return 'Check the pool fees that have accrued first.';
  if (c.includes('restak') || c.includes('staking')) return 'Check the staking rewards that have accrued first.';
  if (c.includes('rwa')) return 'Check the yield that has accrued first.';
  if (c.includes('basis trad')) return 'Check the funding rate first.';
  return 'Check the position is still open first.';
}

/**
 * A protocol's farm plan: six steps, seven when the protocol runs on more than one chain. Every step
 * is derived from the protocol's own record (name, category, chains, TVL, age), so no two protocols
 * carry the same plan: the wallet step names the chain, the hold names the protocol's age, the claim
 * step names the category's check, and the log names the chains and the capital. The multi-chain
 * step mirrors the position onto a second chain, because a wallet active on two of a protocol's
 * chains reads as a real user, not a one-off deposit.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chains = chainPhrase(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const ageNote =
    age === null
      ? `${p.name} has no listing date on record, so the window is a guess`
      : `${p.name} was listed ${age} day${age === 1 ? '' : 's'} ago and still has no token`;
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and fund it with $${capital} of USDC on ${chain}. ${gasNote(chain)}.`,
      cost: chain === 'Ethereum' ? 'about $2 to $10 of gas for the first transaction' : 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days: ${ageNote}, so a ${hold}-day window puts the activity in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes. ${claimNote(p)}`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, with the ${chains} position and the $${capital} capital noted, so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    const half = Math.max(25, Math.round(capital / 2));
    steps.push({
      text: `Mirror the same position on ${second} with half the capital, $${half}, so the wallet shows activity on two of ${p.name}'s chains instead of one.`,
      cost: `about $${half} of capital and a few cents of gas`,
      time: '10 minutes',
    });
  }
  return steps;
}

/** The live-token protocols the calibration is built from, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(isComp)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan it carries. */
export function radarRow(row: BoardRow): RadarRow {
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
    intercept: row.model.intercept,
    log_tvl_slope: row.model.log_tvl_slope,
    log_chains_slope: row.model.log_chains_slope,
    log_tvl: row.model.log_tvl,
    log_chains: row.model.log_chains,
    predicted_log_value: row.model.predicted_log_value,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot);
  const board = buildBoard(snapshot, calibration);
  const live = liveRows(snapshot);
  const fit = modelFit(snapshot, calibration);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const earlyAboveFloor = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    calibration,
    fit,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    early_above_floor: earlyAboveFloor,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
