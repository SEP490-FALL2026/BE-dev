import { Test } from '@nestjs/testing';
import { AiServiceClients } from './ai-service-clients.service';
import { SimulatedAiServiceClient } from './ai-service-simulated-client.service';
import { AiServiceClient } from './ai-service.types';

class UnconfiguredModel extends AiServiceClient {
  configured(): boolean {
    return false;
  }

  summarizeQueue(): never {
    throw new Error('the model is never called here');
  }
}

describe('AiServiceClients', () => {
  async function clients() {
    const model = new UnconfiguredModel();
    const simulated = new SimulatedAiServiceClient();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiServiceClients,
        { provide: AiServiceClient, useValue: model },
        { provide: SimulatedAiServiceClient, useValue: simulated },
      ],
    }).compile();

    return { found: moduleRef.get(AiServiceClients), model, simulated };
  }

  it('gives the client behind the token AiServiceClient for MODEL', async () => {
    const { found, model } = await clients();

    expect(found.forMode('MODEL')).toBe(model);
    expect(found.forMode('MODEL').configured()).toBe(false);
  });

  it('gives the simulation for SIMULATED, configured whatever the AI service is', async () => {
    const { found, simulated } = await clients();

    expect(found.forMode('SIMULATED')).toBe(simulated);
    expect(found.forMode('SIMULATED').configured()).toBe(true);
  });
});
