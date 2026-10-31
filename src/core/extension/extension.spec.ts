import { Contributions } from './contributions';
import { Hook } from './hook';
import { Listeners } from './listeners';

describe('Hook', () => {
  it('answers the bound implementation', () => {
    const hook = new Hook<{ allow(): boolean }>('test.gate');
    hook.bind({ allow: () => true });

    expect(hook.get().allow()).toBe(true);
  });

  it('refuses a second binding, naming the hook', () => {
    const hook = new Hook<number>('test.twice');
    hook.bind(1);

    expect(() => hook.bind(2)).toThrow('Hook test.twice is already bound');
  });

  it('fails a call before the binding, naming the hook', () => {
    expect(() => new Hook<number>('test.unbound').get()).toThrow('Hook test.unbound is not bound');
  });

  it('reports whether it is bound, and answers nothing else before the binding', () => {
    const hook = new Hook<{ allow(): boolean }>('test.bound-state');

    expect(hook.isBound()).toBe(false);
    expect(() => hook.get()).toThrow('Hook test.bound-state is not bound');
    hook.bind({ allow: () => true });
    expect(hook.isBound()).toBe(true);
    expect(hook.get().allow()).toBe(true);
  });
});

describe('Listeners', () => {
  it('runs every listener in order with the emitter transaction', async () => {
    const listeners = new Listeners<string, { id: number }>('test.event');
    const seen: string[] = [];
    listeners.add('first', (tx, event) => {
      seen.push(`first:${tx.id}:${event}`);
      return Promise.resolve();
    });
    listeners.add('second', (tx, event) => {
      seen.push(`second:${tx.id}:${event}`);
      return Promise.resolve();
    });

    await listeners.emit({ id: 7 }, 'e');

    expect(seen).toEqual(['first:7:e', 'second:7:e']);
    expect(listeners.names()).toEqual(['first', 'second']);
  });

  it('stops at the first listener that throws, so the emitter transaction rolls back', async () => {
    const listeners = new Listeners<string, null>('test.refusal');
    const later = jest.fn();
    listeners.add('refuses', () => Promise.reject(new Error('refused')));
    listeners.add('later', later);

    await expect(listeners.emit(null, 'e')).rejects.toThrow('refused');
    expect(later).not.toHaveBeenCalled();
  });

  it('refuses the same listener name twice', () => {
    const listeners = new Listeners<string, null>('test.names');
    listeners.add('one', () => Promise.resolve());

    expect(() => listeners.add('one', () => Promise.resolve())).toThrow('Listener one is already added to test.names');
  });
});

describe('Contributions', () => {
  it('answers every contribution in the order added, with their names', () => {
    const readers = new Contributions<() => number>('test.readers');
    readers.add('one', () => 1);
    readers.add('two', () => 2);

    expect(readers.all().map((read) => read())).toEqual([1, 2]);
    expect(readers.names()).toEqual(['one', 'two']);
  });

  it('refuses the same contribution name twice', () => {
    const readers = new Contributions<number>('test.twice');
    readers.add('one', 1);

    expect(() => readers.add('one', 2)).toThrow('Contribution one is already added to test.twice');
  });
});
