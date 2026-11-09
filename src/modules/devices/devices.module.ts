import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OrganizationModule } from '../organization/organization.module';
import { DEVICE_CREDENTIAL_VERIFIER } from '../../infrastructure/security/tokens/device-credential-verifier.port';
import { AcknowledgementController } from './acknowledgement/acknowledgement.controller';
import { AcknowledgementRepo } from './acknowledgement/acknowledgement.repo';
import { AcknowledgementService } from './acknowledgement/acknowledgement.service';
import { CredentialController } from './credential/credential.controller';
import { CredentialQueryService } from './credential/credential-query.service';
import { CredentialRepo } from './credential/credential.repo';
import { CredentialRevocationService } from './credential/credential-revocation.service';
import { CredentialVerifier } from './credential/credential-verifier.service';
import { DeviceEnrollmentController } from './credential/enrollment/device-enrollment.controller';
import { CredentialEnrollmentService } from './credential/enrollment/credential-enrollment.service';
import { DeviceSessionController } from './credential/session/device-session.controller';
import { CredentialSessionService } from './credential/session/credential-session.service';
import { MyDevicesController } from './my-devices/my-devices.controller';
import { MyDevicesRepo } from './my-devices/my-devices.repo';
import { MyDevicesService } from './my-devices/my-devices.service';
import { NoticeController } from './notice/notice.controller';
import { NoticeRepo } from './notice/notice.repo';
import { NoticeService } from './notice/notice.service';
import { DevicesApi } from './public/devices.api';
import { CollectorAllowlistHook } from './public/devices.extension-points';
import { RegistrationEndService } from './registry/registration-end.service';
import { RegistryController } from './registry/registry.controller';
import { RegistryQueryRepo } from './registry/registry-query.repo';
import { RegistryQueryService } from './registry/registry-query.service';
import { RegistryRepo } from './registry/registry.repo';
import { RegistryService } from './registry/registry.service';
import { SignatureRecordController } from './registry/signature-record.controller';
import { SignatureRecordService } from './registry/signature-record.service';

/**
 * The register of company machines that one person uses each (`G7`): who holds which machine, the notice about what is collected,
 * the signed `BM-06`, and the acknowledgement of the holder, which decides whether a machine is collected from. It exports only the
 * facade `DevicesApi`, which `personnel` calls when a person leaves.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, CatalogModule, IdentityAccessFacadeModule],
  controllers: [
    NoticeController,
    RegistryController,
    SignatureRecordController,
    AcknowledgementController,
    MyDevicesController,
    CredentialController,
    DeviceEnrollmentController,
    DeviceSessionController,
  ],
  providers: [
    NoticeRepo,
    NoticeService,
    RegistryRepo,
    RegistryQueryRepo,
    RegistryQueryService,
    RegistryService,
    RegistrationEndService,
    SignatureRecordService,
    AcknowledgementRepo,
    AcknowledgementService,
    MyDevicesRepo,
    MyDevicesService,
    CredentialRepo,
    CredentialRevocationService,
    CredentialQueryService,
    CredentialEnrollmentService,
    CredentialSessionService,
    CredentialVerifier,
    // The port the device guard of `infrastructure/security` verifies a credential through (the application module passes this module in).
    { provide: DEVICE_CREDENTIAL_VERIFIER, useExisting: CredentialVerifier },
    CollectorAllowlistHook,
    DevicesApi,
  ],
  exports: [DevicesApi, DEVICE_CREDENTIAL_VERIFIER, CollectorAllowlistHook],
})
export class DevicesModule {}
