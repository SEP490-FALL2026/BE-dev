import { Test } from '@nestjs/testing';
import { WorkerModule } from './worker.module';

describe('WorkerModule DI graph', () => {
  it('compiles all worker providers without unresolved required dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
