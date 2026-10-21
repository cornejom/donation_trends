import {
  DonationRecord,
  DonorRegistryEntry,
  HouseholdEntity,
  AnalysisWindow,
  MonthlyDataPoint,
  DonorTrendSummary,
  TrendCalculationModel,
} from '../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Builds canonical household entities from the registry.
 * Spousal pairs (where A links to B and B links to A) are unified into a single household.
 */
export function buildHouseholdMap(registry: DonorRegistryEntry[]): Map<string, HouseholdEntity> {
  const householdMap = new Map<string, HouseholdEntity>(); // donorId (as string) -> HouseholdEntity
  const visitedDonors = new Set<number>();

  // Map of donorId -> entry
  const regMap = new Map<number, DonorRegistryEntry>();
  registry.forEach((entry) => regMap.set(entry.donor_id, entry));

  registry.forEach((entry) => {
    if (visitedDonors.has(entry.donor_id)) return;

    const donorId = entry.donor_id;
    const spouseId = entry.spouse_id;

    if (spouseId !== null && regMap.has(spouseId)) {
      // Check reciprocity
      const spouseEntry = regMap.get(spouseId)!;
      if (spouseEntry.spouse_id === donorId) {
        // Reciprocal spouse pair
        const primaryId = Math.min(donorId, spouseId);
        const secondaryId = Math.max(donorId, spouseId);
        const householdKey = `household_${primaryId}_${secondaryId}`;

        const household: HouseholdEntity = {
          key: householdKey,
          primaryDonorId: primaryId,
          spouseDonorId: secondaryId,
          donorIds: [primaryId, secondaryId],
          displayName: `Household #${primaryId} & #${secondaryId}`,
          isSpousePair: true,
          isAnonymous: false,
        };

        householdMap.set(String(donorId), household);
        householdMap.set(String(spouseId), household);
        visitedDonors.add(donorId);
        visitedDonors.add(spouseId);
        return;
      }
    }

    // Individual donor without a spouse
    const householdKey = `donor_${donorId}`;
    const household: HouseholdEntity = {
      key: householdKey,
      primaryDonorId: donorId,
      spouseDonorId: null,
      donorIds: [donorId],
      displayName: `Donor #${donorId}`,
      isSpousePair: false,
      isAnonymous: false,
    };

    householdMap.set(String(donorId), household);
    visitedDonors.add(donorId);
  });

  return householdMap;
}

/**
 * Anonymous / unassigned household singleton
 */
export function getAnonymousHousehold(): HouseholdEntity {
  return {
    key: 'household_anonymous',
    primaryDonorId: null,
    spouseDonorId: null,
    donorIds: [],
    displayName: 'Anonymous & Loose Gifts',
    isSpousePair: false,
    isAnonymous: true,
  };
}

/**
 * Computes the analysis time window based on the maximum received_date and user's max months setting,
 * anchored to an optional cutoff month (e.g. to exclude incomplete current-month data).
 */
export function computeAnalysisWindow(
  donations: DonationRecord[],
  maxMonthsSetting: number | 'all',
  cutoffMonthKey?: string | null
): AnalysisWindow | null {
  if (donations.length === 0) return null;

  // Filter donations on or before cutoffMonthKey if specified
  let relevantDonations = donations;
  if (cutoffMonthKey) {
    const filtered = donations.filter((d) => {
      const y = d.received_date.getFullYear();
      const m = d.received_date.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      return key <= cutoffMonthKey;
    });
    if (filtered.length > 0) {
      relevantDonations = filtered;
    }
  }

  // Find max date & min date among relevant donations
  let maxTimestamp = -Infinity;
  let minTimestamp = Infinity;

  relevantDonations.forEach((d) => {
    const t = d.received_date.getTime();
    if (t > maxTimestamp) maxTimestamp = t;
    if (t < minTimestamp) minTimestamp = t;
  });

  if (maxTimestamp === -Infinity) return null;

  let endYear: number;
  let endMonth: number; // 0-11
  let maxDate: Date;

  if (cutoffMonthKey) {
    const [cy, cm] = cutoffMonthKey.split('-').map(Number);
    endYear = cy;
    endMonth = cm - 1;
    maxDate = new Date(endYear, endMonth + 1, 0, 23, 59, 59, 999);
  } else {
    maxDate = new Date(maxTimestamp);
    endYear = maxDate.getFullYear();
    endMonth = maxDate.getMonth();
  }

  const minDate = new Date(minTimestamp);

  // Total possible months spanning minDate to (endYear, endMonth)
  const totalAvailableMonths = Math.max(
    1,
    (endYear - minDate.getFullYear()) * 12 + (endMonth - minDate.getMonth()) + 1
  );

  const numMonths = maxMonthsSetting === 'all'
    ? totalAvailableMonths
    : Math.max(1, Math.min(maxMonthsSetting, totalAvailableMonths));

  // Generate consecutive month keys from (endMonth - numMonths + 1) up to endMonth
  const monthKeys: string[] = [];
  const monthLabels: string[] = [];

  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_SHORT[m]} '${String(y).slice(-2)}`;

    monthKeys.push(key);
    monthLabels.push(label);
  }

  // Find actual starting and ending months that contain data within this window
  const windowMonthSet = new Set(monthKeys);
  const dataMonthsInWindow = relevantDonations
    .filter((d) => {
      const key = `${d.received_date.getFullYear()}-${String(d.received_date.getMonth() + 1).padStart(2, '0')}`;
      return windowMonthSet.has(key);
    })
    .map((d) => `${d.received_date.getFullYear()}-${String(d.received_date.getMonth() + 1).padStart(2, '0')}`)
    .sort();

  const actualStartKey = dataMonthsInWindow.length > 0 ? dataMonthsInWindow[0] : monthKeys[0];
  const actualEndKey = dataMonthsInWindow.length > 0 ? dataMonthsInWindow[dataMonthsInWindow.length - 1] : monthKeys[monthKeys.length - 1];

  const formatKeyToLongLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  };

  return {
    maxDate,
    startMonthKey: actualStartKey,
    endMonthKey: actualEndKey,
    startMonthLabel: formatKeyToLongLabel(actualStartKey),
    endMonthLabel: formatKeyToLongLabel(actualEndKey),
    totalMonths: monthKeys.length,
    monthKeys,
    monthLabels,
    cutoffMonthKey: cutoffMonthKey || undefined,
  };
}


/**
 * Runs the full monthly aggregation and trend calculation pipeline
 */
export function runDonationAnalysis(
  donations: DonationRecord[],
  registry: DonorRegistryEntry[],
  window: AnalysisWindow,
  selectedFund: string | 'all',
  model: TrendCalculationModel = 'ols'
): {
  summaries: DonorTrendSummary[];
  overallTotals: {
    totalRaised: number;
    totalGifts: number;
    averagePerMonth: number;
    overallSlopeDollar: number;
    activeHouseholdsCount: number;
  };
} {
  const householdMap = buildHouseholdMap(registry);
  const anonymousHousehold = getAnonymousHousehold();

  // Filter by fund if not 'all'
  let filteredDonations = (selectedFund === 'all' || !selectedFund)
    ? donations
    : donations.filter((d) => d.fund.trim().toLowerCase() === selectedFund.trim().toLowerCase());

  // Safety fallback: if selectedFund filtered out ALL donations, but donations exist, show all donations
  if (filteredDonations.length === 0 && donations.length > 0) {
    filteredDonations = donations;
  }

  // Set of month keys in the analysis window
  const windowMonthKeys = window.monthKeys;
  const monthKeyToIndex = new Map<string, number>();
  windowMonthKeys.forEach((key, idx) => monthKeyToIndex.set(key, idx));

  // Group donations by canonical household key
  const householdDonationMap = new Map<string, {
    household: HouseholdEntity;
    monthlySums: Map<string, { amount: number; count: number }>;
  }>();

  // Initialize all known households from registry with $0 across all months
  // This ensures even donors with zero gifts in the window appear and can be filtered or inspected
  const uniqueHouseholds = new Map<string, HouseholdEntity>();
  householdMap.forEach((hh) => uniqueHouseholds.set(hh.key, hh));
  uniqueHouseholds.set(anonymousHousehold.key, anonymousHousehold);

  uniqueHouseholds.forEach((hh) => {
    const monthlySums = new Map<string, { amount: number; count: number }>();
    windowMonthKeys.forEach((key) => {
      monthlySums.set(key, { amount: 0, count: 0 });
    });
    householdDonationMap.set(hh.key, { household: hh, monthlySums });
  });

  // Aggregate donation records in window
  let totalRaised = 0;
  let totalGifts = 0;

  filteredDonations.forEach((d) => {
    const y = d.received_date.getFullYear();
    const m = d.received_date.getMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;

    if (!monthKeyToIndex.has(monthKey)) {
      return; // outside analysis window
    }

    totalRaised += d.amount;
    totalGifts += 1;

    let household: HouseholdEntity;
    if (d.donor_id === null) {
      household = anonymousHousehold;
    } else {
      household = householdMap.get(String(d.donor_id)) || {
        key: `donor_${d.donor_id}`,
        primaryDonorId: d.donor_id,
        spouseDonorId: null,
        donorIds: [d.donor_id],
        displayName: `Donor #${d.donor_id}`,
        isSpousePair: false,
        isAnonymous: false,
      };
    }

    if (!householdDonationMap.has(household.key)) {
      const monthlySums = new Map<string, { amount: number; count: number }>();
      windowMonthKeys.forEach((key) => {
        monthlySums.set(key, { amount: 0, count: 0 });
      });
      householdDonationMap.set(household.key, { household, monthlySums });
    }

    const entry = householdDonationMap.get(household.key)!;
    const current = entry.monthlySums.get(monthKey) || { amount: 0, count: 0 };
    entry.monthlySums.set(monthKey, {
      amount: current.amount + d.amount,
      count: current.count + 1,
    });
  });

  // Calculate trends for each household
  const summaries: DonorTrendSummary[] = [];

  householdDonationMap.forEach(({ household, monthlySums }) => {
    const monthlyPoints: MonthlyDataPoint[] = windowMonthKeys.map((key, idx) => {
      const data = monthlySums.get(key) || { amount: 0, count: 0 };
      const [year, month] = key.split('-').map(Number);
      return {
        monthKey: key,
        monthLabel: window.monthLabels[idx],
        year,
        month,
        monthIndex: idx,
        amount: data.amount,
        giftCount: data.count,
      };
    });

    const totalAmount = monthlyPoints.reduce((acc, p) => acc + p.amount, 0);
    const averageMonthly = windowMonthKeys.length > 0 ? totalAmount / windowMonthKeys.length : 0;
    const activeMonthsCount = monthlyPoints.filter((p) => p.amount > 0).length;

    // Trend Calculations
    const n = monthlyPoints.length;
    let slopeDollar = 0;
    let interceptDollar = averageMonthly;

    if (n >= 2) {
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;

      monthlyPoints.forEach((p) => {
        const x = p.monthIndex;
        const y = p.amount;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });

      const denominator = n * sumX2 - sumX * sumX;
      if (denominator !== 0) {
        slopeDollar = (n * sumXY - sumX * sumY) / denominator;
        interceptDollar = (sumY - slopeDollar * sumX) / n;
      }
    }

    // Proportional slope: percentage change per month relative to average giving
    // e.g., if slope is +$50/mo and mean is $500, that's +10%/mo
    let slopeProportional = 0;
    if (averageMonthly > 0) {
      slopeProportional = (slopeDollar / averageMonthly) * 100;
    }

    // Alternative model 1: Window shift (2nd half average - 1st half average)
    let windowShiftDollar = 0;
    if (n >= 2) {
      const mid = Math.floor(n / 2);
      const firstHalf = monthlyPoints.slice(0, mid);
      const secondHalf = monthlyPoints.slice(mid);
      const avg1 = firstHalf.reduce((a, b) => a + b.amount, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((a, b) => a + b.amount, 0) / secondHalf.length;
      windowShiftDollar = avg2 - avg1;
    }
    const windowShiftProportional = averageMonthly > 0 ? (windowShiftDollar / averageMonthly) * 100 : 0;

    // Alternative model 2: Theil-Sen Robust Estimator (median pairwise slope & median residual intercept)
    const { slope: theilSenSlope, intercept: theilSenIntercept } = calculateTheilSenEstimator(monthlyPoints);
    const theilSenProportional = averageMonthly > 0 ? (theilSenSlope / averageMonthly) * 100 : 0;

    summaries.push({
      household,
      monthlyPoints,
      totalAmount,
      averageMonthly,
      activeMonthsCount,
      slopeDollar,
      interceptDollar,
      slopeProportional,
      windowShiftDollar,
      windowShiftProportional,
      theilSenSlope,
      theilSenIntercept,
      theilSenProportional,
      hasZeroTotal: totalAmount === 0,
    });
  });

  // Calculate overall giving slope across all households combined
  const aggregateMonthlyTotals = windowMonthKeys.map((key, idx) => {
    let sum = 0;
    summaries.forEach((s) => {
      sum += s.monthlyPoints[idx].amount;
    });
    return { x: idx, y: sum };
  });

  let overallSlopeDollar = 0;
  if (aggregateMonthlyTotals.length >= 2) {
    if (model === 'theilSen') {
      const pts = aggregateMonthlyTotals.map((pt) => ({
        monthIndex: pt.x,
        amount: pt.y,
        monthKey: '',
        monthLabel: '',
        year: 0,
        month: 0,
        giftCount: 0,
      }));
      overallSlopeDollar = calculateTheilSenEstimator(pts).slope;
    } else if (model === 'windowShift') {
      const mid = Math.floor(aggregateMonthlyTotals.length / 2);
      const firstHalf = aggregateMonthlyTotals.slice(0, mid);
      const secondHalf = aggregateMonthlyTotals.slice(mid);
      const avg1 = firstHalf.reduce((a, b) => a + b.y, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((a, b) => a + b.y, 0) / secondHalf.length;
      overallSlopeDollar = avg2 - avg1;
    } else {
      const n = aggregateMonthlyTotals.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      aggregateMonthlyTotals.forEach(({ x, y }) => {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        overallSlopeDollar = (n * sumXY - sumX * sumY) / denom;
      }
    }
  }

  return {
    summaries,
    overallTotals: {
      totalRaised,
      totalGifts,
      averagePerMonth: windowMonthKeys.length > 0 ? totalRaised / windowMonthKeys.length : 0,
      overallSlopeDollar,
      activeHouseholdsCount: summaries.filter((s) => s.totalAmount > 0).length,
    },
  };
}

/**
 * Robust Theil-Sen estimator:
 * Slope: Median of all pairwise slopes (y_j - y_i) / (x_j - x_i)
 * Intercept: Median of residuals (y_i - slope * x_i)
 */
export function calculateTheilSenEstimator(points: MonthlyDataPoint[]): { slope: number; intercept: number } {
  if (points.length === 0) return { slope: 0, intercept: 0 };
  if (points.length === 1) return { slope: 0, intercept: points[0].amount };

  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].monthIndex - points[i].monthIndex;
      const dy = points[j].amount - points[i].amount;
      if (dx !== 0) {
        slopes.push(dy / dx);
      }
    }
  }

  let slope = 0;
  if (slopes.length > 0) {
    slopes.sort((a, b) => a - b);
    const mid = Math.floor(slopes.length / 2);
    slope = slopes.length % 2 !== 0 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
  }

  // Intercept: median of residuals (y_i - slope * x_i)
  const residuals = points.map((p) => p.amount - slope * p.monthIndex).sort((a, b) => a - b);
  const midRes = Math.floor(residuals.length / 2);
  const intercept = residuals.length % 2 !== 0 ? residuals[midRes] : (residuals[midRes - 1] + residuals[midRes]) / 2;

  return { slope, intercept };
}
