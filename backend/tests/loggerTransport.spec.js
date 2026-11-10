import { buildTransportTargets, resolveLogLevel } from '../server/config/logger.js';

describe('buildTransportTargets', () => {
  it('keeps direct stdout (no transport) when Better Stack is unset outside localhost', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: false,
      prettyInstalled: true,
      sourceToken: undefined,
      ingestingHost: undefined,
    });

    expect(result).toEqual({ level: 'info', targets: undefined });
  });

  it('falls back to pino-pretty only on localhost without Better Stack', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: true,
      prettyInstalled: true,
      sourceToken: undefined,
      ingestingHost: undefined,
    });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].target).toBe('pino-pretty');
  });

  it('keeps JSON stdout when pino-pretty is not installed locally', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: true,
      prettyInstalled: false,
      sourceToken: undefined,
      ingestingHost: undefined,
    });

    expect(result).toEqual({ level: 'info', targets: undefined });
  });

  it('adds the Better Stack transport next to pino-pretty on localhost', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: true,
      prettyInstalled: true,
      sourceToken: 'source-token',
      ingestingHost: 'ingest.example.com',
    });

    expect(result.targets).toHaveLength(2);
    expect(result.targets.map((target) => target.target)).toEqual(['pino-pretty', '@logtail/pino']);
    expect(result.targets[1].options).toEqual({
      sourceToken: 'source-token',
      options: { endpoint: 'https://ingest.example.com' },
    });
  });

  it('keeps JSON stdout alongside Better Stack in deployed environments', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: false,
      prettyInstalled: false,
      sourceToken: 'source-token',
      ingestingHost: 'ingest.example.com',
    });

    expect(result.targets).toHaveLength(2);
    expect(result.targets[0]).toEqual({
      target: 'pino/file',
      options: { destination: 1 },
      level: 'info',
    });
    expect(result.targets[1].target).toBe('@logtail/pino');
  });

  it('ignores a half-configured source - both values are required together', () => {
    expect(buildTransportTargets({
      isLocalhostEnv: false,
      prettyInstalled: false,
      sourceToken: 'source-token',
      ingestingHost: undefined,
    }).targets).toBeUndefined();

    expect(buildTransportTargets({
      isLocalhostEnv: false,
      prettyInstalled: false,
      sourceToken: undefined,
      ingestingHost: 'ingest.example.com',
    }).targets).toBeUndefined();
  });

  it('propagates the level to the root logger and every target', () => {
    const result = buildTransportTargets({
      isLocalhostEnv: false,
      prettyInstalled: false,
      sourceToken: 'source-token',
      ingestingHost: 'ingest.example.com',
      level: 'debug',
    });

    expect(result.level).toBe('debug');
    result.targets.forEach((target) => expect(target.level).toBe('debug'));
  });

  it('falls back to info for an unknown LOG_LEVEL', () => {
    const previousLevel = process.env.LOG_LEVEL;

    process.env.LOG_LEVEL = 'not-a-level';

    try {
      expect(buildTransportTargets().level).toBe('info');
    } finally {
      if (previousLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLevel;
      }
    }
  });

  it('accepts a valid LOG_LEVEL label instead of coercing it to info', () => {
    const previousLevel = process.env.LOG_LEVEL;

    process.env.LOG_LEVEL = 'warn';

    try {
      expect(buildTransportTargets().level).toBe('warn');
    } finally {
      if (previousLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLevel;
      }
    }
  });
});

describe('resolveLogLevel', () => {
  it.each(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])('accepts the pino level %s', (level) => {
    expect(resolveLogLevel(level)).toBe(level);
  });

  it.each([undefined, '', 'WARN', 'verbose', '30'])('falls back to info for %p', (level) => {
    expect(resolveLogLevel(level)).toBe('info');
  });
});
