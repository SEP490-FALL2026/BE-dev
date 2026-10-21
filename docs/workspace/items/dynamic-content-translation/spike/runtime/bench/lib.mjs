import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

export function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
export function summarize(values, digits = 1) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const r = (x) => (x === null ? null : +x.toFixed(digits));
  return {
    n: v.length,
    min: r(v[0] ?? null),
    p50: r(pct(v, 50)),
    p95: r(pct(v, 95)),
    p99: r(pct(v, 99)),
    max: r(v[v.length - 1] ?? null),
    mean: v.length ? r(v.reduce((a, b) => a + b, 0) / v.length) : null,
  };
}

export function httpJson(port, method, urlPath, body, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const t0 = performance.now();
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        agent,
        headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(txt);
          } catch {
            /* leave null */
          }
          resolve({ status: res.statusCode, json, ms: performance.now() - t0, wall: Date.now() });
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('client timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 20 Hz (default) /health poller; returns stop() -> { latencies, errors, lateTicks }. */
export function startHealthPoller(port, hz = 20) {
  const lat = [];
  let errors = 0;
  const period = 1000 / hz;
  const timer = setInterval(() => {
    httpJson(port, 'GET', '/health', undefined, 5000).then(
      (r) => lat.push(r.ms),
      () => errors++,
    );
  }, period);
  return async () => {
    clearInterval(timer);
    await sleep(300);
    return { ...summarize(lat), errors };
  };
}

// ---- Linux procfs helpers (return null elsewhere) --------------------------------------------------------------
export const isLinux = process.platform === 'linux';
export function procStatus(pid) {
  if (!isLinux) return null;
  try {
    const t = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const kb = (k) => {
      const m = t.match(new RegExp(`${k}:\\s+(\\d+) kB`));
      return m ? +(Number(m[1]) / 1024).toFixed(1) : null;
    };
    const th = t.match(/Threads:\s+(\d+)/);
    return { vmRssMb: kb('VmRSS'), vmHwmMb: kb('VmHWM'), threads: th ? Number(th[1]) : null };
  } catch {
    return null;
  }
}
export function childrenOf(pid) {
  if (!isLinux) return [];
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const after = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // state ppid ...
      if (Number(after[1]) === pid) out.push(Number(d));
    } catch {
      /* raced with exit */
    }
  }
  return out;
}
export const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
export function cgroup() {
  const read = (f) => {
    try {
      return fs.readFileSync(f, 'utf8').trim();
    } catch {
      return null;
    }
  };
  const mb = (v) => (v && /^\d+$/.test(v) ? +(Number(v) / 1048576).toFixed(1) : v);
  return {
    memoryPeakMb: mb(read('/sys/fs/cgroup/memory.peak')) ?? mb(read('/sys/fs/cgroup/memory/memory.max_usage_in_bytes')),
    memoryCurrentMb:
      mb(read('/sys/fs/cgroup/memory.current')) ?? mb(read('/sys/fs/cgroup/memory/memory.usage_in_bytes')),
    memoryMax: read('/sys/fs/cgroup/memory.max') ?? read('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
    cpuMax: read('/sys/fs/cgroup/cpu.max'),
    cpuStat: (() => {
      const t = read('/sys/fs/cgroup/cpu.stat');
      if (!t) return null;
      const g = (k) => Number((t.match(new RegExp(`^${k} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
      return {
        nrPeriods: g('nr_periods'),
        nrThrottled: g('nr_throttled'),
        throttledMs: +(g('throttled_usec') / 1000).toFixed(0),
      };
    })(),
  };
}

/** Starts bench/api.mjs as a child process. Resolves once it prints LISTENING <port>. */
export function startApi(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(HERE, 'api.mjs')], {
      env: { ...process.env, ...env, BENCH_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    let stderrBuf = '';
    const api = { child, pid: child.pid, port: null, exit: null, shutdownEvents: null, stderr: () => stderrBuf };
    const exited = new Promise((r) =>
      child.once('exit', (code, signal) => r((api.exit = { code, signal, at: Date.now() }))),
    );
    api.exited = exited;
    child.stderr.on('data', (c) => (stderrBuf = (stderrBuf + c).slice(-4000)));
    child.stdout.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const m = /^LISTENING (\d+)/.exec(line);
        if (m) {
          api.port = Number(m[1]);
          resolve(api);
        } else if (line.startsWith('SHUTDOWN_EVENTS ')) api.shutdownEvents = JSON.parse(line.slice(16));
      }
    });
    child.once('error', reject);
    child.once('exit', () => {
      if (!api.port) reject(new Error('api exited before listening: ' + stderrBuf));
    });
    api.get = (p) => httpJson(api.port, 'GET', p).then((r) => r.json);
    api.post = (p, b) => httpJson(api.port, 'POST', p, b);
    api.stop = async () => {
      if (api.exit) return api.exit;
      if (process.platform === 'win32')
        httpJson(api.port, 'POST', '/control/shutdown', {}).catch(() => {}); // no POSIX signals on Windows
      else child.kill('SIGTERM');
      const t = setTimeout(() => child.kill('SIGKILL'), 15_000);
      const r = await exited;
      clearTimeout(t);
      return r;
    };
  });
}
