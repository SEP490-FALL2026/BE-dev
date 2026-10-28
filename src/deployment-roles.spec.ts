import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gate of H7 (F-15, DB-04, Q9; docs/guides/containers.md#postgresql-roles-h7): which PostgreSQL identity each production
 * process receives. The API and the worker get the runtime role only; preflight, migrate, reconcile and the backup get the
 * deploy role only; the cluster superuser reaches nothing but the one-off role provisioning. Read from the files that
 * ship, not from a description of them.
 */
const projectRoot = process.cwd();
const read = (path: string): string => readFileSync(join(projectRoot, path), 'utf8');

/**
 * The blocks of one top-level section of a YAML file (`services:` of Compose, `jobs:` of a workflow): name → its lines,
 * comments dropped (enough YAML for these files, no parser needed).
 */
function sectionBlocks(source: string, section: string): Map<string, string> {
  const blocks = new Map<string, string[]>();
  let inSection = false;
  let current: string[] | undefined;
  for (const line of source.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inSection = line.trim() === `${section}:`;
      current = undefined;
      continue;
    }
    if (!inSection || line.trim() === '' || line.trim().startsWith('#')) continue;
    const name = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (name) {
      current = [];
      blocks.set(name[1], current);
      continue;
    }
    current?.push(line);
  }
  return new Map([...blocks].map(([name, lines]) => [name, lines.join('\n')]));
}

/** The value of `key:` inside a service block (first match), trimmed of quotes. */
function setting(block: string, key: string): string | undefined {
  const match = new RegExp(`^\\s+${key}:\\s*(.+)$`, 'm').exec(block);
  return match?.[1].trim().replace(/^["']|["']$/g, '');
}

/** The items of a block list such as `env_file:` or `profiles:` (both `- a` lines and `[a, b]`). */
function list(block: string, key: string): string[] | undefined {
  const lines = block.split('\n');
  const index = lines.findIndex((line) => new RegExp(`^\\s+${key}:`).test(line));
  if (index === -1) return undefined;
  const inline = /\[(.*)\]/.exec(lines[index]);
  if (inline) return inline[1].split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''));
  const indent = /^(\s*)/.exec(lines[index])?.[1].length ?? 0;
  const items: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if ((/^(\s*)/.exec(line)?.[1].length ?? 0) <= indent) break;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item) items.push(item[1].trim().replace(/^["']|["']$/g, ''));
  }
  return items;
}

const compose = sectionBlocks(read('docker-compose.prod.yml'), 'services');
const service = (name: string): string => {
  const block = compose.get(name);
  if (block === undefined) throw new Error(`docker-compose.prod.yml has no service "${name}"`);
  return block;
};

const ADMIN_CREDENTIALS = /POSTGRES_USER|POSTGRES_PASSWORD|DATABASE_DEPLOY_|DATABASE_BOOTSTRAP_/;

describe('production PostgreSQL identities (H7: F-15, DB-04, Q9)', () => {
  it.each(['api', 'worker'])('gives %s the runtime role only, and none of the administration credentials', (name) => {
    const block = service(name);

    expect(setting(block, 'DATABASE_URL')).toBe(
      'postgresql://${DATABASE_RUNTIME_USER:-slm_runtime}:${DATABASE_RUNTIME_PASSWORD:?Set DATABASE_RUNTIME_PASSWORD in .env}@postgres:5432/${POSTGRES_DB:-software_license_management}',
    );
    expect(block).not.toMatch(ADMIN_CREDENTIALS);
    // The whole `.env` feeds Compose interpolation and holds the administration passwords: it never reaches the process.
    expect(list(block, 'env_file')).toEqual(['.env.app']);
  });

  it('runs preflight, migrate and reconcile as the deploy role, with nothing but the runtime role name', () => {
    const block = service('migrate');

    expect(list(block, 'profiles')).toEqual(['deploy']);
    expect(setting(block, 'image')).toBe(setting(service('api'), 'image'));
    expect(setting(block, 'DATABASE_URL')).toBe(
      'postgresql://${DATABASE_DEPLOY_USER:-slm_deploy}:${DATABASE_DEPLOY_PASSWORD:?Set DATABASE_DEPLOY_PASSWORD in .env}@postgres:5432/${POSTGRES_DB:-software_license_management}',
    );
    expect(setting(block, 'DATABASE_RUNTIME_ROLE')).toBe('${DATABASE_RUNTIME_USER:-slm_runtime}');
    expect(list(block, 'env_file')).toBeUndefined();
    expect(block).not.toMatch(/POSTGRES_USER|POSTGRES_PASSWORD|DATABASE_RUNTIME_PASSWORD|DATABASE_BOOTSTRAP_/);
  });

  it('dumps as the deploy role over TCP with the server image, never as the cluster superuser', () => {
    const block = service('backup');

    expect(list(block, 'profiles')).toEqual(['deploy']);
    expect(setting(block, 'image')).toBe(setting(service('postgres'), 'image'));
    expect(setting(block, 'PGHOST')).toBe('postgres');
    expect(setting(block, 'PGUSER')).toBe('${DATABASE_DEPLOY_USER:-slm_deploy}');
    expect(setting(block, 'PGPASSWORD')).toBe('${DATABASE_DEPLOY_PASSWORD:?Set DATABASE_DEPLOY_PASSWORD in .env}');
    expect(block).not.toMatch(/POSTGRES_USER|POSTGRES_PASSWORD|DATABASE_RUNTIME_/);
  });

  it('lets only the one-off provisioning reach the cluster superuser', () => {
    const block = service('db-admin');

    expect(list(block, 'profiles')).toEqual(['admin']);
    expect(setting(block, 'DATABASE_BOOTSTRAP_URL')).toBe(
      'postgresql://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}@postgres:5432/${POSTGRES_DB:-software_license_management}',
    );
    expect(list(block, 'command')).toEqual(['node', 'dist/database-roles-cli.js', 'provision']);
    expect(list(block, 'env_file')).toBeUndefined();
    const superuserReaders = [...compose].filter(([, text]) => /POSTGRES_PASSWORD/.test(text)).map(([name]) => name);
    expect(superuserReaders.sort()).toEqual(['db-admin', 'postgres']);
  });

  describe('deploy (workflow and scripts/ops/deploy-release.sh)', () => {
    const workflow = read('.github/workflows/deploy.yml');
    const hostScript = read('scripts/ops/deploy-release.sh');
    const jobs = sectionBlocks(workflow, 'jobs');
    const job = (name: string): string => {
      const block = jobs.get(name);
      if (block === undefined) throw new Error(`deploy.yml has no job "${name}"`);
      return block;
    };
    const position = (pattern: RegExp): number => {
      const match = pattern.exec(hostScript);
      if (!match) throw new Error(`deploy-release.sh does not contain ${String(pattern)}`);
      return match.index;
    };

    it('never runs a database step through the API service or as the cluster superuser', () => {
      for (const text of [workflow, hostScript]) {
        expect(text).not.toMatch(/run\b[^\n]*\bapi node/);
        expect(text).not.toMatch(/pg_dump[^\n]*POSTGRES_USER|exec -T postgres sh -c 'pg_dump/);
        // The cluster superuser is for one-off provisioning by hand (runbook), never a step of an automatic deploy.
        expect(text).not.toMatch(/\b(?:run|up|exec)\b[^\n]*\bdb-admin\b/);
        expect(text).not.toMatch(/database-roles-cli\.js provision/);
      }
    });

    it('checks the environment files and the candidate before it pulls, then backs up, preflights, migrates and reconciles, and promotes only before recreating', () => {
      const steps = [
        position(/\.env\.app/),
        position(/candidate config --quiet/),
        position(/candidate run --rm --no-deps -T caddy caddy validate/),
        position(/candidate pull api worker/),
        position(/candidate run --rm --no-deps -T backup pg_dump/),
        position(/migrate node dist\/migration-preflight-cli\.js/),
        position(/candidate run --rm --no-deps migrate node node_modules\/prisma\/build\/index\.js migrate deploy/),
        position(/candidate run --rm --no-deps migrate node dist\/database-roles-cli\.js reconcile/),
        position(/\|\| recover 'replacing docker-compose\.prod\.yml'/),
        position(/live up -d --force-recreate api worker caddy \|\| recover/),
        // H7-OPS-RV-04/05: a success only once the release is ready and stable, then the marker of the attempt.
        position(
          /check_release "\$API_IMAGE" "release \$RELEASE" \|\| recover 'checking that api, worker and caddy are ready'/,
        ),
        position(
          /mv -f "\$APP_DIR\/releases\/\.current-attempt\.promote" "\$CURRENT_ATTEMPT"[^\n]*\|\| recover 'recording releases\/current-attempt'/,
        ),
        position(/is live and ready/),
      ];

      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      expect(hostScript).toMatch(/^set -euo pipefail$/m);
      // No tracing: a traced command line could print a credential.
      expect(hostScript).not.toMatch(/^\s*set\s+(?:-[a-z]*x|-o\s+xtrace)/m);
    });

    it('checks readiness with bounded defaults that the workflow does not override (H7-OPS-RV-04)', () => {
      // Owner, 28/10/2026 (Prompt 04 section 9.10): the default is 300 s and the workflow still does not override it.
      expect(hostScript).toMatch(/^READY_TIMEOUT=300$/m);
      expect(hostScript).toMatch(/^STABILITY_WINDOW=20$/m);
      expect(hostScript).toMatch(/^POLL_INTERVAL=2$/m);
      // The one bounded attempt to return the containers to the previous image (H7-OPS-RV-02) keeps its 300 s.
      expect(hostScript).toMatch(
        /timeout 300 \\\r?\n\s+docker compose --project-directory "\$APP_DIR" -f "\$APP_DIR\/docker-compose\.prod\.yml" up -d --force-recreate api worker caddy/,
      );
      // The real readiness endpoint, 2xx only; no fixed sleep stands in for it.
      expect(hostScript).toMatch(/\/v1\/health\/ready/);
      expect(hostScript).toMatch(/r\.ok\?0:1/);
      expect(hostScript).not.toMatch(/sleep [1-9][0-9]/);
      expect(workflow).not.toMatch(/--ready-timeout|--stability-window|--poll-interval|--first-rollout-env/);
    });

    it('gives every deployment attempt its own rollback evidence and never rewrites an earlier one (H7-OPS-RV-05)', () => {
      const deploy = job('deploy');

      expect(deploy).toMatch(/^\s+ATTEMPT: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/m);
      expect(deploy).toMatch(/^\s+envs: CR_PAT,REGISTRY_USER,APP_DIR,RELEASE,IMAGE,ATTEMPT$/m);
      expect(deploy).toMatch(/--app-dir "\$APP_DIR" --release "\$RELEASE" --image "\$IMAGE" --attempt "\$ATTEMPT"/);
      // scp-action's `rm` would delete releases/<sha>/ — and every attempt in it — before the upload.
      expect(deploy).not.toMatch(/^\s+rm:/m);
      expect(hostScript).toMatch(/^ATTEMPT_DIR="\$RELEASE_DIR\/attempts\/\$ATTEMPT"$/m);
      expect(hostScript).toMatch(/^REPLACED="\$ATTEMPT_DIR\/replaced"$/m);
      // One mkdir that fails on an existing directory claims the attempt; nothing generic, nothing deleted there.
      expect(hostScript).toMatch(/\bmkdir "\$ATTEMPT_DIR"/);
      expect(hostScript).not.toMatch(/\$RELEASE_DIR\/replaced|releases\/\$RELEASE\/replaced/);
      expect(hostScript).not.toMatch(/rm [^\n]*\$(?:REPLACED|ATTEMPT_DIR)/);
    });

    it('serializes every deployment on the host with one lock, taken without waiting and held until the script exits (H7-OPS-RV-07)', () => {
      expect(hostScript).toMatch(/^LOCK_FILE="\$APP_DIR\/releases\/\.deploy\.lock"$/m);
      const open = position(/^\{ exec 9<> "\$LOCK_FILE"; \} 2> \/dev\/null \|\| refuse /m);
      const take = position(/^flock -n -E 3 9 \|\| LOCK_STATUS=\$\?$/m);
      expect(open).toBeLessThan(take);
      // Before any release-state read, environment check, attempt claim or Docker call.
      for (const later of [
        /^\[ -f "\$RELEASE_DIR\/docker-compose\.prod\.yml" \]/m,
        /\[ ! -e "\$CURRENT_IMAGE" \]/,
        /^\[ -f \.env \] \|\|/m,
        /^mkdir -p "\$RELEASE_DIR\/attempts"$/m,
        /^mkdir "\$ATTEMPT_DIR"/m,
        /candidate config --quiet/,
      ]) {
        expect(take).toBeLessThan(position(later));
      }
      // No wait: every flock call refuses at once on a held lock.
      const calls = hostScript.match(/^\s*flock\b[^\n]*$/gm) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toMatch(/^\s*flock -n\s/);
      expect(hostScript).not.toMatch(/\bflock\b[^\n]*(?:\s-w\s|--wait|--timeout)/);
      // Never released, closed or deleted by the script: the kernel releases it when the script and its commands end.
      expect(hostScript).not.toMatch(/\bflock\b[^\n]*(?:\s-u\b|--unlock)/);
      expect(hostScript).not.toMatch(/\b9\s*[<>]&-/);
      expect(hostScript).not.toMatch(/\brm\b[^\n]*(?:LOCK_FILE|deploy\.lock)/);
      // GitHub's concurrency still orders the workflow's own jobs; the host lock covers the runbook too.
      expect(job('deploy')).toMatch(
        /^\s+concurrency:\r?\n\s+group: production-deploy\r?\n\s+cancel-in-progress: false$/m,
      );
      const guide = read('docs/guides/containers.md');
      const start = guide.indexOf('## PostgreSQL roles (H7)');
      const runbook = guide.slice(start, guide.indexOf('\n## ', start + 1));
      expect(runbook).toMatch(/flock -n <APP_DIR>\/releases\/\.deploy\.lock true/);
      expect(runbook).toMatch(/refuses?[^.]*\bexit 2\b/);
      expect(runbook).not.toMatch(/Deployments run one at a time\./);
    });

    it('publish-only builds and pushes the commit image and never reaches the VPS or moves latest (H7-OPS-02)', () => {
      expect(workflow).toMatch(
        /workflow_dispatch:\r?\n\s+inputs:\r?\n\s+mode:[\s\S]*?options:\r?\n\s+- publish-only\r?\n\s+- deploy\r?\n\s+default: publish-only/,
      );
      expect(job('deploy')).toMatch(/^\s+if: \$\{\{ inputs\.mode == 'deploy' \}\}$/m);
      const vpsJobs = [...jobs].filter(([, text]) => /appleboy\/|secrets\.VPS_/.test(text)).map(([name]) => name);
      expect(vpsJobs).toEqual(['deploy']);
      const build = job('build-and-push');
      // The build pushes the immutable commit tag only, in both modes (H7-OPS-RV-02).
      expect(build.replace(/runs-on: ubuntu-latest/g, '')).not.toMatch(/latest/);
      expect(build).toMatch(/^\s+tags: \$\{\{ steps\.meta\.outputs\.image \}\}:\$\{\{ github\.sha \}\}$/m);
      expect(read('.github/workflows/ci.yml')).toMatch(
        /uses: \.\/\.github\/workflows\/deploy\.yml\r?\n\s+with:\r?\n\s+mode: deploy/,
      );
    });

    it('moves latest only after the host deployment succeeded, one deployment at a time (H7-OPS-RV-02)', () => {
      const deploy = job('deploy');
      const host = deploy.indexOf('- name: Deploy the release on the VPS');
      const mark = deploy.indexOf('- name: Mark the deployed release as latest');

      expect(host).toBeGreaterThan(-1);
      expect(mark).toBeGreaterThan(host);
      // The next step after a failed one never runs: nothing may make it run anyway, or let the host step fail softly.
      expect(deploy.slice(mark)).not.toMatch(/^\s+if:/m);
      expect(deploy).not.toMatch(/continue-on-error/);
      // Retags the commit manifest already pushed: no rebuild, no other image.
      expect(deploy.slice(mark)).toMatch(/docker buildx imagetools create --tag "\$IMAGE:latest" "\$IMAGE:\$RELEASE"/);
      const elsewhere = [...jobs].map(
        ([name, text]) => [name, name === 'deploy' ? text.slice(0, mark) : text] as const,
      );
      for (const [, text] of elsewhere) expect(text.replace(/runs-on: ubuntu-latest/g, '')).not.toMatch(/latest/);
      // Two deployments never run on the host, or move latest, at the same time.
      expect(deploy).toMatch(/^\s+concurrency:\r?\n\s+group: production-deploy\r?\n\s+cancel-in-progress: false$/m);
    });

    it('validates the candidate Caddyfile through the candidate Compose, never the live file (H7-OPS-RV-01)', () => {
      expect(list(service('caddy'), 'volumes')).toContain('${CADDYFILE_PATH:-./Caddyfile}:/etc/caddy/Caddyfile:ro');
      expect(hostScript).toMatch(
        /^candidate\(\) \{ CADDYFILE_PATH="\$RELEASE_DIR\/Caddyfile" docker compose --project-directory "\$APP_DIR" -f "\$RELEASE_DIR\/docker-compose\.prod\.yml" "\$@"; \}$/m,
      );
      expect(hostScript).toMatch(
        /^live\(\) \{ CADDYFILE_PATH="\$APP_DIR\/Caddyfile" docker compose --project-directory "\$APP_DIR" -f "\$APP_DIR\/docker-compose\.prod\.yml" "\$@"; \}$/m,
      );
      // Caddy's log can carry environment values: the validation prints nothing it read.
      expect(hostScript).toMatch(
        /candidate run --rm --no-deps -T caddy caddy validate --config \/etc\/caddy\/Caddyfile --adapter caddyfile > \/dev\/null 2>&1/,
      );
    });

    it('removes no image, volume or orphan container, and nothing by pattern (H7-OPS-RV-03)', () => {
      const guide = read('docs/guides/containers.md');
      const start = guide.indexOf('## PostgreSQL roles (H7)');
      const runbook = guide.slice(start, guide.indexOf('\n## ', start + 1));
      expect(runbook).toContain('### Rollout on an existing installation');
      for (const text of [workflow, hostScript, runbook]) {
        expect(text).not.toMatch(/\bprune\b/);
        expect(text).not.toMatch(/--remove-orphans/);
        expect(text).not.toMatch(/\brm\s+[^\n`]*\*/);
      }
      for (const text of [workflow, hostScript]) {
        expect(text).not.toMatch(/docker\s+(?:rm|rmi|(?:image|container|volume|network)\s+rm)\b/);
        expect(text).not.toMatch(/\brm\s+-[a-zA-Z]*[rR]/);
      }
    });

    it('deploy copies a candidate beside the live files and hands the host the immutable image, nothing else (H7-OPS-02)', () => {
      const deploy = job('deploy');

      expect(deploy).toMatch(
        /target: "\$\{\{ secrets\.VPS_APP_DIR \|\| '\/opt\/slm\/backend' \}\}\/releases\/\$\{\{ github\.sha \}\}"/,
      );
      expect(deploy).toMatch(/source: 'docker-compose\.prod\.yml,Caddyfile,scripts\/ops\/deploy-release\.sh'/);
      expect(deploy).toMatch(/IMAGE: \$\{\{ needs\.build-and-push\.outputs\.image \}\}:\$\{\{ github\.sha \}\}/);
      expect(deploy).toMatch(/bash "\$APP_DIR\/releases\/\$RELEASE\/scripts\/ops\/deploy-release\.sh"/);
      // The live configuration is changed by the host script only, after its pre-recreate steps.
      expect(deploy).not.toMatch(/docker compose|\bmv\b|\bcp\b/);
    });

    it('documents a rollback from the exact attempt, and the first H7 rollout with its old environment (H7-OPS-RV-05, RV-06)', () => {
      const guide = read('docs/guides/containers.md');
      const start = guide.indexOf('## PostgreSQL roles (H7)');
      const runbook = guide.slice(start, guide.indexOf('\n## ', start + 1));

      expect(runbook).not.toMatch(/releases\/<SHA>\/replaced|releases\/<sha>\/replaced/);
      expect(runbook).toMatch(/releases\/current-attempt/);
      expect(runbook).toMatch(/attempts\/<ATTEMPT>\/replaced/);
      // The first rollout names its old environment; the automatic deployments after it never do.
      expect(runbook).toMatch(
        /deploy-release\.sh --app-dir <APP_DIR> --release <SHA> --image <IMAGE>:<SHA> --attempt <ATTEMPT> --first-rollout-env \.env\.pre-h7/,
      );
    });
  });
});
