import type { DeviceCondition, DeviceCustody } from '../devices-custody.policy';
import {
  judgeConditionChange,
  judgeGive,
  judgeReplace,
  judgeRetire,
  judgeReturn,
  judgeSoftwareRemoval,
  judgeVoid,
} from './lifecycle.policy';

describe('lifecycle.policy', () => {
  describe('judgeGive', () => {
    it.each<{
      custody: DeviceCustody;
      condition: DeviceCondition;
      currentHolderEmployeeId: string | null;
      nextHolderEmployeeId: string;
      expected: string;
    }>([
      {
        custody: 'VOIDED',
        condition: 'BROKEN',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e1',
        expected: 'VOIDED',
      },
      {
        custody: 'RETIRED',
        condition: 'BROKEN',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e1',
        expected: 'ALREADY_RETIRED',
      },
      {
        custody: 'AWAITING_RETURN',
        condition: 'USABLE',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e2',
        expected: 'AWAITING_RETURN',
      },
      {
        custody: 'IN_STOCK',
        condition: 'IN_REPAIR',
        currentHolderEmployeeId: null,
        nextHolderEmployeeId: 'e2',
        expected: 'NOT_USABLE',
      },
      {
        custody: 'ASSIGNED',
        condition: 'BROKEN',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e2',
        expected: 'NOT_USABLE',
      },
      {
        custody: 'ASSIGNED',
        condition: 'USABLE',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e1',
        expected: 'HOLDER_UNCHANGED',
      },
      {
        custody: 'IN_STOCK',
        condition: 'USABLE',
        currentHolderEmployeeId: null,
        nextHolderEmployeeId: 'e2',
        expected: 'OK',
      },
      {
        custody: 'ASSIGNED',
        condition: 'USABLE',
        currentHolderEmployeeId: 'e1',
        nextHolderEmployeeId: 'e2',
        expected: 'OK',
      },
    ])('$custody / $condition -> $expected', (input) => {
      expect(judgeGive(input)).toBe(input.expected);
    });
  });

  describe('judgeSoftwareRemoval', () => {
    it.each([
      { hasCurrentHolder: false, softwareRemoval: null, expected: 'NOT_NEEDED' },
      {
        hasCurrentHolder: false,
        softwareRemoval: { outcome: 'NOT_REMOVABLE' as const, note: '' },
        expected: 'NOT_NEEDED',
      },
      { hasCurrentHolder: true, softwareRemoval: null, expected: 'REQUIRED' },
      {
        hasCurrentHolder: true,
        softwareRemoval: { outcome: 'NOT_REMOVABLE' as const, note: '   ' },
        expected: 'NOTE_REQUIRED',
      },
      {
        hasCurrentHolder: true,
        softwareRemoval: { outcome: 'NOT_REMOVABLE' as const, note: null },
        expected: 'NOTE_REQUIRED',
      },
      {
        hasCurrentHolder: true,
        softwareRemoval: { outcome: 'NOT_REMOVABLE' as const, note: 'Encrypted volume' },
        expected: 'OK',
      },
      { hasCurrentHolder: true, softwareRemoval: { outcome: 'REMOVED' as const, note: null }, expected: 'OK' },
    ])('holder=$hasCurrentHolder -> $expected', (input) => {
      expect(judgeSoftwareRemoval(input)).toBe(input.expected);
    });
  });

  describe('judgeReturn', () => {
    it.each<{ custody: DeviceCustody; expected: string }>([
      { custody: 'VOIDED', expected: 'VOIDED' },
      { custody: 'RETIRED', expected: 'ALREADY_RETIRED' },
      { custody: 'IN_STOCK', expected: 'NOT_HELD' },
      { custody: 'ASSIGNED', expected: 'OK' },
      { custody: 'AWAITING_RETURN', expected: 'OK' },
    ])('$custody -> $expected', ({ custody, expected }) => {
      expect(judgeReturn({ custody })).toBe(expected);
    });
  });

  describe('judgeConditionChange', () => {
    it.each<{
      custody: DeviceCustody;
      currentCondition: DeviceCondition;
      nextCondition: DeviceCondition;
      expected: string;
    }>([
      { custody: 'VOIDED', currentCondition: 'USABLE', nextCondition: 'USABLE', expected: 'VOIDED' },
      { custody: 'RETIRED', currentCondition: 'USABLE', nextCondition: 'USABLE', expected: 'ALREADY_RETIRED' },
      { custody: 'IN_STOCK', currentCondition: 'USABLE', nextCondition: 'USABLE', expected: 'CONDITION_UNCHANGED' },
      { custody: 'AWAITING_RETURN', currentCondition: 'USABLE', nextCondition: 'BROKEN', expected: 'OK' },
      { custody: 'ASSIGNED', currentCondition: 'IN_REPAIR', nextCondition: 'USABLE', expected: 'OK' },
    ])('$custody $currentCondition -> $nextCondition: $expected', (input) => {
      expect(judgeConditionChange(input)).toBe(input.expected);
    });
  });

  describe('judgeRetire', () => {
    it.each<{ custody: DeviceCustody; expected: string }>([
      { custody: 'VOIDED', expected: 'VOIDED' },
      { custody: 'RETIRED', expected: 'ALREADY_RETIRED' },
      { custody: 'AWAITING_RETURN', expected: 'AWAITING_RETURN' },
      { custody: 'ASSIGNED', expected: 'OK' },
      { custody: 'IN_STOCK', expected: 'OK' },
    ])('$custody -> $expected', ({ custody, expected }) => {
      expect(judgeRetire({ custody })).toBe(expected);
    });
  });

  describe('judgeReplace', () => {
    it.each<{
      oldDeviceId: string;
      replacementDeviceId: string;
      oldCustody: DeviceCustody;
      replacementCustody: DeviceCustody;
      replacementCondition: DeviceCondition;
      expected: string;
    }>([
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd1',
        oldCustody: 'ASSIGNED',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'SAME_DEVICE',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'VOIDED',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'VOIDED',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'RETIRED',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'ALREADY_RETIRED',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'AWAITING_RETURN',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'AWAITING_RETURN',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'IN_STOCK',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'NOT_HELD',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'ASSIGNED',
        replacementCustody: 'ASSIGNED',
        replacementCondition: 'USABLE',
        expected: 'REPLACEMENT_NOT_IN_STOCK',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'ASSIGNED',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'IN_REPAIR',
        expected: 'NOT_USABLE',
      },
      {
        oldDeviceId: 'd1',
        replacementDeviceId: 'd2',
        oldCustody: 'ASSIGNED',
        replacementCustody: 'IN_STOCK',
        replacementCondition: 'USABLE',
        expected: 'OK',
      },
    ])('$oldCustody -> $replacementCustody/$replacementCondition: $expected', (input) => {
      expect(judgeReplace(input)).toBe(input.expected);
    });
  });

  describe('judgeVoid', () => {
    it.each<{
      label: string;
      custody: DeviceCustody;
      hasOpenReturnTask: boolean;
      hasOpenRegistration: boolean;
      hasSignatureRecord: boolean;
      hasCredential: boolean;
      hasKeyActivationHistory: boolean;
      expected: string;
    }>([
      {
        label: 'voided first',
        custody: 'VOIDED',
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        hasSignatureRecord: true,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'VOIDED',
      },
      {
        label: 'retired second',
        custody: 'RETIRED',
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        hasSignatureRecord: true,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'ALREADY_RETIRED',
      },
      {
        label: 'awaiting return precedes held and history flags',
        custody: 'AWAITING_RETURN',
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        hasSignatureRecord: true,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'AWAITING_RETURN',
      },
      {
        label: 'held precedes signature, credential, and key activation',
        custody: 'ASSIGNED',
        hasOpenReturnTask: false,
        hasOpenRegistration: true,
        hasSignatureRecord: true,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'HELD',
      },
      {
        label: 'signature recorded precedes credential and key activation',
        custody: 'IN_STOCK',
        hasOpenReturnTask: false,
        hasOpenRegistration: false,
        hasSignatureRecord: true,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'SIGNATURE_RECORDED',
      },
      {
        label: 'credential issued precedes key activation',
        custody: 'IN_STOCK',
        hasOpenReturnTask: false,
        hasOpenRegistration: false,
        hasSignatureRecord: false,
        hasCredential: true,
        hasKeyActivationHistory: true,
        expected: 'CREDENTIAL_ISSUED',
      },
      {
        label: 'key activation history blocks void',
        custody: 'IN_STOCK',
        hasOpenReturnTask: false,
        hasOpenRegistration: false,
        hasSignatureRecord: false,
        hasCredential: false,
        hasKeyActivationHistory: true,
        expected: 'KEY_ACTIVATION',
      },
      {
        label: 'clean in-stock machine can be voided',
        custody: 'IN_STOCK',
        hasOpenReturnTask: false,
        hasOpenRegistration: false,
        hasSignatureRecord: false,
        hasCredential: false,
        hasKeyActivationHistory: false,
        expected: 'OK',
      },
    ])('$label -> $expected', (input) => {
      expect(judgeVoid(input)).toBe(input.expected);
    });
  });
});
