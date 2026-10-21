export interface DonorRegistryEntry {
  donor_id: number;
  spouse_id: number | null;
  isNewFromLedger?: boolean;
}

export interface RegistryValidationError {
  rowIndex: number; // 1-indexed (e.g. line 1 for header/format error, line 2+ for data rows)
  ruleId: 0 | 1 | 2 | 3 | 4; // 0 = Test 1: File Format (Column Names & Data Types); 1-4 = Test 2: Integrity Rules
  ruleTitle: string;
  details: string;
  donor_id?: unknown;
  spouse_id?: unknown;
  testCategory?: 'format' | 'integrity';
  formatSubtype?: 'column_names' | 'data_types';
}

export interface RegistryValidationResult {
  entries: DonorRegistryEntry[];
  errors: RegistryValidationError[];
  isValid: boolean;
  formatTestPassed: boolean;
  formatErrors: RegistryValidationError[];
  integrityErrors: RegistryValidationError[];
  detectedColumns?: string[];
}

export interface DonationRecord {
  id: string;
  donor_id: number | null; // null represents anonymous or unassigned donor
  received_date: Date;
  dateStr: string;
  fund: string;
  amount: number;
  rawAmount: string;
}

export interface DonationValidationError {
  rowIndex: number;
  field: string;
  message: string;
  rawValue?: unknown;
}

export interface HouseholdEntity {
  key: string;
  primaryDonorId: number | null;
  spouseDonorId: number | null;
  donorIds: number[];
  displayName: string;
  isSpousePair: boolean;
  isAnonymous: boolean;
}

export interface MonthlyDataPoint {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "Jun 2026"
  year: number;
  month: number; // 1-12
  monthIndex: number; // 0, 1, 2... within window
  amount: number;
  giftCount: number;
}

export interface DonorTrendSummary {
  household: HouseholdEntity;
  monthlyPoints: MonthlyDataPoint[];
  totalAmount: number;
  averageMonthly: number;
  activeMonthsCount: number;
  
  // OLS linear regression: y = m*x + b
  slopeDollar: number; // $ change per month
  interceptDollar: number;
  slopeProportional: number; // percentage change per month (e.g., +15.2%/mo)
  
  // Alternative models
  windowShiftDollar: number; // difference between 2nd half and 1st half of window
  windowShiftProportional: number; // percentage change relative to averageMonthly
  theilSenSlope: number; // robust median of pairwise slopes
  theilSenIntercept: number; // robust median intercept: median(y_i - theilSenSlope * x_i)
  theilSenProportional: number; // percentage change per month relative to averageMonthly
  
  hasZeroTotal: boolean;
}

export type TrendMetric = 'dollar' | 'proportional';
export type TrendCalculationModel = 'ols' | 'theilSen' | 'windowShift';

export type SortField = 
  | 'largestAbsChange'
  | 'donorId'
  | 'totalAmount'
  | 'averageMonthly'
  | 'activeMonths'
  | 'slopeDollar'
  | 'slopeProportional';

export type SortDirection = 'asc' | 'desc';

export type SortOption = 
  | 'largestAbsChange' // Largest changes (positive or negative) at top
  | 'trendDesc'        // Steepest growth
  | 'trendAsc'         // Steepest decline
  | 'totalDesc'        // Total volume
  | 'donorIdAsc'       // Donor ID numerical
  | 'avgMonthlyDesc'   // Monthly Average
  | 'activeMonthsDesc' // Active Months
  | 'proportionalDesc'; // Proportional trend

export interface DiscoveredMonthSummary {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "June 2026"
  shortLabel: string; // "Jun '26"
  year: number;
  month: number; // 1-12
  count: number;
  totalAmount: number;
}

export interface AnalysisWindow {
  maxDate: Date | null;
  startMonthKey: string;
  endMonthKey: string;
  startMonthLabel: string;
  endMonthLabel: string;
  totalMonths: number;
  monthKeys: string[]; // Consecutive "YYYY-MM"
  monthLabels: string[];
  cutoffMonthKey?: string;
}
