import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule DI graph', () => {
  it('compiles all module providers without unresolved required dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
