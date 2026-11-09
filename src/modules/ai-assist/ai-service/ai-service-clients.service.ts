import { Inject, Injectable } from '@nestjs/common';
import { SimulatedAiServiceClient } from './ai-service-simulated-client.service';
import { type AiProviderMode, AiServiceClient } from './ai-service.types';

/**
 * The source of answers of a call by its mode: the client of the AI service for MODEL (the token `AiServiceClient`, unchanged), the
 * simulation for SIMULATED (QĐ-102f). A call asks for the client of the mode it was recorded with, so a change of `AI_PROVIDER_MODE`
 * never reaches a call already made, and a model that fails is never replaced by the simulation (QĐ-102b).
 */
@Injectable()
export class AiServiceClients {
  constructor(
    private readonly model: AiServiceClient,
    @Inject(SimulatedAiServiceClient) private readonly simulated: AiServiceClient,
  ) {}

  forMode(mode: AiProviderMode): AiServiceClient {
    return mode === 'MODEL' ? this.model : this.simulated;
  }
}
