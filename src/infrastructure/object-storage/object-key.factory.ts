import { randomUUID } from 'node:crypto';

type Clock = () => Date;
type IdGenerator = () => string;

export class ObjectKeyFactory {
  constructor(
    private readonly now: Clock = () => new Date(),
    private readonly generateId: IdGenerator = randomUUID,
  ) {}

  create(scope: string): string {
    if (!/^[a-z][a-z0-9-]*$/.test(scope)) {
      throw new Error('Invalid object storage scope');
    }

    const date = this.now();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${scope}/${year}/${month}/${this.generateId()}`;
  }
}
