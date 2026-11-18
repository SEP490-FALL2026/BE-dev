import { createStartupReporter } from './startup-timing';

describe('startup timing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports import time from process start, then wall/CPU deltas immediately as structured lines', () => {
    const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(process, 'uptime').mockReturnValueOnce(2).mockReturnValueOnce(2.5);
    jest
      .spyOn(process, 'cpuUsage')
      .mockReturnValueOnce({ user: 250_000, system: 50_000 })
      .mockReturnValueOnce({ user: 300_000, system: 100_000 });
    const report = createStartupReporter('software-license-api');
    report('imports-loaded');
    report('nest-created');

    expect(write).toHaveBeenCalledTimes(2);
    const entries = write.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        service: 'software-license-api',
        context: 'StartupTiming',
        phase: 'imports-loaded',
        elapsedMs: 2_000,
        phaseMs: 2_000,
        cpuMs: 300,
        phaseCpuMs: 300,
      }),
    );
    expect(entries[1]).toEqual(
      expect.objectContaining({ phase: 'nest-created', elapsedMs: 2_500, phaseMs: 500, cpuMs: 400, phaseCpuMs: 100 }),
    );
    expect(Number(entries[0].rssMiB)).toBeGreaterThan(0);
    expect(Object.keys(entries[0]).sort()).toEqual(
      [
        'timestamp',
        'level',
        'service',
        'context',
        'message',
        'phase',
        'elapsedMs',
        'phaseMs',
        'cpuMs',
        'phaseCpuMs',
        'rssMiB',
      ].sort(),
    );
  });
});
