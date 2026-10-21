import { DonorRegistryEntry } from '../types';

const STORAGE_KEY = 'givingpulse_saved_donor_registry_v1';

export const DEFAULT_PREVIOUS_REGISTRY: DonorRegistryEntry[] = [
  { donor_id: 100101, spouse_id: 100102 },
  { donor_id: 100102, spouse_id: 100101 },
  { donor_id: 100201, spouse_id: 100202 },
  { donor_id: 100202, spouse_id: 100201 },
  { donor_id: 100301, spouse_id: 100302 },
  { donor_id: 100302, spouse_id: 100301 },
  { donor_id: 100401, spouse_id: 100402 },
  { donor_id: 100402, spouse_id: 100401 },
  { donor_id: 100501, spouse_id: 100502 },
  { donor_id: 100502, spouse_id: 100501 },
  { donor_id: 100601, spouse_id: null },
  { donor_id: 100602, spouse_id: null },
  { donor_id: 100603, spouse_id: null },
  { donor_id: 100604, spouse_id: null },
  { donor_id: 100605, spouse_id: null },
  { donor_id: 100701, spouse_id: null },
  { donor_id: 100702, spouse_id: null },
  { donor_id: 100703, spouse_id: null },
  { donor_id: 100704, spouse_id: null },
  { donor_id: 100705, spouse_id: null },
  { donor_id: 100801, spouse_id: null },
  { donor_id: 100802, spouse_id: null },
  { donor_id: 100803, spouse_id: null },
  { donor_id: 100804, spouse_id: null },
  { donor_id: 100805, spouse_id: null },
  { donor_id: 100901, spouse_id: null },
  { donor_id: 100902, spouse_id: null },
  { donor_id: 100903, spouse_id: null },
  { donor_id: 100904, spouse_id: null },
  { donor_id: 100905, spouse_id: null },
  { donor_id: 101001, spouse_id: null },
  { donor_id: 101002, spouse_id: null },
  { donor_id: 101003, spouse_id: null },
  { donor_id: 101004, spouse_id: null },
  { donor_id: 101005, spouse_id: null },
  { donor_id: 101101, spouse_id: null },
  { donor_id: 101102, spouse_id: null },
  { donor_id: 101103, spouse_id: null },
  { donor_id: 101104, spouse_id: null },
  { donor_id: 101105, spouse_id: null },
  { donor_id: 101201, spouse_id: null },
];

/**
 * Retrieve saved registry from previous session (localStorage) with robust fallback
 */
export function getSavedSessionRegistry(): DonorRegistryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read saved registry from localStorage:', err);
  }

  // If no registry found or previously cleared, initialize with default cached registry
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREVIOUS_REGISTRY));
  } catch {
    // Ignore storage errors in restricted sandbox
  }
  return DEFAULT_PREVIOUS_REGISTRY;
}

/**
 * Persist registry to localStorage for future sessions.
 * Never overwrites with an empty array.
 */
export function saveSessionRegistry(registry: DonorRegistryEntry[]): void {
  if (!Array.isArray(registry) || registry.length === 0) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (err) {
    console.error('Failed to save registry to localStorage:', err);
  }
}

/**
 * Synthesize a new registry by scanning donor IDs in the donation file
 */
export function createRegistryFromDonationIds(donorIds: (number | null)[]): DonorRegistryEntry[] {
  const uniqueIds = new Set<number>();
  donorIds.forEach((id) => {
    if (id !== null && id > 0) {
      uniqueIds.add(id);
    }
  });

  const sortedIds = Array.from(uniqueIds).sort((a, b) => a - b);
  return sortedIds.map((id) => ({
    donor_id: id,
    spouse_id: null,
  }));
}

export interface UnregisteredDonorSummary {
  donor_id: number;
  giftCount: number;
  totalAmount: number;
}

/**
 * Identify donor IDs from donation records that are not in the registry, with summary stats
 */
export function findUnregisteredDonors(
  currentRegistry: DonorRegistryEntry[],
  donations: { donor_id: number | null; amount: number }[]
): UnregisteredDonorSummary[] {
  const existingIdSet = new Set<number>(currentRegistry.map((r) => r.donor_id));
  const statsMap = new Map<number, { giftCount: number; totalAmount: number }>();

  donations.forEach((d) => {
    if (d.donor_id !== null && d.donor_id > 0 && !existingIdSet.has(d.donor_id)) {
      const current = statsMap.get(d.donor_id) || { giftCount: 0, totalAmount: 0 };
      statsMap.set(d.donor_id, {
        giftCount: current.giftCount + 1,
        totalAmount: current.totalAmount + (d.amount || 0),
      });
    }
  });

  const result: UnregisteredDonorSummary[] = [];
  statsMap.forEach((stats, id) => {
    result.push({
      donor_id: id,
      giftCount: stats.giftCount,
      totalAmount: stats.totalAmount,
    });
  });

  return result.sort((a, b) => a.donor_id - b.donor_id);
}

/**
 * Update existing registry by appending any donor IDs in the donation file not already present
 */
export function reconcileRegistryWithDonations(
  currentRegistry: DonorRegistryEntry[],
  donationDonorIds: (number | null)[]
): {
  updatedRegistry: DonorRegistryEntry[];
  appendedCount: number;
  newDonorIds: number[];
} {
  const existingIdSet = new Set<number>(currentRegistry.map((r) => r.donor_id));
  const newDonorIds: number[] = [];

  donationDonorIds.forEach((id) => {
    if (id !== null && id > 0 && !existingIdSet.has(id)) {
      existingIdSet.add(id);
      newDonorIds.push(id);
    }
  });

  newDonorIds.sort((a, b) => a - b);

  const newEntries: DonorRegistryEntry[] = newDonorIds.map((id) => ({
    donor_id: id,
    spouse_id: null,
    isNewFromLedger: true,
  }));

  const updatedRegistry = [...currentRegistry, ...newEntries];

  // Save updated version
  saveSessionRegistry(updatedRegistry);

  return {
    updatedRegistry,
    appendedCount: newDonorIds.length,
    newDonorIds,
  };
}

/**
 * Generate default filename with current date: donor_registry_YYYY_MM_DD.csv
 */
export function getDefaultRegistryExportFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `donor_registry_${yyyy}_${mm}_${dd}.csv`;
}

/**
 * Download the registry as a CSV file: donor_id,spouse_id
 * Filename defaults to donor_registry_YYYY_MM_DD.csv
 */
export function downloadRegistryCSV(registry: DonorRegistryEntry[], filename?: string): void {
  const targetFilename = filename || getDefaultRegistryExportFilename();
  const header = 'donor_id,spouse_id';
  const rows = registry.map((r) => `${r.donor_id},${r.spouse_id !== null ? r.spouse_id : ''}`);
  const csvContent = [header, ...rows].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', targetFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
