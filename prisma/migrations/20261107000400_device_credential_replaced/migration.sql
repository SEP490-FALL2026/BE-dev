-- A new credential for the same AI collector on a registration takes the live one away (a re-install of the tool, a second code).
ALTER TYPE "DeviceCredentialRevocationCause" ADD VALUE IF NOT EXISTS 'REPLACED';
