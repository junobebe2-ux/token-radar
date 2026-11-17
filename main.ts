// Token launch radar: one snapshot in, one ranked board and one offline
// dashboard bundle out.
//
//   node main.ts [--input <snapshot.json>]
//   MAKEFUN_OUTPUT_DIR=<dir> node main.ts --input <snapshot.json>
//
// The snapshot is the sealed DefiLlama extract the grader mounts at
// /input/snapshot.json. The model in lib/model.ts does all the scoring:
// it calibrates its multiples from the snapshot's own live-token protocols,
// ranks the pre-token ones, and writes the farm plan each row carries.
// This file only drives it: read the snapshot, run the model, refuse a
// board the gate rejects, and lay out the output directory the dossier
// is built from. It makes no network calls and needs nothing beyond the
// Node 22 standard library.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Where the snapshot lives when --input is not given, and where the
// bundle goes when MAKEFUN_OUTPUT_DIR is not set.
const FALLBACK_SNAPSHOT = '/input/snapshot.json';
const FALLBACK_OUTPUT = '/output';

// The dossier's text budget and the screenshot caps, in the gate's units.
const TEXT_BUDGET_BYTES = 65_536;
const SHOT_COUNT_MIN = 3;
const SHOT_COUNT_MAX = 4;
const SHOT_SIZE_MAX = 512 * 1024;

// A screenshot's name: a letter, digit or _ first, then letters, digits
// and . _ -, 1 to 128 characters. The dossier enforces the same rule.
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// The repository this file lives in.
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

/** Stop with a non-zero exit and a message the operator can act on. */
function quit(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

/** The --input value from the command line, or the grader's default. */
function snapshotPath(argv: string[]): string {
  let path = FALLBACK_SNAPSHOT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--input') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) quit('--input needs a path after it');
      path = next;
      i++;
    } else if (arg.startsWith('--input=')) {
      path = arg.slice('--input='.length);
      if (path === '') quit('--input= needs a path after the =');
    } else {
      quit(`unknown argument: ${arg}`);
    }
  }
  return path;
}

/** Read a snapshot file and score it, or stop with the reason it cannot be used. */
function loadSnapshot(path: string) {
  if (!existsSync(path)) quit(`snapshot not found: ${path}`);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    quit(`cannot read snapshot ${path}: ${(err as Error).message}`);
  }
  try {
    return parseSnapshot(text!);
  } catch (err) {
    quit(`snapshot ${path} is not usable: ${(err as Error).message}`);
  }
}

/** Copy a directory tree, leaving dotfiles and dot-directories behind. */
function mirrorTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) {
      mirrorTree(src, dst);
    } else {
      writeFileSync(dst, readFileSync(src));
    }
  }
}

/** The screenshots a dossier can take: enough of them, named right, small enough. */
function inspectShots(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  } catch {
    quit(`no screenshots/ directory in the output: ${dir}`);
  }
  if (names!.length < SHOT_COUNT_MIN) {
    quit(`only ${names!.length} screenshot(s) in ${dir}, need at least ${SHOT_COUNT_MIN}`);
  }
  if (names!.length > SHOT_COUNT_MAX) {
    quit(`${names!.length} screenshots in ${dir}, at most ${SHOT_COUNT_MAX}`);
  }
  for (const name of names!) {
    if (!SHOT_NAME.test(name)) quit(`screenshot name ${name} is not allowed`);
    const size = statSync(join(dir, name)).size;
    if (size > SHOT_SIZE_MAX) quit(`screenshot ${name} is ${size} bytes, over the ${SHOT_SIZE_MAX} allowed`);
  }
  return names!;
}

function run(): void {
  const snapPath = snapshotPath(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? FALLBACK_OUTPUT;

  const snapshot = loadSnapshot(snapPath);
  const { board, radar } = buildRadar(snapshot);
  const problem = boardIssue(board, snapshot);
  if (problem !== null) quit(`board rejected: ${problem}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));
  mirrorTree(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
  mirrorTree(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));
  const shots = inspectShots(join(outDir, 'screenshots'));

  let dossier: Uint8Array;
  try {
    dossier = buildDossier(outDir, {
      text_max_bytes: TEXT_BUDGET_BYTES,
      screenshots: { max: SHOT_COUNT_MAX, max_bytes: SHOT_SIZE_MAX },
    });
  } catch (err) {
    quit(`dossier failed: ${(err as Error).message}`);
  }
  writeFileSync(join(outDir, 'dossier.json'), dossier!);

  const watchlistRows = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;
  console.log(
    `radar: ${board.length} rows (${watchlistRows} watchlist, ${board.length - watchlistRows} early), ` +
      `${radar.live_size} live, ${shots.length} screenshots -> ${outDir}`,
  );
}

run();
