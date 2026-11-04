type StartupService = 'software-license-api' | 'software-license-worker';
type StartupPhase =
  | 'imports-loaded'
  | 'nest-created'
  | 'http-configured'
  | 'swagger-generated'
  | 'http-ready'
  | 'initialized'
  | 'listening'
  | 'worker-ready';

/** Writes immediately, before Nest's buffered logger is available. No configuration, URL or error payload is recorded. */
export function createStartupReporter(service: StartupService): (phase: StartupPhase) => void {
  let previousMs = 0;
  let previousCpuMs = 0;
  return (phase) => {
    const elapsedMs = Math.round(process.uptime() * 1_000);
    const cpu = process.cpuUsage();
    const cpuMs = Math.round((cpu.user + cpu.system) / 1_000);
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service,
        context: 'StartupTiming',
        message: `Startup phase: ${phase}`,
        phase,
        elapsedMs,
        phaseMs: elapsedMs - previousMs,
        cpuMs,
        phaseCpuMs: cpuMs - previousCpuMs,
        rssMiB: Math.round(process.memoryUsage().rss / 1_048_576),
      })}\n`,
    );
    previousMs = elapsedMs;
    previousCpuMs = cpuMs;
  };
}
