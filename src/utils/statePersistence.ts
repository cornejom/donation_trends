import {
  DonorRegistryEntry,
  RegistryValidationError,
  DonationRecord,
  DonationValidationError,
  TrendMetric,
  SortOption,
  SortField,
  SortDirection,
  TrendCalculationModel,
  DiscoveredMonthSummary,
} from '../types';
import { UnregisteredDonorSummary } from './registryManager';

export interface PriorAppState {
  registry: DonorRegistryEntry[];
  registrySource: 'uploaded' | 'previous_session' | 'auto_detected' | 'sample' | 'none';
  registryErrors: RegistryValidationError[];
  registryFileName: string;
  previousSessionRegistry: DonorRegistryEntry[] | null;
  donations: DonationRecord[];
  donationErrors: DonationValidationError[];
  donationFileName: string;
  availableFunds: string[];
  reconciledCountNotice: number | null;
  pendingNewDonors: UnregisteredDonorSummary[];
  isNewDonorsModalOpen: boolean;
  maxMonthsSetting: number | 'all';
  cutoffMonth?: string;
  discoveredMonths?: DiscoveredMonthSummary[];
  selectedFund: string | 'all';
  trendMetric: TrendMetric;
  sortField: SortField;
  sortDirection: SortDirection;
  sortOption: SortOption;
  calculationModel: TrendCalculationModel;
  excludeZeroDonors: boolean;
  expandedDonorKeys: string[];
}

export interface PersistedAppState {
  version: number;
  timestamp: number;
  registry: DonorRegistryEntry[];
  registrySource: 'uploaded' | 'previous_session' | 'auto_detected' | 'sample' | 'none';
  registryErrors: RegistryValidationError[];
  registryFileName: string;
  previousSessionRegistry: DonorRegistryEntry[] | null;
  isDemoModeActive: boolean;
  priorAppState: PriorAppState | null;
  donations: DonationRecord[];
  donationFileName: string;
  donationErrors: DonationValidationError[];
  availableFunds: string[];
  reconciledCountNotice: number | null;
  pendingNewDonors: UnregisteredDonorSummary[];
  isNewDonorsModalOpen: boolean;
  maxMonthsSetting: number | 'all';
  cutoffMonth?: string;
  discoveredMonths?: DiscoveredMonthSummary[];
  selectedFund: string | 'all';
  trendMetric: TrendMetric;
  sortField: SortField;
  sortDirection: SortDirection;
  sortOption: SortOption;
  calculationModel: TrendCalculationModel;
  excludeZeroDonors: boolean;
  expandedDonorKeys: string[];
}

const DB_NAME = 'GivingPulseDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const STATE_KEY = 'active_session_state';
const LOCAL_STORAGE_KEY = 'givingpulse_active_session_state_v2';

const LEGACY_FUND_RENAME_MAP: Record<string, string> = {
  'Tithes': 'Unrestricted',
  'Helping Hands': 'Emergency Assistance',
  'Community Outreach Events': 'Scholarships',
  'Equipment & Tech': 'Scholarships',
  'Special Ministries': 'Special Projects',
  'Missions': 'Endowment',
  'General': 'Endowment',
};

/**
 * Revives raw JSON or IndexedDB object into properly typed PersistedAppState with Date objects
 */
export function revivePersistedState(raw: unknown): PersistedAppState | null {
  if (!raw || typeof raw !== 'object') return null;

  try {
    const data = raw as Record<string, unknown>;

    // Revive donations array ensuring received_date is a real Date instance and legacy funds are migrated
    const rawDonations = Array.isArray(data.donations) ? data.donations : [];
    const donations: DonationRecord[] = rawDonations.map((d: Record<string, unknown>) => {
      const recDate = d.received_date;
      const parsedDate = recDate instanceof Date ? recDate : (recDate ? new Date(String(recDate)) : new Date());
      const rawFund = String(d.fund || '');
      const fund = LEGACY_FUND_RENAME_MAP[rawFund] || rawFund;
      return {
        id: String(d.id || ''),
        donor_id: typeof d.donor_id === 'number' ? d.donor_id : null,
        received_date: isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
        dateStr: String(d.dateStr || ''),
        fund,
        amount: typeof d.amount === 'number' ? d.amount : 0,
        rawAmount: String(d.rawAmount || ''),
      };
    });

    // Revive priorAppState if exists
    let priorAppState: PriorAppState | null = null;
    if (data.priorAppState && typeof data.priorAppState === 'object') {
      const p = data.priorAppState as Record<string, unknown>;
      const pRawDonations = Array.isArray(p.donations) ? p.donations : [];
      const pDonations: DonationRecord[] = pRawDonations.map((d: Record<string, unknown>) => {
        const recDate = d.received_date;
        const parsedDate = recDate instanceof Date ? recDate : (recDate ? new Date(String(recDate)) : new Date());
        const rawFund = String(d.fund || '');
        const fund = LEGACY_FUND_RENAME_MAP[rawFund] || rawFund;
        return {
          id: String(d.id || ''),
          donor_id: typeof d.donor_id === 'number' ? d.donor_id : null,
          received_date: isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
          dateStr: String(d.dateStr || ''),
          fund,
          amount: typeof d.amount === 'number' ? d.amount : 0,
          rawAmount: String(d.rawAmount || ''),
        };
      });

      const pRawFunds = Array.isArray(p.availableFunds) ? p.availableFunds : [];
      const pAvailableFunds = Array.from(
        new Set(pRawFunds.map((f: unknown) => LEGACY_FUND_RENAME_MAP[String(f)] || String(f)))
      );
      const pRawSelectedFund = typeof p.selectedFund === 'string' ? p.selectedFund : 'all';

      priorAppState = {
        registry: Array.isArray(p.registry) ? (p.registry as DonorRegistryEntry[]) : [],
        registrySource: (p.registrySource as PriorAppState['registrySource']) || 'none',
        registryErrors: Array.isArray(p.registryErrors) ? (p.registryErrors as RegistryValidationError[]) : [],
        registryFileName: typeof p.registryFileName === 'string' ? p.registryFileName : '',
        previousSessionRegistry: Array.isArray(p.previousSessionRegistry) ? (p.previousSessionRegistry as DonorRegistryEntry[]) : null,
        donations: pDonations,
        donationErrors: Array.isArray(p.donationErrors) ? (p.donationErrors as DonationValidationError[]) : [],
        donationFileName: typeof p.donationFileName === 'string' ? p.donationFileName : '',
        availableFunds: pAvailableFunds,
        reconciledCountNotice: typeof p.reconciledCountNotice === 'number' ? p.reconciledCountNotice : null,
        pendingNewDonors: Array.isArray(p.pendingNewDonors) ? (p.pendingNewDonors as UnregisteredDonorSummary[]) : [],
        isNewDonorsModalOpen: Boolean(p.isNewDonorsModalOpen),
        maxMonthsSetting: p.maxMonthsSetting === 'all' ? 'all' : (typeof p.maxMonthsSetting === 'number' ? p.maxMonthsSetting : 12),
        cutoffMonth: typeof p.cutoffMonth === 'string' ? p.cutoffMonth : undefined,
        discoveredMonths: Array.isArray(p.discoveredMonths) ? (p.discoveredMonths as DiscoveredMonthSummary[]) : undefined,
        selectedFund: LEGACY_FUND_RENAME_MAP[pRawSelectedFund] || pRawSelectedFund,
        trendMetric: (p.trendMetric as TrendMetric) || 'dollar',
        sortField: (p.sortField as SortField) || 'slopeDollar',
        sortDirection: (p.sortDirection as SortDirection) || 'desc',
        sortOption: (p.sortOption as SortOption) || 'trendDesc',
        calculationModel: (p.calculationModel as TrendCalculationModel) || 'ols',
        excludeZeroDonors: typeof p.excludeZeroDonors === 'boolean' ? p.excludeZeroDonors : true,
        expandedDonorKeys: Array.isArray(p.expandedDonorKeys) ? (p.expandedDonorKeys as string[]) : [],
      };
    }

    const rawFunds = Array.isArray(data.availableFunds) ? data.availableFunds : [];
    const availableFunds = Array.from(
      new Set(rawFunds.map((f: unknown) => LEGACY_FUND_RENAME_MAP[String(f)] || String(f)))
    );
    const rawSelectedFund = typeof data.selectedFund === 'string' ? data.selectedFund : 'all';
    const selectedFund = LEGACY_FUND_RENAME_MAP[rawSelectedFund] || rawSelectedFund;

    return {
      version: 2,
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
      registry: Array.isArray(data.registry) ? (data.registry as DonorRegistryEntry[]) : [],
      registrySource: (data.registrySource as PersistedAppState['registrySource']) || 'none',
      registryErrors: Array.isArray(data.registryErrors) ? (data.registryErrors as RegistryValidationError[]) : [],
      registryFileName: typeof data.registryFileName === 'string' ? data.registryFileName : '',
      previousSessionRegistry: Array.isArray(data.previousSessionRegistry) ? (data.previousSessionRegistry as DonorRegistryEntry[]) : null,
      isDemoModeActive: Boolean(data.isDemoModeActive),
      priorAppState,
      donations,
      donationFileName: typeof data.donationFileName === 'string' ? data.donationFileName : '',
      donationErrors: Array.isArray(data.donationErrors) ? (data.donationErrors as DonationValidationError[]) : [],
      availableFunds: Array.isArray(data.availableFunds) ? (data.availableFunds as string[]) : [],
      reconciledCountNotice: typeof data.reconciledCountNotice === 'number' ? data.reconciledCountNotice : null,
      pendingNewDonors: Array.isArray(data.pendingNewDonors) ? (data.pendingNewDonors as UnregisteredDonorSummary[]) : [],
      isNewDonorsModalOpen: Boolean(data.isNewDonorsModalOpen),
      maxMonthsSetting: data.maxMonthsSetting === 'all' ? 'all' : (typeof data.maxMonthsSetting === 'number' ? data.maxMonthsSetting : 12),
      cutoffMonth: typeof data.cutoffMonth === 'string' ? data.cutoffMonth : undefined,
      discoveredMonths: Array.isArray(data.discoveredMonths) ? (data.discoveredMonths as DiscoveredMonthSummary[]) : undefined,
      selectedFund: typeof data.selectedFund === 'string' ? data.selectedFund : 'all',
      trendMetric: (data.trendMetric as TrendMetric) || 'dollar',
      sortField: (data.sortField as SortField) || 'slopeDollar',
      sortDirection: (data.sortDirection as SortDirection) || 'desc',
      sortOption: (data.sortOption as SortOption) || 'trendDesc',
      calculationModel: (data.calculationModel as TrendCalculationModel) || 'ols',
      excludeZeroDonors: typeof data.excludeZeroDonors === 'boolean' ? data.excludeZeroDonors : true,
      expandedDonorKeys: Array.isArray(data.expandedDonorKeys) ? (data.expandedDonorKeys as string[]) : [],
    };
  } catch (err) {
    console.error('Failed to revive persisted app state:', err);
    return null;
  }
}

/**
 * Synchronous read from localStorage for instant 0ms hydration on first render
 */
export function loadStateFromLocalStorageSync(): PersistedAppState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return revivePersistedState(parsed);
  } catch (err) {
    console.warn('Could not read from localStorage:', err);
    return null;
  }
}

/**
 * Synchronous write to localStorage
 */
export function saveStateToLocalStorageSync(state: PersistedAppState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // QuotaExceededError may occur if donation dataset is unusually large
    console.warn('Could not write to localStorage (will rely on IndexedDB):', err);
  }
}

function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('IndexedDB failed to open:', request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB exception:', err);
      resolve(null);
    }
  });
}

/**
 * Asynchronous read from IndexedDB (handles virtually unlimited dataset sizes)
 */
export async function loadStateFromIndexedDB(): Promise<PersistedAppState | null> {
  try {
    const db = await openIndexedDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(STATE_KEY);
      req.onsuccess = () => {
        if (req.result) {
          resolve(revivePersistedState(req.result));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
    return null;
  }
}

/**
 * Asynchronous write to IndexedDB
 */
export async function saveStateToIndexedDB(state: PersistedAppState): Promise<void> {
  try {
    const db = await openIndexedDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(state, STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Error saving to IndexedDB:', err);
  }
}

/**
 * Clear persisted state from both storages (used for full reset)
 */
export async function clearAllPersistedState(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    const db = await openIndexedDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Error clearing persisted state:', err);
  }
}
