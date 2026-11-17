// token-radar-01 — the entry program.
//
// Reads the sealed snapshot, scores every launch candidate with lib/model.ts, writes the ranked board
// and the page's data, copies the dashboard and the screenshots, and last writes the dossier the
// judge reads with the kit's own builder. Node 22, standard library only.
//
//   node --experimental-strip-types main.ts --input input/snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts --input input/snapshot.json
//
// In the grader's container the snapshot is mounted at /input and the output is /output, so no
// argument is needed there.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Where this program's own files are, so the dashboard and screenshots travel with it. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** The dossier's caps: the source text is cut at 65,536 bytes, the rest refuse. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

/** A file name the dossier and the gate both accept. */
const PLAIN_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--flag value` or `--flag=value` out of the arguments. */
function flag(name: string, fallback: string): string {
  const args = process.argv;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === `--${name}` && i + 1 < args.length) return args[i + 1] as string;
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return fallback;
}

function die(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- the snapshot

const inputPath = flag('input', '/input');
const snapshotFile = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotFile}\n` +
      'token radar: pass --input <snapshot.json|directory>, or mount the sealed /input\n',
  );
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// The model's own refusal, before anything is written: a board the gate would reject is a bug here.
const refusal = boardIssue(board, snapshot);
if (refusal !== null) die(`the model wrote a board the gate refuses: ${refusal}`);

// ---------------------------------------------------------------- the output

const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`, 'utf8');
writeFileSync(join(outDir, 'data.js'), dataScript(radar), 'utf8');

/** Copy a directory's regular files, skipping dotfiles and any subdirectory. */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const source = join(from, entry);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, entry));
    names.push(entry);
  }
  return names;
}

const dashboardFiles = copyDirectory(join(ROOT, 'dashboard'), join(outDir, 'dashboard'));
const imageFiles = copyDirectory(join(ROOT, 'screenshots'), join(outDir, 'screenshots'));

if (imageFiles.length < 3) {
  die(
    `screenshots/ holds ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}: ` +
      'hand in 3, the board, a detail view and a filtered view',
  );
}
for (const name of imageFiles) {
  if (!PLAIN_IMAGE_NAME.test(name)) {
    die(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier last: the gate rebuilds it from this directory and compares the bytes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

// ---------------------------------------------------------------- what happened

const counts = radar.counts;
process.stdout.write(
  `token radar: ${counts.protocols} protocols read, ${counts.watchlist} on the watchlist, ` +
    `${counts.rows} launch candidates ranked, ${counts.live} already trading set aside\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashboardFiles.length} files), ` +
    `screenshots/ (${imageFiles.length} images) and dossier.json into ${outDir}\n`,
);
