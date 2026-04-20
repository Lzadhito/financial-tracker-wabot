import { getLedgerSetting } from './services/ledger.service'

/**
 * Feature flags — toggleable per ledger (group JID → ledger → setting).
 *
 * Stored in the existing `ledger_settings` table as key-value pairs.
 * This avoids adding a new table or in-memory config that diverges
 * across instances.
 *
 * Usage:
 *   if (await isFeatureEnabled('NLU_ENABLED', ledgerId)) { ... }
 */

const FLAG_DEFAULTS: Record<string, boolean> = {
  NLU_ENABLED: false,
}

/**
 * Check whether a feature flag is enabled for a given ledger.
 * Falls back to the default defined in FLAG_DEFAULTS.
 */
export async function isFeatureEnabled(
  flag: string,
  ledgerId: string
): Promise<boolean> {
  const setting = await getLedgerSetting(ledgerId, `flag:${flag}`)
  if (setting) {
    return setting.value === 'true'
  }
  return FLAG_DEFAULTS[flag] ?? false
}
