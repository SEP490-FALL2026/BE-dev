import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { installationEnvironmentConfigOptions } from './env-config';

/**
 * Configuration for the installation command only. It is a separate file so importing it never
 * loads configuration.module.ts: the API and the worker keep the full validation, and this one
 * must never be imported by them.
 */
@Module({
  imports: [ConfigModule.forRoot(installationEnvironmentConfigOptions)],
})
export class InstallationConfigurationModule {}
