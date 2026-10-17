import { Module } from '@nestjs/common';
import { OperatingParametersController } from './operating-parameters.controller';
import { OperatingParametersModule } from './operating-parameters.module';

/** The HTTP side of the operating parameters, mounted by the API only. */
@Module({
  imports: [OperatingParametersModule],
  controllers: [OperatingParametersController],
})
export class OperatingParametersHttpModule {}
