import { Injectable } from '@nestjs/common';
import type { SeatOccupancyReader } from '../catalog.types';

/** No reader of seats has been registered, so a rule that depends on them cannot be judged: a configuration error. */
export class SeatOccupancyNotRegisteredError extends Error {
  constructor() {
    super('No module has registered the reader of occupied seats.');
    this.name = 'SeatOccupancyNotRegisteredError';
  }
}

/**
 * Where `licensing` hands the catalog its reader of occupied seats when its module starts (ADR-0013 item 4): the catalog
 * never imports `licensing`, and a rule that needs the seats (a quantity that cannot go under them, a software that cannot
 * be retired while they are held) asks here. With no reader registered it fails loudly instead of letting a rule pass.
 */
@Injectable()
export class SeatOccupancyRegistry {
  private reader: SeatOccupancyReader | null = null;

  register(reader: SeatOccupancyReader): void {
    this.reader = reader;
  }

  current(): SeatOccupancyReader {
    if (!this.reader) throw new SeatOccupancyNotRegisteredError();

    return this.reader;
  }
}
