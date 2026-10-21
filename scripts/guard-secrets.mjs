#!/usr/bin/env node
/**
 * Fails if a Supabase service-role JWT or a tracked `.env` is about to be
 * published. Used by the pre-push hook (.githooks/pre-push).
 *
 *   node scripts/guard-secrets.mjs                # check the working tree
 *   node scripts/guard-secrets.mjs <sha>..<sha>  # check a commit range
 */
import { execFileSync } from 'node:child_process';

const JWT = /eyJ[A-Za-z0-9_.-]{40,}/;
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitQuiet = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

let failures = 0;
const fail = (msg) => { failures++; console.error(`[guard-secrets] BLOCKED: ${msg}`); };

// 1. `.env` must never be tracked
try {
  if (gitQuiet('ls-files', '--error-unmatch', '.env')) fail('`.env` is tracked by git');
} catch { /* not tracked - good */ }

// 2. scan every tracked file
for (const f of git('ls-files').split('\n').filter(Boolean)) {
  if (f === '.env') continue;
  let buf;
  try { buf = git('show', `:${f}`); } catch { continue; }
  if (JWT.test(buf)) fail(`service-role JWT found in ${f}`);
}

// 3. scan the commits about to be pushed
const range = process.argv[2];
if (range) {
  let hits = '';
  try {
    const revs = git('rev-list', range).split('\n').filter(Boolean);
    if (revs.length) hits = git('grep', '-l', '-I', '-E', 'eyJ[A-Za-z0-9_.-]{40,}', ...revs);
  } catch { hits = ''; }
  for (const line of hits.split('\n').filter(Boolean)) fail(`service-role JWT in ${line}`);
}

if (failures) {
  console.error('[guard-secrets] Remove the credential, rotate it, and rewrite the affected commits before pushing.');
  process.exit(1);
}
console.log('[guard-secrets] OK - no service-role JWT and no tracked .env');
