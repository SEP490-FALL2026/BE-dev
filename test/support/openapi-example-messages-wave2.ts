/**
 * The success `message` each operation redesign wave 2 adds answers with, a part of SUCCESS_MESSAGES (reached through
 * SUCCESS_MESSAGES_PURCHASE_INVOICE) kept in a file of its own so the manifest stays under the size of a support file.
 */
export const SUCCESS_MESSAGES_WAVE2: Readonly<Record<string, string>> = {
  // W2-21: a key's cap of activations. W2-27 H16: who answers for a subscription.
  licenseKeyUpdate: 'LICENSE_KEY.UPDATED',
  subscriptionResponsibleItAdminChange: 'SUBSCRIPTION.RESPONSIBLE_CHANGED',
};
