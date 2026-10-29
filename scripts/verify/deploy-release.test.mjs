// H7-OPS-02, H7-OPS-RV-01..07: the host side of the deploy (scripts/ops/deploy-release.sh). Runs the real script with
// bash on a temporary application directory, with a fake `docker` first on PATH that records every call (and the
// API_IMAGE/CADDYFILE_PATH it got), fails the step a case names and plays the containers of each recreation (their image,
// state, restart count, readiness answer, mounted Caddyfile and the `.env` they were created with), and a fake `mv` that
// can fail one rename; never on a server and never with Docker. Proves the candidate Compose and Caddyfile are validated
// before anything else, every pre-recreate step runs from the candidate, a failure before the promotion leaves the live
// state alone, a release is a success only once it is ready and stable, any later failure restores the previous release
// whole and verifies it, every attempt keeps its own rollback evidence, the first H7 rollout gets its old environment
// back, nothing is pruned or removed as an orphan, and no credential is printed. RV-07: a run paused at a barrier of the
// fakes, past the host lock, makes a second run of the same directory exit 2 at once; the lock is the real `flock` where
// there is one (Linux), else a stand-in taking the same flock(2) lock (Git for Windows ships no `flock`). RV-08: a run is
// over only when every process it started has ended, not when the bash the test spawned exits (see `TREE`).
import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { bashFor } from './git-bash.mjs';

const SCRIPT = resolve(import.meta.dirname, '..', 'ops', 'deploy-release.sh');
const RELEASE = '0123456789abcdef0123456789abcdef01234567';
const IMAGE = `ghcr.io/example/slm-api:${RELEASE}`;
const PREVIOUS_IMAGE = `ghcr.io/example/slm-api:${'a'.repeat(40)}`;
const OTHER_SHA = 'b'.repeat(40);
const OTHER_IMAGE = `ghcr.io/example/slm-api:${OTHER_SHA}`;
const SECRET = 'secret-sentinel-4f1c2d9e7a6b';
const ATTEMPT = '40177719652-2';
const LIVE = { compose: 'name: slm-production # live v1\n', caddy: ':80 # live v1\n', image: `${PREVIOUS_IMAGE}\n` };
const CANDIDATE = {
  compose: 'name: slm-production # candidate v2\n',
  caddy: ':80 # candidate v2\n',
  image: `${IMAGE}\n`,
};
const MALFORMED_CADDY = ':80 {\n  MALFORMED directive\n}\n';
/** The `.env` of H7 (the live one in every case) and the one kept before the first H7 rollout. */
const H7_ENV = `ENV_GENERATION=h7\nPOSTGRES_PASSWORD=${SECRET}\nDATABASE_DEPLOY_PASSWORD=${SECRET}\n`;
const PRE_H7_ENV = `ENV_GENERATION=pre-h7\nPOSTGRES_PASSWORD=${SECRET}\nAUTH_ACCESS_TOKEN_SECRET=${SECRET}\n`;
/**
 * P04-CPE-04: the labels `docker image inspect --format '{{json .Config.Labels}}'` prints for an image that reads the
 * representation the final release writes (the Dockerfile label, pinned in recovery-target.policy.spec.ts). The previous image
 * prints `null` by default: an image built before the label, as the compatibility image `fba4dfe`.
 */
const FINAL_LABELS = JSON.stringify({ 'io.github.baophipham.slm.data-reads': 'access-request-null-cost-center' });
/** Short, still bounded, windows: the fake answers at once. */
const QUICK = ['--ready-timeout', '2', '--stability-window', '0', '--poll-interval', '0'];
const created = [];

/**
 * Records each call and its API_IMAGE/CADDYFILE_PATH; fails a call whose arguments contain FAKE_FAIL (only the first one
 * with FAKE_FAIL_ONCE); plays pg_dump/pg_restore and `caddy validate`, which reads the Caddyfile Compose would mount
 * (`${CADDYFILE_PATH:-./Caddyfile}` against --project-directory), refuses one that says MALFORMED and prints an
 * environment value, as a real log may.
 *
 * Containers: generation 0 is what ran before the deploy (image FAKE_GEN0_IMAGE, none when empty); each successful
 * `up -d --force-recreate api worker caddy` makes the next generation, with the API_IMAGE, the sha256 of the mounted
 * Caddyfile and the generation of the `.env` it was created with. `compose ps -a -q <service>`, `inspect` and `exec`
 * answer for container `fake-<service>-<generation>`. FAKE_BAD_NEW / FAKE_BAD_OLD list `service:behaviour` for containers
 * of the new image / of any other image: notready (readiness not 2xx), image (runs another image), crashloop (restart
 * count grows at every look), restarting, exited, missing (no container), twice (two containers), replaced (another
 * container after the first look), stale (Caddy mounts another Caddyfile). With FAKE_OLD_NEEDS_PRE_H7 an old image
 * created with the `.env` of H7 does not start; FAKE_GEN0_STOPPED stops api/worker of generation 0 (runbook step 4).
 *
 * Barrier (H7-OPS-RV-07): the first call containing FAKE_PAUSE creates $FAKE_BARRIER/paused, then waits — at most 300 s —
 * for $FAKE_BARRIER/go. The test thus knows the run is inside the script, past the host lock, at that exact step.
 *
 * Linger (H7-TEST-RV-08): the first call containing FAKE_LINGER leaves behind a process of the run in a process group of its
 * own, as `timeout` puts the fake it runs, that runs three seconds more and then creates $FAKE_LINGERED.
 */
const barrier = (
  variable,
) => `if [ -n "\${${variable}:-}" ] && [[ "$*" == *"$${variable}"* ]] && [ ! -e "$FAKE_BARRIER/paused" ]; then
  leader=''
  if [ -n "\${FAKE_RUN_PID:-}" ] && [ -f "$FAKE_RUN_PID" ]; then read -r leader < "$FAKE_RUN_PID"; fi
  : > "$FAKE_BARRIER/paused"
  for _ in $(seq 1 3000); do
    [ -e "$FAKE_BARRIER/go" ] && break
    # Ends with its run: under \`timeout\` this process is in a process group of its own, out of reach of the group kill.
    if [ -n "$leader" ] && ! kill -0 "$leader" 2> /dev/null; then exit 97; fi
    sleep 0.1
  done
  [ -e "$FAKE_BARRIER/go" ] || exit 98
fi`;

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
printf 'API_IMAGE=%s CADDYFILE_PATH=%s\\n' "\${API_IMAGE:-}" "\${CADDYFILE_PATH:-}" >> "$FAKE_DOCKER_LOG.env"
${barrier('FAKE_PAUSE')}
if [ -n "\${FAKE_LINGER:-}" ] && [[ "$*" == *"$FAKE_LINGER"* ]] && [ ! -e "$FAKE_LINGERED.started" ]; then
  : > "$FAKE_LINGERED.started"
  timeout 30 bash -c 'sleep 3; : > "$0"' "$FAKE_LINGERED" > /dev/null 2>&1 < /dev/null &
fi
project=''
previous=''
for arg in "$@"; do
  [ "$previous" = '--project-directory' ] && project="$arg"
  previous="$arg"
done
state="$FAKE_STATE"
if [ ! -f "$state/generation" ]; then
  mkdir -p "$state"
  echo 0 > "$state/generation"
  echo "\${FAKE_NULL_ROWS:-0}" > "$state/null-rows"
  if [ -f "$project/Caddyfile" ]; then sha256sum "$project/Caddyfile" | cut -d ' ' -f 1 > "$state/caddy-0"; fi
fi
read -r generation < "$state/generation"
if [ -n "\${FAKE_FAIL:-}" ] && [[ "$*" == *"$FAKE_FAIL"* ]]; then
  if [ -z "\${FAKE_FAIL_ONCE:-}" ] || [ ! -e "$state/failed" ]; then
    : > "$state/failed"
    exit "\${FAKE_FAIL_CODE:-1}"
  fi
fi
# File reads with the read builtin, not cat: a Windows fork per call is what makes this fake slow.
value_of() {
  value="$2"
  if [ -f "$1" ]; then read -r value < "$1" || true; fi
}
image_of() {
  if [ "$1" = 0 ]; then generation_image="\${FAKE_GEN0_IMAGE:-}"; else value_of "$state/image-$1" ''; generation_image="$value"; fi
}
behaves() {
  local list
  image_of "$2"
  if [ "$generation_image" = "$FAKE_NEW_IMAGE" ]; then list="\${FAKE_BAD_NEW:-}"; else list="\${FAKE_BAD_OLD:-}"; fi
  if [ -n "\${FAKE_OLD_NEEDS_PRE_H7:-}" ] && [ "$2" != 0 ] && [ "$generation_image" != "$FAKE_NEW_IMAGE" ]; then
    value_of "$state/env-$2" h7
    [ "$value" = pre-h7 ] || list="$list api:notready worker:crashloop"
  fi
  if [ "$2" = 0 ] && [ -n "\${FAKE_GEN0_STOPPED:-}" ]; then list="$list api:exited worker:exited"; fi
  [[ " $list " == *" $1:$3 "* ]]
}
count() {
  value_of "$state/$1" 0
  counted=$((value + 1))
  echo "$counted" > "$state/$1"
}
case "$*" in
  *" caddy caddy validate "*)
    echo "caddy: DOMAIN=$FAKE_ENV_VALUE"
    echo "caddy: DOMAIN=$FAKE_ENV_VALUE" >&2
    if grep -q MALFORMED "\${CADDYFILE_PATH:-$project/Caddyfile}"; then exit 1; fi ;;
  *" pg_dump "*) printf 'PGDMP fake dump' ;;
  *" pg_restore "*) cat > /dev/null ;;
  *" up -d --force-recreate api worker caddy")
    generation=$((generation + 1))
    printf '%s' "\${API_IMAGE:-}" > "$state/image-$generation"
    sha256sum "\${CADDYFILE_PATH:-$project/Caddyfile}" | cut -d ' ' -f 1 > "$state/caddy-$generation"
    if grep -qx 'ENV_GENERATION=pre-h7' "$project/.env"; then echo pre-h7; else echo h7; fi > "$state/env-$generation"
    echo "$generation" > "$state/generation" ;;
  *" ps -a -q "*)
    service="\${@: -1}"
    image_of "$generation"
    [ -n "$generation_image" ] || exit 0
    behaves "$service" "$generation" missing && exit 0
    count "ps-$service-$generation"
    if behaves "$service" "$generation" replaced && [ "$counted" -gt 1 ]; then
      echo "fake-$service-$generation-replaced"
    else
      echo "fake-$service-$generation"
    fi
    if behaves "$service" "$generation" twice; then echo "fake-$service-$generation-other"; fi ;;
  "inspect --format "*)
    IFS=- read -r _ service container _ <<< "$4"
    image_of "$container"
    image="$generation_image"
    [ "$service" = caddy ] && image=caddy:2-alpine
    behaves "$service" "$container" image && image="ghcr.io/example/slm-api:$FAKE_OTHER_SHA"
    if [ "$3" = '{{.Config.Image}}' ]; then echo "$image"; exit 0; fi
    status=running
    restarting=false
    restarts=0
    behaves "$service" "$container" exited && status=exited
    if behaves "$service" "$container" restarting; then status=restarting; restarting=true; fi
    if behaves "$service" "$container" crashloop; then
      count "restarts-$4"
      restarts="$counted"
    fi
    echo "$image|$status|$restarting|$restarts" ;;
  "exec "*" node -e "*)
    IFS=- read -r _ service container _ <<< "$2"
    # What releases/current-attempt said while the release was being checked (it must not have moved yet).
    if [ -f "$FAKE_APP/releases/current-attempt" ]; then
      value_of "$FAKE_APP/releases/current-attempt" ''
      echo "$value" >> "$state/marker-at-probe"
    fi
    for bad in notready exited restarting crashloop; do
      if behaves "$service" "$container" "$bad"; then exit 1; fi
    done
    # slowstart: ready only from the third probe on.
    if behaves "$service" "$container" slowstart; then
      count "probes-$2"
      [ "$counted" -ge 3 ] || exit 1
    fi
    # P04-CPE-04: a ready API of the new image serves a request and writes a row its predecessor cannot read.
    image_of "$container"
    if [ -n "\${FAKE_CANDIDATE_WRITES:-}" ] && [ "$service" = api ] && [ "$generation_image" = "$FAKE_NEW_IMAGE" ] &&
      [ ! -e "$state/stopped-$container" ]; then
      count null-rows
    fi ;;
  *" stop api worker")
    : > "$state/stopped-$generation" ;;
  "image inspect --format "*)
    image="\${@: -1}"
    if [ "$image" = "\${FAKE_ABSENT_IMAGE:-}" ]; then echo "Error: No such image: $image" >&2; exit 1; fi
    if [ "$image" = "$FAKE_NEW_IMAGE" ]; then echo "$FAKE_NEW_LABELS"; else echo "\${FAKE_OLD_LABELS:-null}"; fi ;;
  *"/migration-preflight-cli.js --recovery-target "*)
    # A stand-in for the judgement of ops:preflight --recovery-target (unit-tested in recovery-target.policy.spec.ts): the rows
    # this fake database holds against what the labels declare. Exit 0 compatible, 2 incompatible, 3 no history.
    if [ -n "\${FAKE_JUDGE_FAILS_AFTER_RECREATE:-}" ] && [ "$generation" -ge 1 ]; then echo 'The preflight failed: Error' >&2; exit 1; fi
    if [ -n "\${FAKE_NO_HISTORY:-}" ]; then echo 'Recovery target: NO_HISTORY'; exit 3; fi
    value_of "$state/null-rows" 0
    rows="$value"
    verdict=0
    if [ "$rows" -gt 0 ] && [[ "\${@: -1}" != *access-request-null-cost-center* ]]; then verdict=2; fi
    # A release still running while it is judged keeps writing: a row after the verdict is one the verdict missed.
    image_of "$generation"
    if [ -n "\${FAKE_WRITE_DURING_JUDGE:-}" ] && [ "$generation_image" = "$FAKE_NEW_IMAGE" ] && [ ! -e "$state/stopped-$generation" ]; then
      count null-rows
      : > "$state/write-after-judge"
    fi
    if [ "$verdict" -eq 2 ]; then
      echo 'Recovery target: INCOMPATIBLE'
      echo "  - access-request-null-cost-center: $rows row(s), NOT read by the image"
      exit 2
    fi
    echo 'Recovery target: COMPATIBLE' ;;
  "exec "*" sha256sum /etc/caddy/Caddyfile")
    IFS=- read -r _ service container _ <<< "$2"
    value_of "$state/caddy-$container" ''
    hash="$value"
    behaves caddy "$container" stale && hash="$FAKE_OTHER_SHA"
    echo "$hash  /etc/caddy/Caddyfile" ;;
esac
exit 0
`;

/**
 * A real `mv`, except that a rename whose arguments contain FAKE_MV_FAIL fails, and the first one containing
 * FAKE_MV_PAUSE waits at the barrier of FAKE_DOCKER before it renames.
 */
const FAKE_MV = `#!/usr/bin/env bash
${barrier('FAKE_MV_PAUSE')}
if [ -n "\${FAKE_MV_FAIL:-}" ] && [[ "$*" == *"$FAKE_MV_FAIL"* ]]; then
  echo 'mv: fake failure' >&2
  exit 1
fi
for real in /usr/bin/mv /bin/mv; do
  if [ -x "$real" ]; then exec "$real" "$@"; fi
done
exit 127
`;

/**
 * Stand-in for util-linux `flock <fd>` where the host has none (Git for Windows): the same flock(2) lock on the inherited
 * descriptor, so it stays held by the script after this process exits and is released when the last holder of the
 * descriptor ends. One perl process, a direct child of the script as util-linux flock is: under msys, a lock taken
 * through a second, intermediate process (a bash wrapper calling perl) is dropped when that wrapper exits. Options as
 * util-linux: -n (no wait), -u (release), -E <exit on conflict>; any other is refused. Only where `command -v flock`
 * finds nothing; Linux runs the real one.
 */
const FLOCK_STAND_IN = `#!/usr/bin/perl
use strict;
use warnings;
use Fcntl qw(:flock);
my ($conflict, $operation, $wait) = (1, LOCK_EX, 1);
while (@ARGV > 1) {
  my $option = shift @ARGV;
  if ($option eq '-n') { $wait = 0 }
  elsif ($option eq '-u') { $operation = LOCK_UN }
  elsif ($option eq '-E') { $conflict = shift @ARGV }
  else { print STDERR "flock stand-in: unsupported option $option\\n"; exit 64 }
}
my $fd = shift @ARGV // '';
if ($fd !~ /^[0-9]+$/) { print STDERR "flock stand-in: a descriptor number is required\\n"; exit 64 }
open(my $handle, '>&=', $fd) or exit 66;
$operation |= LOCK_NB if $operation == LOCK_EX && !$wait;
exit 0 if flock($handle, $operation);
exit($!{EWOULDBLOCK} ? $conflict : 66);
`;

const setup = (() => {
  try {
    const bash = bashFor();
    const flock = spawnSync(bash.executable, ['-c', 'command -v flock'], { stdio: 'ignore' }).status === 0;
    return { bash, flock };
  } catch (error) {
    return { error };
  }
})();

/**
 * A host directory with the live release, the two environment files and the candidate of RELEASE. `preH7` adds the
 * `.env.pre-h7` kept by the runbook before the first H7 rollout (and, as on such a host, no releases/current-image).
 * `noFlock` leaves PATH with the fakes only, so that no `flock` can be found.
 */
function host({
  appEnv = `AUTH_ACCESS_TOKEN_SECRET=${SECRET}\nSMTP_HOST=smtp.example.com\n`,
  fresh = false,
  preH7 = false,
  noFlock = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'slm-deploy-release-'));
  created.push(root);
  const app = join(root, 'app');
  const bin = join(root, 'bin');
  const release = join(app, 'releases', RELEASE);
  mkdirSync(release, { recursive: true });
  mkdirSync(bin);
  if (!fresh) {
    writeFileSync(join(app, 'docker-compose.prod.yml'), LIVE.compose);
    writeFileSync(join(app, 'Caddyfile'), LIVE.caddy);
    if (!preH7) writeFileSync(join(app, 'releases', 'current-image'), LIVE.image);
  }
  writeFileSync(join(app, '.env'), H7_ENV);
  if (preH7) writeFileSync(join(app, '.env.pre-h7'), PRE_H7_ENV);
  if (appEnv !== null) writeFileSync(join(app, '.env.app'), appEnv);
  writeFileSync(join(release, 'docker-compose.prod.yml'), CANDIDATE.compose);
  writeFileSync(join(release, 'Caddyfile'), CANDIDATE.caddy);
  writeFileSync(join(bin, 'docker'), FAKE_DOCKER);
  writeFileSync(join(bin, 'mv'), FAKE_MV);
  chmodSync(join(bin, 'docker'), 0o755);
  chmodSync(join(bin, 'mv'), 0o755);
  if (!setup.flock && !noFlock) {
    writeFileSync(join(bin, 'flock'), FLOCK_STAND_IN);
    chmodSync(join(bin, 'flock'), 0o755);
  }
  // Git for Windows' bash puts /usr/bin first on PATH, ahead of the fakes; BASH_ENV runs before the script on any bash.
  // A run started without waiting names FAKE_RUN_PID: the first bash of the run — the script itself, before any child —
  // records its PID there, the leader of the process group the run ends with (H7-OPS-RV-07).
  const bashEnv = join(root, 'bash-env.sh');
  writeFileSync(
    bashEnv,
    `${noFlock ? `PATH="${setup.bash.path(bin)}"` : `PATH="${setup.bash.path(bin)}:$PATH"`}\n` +
      'if [ -n "${FAKE_RUN_PID:-}" ] && [ ! -e "$FAKE_RUN_PID" ]; then echo "$$" > "$FAKE_RUN_PID"; fi\n',
  );
  return { root, app, bin, release, bashEnv, fresh, state: join(root, 'docker-state'), runs: 0 };
}

/** A second candidate, of `sha`, beside the one of RELEASE (H7-OPS-RV-07: two deployments of different releases). */
function addCandidate(target, sha) {
  const dir = join(target.app, 'releases', sha);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'docker-compose.prod.yml'), `name: slm-production # candidate ${sha.slice(0, 7)}\n`);
  writeFileSync(join(dir, 'Caddyfile'), `:80 # candidate ${sha.slice(0, 7)}\n`);
}

/** The usual arguments of one run; `attempt: null` leaves --attempt out; `release` deploys another candidate. */
const argumentsFor = (target, { attempt = ATTEMPT, extra = [], release = RELEASE } = {}) => [
  '--app-dir',
  setup.bash.path(target.app),
  '--release',
  release,
  '--image',
  `ghcr.io/example/slm-api:${release}`,
  ...(attempt === null ? [] : ['--attempt', attempt]),
  ...QUICK,
  ...extra,
];

function environmentFor(target, options, log) {
  const { fail, failCode, once, mvFail, runningImage, badNew, badOld, oldNeedsPreH7, gen0Stopped } = options;
  const { pause, mvPause, barrier, linger } = options;
  // P04-CPE-04: the labels of the previous image, what the fake database holds and how the release writes.
  const { labelsOld, absentImage, nullRows, candidateWrites, writeDuringJudge, noHistory, judgeFailsAfterRecreate } =
    options;
  const { bash } = setup;
  return {
    ...process.env,
    PATH: `${target.bin}${delimiter}${process.env.PATH}`,
    BASH_ENV: bash.path(target.bashEnv),
    FAKE_DOCKER_LOG: bash.path(log),
    FAKE_STATE: bash.path(target.state),
    FAKE_APP: bash.path(target.app),
    FAKE_ENV_VALUE: SECRET,
    FAKE_NEW_IMAGE: IMAGE,
    FAKE_OTHER_SHA: OTHER_SHA,
    FAKE_GEN0_IMAGE: target.fresh ? '' : (runningImage ?? PREVIOUS_IMAGE),
    ...(fail ? { FAKE_FAIL: fail, FAKE_FAIL_CODE: String(failCode ?? 1) } : {}),
    ...(once ? { FAKE_FAIL_ONCE: '1' } : {}),
    ...(mvFail ? { FAKE_MV_FAIL: mvFail } : {}),
    ...(badNew ? { FAKE_BAD_NEW: badNew } : {}),
    ...(badOld ? { FAKE_BAD_OLD: badOld } : {}),
    ...(oldNeedsPreH7 ? { FAKE_OLD_NEEDS_PRE_H7: '1' } : {}),
    ...(gen0Stopped ? { FAKE_GEN0_STOPPED: '1' } : {}),
    ...(barrier ? { FAKE_BARRIER: bash.path(barrier) } : {}),
    ...(pause ? { FAKE_PAUSE: pause } : {}),
    ...(mvPause ? { FAKE_MV_PAUSE: mvPause } : {}),
    ...(linger ? { FAKE_LINGER: linger, FAKE_LINGERED: bash.path(join(target.root, 'lingered')) } : {}),
    FAKE_NEW_LABELS: FINAL_LABELS,
    ...(labelsOld ? { FAKE_OLD_LABELS: labelsOld } : {}),
    ...(absentImage ? { FAKE_ABSENT_IMAGE: absentImage } : {}),
    ...(nullRows ? { FAKE_NULL_ROWS: String(nullRows) } : {}),
    ...(candidateWrites ? { FAKE_CANDIDATE_WRITES: '1' } : {}),
    ...(writeDuringJudge ? { FAKE_WRITE_DURING_JUDGE: '1' } : {}),
    ...(noHistory ? { FAKE_NO_HISTORY: '1' } : {}),
    ...(judgeFailsAfterRecreate ? { FAKE_JUDGE_FAILS_AFTER_RECREATE: '1' } : {}),
  };
}

const lines = (path) => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []);

/**
 * H7-TEST-RV-08: the end of a run is the end of every process it started, not the exit of the process the test spawned. On
 * Windows that process is Git's bash launcher: the msys processes the script starts can outlive it (a fake in a process
 * group of its own under `timeout`, still holding a file of the temporary directory), so its exit says nothing about them.
 * Each run therefore gets one more pipe, its fd 3, that nothing reads or writes: every process of the run, whatever its
 * process group and wherever its output goes, holds an inherited handle of it, and the pipe closes only when the last of
 * them has ended. That close, which belongs to the test, is what `deploy` and `finish` wait for before a directory is
 * removed.
 */
const TREE = 'pipe';

function deploy(target, options = {}) {
  const { bash } = setup;
  target.runs += 1;
  const log = join(target.root, `docker-${target.runs}.log`);
  const started = Date.now();
  // spawnSync returns once every pipe is closed: with fd 3 (TREE), once every process of the run has ended.
  const result = spawnSync(bash.executable, [bash.path(SCRIPT), ...(options.args ?? argumentsFor(target, options))], {
    encoding: 'utf8',
    env: environmentFor(target, options, log),
    stdio: ['ignore', 'pipe', 'pipe', TREE],
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    seconds: (Date.now() - started) / 1000,
    calls: lines(log),
    environments: lines(`${log}.env`),
  };
}

/**
 * Runs started without waiting (H7-OPS-RV-07). Each is registered before its process exists; afterEach — or the exit of
 * this test process — ends whatever is left, by its exact identity, never by name. POSIX: the process group the test
 * created (`detached`). Windows: the msys process group of the script, whose leader recorded its PID through BASH_ENV,
 * then `taskkill /T` of the exact PID spawned (Git's bash launcher). `taskkill /T` alone does not reach the commands the
 * script started: msys fork/exec does not keep the Windows parent chain. A fake in a process group of its own (under
 * `timeout`) is out of reach of both and ends by itself once its run is gone; `settled` waits for it (H7-TEST-RV-08).
 */
const running = [];

function endTree(run) {
  const { child } = run;
  if (!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const leader = optional(run.pidFile)?.trim();
    if (leader && /^[0-9]+$/.test(leader)) {
      spawnSync(setup.bash.executable, ['-c', `kill -KILL -- -${leader}`], { stdio: 'ignore' });
    }
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // The group is already gone.
    }
  }
}
process.on('exit', () => running.forEach(endTree));

/** Starts one run; its output goes to a file (no pipe to fill while the test waits elsewhere). */
function start(target, options = {}) {
  const { bash } = setup;
  target.runs += 1;
  const run = {
    log: join(target.root, `docker-${target.runs}.log`),
    outPath: join(target.root, `run-${target.runs}.out`),
    pidFile: join(target.root, `run-${target.runs}.pid`),
    barrier: join(target.root, `barrier-${target.runs}`),
    started: Date.now(),
  };
  mkdirSync(run.barrier);
  running.push(run);
  const out = openSync(run.outPath, 'w');
  try {
    run.child = spawn(bash.executable, [bash.path(SCRIPT), ...argumentsFor(target, options)], {
      env: {
        ...environmentFor(target, { ...options, barrier: run.barrier }, run.log),
        FAKE_RUN_PID: bash.path(run.pidFile),
      },
      stdio: ['ignore', out, out, TREE],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
  } finally {
    closeSync(out);
  }
  run.exited = new Promise((resolve) => {
    run.child.once('exit', (status) => resolve(status));
    run.child.once('error', () => resolve(null));
  });
  // Every process of the run has ended once fd 3 (TREE) is closed; a run that could not start has none.
  run.ended = new Promise((resolve) => {
    const tree = run.child.stdio[3];
    if (!tree) return resolve();
    tree.resume();
    tree.once('close', resolve);
    run.child.once('error', resolve);
  });
  return run;
}

/**
 * Resolves once every process of the run has ended (H7-TEST-RV-08); a process of the run still alive after `within` ms
 * fails the test with the identity of the run, and nothing is removed or killed for it here.
 */
async function settled(run, within = 60_000) {
  let timer;
  const ended = await Promise.race([
    run.ended.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), within);
    }),
  ]);
  clearTimeout(timer);
  if (!ended) {
    assert.fail(
      `a process of the run ${run.outPath} (leader ${optional(run.pidFile)?.trim() ?? 'unknown'}) is still alive`,
    );
  }
}

/** Waits for the run to end — at most `within` ms, then its exact tree is ended and `timedOut` says so. */
async function finish(run, within = 600_000) {
  let timer;
  const timedOut = await Promise.race([
    run.exited.then(() => false),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(true), within);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) endTree(run);
  const status = await run.exited;
  await settled(run);
  return {
    status: timedOut ? null : status,
    timedOut,
    seconds: (Date.now() - run.started) / 1000,
    output: optional(run.outPath) ?? '',
    calls: lines(run.log),
    environments: lines(`${run.log}.env`),
  };
}

/** Resolves once the run waits at its barrier (it is then inside the script, past the lock); fails if it ended first. */
async function paused(run, within = 300_000) {
  const deadline = Date.now() + within;
  while (!existsSync(join(run.barrier, 'paused'))) {
    if (run.child.exitCode !== null || run.child.signalCode !== null) {
      assert.fail(`the run ended before its barrier:\n${optional(run.outPath)}`);
    }
    if (Date.now() > deadline) assert.fail('the run did not reach its barrier');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
const resume = (run) => writeFileSync(join(run.barrier, 'go'), '');

const optional = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
/** The live release state: the Compose/Caddy pair and releases/current-image, read together. */
const live = (target) => ({
  compose: optional(join(target.app, 'docker-compose.prod.yml')),
  caddy: optional(join(target.app, 'Caddyfile')),
  image: optional(join(target.app, 'releases', 'current-image')),
});
const attemptDir = (target, attempt = ATTEMPT) => join(target.release, 'attempts', attempt);
/** The release state one attempt replaced (its rollback evidence). */
const replaced = (target, attempt = ATTEMPT) => ({
  compose: optional(join(attemptDir(target, attempt), 'replaced', 'docker-compose.prod.yml')),
  caddy: optional(join(attemptDir(target, attempt), 'replaced', 'Caddyfile')),
  image: optional(join(attemptDir(target, attempt), 'replaced', 'current-image')),
});
/** Every file under a directory, path → bytes (base64), to prove an earlier attempt stays byte-identical. */
function tree(dir) {
  const files = {};
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}${entry.name}/`);
      else files[`${prefix}${entry.name}`] = readFileSync(path).toString('base64');
    }
  };
  walk(dir, '');
  return files;
}
const marker = (target) => optional(join(target.app, 'releases', 'current-attempt'));
const markerOf = (attempt) => `releases/${RELEASE}/attempts/${attempt}\n`;
const recreations = (result) => result.calls.filter((call) => call.includes('--force-recreate'));
const step = (result, pattern) => result.calls.findIndex((call) => pattern.test(call));
const VALIDATE = / run --rm --no-deps -T caddy caddy validate --config \/etc\/caddy\/Caddyfile --adapter caddyfile$/;
const PROBE = (generation) => new RegExp(`^exec fake-api-${generation} node -e `);

/**
 * Removes the registered fixture directories, newest first, each by its exact path. A directory leaves the registry only
 * once its removal succeeded (P04-CPE-05): a removal that fails throws as it is — the error names the path — and leaves
 * that directory, and every older one, registered for the next cleanup, never lost.
 */
function removeFixtures(
  registry,
  remove = (path) => rmSync(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
) {
  while (registry.length > 0) {
    remove(registry.at(-1));
    registry.pop();
  }
}

describe('fixture cleanup registry (P04-CPE-05)', () => {
  it('keeps a fixture registered until its removal succeeds, so a failed removal is never lost', () => {
    const registry = ['/tmp/fixture-a', '/tmp/fixture-b'];
    const removed = [];
    const denied = Object.assign(new Error('EPERM: operation not permitted, rm'), {
      code: 'EPERM',
      path: '/tmp/fixture-b',
    });
    const failB = (path) => {
      if (path === '/tmp/fixture-b') throw denied;
      removed.push(path);
    };

    assert.throws(() => removeFixtures(registry, failB), denied);
    // The fixture that could not be removed is still registered, and so is the older one the loop did not reach.
    assert.deepEqual(registry, ['/tmp/fixture-a', '/tmp/fixture-b']);
    assert.deepEqual(removed, []);
    // The next cleanup removes both; each leaves the registry only once removed.
    removeFixtures(registry, (path) => removed.push(path));
    assert.deepEqual(registry, []);
    assert.deepEqual(removed, ['/tmp/fixture-b', '/tmp/fixture-a']);
  });
});

describe('deploy-release.sh (H7-OPS-02, H7-OPS-RV-01..07)', () => {
  afterEach(async () => {
    // Processes first: a directory cannot go while a process of a run still holds a file of it. Each run is ended by its
    // exact identity, then waited for until every process it started has ended (H7-TEST-RV-08) — a fake waiting at a
    // barrier under `timeout` ends itself once its run is gone — and only then is its exact directory removed.
    while (running.length > 0) {
      const run = running.pop();
      endTree(run);
      if (run.ended) await settled(run);
    }
    removeFixtures(created);
  });

  if (setup.error) {
    it('runs under Git for Windows Bash on Windows', () => assert.fail(setup.error.message));
    return;
  }

  it('validates the candidate, runs every pre-recreate step from it, promotes the release whole and succeeds only once it is ready', () => {
    const target = host();
    const result = deploy(target);

    assert.equal(result.status, 0, result.output);
    assert.deepEqual(live(target), CANDIDATE);
    assert.deepEqual(replaced(target), LIVE);
    assert.equal(marker(target), markerOf(ATTEMPT));
    // The marker moves only after the readiness check: no probe ever saw it (H7-OPS-RV-05).
    assert.equal(optional(join(target.state, 'marker-at-probe')), null);
    const order = [
      step(result, /releases\/[0-9a-f]{40}\/docker-compose\.prod\.yml config --quiet$/),
      step(result, VALIDATE),
      step(result, / pull api worker$/),
      step(result, / up -d --no-recreate postgres$/),
      step(result, / backup pg_dump /),
      step(result, / backup pg_restore --list$/),
      step(result, / migrate node dist\/migration-preflight-cli\.js$/),
      step(result, / migrate node node_modules\/prisma\/build\/index\.js migrate deploy$/),
      step(result, / migrate node dist\/database-roles-cli\.js reconcile$/),
      step(result, / up -d --force-recreate api worker caddy$/),
      step(result, PROBE(1)),
    ];
    assert.ok(
      order.every((index) => index >= 0),
      `missing step in ${result.calls.join('\n')}`,
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
    // Everything before the recreation used the candidate; the validation mounted the candidate Caddyfile, the
    // recreation the (now promoted) live one.
    const recreate = order.at(-2);
    for (const call of result.calls.slice(0, recreate)) {
      if (call.startsWith('compose'))
        assert.match(call, new RegExp(`-f \\S*releases/${RELEASE}/docker-compose\\.prod\\.yml`));
    }
    assert.match(result.environments[order[1]], new RegExp(`CADDYFILE_PATH=\\S*/app/releases/${RELEASE}/Caddyfile$`));
    assert.doesNotMatch(result.calls[recreate], /releases\//);
    assert.match(result.environments[recreate], /CADDYFILE_PATH=\S*\/app\/Caddyfile$/);
    assert.match(result.environments[recreate], new RegExp(`API_IMAGE=${IMAGE} `));
    assert.equal(recreations(result).length, 1);
    // Ready, then watched: every service looked at twice at least, the Caddyfile inside Caddy compared with the live one.
    const after = result.calls.slice(recreate);
    for (const service of ['api', 'worker', 'caddy']) {
      assert.ok(
        after.filter((call) => call.startsWith(`inspect --format `) && call.endsWith(` fake-${service}-1`)).length >= 2,
      );
    }
    assert.ok(after.filter((call) => PROBE(1).test(call)).length >= 2);
    assert.ok(after.some((call) => call === 'exec fake-caddy-1 sha256sum /etc/caddy/Caddyfile'));
    assert.match(result.output, /Release [0-9a-f]{40} is live and ready \(attempt 40177719652-2\)/);
    assert.equal(result.output.includes(SECRET), false);
  });

  it('refuses a malformed candidate Caddyfile before the backup, even when the live one is valid (H7-OPS-RV-01)', () => {
    const target = host();
    writeFileSync(join(target.release, 'Caddyfile'), MALFORMED_CADDY);
    const result = deploy(target);

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /candidate Caddyfile/);
    assert.equal(step(result, / backup pg_dump /), -1);
    assert.deepEqual(live(target), LIVE);
    assert.equal(recreations(result).length, 0);
    assert.equal(result.output.includes(SECRET), false);
  });

  it('validates the candidate Caddyfile, not the live one (H7-OPS-RV-01)', () => {
    const target = host();
    writeFileSync(join(target.app, 'Caddyfile'), MALFORMED_CADDY);
    const result = deploy(target);

    assert.equal(result.status, 0, result.output);
    assert.deepEqual(live(target), CANDIDATE);
  });

  for (const [what, fail, failCode] of [
    ['the candidate Compose does not validate', 'config --quiet', 1],
    ['the candidate Caddyfile cannot be checked', 'caddy validate', 1],
    ['the image cannot be pulled', 'pull api worker', 1],
    ['the database cannot start', 'up -d --no-recreate postgres', 1],
    ['the backup fails', 'pg_dump', 1],
    ['the backup is unreadable', 'pg_restore', 1],
    ['the preflight blocks', 'migration-preflight-cli', 2],
    ['the migration fails', 'migrate deploy', 1],
    ['the role reconcile fails', 'database-roles-cli.js reconcile', 2],
  ]) {
    it(`keeps the live release and containers when ${what}`, () => {
      const target = host();
      const result = deploy(target, { fail, failCode });

      assert.notEqual(result.status, 0);
      assert.deepEqual(live(target), LIVE);
      assert.equal(recreations(result).length, 0, result.calls.join('\n'));
      assert.equal(existsSync(join(attemptDir(target), 'replaced')), false);
      assert.equal(marker(target), null);
      assert.equal(result.output.includes(SECRET), false);
    });
  }

  for (const [what, mvFail] of [
    ['the first rename (docker-compose.prod.yml)', '.docker-compose.prod.yml.promote'],
    ['the second rename (Caddyfile)', '.Caddyfile.promote'],
    ['the rename of releases/current-image', '.current-image.promote'],
  ]) {
    it(`restores the whole previous release state when ${what} fails, recreates nothing and verifies the running release (H7-OPS-RV-02, RV-04)`, () => {
      const target = host();
      const result = deploy(target, { mvFail });

      assert.equal(result.status, 1, result.output);
      assert.deepEqual(live(target), LIVE);
      assert.equal(recreations(result).length, 0, result.calls.join('\n'));
      assert.match(result.output, /previous release state restored/);
      assert.match(result.output, /RESULT: release [0-9a-f]{40} \(attempt 40177719652-2\) FAILED/);
      assert.ok(
        result.calls.some((call) => PROBE(0).test(call)),
        'the running release was not checked',
      );
      assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
      assert.match(result.output, /No migration was rolled back/);
      assert.equal(marker(target), null);
      assert.equal(result.output.includes(SECRET), false);
    });
  }

  it('restores the previous release state, returns the containers to the previous image and verifies them when the recreation fails (H7-OPS-RV-02, RV-04)', () => {
    const target = host();
    const result = deploy(target, { fail: '--force-recreate', once: true });

    assert.equal(result.status, 1, result.output);
    assert.deepEqual(live(target), LIVE);
    const recreate = result.calls
      .map((call, index) => [call, index])
      .filter(([call]) => call.includes('--force-recreate'));
    assert.equal(recreate.length, 2, result.calls.join('\n'));
    assert.match(recreate[1][0], / up -d --force-recreate api worker caddy$/);
    assert.match(
      result.environments[recreate[1][1]],
      new RegExp(`API_IMAGE=${PREVIOUS_IMAGE} CADDYFILE_PATH=\\S*/app/Caddyfile$`),
    );
    assert.match(result.output, /FAILED while recreating api, worker and caddy/);
    assert.match(result.output, /containers returned to the previous image/);
    assert.ok(result.calls.slice(recreate[1][1]).some((call) => PROBE(1).test(call)));
    assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
    assert.match(result.output, /No migration was rolled back.*slm-pre-migrate-/s);
    assert.equal(result.output.includes(SECRET), false);
  });

  it('reports a recovery step that fails, with the previous release state still restored (H7-OPS-RV-02)', () => {
    const target = host();
    const result = deploy(target, { fail: '--force-recreate' });

    assert.equal(result.status, 1, result.output);
    assert.deepEqual(live(target), LIVE);
    assert.match(result.output, /containers NOT returned/);
    assert.match(result.output, /RECOVERY: FAILED/);
    assert.equal(result.output.includes(SECRET), false);
  });

  it('on a first deploy, a failed recreation leaves no live release and does not guess an image (H7-OPS-RV-02)', () => {
    const target = host({ fresh: true });
    const result = deploy(target, { fail: '--force-recreate', once: true });

    assert.equal(result.status, 1, result.output);
    assert.deepEqual(live(target), { compose: null, caddy: null, image: null });
    assert.equal(recreations(result).length, 1, result.calls.join('\n'));
    assert.match(result.output, /not attempted/);
    assert.match(result.output, /RECOVERY: not possible/);
  });

  it('takes the previous image from the api container, running or stopped, when releases/current-image is absent (H7-OPS-RV-02)', () => {
    const target = host();
    rmSync(join(target.app, 'releases', 'current-image'));
    const result = deploy(target, { fail: '--force-recreate', once: true, runningImage: PREVIOUS_IMAGE });

    assert.equal(result.status, 1, result.output);
    assert.deepEqual(live(target), { ...LIVE, image: null });
    const back = result.calls.findLastIndex((call) => call.includes('--force-recreate'));
    assert.match(result.environments[back], new RegExp(`API_IMAGE=${PREVIOUS_IMAGE} `));
  });

  describe('readiness after the recreation (H7-OPS-RV-04)', () => {
    for (const [what, badNew, reason] of [
      ['the API never answers ready', 'api:notready', /api: .*did not answer 2xx/],
      ['the API runs another image', 'api:image', /api: runs ghcr\.io\/example\/slm-api:b{40}/],
      ['the worker crash-loops', 'worker:crashloop', /worker: restarted/],
      ['the worker keeps restarting', 'worker:restarting', /worker: restarting/],
      ['Caddy exited', 'caddy:exited', /caddy: exited/],
      ['Caddy mounts another Caddyfile than the promoted one', 'caddy:stale', /caddy: .*not the live Caddyfile/],
      ['another deployment replaced the API container', 'api:replaced', /api: replaced/],
      ['the worker container is missing', 'worker:missing', /worker: no container/],
      ['there are two API containers', 'api:twice', /api: 2 containers/],
    ]) {
      it(`fails the release, restores the previous one and verifies it when ${what}`, () => {
        const target = host();
        const result = deploy(target, { badNew });

        assert.equal(result.status, 1, result.output);
        assert.match(result.output, reason);
        assert.match(
          result.output,
          /RESULT: release [0-9a-f]{40} \(attempt 40177719652-2\) FAILED while checking that api, worker and caddy are ready/,
        );
        assert.deepEqual(live(target), LIVE);
        assert.equal(marker(target), null);
        assert.equal(recreations(result).length, 2, result.calls.join('\n'));
        assert.match(
          result.environments[result.calls.findLastIndex((call) => call.includes('--force-recreate'))],
          new RegExp(`API_IMAGE=${PREVIOUS_IMAGE} `),
        );
        assert.ok(
          result.calls.some((call) => PROBE(2).test(call)),
          'the restored release was not checked',
        );
        assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
        assert.doesNotMatch(result.output, /is live and ready/);
        assert.equal(result.output.includes(SECRET), false);
      });
    }

    it('reports a failed recovery when the restored release is not ready either, and still exits non-zero', () => {
      const target = host();
      const result = deploy(target, { badNew: 'api:notready', badOld: 'api:notready' });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /RESULT: release [0-9a-f]{40} \(attempt 40177719652-2\) FAILED/);
      assert.match(
        result.output,
        /RECOVERY: FAILED .*the previous release ghcr\.io\/example\/slm-api:a{40} is not ready/,
      );
      assert.deepEqual(live(target), LIVE);
      assert.equal(result.output.includes(SECRET), false);
    });

    it('polls until the release answers ready within the deadline', () => {
      const target = host();
      const result = deploy(target, { badNew: 'api:slowstart', extra: ['--ready-timeout', '120'] });

      assert.equal(result.status, 0, result.output);
      assert.ok(result.calls.filter((call) => PROBE(1).test(call)).length >= 3, 'one look is not polling');
      assert.equal(marker(target), markerOf(ATTEMPT));
    });

    it('stops at the deadline, never waits forever', () => {
      const target = host();
      const result = deploy(target, {
        badNew: 'api:notready',
        extra: ['--ready-timeout', '3', '--poll-interval', '0.2'],
      });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /release [0-9a-f]{40} is not ready after 3 s/);
      // The deadline, the recovery's own bounded check and process start-up on a slow machine; never unbounded.
      assert.ok(result.seconds < 180, `took ${result.seconds} s`);
    });

    it('restores the previous release when the success marker cannot be recorded (H7-OPS-RV-05)', () => {
      const target = host();
      const result = deploy(target, { mvFail: '.current-attempt.promote' });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /FAILED while recording releases\/current-attempt/);
      assert.deepEqual(live(target), LIVE);
      assert.equal(marker(target), null);
      assert.equal(recreations(result).length, 2, result.calls.join('\n'));
      assert.match(result.output, /RECOVERY: the previous release .* is ready/);
    });

    it('refuses windows that are not bounded numbers before any docker call', () => {
      const target = host();
      for (const extra of [
        ['--ready-timeout', '0'],
        ['--ready-timeout', 'forever'],
        ['--ready-timeout', '100000'],
        ['--stability-window', '-1'],
        ['--stability-window', '601'],
        ['--poll-interval', '31'],
        ['--poll-interval', '1e3'],
      ]) {
        const result = deploy(target, { extra });
        assert.equal(result.status, 2, `${extra.join(' ')}: ${result.output}`);
        assert.deepEqual(result.calls, []);
      }
    });
  });

  // P04-CPE-04 (spec L.12). The judgement itself is a stand-in here (the fake docker compares the rows of its database with
  // the labels it was given); ops:preflight --recovery-target is unit-tested in recovery-target.policy.spec.ts. What these cases
  // prove is the script: when it judges, with what, as whom, and what it does with each verdict — not that a real image
  // reads a real row.
  describe('the way back (P04-CPE-04)', () => {
    const JUDGE = / migrate node dist\/migration-preflight-cli\.js --recovery-target /;
    const INSPECT = new RegExp(
      `^image inspect --format \\{\\{json \\.Config\\.Labels\\}\\} ${PREVIOUS_IMAGE.replace(/[.]/g, '\\.')}$`,
    );
    const STOP = / stop api worker$/;
    const all = (result, pattern) => result.calls.flatMap((call, index) => (pattern.test(call) ? [index] : []));

    it('judges the previous image against the database before migrate deploy, from the candidate as the deploy role', () => {
      const target = host();
      const result = deploy(target);

      assert.equal(result.status, 0, result.output);
      const order = [
        step(result, / migrate node dist\/migration-preflight-cli\.js$/),
        step(result, INSPECT),
        step(result, JUDGE),
        step(result, / migrate node node_modules\/prisma\/build\/index\.js migrate deploy$/),
      ];
      assert.ok(
        order.every((index) => index >= 0),
        result.calls.join('\n'),
      );
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
      );
      const judge = order[2];
      // The previous image has no label (built before it): its labels are `null`.
      assert.match(result.calls[judge], /--recovery-target null$/);
      assert.match(
        result.calls[judge],
        new RegExp(`-f \\S*releases/${RELEASE}/docker-compose\\.prod\\.yml run --rm --no-deps`),
      );
      assert.match(result.environments[judge], new RegExp(`API_IMAGE=${IMAGE} `));
      assert.match(result.output, /a{40} reads every row this database holds: it is the way back of this deployment/);
      assert.deepEqual(all(result, STOP), []);
      assert.equal(result.output.includes(SECRET), false);
    });

    it('stops the failed release, judges again and brings the previous image back when nothing it cannot read was written', () => {
      const target = host();
      const result = deploy(target, { badNew: 'api:notready' });

      assert.equal(result.status, 1, result.output);
      const judges = all(result, JUDGE);
      const stop = step(result, STOP);
      const back = result.calls.findLastIndex((call) => call.includes('--force-recreate'));
      assert.equal(judges.length, 2, result.calls.join('\n'));
      assert.ok(stop > 0 && stop < judges[1] && judges[1] < back, result.calls.join('\n'));
      // Both run from the candidate: its Compose file, its image (the previous image has no --recovery-target to run).
      for (const index of [stop, judges[1]]) {
        assert.match(result.calls[index], new RegExp(`-f \\S*releases/${RELEASE}/docker-compose\\.prod\\.yml `));
        assert.match(
          result.environments[index],
          new RegExp(`API_IMAGE=${IMAGE} CADDYFILE_PATH=\\S*/app/releases/${RELEASE}/Caddyfile$`),
        );
      }
      assert.match(result.environments[back], new RegExp(`API_IMAGE=${PREVIOUS_IMAGE} `));
      assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
    });

    it('zero rows before the deploy, one written by the release before its readiness fails: the previous image is NOT brought back', () => {
      const target = host();
      const result = deploy(target, { badNew: 'worker:crashloop', candidateWrites: true });

      assert.equal(result.status, 1, result.output);
      // Before migrate deploy the previous image was a way back: the database held no row it cannot read.
      assert.match(result.output, /is the way back of this deployment until this release writes one it cannot read/);
      assert.match(result.output, /RESULT: release [0-9a-f]{40} \(attempt 40177719652-2\) FAILED while checking/);
      assert.match(
        result.output,
        /RECOVERY: REFUSED — ghcr\.io\/example\/slm-api:a{40} cannot read rows release [0-9a-f]{40} wrote/,
      );
      assert.ok(step(result, STOP) < all(result, JUDGE).at(-1), result.calls.join('\n'));
      // Only the release itself was created; the previous image was not recreated nor checked, and nothing says ready.
      assert.equal(recreations(result).length, 1, result.calls.join('\n'));
      assert.equal(step(result, PROBE(2)), -1);
      assert.doesNotMatch(
        result.output,
        /RECOVERY: the previous release|containers returned to the previous image|is live and ready/,
      );
      // The release state names the previous release again; the failed one is stopped, never marked.
      assert.deepEqual(live(target), LIVE);
      assert.equal(marker(target), null);
      assert.ok(existsSync(join(target.state, 'stopped-1')));
      assert.match(result.output, /No migration was rolled back/);
      assert.equal(result.output.includes(SECRET), false);
    });

    it('covers a row the release writes up to the recovery: it is stopped before the way back is judged', () => {
      const target = host();
      // The release keeps writing while it runs: a judgement made before it stops would miss the row written after it.
      const result = deploy(target, { badNew: 'api:notready', writeDuringJudge: true });

      assert.equal(result.status, 1, result.output);
      assert.equal(existsSync(join(target.state, 'write-after-judge')), false, 'a row was written after the verdict');
      assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
    });

    it('brings back a previous image that declares the representation, rows or not (a later deployment over the final release)', () => {
      const target = host();
      const result = deploy(target, { badNew: 'worker:crashloop', candidateWrites: true, labelsOld: FINAL_LABELS });

      assert.equal(result.status, 1, result.output);
      assert.match(result.calls[all(result, JUDGE).at(-1)], /access-request-null-cost-center/);
      assert.equal(recreations(result).length, 2, result.calls.join('\n'));
      assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
    });

    it('stops before migrate deploy when the previous image is not on the host: its way back would be unknown', () => {
      const target = host();
      const result = deploy(target, { absentImage: PREVIOUS_IMAGE });

      assert.equal(result.status, 1, result.output);
      assert.match(
        result.output,
        /cannot be inspected on this host \(not pulled here\?\), so what it reads is unknown: 'docker pull ghcr\.io\/example\/slm-api:a{40}'/,
      );
      assert.match(result.output, /nothing was migrated/);
      assert.equal(step(result, /migrate deploy$/), -1);
      assert.equal(step(result, JUDGE), -1);
      assert.deepEqual(live(target), LIVE);
      assert.equal(recreations(result).length, 0);
    });

    it('stops before migrate deploy when an old release state names an image but the database has no migration history (reset)', () => {
      const target = host();
      const result = deploy(target, { noHistory: true });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /this database has no migration history: no release ever ran on it/);
      assert.match(result.output, /runbook: fresh installation/);
      assert.equal(step(result, /migrate deploy$/), -1);
      assert.deepEqual(live(target), LIVE);
      assert.equal(recreations(result).length, 0);
      assert.equal(marker(target), null);
    });

    it('still deploys a fixed release when the previous image already cannot read the database, and says it is no way back', () => {
      const target = host();
      const result = deploy(target, { nullRows: 1 });

      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /cannot read rows this database already holds .* will NOT be brought back/);
      assert.deepEqual(live(target), CANDIDATE);
      assert.equal(marker(target), markerOf(ATTEMPT));
    });

    it('refuses the recovery when the way back can no longer be judged, or the failed release cannot be stopped', () => {
      for (const [options, reason] of [
        [
          { badNew: 'api:notready', judgeFailsAfterRecreate: true },
          /RECOVERY: REFUSED — the way back could not be judged \(exit 1\)/,
        ],
        [
          { badNew: 'api:notready', fail: 'stop api worker' },
          /RECOVERY: REFUSED — api and worker of the failed release could not be stopped/,
        ],
      ]) {
        const target = host();
        const result = deploy(target, options);

        assert.equal(result.status, 1, result.output);
        assert.match(result.output, reason);
        assert.equal(recreations(result).length, 1, result.calls.join('\n'));
        assert.doesNotMatch(result.output, /RECOVERY: the previous release/);
        assert.deepEqual(live(target), LIVE);
      }
    });

    it('on a host that never ran a release judges no way back, and a failure stays a failed installation', () => {
      const target = host({ fresh: true });
      const failed = deploy(target, { badNew: 'api:notready' });

      assert.equal(failed.status, 1, failed.output);
      assert.match(failed.output, /No previous release on this host/);
      assert.equal(step(failed, JUDGE), -1);
      assert.equal(step(failed, /^image inspect /), -1);
      assert.match(failed.output, /RECOVERY: not possible/);
      assert.equal(recreations(failed).length, 1);
      assert.deepEqual(live(target), { compose: null, caddy: null, image: null });
      assert.equal(marker(target), null);
    });
  });

  describe('rollback evidence per attempt (H7-OPS-RV-05)', () => {
    it('keeps every attempt of the same commit apart and points the marker at the attempt that made the release live', () => {
      const target = host();
      // Attempt 1 fails after the promotion and is recovered; attempt 2 succeeds.
      const first = deploy(target, { attempt: '40177719652-1', badNew: 'api:notready' });
      assert.equal(first.status, 1, first.output);
      assert.deepEqual(replaced(target, '40177719652-1'), LIVE);
      const firstEvidence = tree(attemptDir(target, '40177719652-1'));

      const second = deploy(target, { attempt: '40177719652-2' });
      assert.equal(second.status, 0, second.output);
      assert.deepEqual(live(target), CANDIDATE);
      assert.deepEqual(replaced(target, '40177719652-2'), LIVE);
      assert.equal(marker(target), markerOf('40177719652-2'));
      assert.deepEqual(tree(attemptDir(target, '40177719652-1')), firstEvidence);
      assert.equal(existsSync(join(target.release, 'replaced')), false);

      // Rollback as the runbook says: the attempt named by releases/current-attempt, its replaced/ only.
      const backup = join(target.app, marker(target).trim(), 'replaced');
      const secondEvidence = tree(attemptDir(target, '40177719652-2'));
      for (const [kept, livePath] of [
        ['docker-compose.prod.yml', 'docker-compose.prod.yml'],
        ['Caddyfile', 'Caddyfile'],
        ['current-image', 'releases/current-image'],
        ['current-attempt', 'releases/current-attempt'],
      ]) {
        if (existsSync(join(backup, kept))) writeFileSync(join(target.app, livePath), readFileSync(join(backup, kept)));
        else rmSync(join(target.app, livePath), { force: true });
      }
      assert.deepEqual(live(target), LIVE);
      assert.equal(marker(target), null);
      assert.deepEqual(tree(attemptDir(target, '40177719652-1')), firstEvidence);
      assert.deepEqual(tree(attemptDir(target, '40177719652-2')), secondEvidence);
    });

    it('a new attempt of the release already live keeps the marker on the attempt that made it live', () => {
      const target = host();
      assert.equal(deploy(target, { attempt: 'run-1' }).status, 0);
      const firstEvidence = tree(attemptDir(target, 'run-1'));
      const again = deploy(target, { attempt: 'run-2' });

      assert.equal(again.status, 0, again.output);
      assert.equal(marker(target), markerOf('run-1'));
      assert.deepEqual(replaced(target, 'run-2'), CANDIDATE);
      assert.deepEqual(tree(attemptDir(target, 'run-1')), firstEvidence);
    });

    it('refuses an attempt id used before, before any docker call, and leaves that attempt byte-identical', () => {
      const target = host();
      assert.equal(deploy(target, { attempt: 'run-1' }).status, 0);
      const evidence = tree(attemptDir(target, 'run-1'));
      const state = { live: live(target), marker: marker(target) };
      const reused = deploy(target, { attempt: 'run-1' });

      assert.equal(reused.status, 2, reused.output);
      assert.match(reused.output, /attempt run-1 .*already exists/);
      assert.deepEqual(reused.calls, []);
      assert.deepEqual(tree(attemptDir(target, 'run-1')), evidence);
      assert.deepEqual({ live: live(target), marker: marker(target) }, state);
    });

    it('refuses a missing or unsafe attempt id before any docker call', () => {
      const target = host();
      for (const attempt of [null, '', 'latest', 'current', '../x', 'a/b', '.hidden', '-x', 'x'.repeat(65), 'a b']) {
        const result = deploy(target, { attempt });
        assert.equal(result.status, 2, `${attempt}: ${result.output}`);
        assert.deepEqual(result.calls, []);
      }
      assert.equal(existsSync(join(target.release, 'attempts', 'latest')), false);
    });
  });

  describe('first H7 rollout (H7-OPS-RV-06)', () => {
    const FIRST = ['--first-rollout-env', '.env.pre-h7'];
    const firstRollout = { extra: FIRST, oldNeedsPreH7: true, gen0Stopped: true };
    /** No file under releases/ carries an environment value. */
    const releasesAreClean = (target) => {
      for (const [path, bytes] of Object.entries(tree(join(target.app, 'releases')))) {
        const text = Buffer.from(bytes, 'base64').toString('utf8');
        assert.equal(text.includes(SECRET) || text.includes('ENV_GENERATION'), false, path);
      }
    };

    it('restores the old .env before it recreates the old image, which then becomes ready', () => {
      const target = host({ preH7: true });
      const result = deploy(target, { ...firstRollout, badNew: 'api:notready' });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /RESULT: release [0-9a-f]{40} \(attempt 40177719652-2\) FAILED/);
      assert.match(result.output, /\.env restored from \.env\.pre-h7/);
      assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
      assert.deepEqual(live(target), { ...LIVE, image: null });
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), PRE_H7_ENV);
      // The environment of H7 is kept beside it for the next attempt, never under releases/.
      assert.equal(readFileSync(join(target.app, `.env.h7-${ATTEMPT}`), 'utf8'), H7_ENV);
      assert.equal(readFileSync(join(target.app, '.env.pre-h7'), 'utf8'), PRE_H7_ENV);
      assert.equal(readFileSync(join(target.state, 'env-2'), 'utf8').trim(), 'pre-h7');
      if (process.platform !== 'win32') {
        assert.equal(statSync(join(target.app, '.env')).mode & 0o777, 0o600);
        assert.equal(statSync(join(target.app, `.env.h7-${ATTEMPT}`)).mode & 0o777, 0o600);
      }
      releasesAreClean(target);
      assert.equal(result.output.includes(SECRET), false);
      assert.doesNotMatch(result.output, /ENV_GENERATION/);
    });

    it('without the option, the old image meets the new .env and the recovery is reported as failed', () => {
      const target = host({ preH7: true });
      const result = deploy(target, { oldNeedsPreH7: true, gen0Stopped: true, badNew: 'api:notready' });

      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /RECOVERY: FAILED/);
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), H7_ENV);
    });

    it('restores the old .env and starts the old wiring when a rename fails during the promotion', () => {
      const target = host({ preH7: true });
      const result = deploy(target, { ...firstRollout, mvFail: '.Caddyfile.promote' });

      assert.equal(result.status, 1, result.output);
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), PRE_H7_ENV);
      assert.equal(recreations(result).length, 1, result.calls.join('\n'));
      assert.match(
        result.environments[result.calls.findIndex((call) => call.includes('--force-recreate'))],
        new RegExp(`API_IMAGE=${PREVIOUS_IMAGE} `),
      );
      assert.match(result.output, /RECOVERY: the previous release .* is ready/);
    });

    it('a successful first rollout keeps the new .env and .env.app', () => {
      const target = host({ preH7: true });
      const result = deploy(target, firstRollout);

      assert.equal(result.status, 0, result.output);
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), H7_ENV);
      assert.ok(existsSync(join(target.app, '.env.app')));
      assert.equal(existsSync(join(target.app, `.env.h7-${ATTEMPT}`)), false);
      assert.deepEqual(live(target), CANDIDATE);
      releasesAreClean(target);
    });

    it('a failure before the promotion leaves .env alone and points at the manual path', () => {
      const target = host({ preH7: true });
      const result = deploy(target, { ...firstRollout, fail: 'migrate deploy' });

      assert.equal(result.status, 1, result.output);
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), H7_ENV);
      assert.equal(recreations(result).length, 0);
      assert.match(result.output, /before the promotion.*\.env was not restored/s);
    });

    it('refuses an unsafe rollback source, or a host that already runs a release of this script, before any docker call', () => {
      const target = host({ preH7: true });
      const outside = join(target.root, 'outside.env');
      writeFileSync(outside, PRE_H7_ENV);
      mkdirSync(join(target.app, 'sub'));
      writeFileSync(join(target.app, 'sub', '.env.pre-h7'), PRE_H7_ENV);
      const sources = [
        '.env.missing',
        setup.bash.path(outside),
        'sub/.env.pre-h7',
        './.env.pre-h7',
        '.env',
        '.env.app',
        'releases',
      ];
      try {
        symlinkSync(join(target.app, '.env.pre-h7'), join(target.app, '.env.link'));
        sources.push('.env.link');
      } catch {
        // No symbolic link without privileges on Windows; the Linux run of the same test covers it.
      }
      for (const source of sources) {
        const result = deploy(target, { extra: ['--first-rollout-env', source] });
        assert.equal(result.status, 2, `${source}: ${result.output}`);
        assert.deepEqual(result.calls, []);
      }
      writeFileSync(join(target.app, 'releases', 'current-image'), LIVE.image);
      const later = deploy(target, { extra: FIRST });
      assert.equal(later.status, 2, later.output);
      assert.match(later.output, /first H7 rollout only/);
      assert.deepEqual(later.calls, []);
      assert.equal(existsSync(join(target.release, 'attempts')), false);
      assert.equal(readFileSync(join(target.app, '.env'), 'utf8'), H7_ENV);
    });
  });

  describe('every process of a run has ended before the test goes on (H7-TEST-RV-08)', () => {
    it('a deployment that returned left no process of its run running, even one in a process group of its own', () => {
      const target = host();
      // Left behind by the recreation, near the end of the run: it outlives the script by about two seconds.
      const result = deploy(target, { linger: '--force-recreate' });

      assert.equal(result.status, 0, result.output);
      assert.ok(existsSync(join(target.root, 'lingered.started')), 'the lingering process did not start');
      assert.ok(existsSync(join(target.root, 'lingered')), 'deploy() returned while a process of the run still ran');
    });

    it('a run started without waiting is finished only once every process it started has ended', async () => {
      const target = host();
      const run = start(target, { linger: '--force-recreate' });
      const result = await finish(run);

      assert.equal(result.status, 0, result.output);
      assert.ok(existsSync(join(target.root, 'lingered.started')), 'the lingering process did not start');
      assert.ok(existsSync(join(target.root, 'lingered')), 'finish() resolved while a process of the run still ran');
    });
  });

  describe('one deployment at a time on the host (H7-OPS-RV-07)', () => {
    /** A refusal comes at once; a contender still running after this has waited instead of refusing. */
    const PROMPTLY = 60_000;
    const TIMEOUT = { timeout: 900_000 };
    const lockOf = (target) => join(target.app, 'releases', '.deploy.lock');
    /** Everything a refused run must leave as it was: every file under releases/, the live release, both env files. */
    const hostState = (target) => ({
      releases: tree(join(target.app, 'releases')),
      live: live(target),
      env: optional(join(target.app, '.env')),
      appEnv: optional(join(target.app, '.env.app')),
    });

    /**
     * Starts a deployment of another release and attempt in the directory where `holder` waits at its barrier, past the
     * lock: it must exit 2 at once, before any docker call, claim no attempt and change nothing on the host.
     */
    async function assertRefused(target, holder, holderAttempt) {
      const before = hostState(target);
      const contender = await finish(start(target, { release: OTHER_SHA, attempt: 'contender-1' }), PROMPTLY);

      assert.equal(contender.timedOut, false, `the contender waited instead of refusing:\n${contender.output}`);
      assert.equal(contender.status, 2, contender.output);
      assert.deepEqual(contender.calls, []);
      assert.match(contender.output, /another deployment holds the deployment lock/);
      // The holder as it recorded itself (release and attempt, nothing secret).
      assert.match(contender.output, new RegExp(`release ${RELEASE} attempt ${holderAttempt}`));
      assert.equal(existsSync(join(target.app, 'releases', OTHER_SHA, 'attempts')), false);
      assert.deepEqual(hostState(target), before);
      assert.equal(holder.child.exitCode, null, 'the holder is still inside the script');
      assert.equal(contender.output.includes(SECRET), false);
    }

    it(
      'refuses a second deployment at once while the first holds the lock, and lets the next one take it after',
      TIMEOUT,
      async () => {
        const target = host();
        addCandidate(target, OTHER_SHA);
        // Paused at its first docker call: past the lock and the attempt claim, before anything is changed.
        const holder = start(target, { attempt: 'holder-1', pause: 'config --quiet' });
        await paused(holder);
        await assertRefused(target, holder, 'holder-1');

        resume(holder);
        const first = await finish(holder);
        assert.equal(first.status, 0, first.output);
        assert.equal(marker(target), markerOf('holder-1'));

        // Released when the first ended: the next deployment takes the same lock and runs to the end.
        const next = deploy(target, { release: OTHER_SHA, attempt: 'successor-1' });
        assert.equal(next.status, 0, next.output);
        assert.ok(next.calls.some((call) => / up -d --force-recreate api worker caddy$/.test(call)));
        assert.equal(live(target).image, `${OTHER_IMAGE}\n`);
        assert.equal(marker(target), `releases/${OTHER_SHA}/attempts/successor-1\n`);
        // The lock file stays behind, naming its last holder, and carries no credential.
        const record = readFileSync(lockOf(target), 'utf8');
        assert.match(record, new RegExp(`release ${OTHER_SHA} attempt successor-1`));
        assert.equal(record.includes(SECRET) || record.includes('ENV_GENERATION'), false);
      },
    );

    for (const [where, options, status] of [
      ['the readiness check', { pause: 'exec fake-api-1 node -e' }, 0],
      ['the record of the success marker', { mvPause: '.current-attempt.promote' }, 0],
      ['the recovery of the previous release', { badNew: 'api:notready', pause: 'exec fake-api-2 node -e' }, 1],
    ]) {
      it(`holds the lock through ${where}`, TIMEOUT, async () => {
        const target = host();
        addCandidate(target, OTHER_SHA);
        const holder = start(target, { attempt: 'holder-1', ...options });
        await paused(holder);
        await assertRefused(target, holder, 'holder-1');

        resume(holder);
        const result = await finish(holder);
        assert.equal(result.status, status, result.output);
        if (status === 0) assert.equal(marker(target), markerOf('holder-1'));
        else assert.match(result.output, /RECOVERY: the previous release ghcr\.io\/example\/slm-api:a{40} is ready/);
      });
    }

    it('a deployment ended by force leaves the lock to the next one, with no cleanup step', TIMEOUT, async () => {
      const target = host();
      addCandidate(target, OTHER_SHA);
      const holder = start(target, { attempt: 'holder-1', pause: 'config --quiet' });
      await paused(holder);
      await assertRefused(target, holder, 'holder-1');

      // Its exact process tree (the script and the fake docker waiting in it), as a kill or a lost SSH session would.
      endTree(holder);
      const ended = await finish(holder);
      assert.notEqual(ended.status, 0, ended.output);
      assert.deepEqual(live(target), LIVE);
      const lockFile = statSync(lockOf(target), { bigint: true });

      const next = deploy(target, { release: OTHER_SHA, attempt: 'after-kill-1' });
      assert.equal(next.status, 0, next.output);
      assert.equal(marker(target), `releases/${OTHER_SHA}/attempts/after-kill-1\n`);
      // The same file, never deleted or replaced: the kernel released the lock, nobody cleaned it up.
      assert.equal(statSync(lockOf(target), { bigint: true }).ino, lockFile.ino);
    });

    it('deployments of two application directories do not wait for each other', TIMEOUT, async () => {
      const first = host();
      addCandidate(first, OTHER_SHA);
      const holder = start(first, { attempt: 'holder-1', pause: 'config --quiet' });
      await paused(holder);
      await assertRefused(first, holder, 'holder-1');

      const second = host();
      const elsewhere = deploy(second, { attempt: 'elsewhere-1' });
      assert.equal(elsewhere.status, 0, elsewhere.output);
      assert.equal(marker(second), markerOf('elsewhere-1'));
      assert.ok(existsSync(join(holder.barrier, 'paused')) && !existsSync(join(holder.barrier, 'go')));

      resume(holder);
      const result = await finish(holder);
      assert.equal(result.status, 0, result.output);
    });

    it('refuses with exit 2 before any docker call when no flock exists or the lock file cannot be opened as one', () => {
      const bare = host({ noFlock: true });
      const missing = deploy(bare);
      assert.equal(missing.status, 2, missing.output);
      assert.match(missing.output, /flock/);
      assert.deepEqual(missing.calls, []);
      assert.equal(existsSync(lockOf(bare)), false);
      assert.equal(existsSync(join(bare.release, 'attempts')), false);
      assert.deepEqual(live(bare), LIVE);

      const target = host();
      mkdirSync(lockOf(target));
      const directory = deploy(target);
      assert.equal(directory.status, 2, directory.output);
      assert.deepEqual(directory.calls, []);
      assert.equal(existsSync(join(target.release, 'attempts')), false);
      assert.deepEqual(live(target), LIVE);

      rmSync(lockOf(target), { recursive: true });
      const elsewhere = join(target.root, 'elsewhere');
      writeFileSync(elsewhere, 'untouched\n');
      try {
        symlinkSync(elsewhere, lockOf(target));
      } catch {
        // No symbolic link without privileges on Windows; the Linux run of the same test covers it.
        return;
      }
      const link = deploy(target);
      assert.equal(link.status, 2, link.output);
      assert.deepEqual(link.calls, []);
      assert.equal(readFileSync(elsewhere, 'utf8'), 'untouched\n');
      assert.equal(existsSync(join(target.release, 'attempts')), false);
    });
  });

  it('removes no image and no orphan container (H7-OPS-RV-03)', () => {
    const target = host();
    for (const result of [
      deploy(target),
      deploy(host(), { fail: '--force-recreate', once: true }),
      deploy(host(), { badNew: 'api:notready' }),
    ]) {
      for (const call of result.calls) {
        assert.doesNotMatch(call, /\bprune\b|--remove-orphans|^(?:rm|rmi|image rm|container rm|volume rm)\b/, call);
      }
    }
  });

  it('stops before any docker call without .env.app, or with a database variable in it', () => {
    for (const appEnv of [
      null,
      `AUTH_ACCESS_TOKEN_SECRET=${SECRET}\nPOSTGRES_PASSWORD=${SECRET}\n`,
      'export PGPASSWORD=x\n',
    ]) {
      const target = host({ appEnv });
      const result = deploy(target);

      assert.equal(result.status, 1);
      assert.deepEqual(result.calls, []);
      assert.deepEqual(live(target), LIVE);
      assert.equal(result.output.includes(SECRET), false);
    }
  });

  it('refuses a moving tag, another commit, a relative directory or a missing candidate before any docker call', () => {
    const target = host();
    const { bash } = setup;
    for (const args of [
      [
        '--app-dir',
        bash.path(target.app),
        '--release',
        RELEASE,
        '--image',
        'ghcr.io/example/slm-api:latest',
        '--attempt',
        'a1',
      ],
      [
        '--app-dir',
        bash.path(target.app),
        '--release',
        RELEASE,
        '--image',
        `ghcr.io/example/slm-api:${'f'.repeat(40)}`,
        '--attempt',
        'a1',
      ],
      ['--app-dir', 'app', '--release', RELEASE, '--image', IMAGE, '--attempt', 'a1'],
      [
        '--app-dir',
        bash.path(target.app),
        '--release',
        'main',
        '--image',
        'ghcr.io/example/slm-api:main',
        '--attempt',
        'a1',
      ],
    ]) {
      const result = deploy(target, { args });
      assert.equal(result.status, 2, result.output);
      assert.deepEqual(result.calls, []);
    }
    rmSync(join(target.release, 'Caddyfile'));
    assert.equal(deploy(target).status, 1);
    assert.deepEqual(live(target), LIVE);
  });
});
