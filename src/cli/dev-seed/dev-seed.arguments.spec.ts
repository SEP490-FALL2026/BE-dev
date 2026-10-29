import { DevSeedArgumentError, parseDevSeedArguments } from './dev-seed.arguments';

describe('parseDevSeedArguments', () => {
  it.each([
    [['--confirm-local'], { help: false, confirmLocal: true }],
    [['--', '--confirm-local'], { help: false, confirmLocal: true }],
    [['--help'], { help: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseDevSeedArguments(argv)).toEqual(expected);
  });

  it.each([
    [[]],
    [['--']],
    [['--force']],
    [['--confirm-local', '--force']],
    [['--yes']],
    [['--confirm-local=yes']],
    [['seed']],
  ])('refuses %j as a usage error', (argv) => {
    expect(() => parseDevSeedArguments(argv)).toThrow(DevSeedArgumentError);
  });
});
