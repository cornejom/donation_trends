import * as XLSX from 'xlsx';
import { 
  DonorRegistryEntry, 
  RegistryValidationError, 
  RegistryValidationResult,
  DonationRecord, 
  DonationValidationError,
  DiscoveredMonthSummary 
} from '../types';

/**
 * Validates a Donor Registry file according to:
 * 
 * FIRST TEST: File Format Validation (Column Names and Data Types)
 * - Column Names: File must contain expected headers 'donor_id' and 'spouse_id'. Rejects wrong file types, missing headers, or empty files.
 * - Data Types: 'donor_id' must be of integer data type (> 0); 'spouse_id' must be of integer data type or blank/null.
 * 
 * SECOND TEST: Relational Integrity Validation (Rules 1-4)
 * - Rule 1: donor_id must be unique across all rows.
 * - Rule 2: spouse_id must not be equal to donor_id (no self-reference).
 * - Rule 3: every populated spouse_id must exist as a registered donor_id in the registry.
 * - Rule 4: reciprocal relationship matching between spouse pairs.
 */
export function validateDonorRegistry(
  rawRows: Record<string, unknown>[],
  explicitHeaders?: string[]
): RegistryValidationResult {
  const formatErrors: RegistryValidationError[] = [];
  const integrityErrors: RegistryValidationError[] = [];
  const entries: DonorRegistryEntry[] = [];

  // ==========================================
  // TEST 1: FILE FORMAT (COLUMN NAMES & DATA TYPES)
  // ==========================================

  // Determine detected column headers
  let detectedHeaders: string[] = [];
  if (explicitHeaders && explicitHeaders.length > 0) {
    detectedHeaders = explicitHeaders.map((h) => h.trim());
  } else if (rawRows.length > 0) {
    detectedHeaders = Object.keys(rawRows[0]).map((h) => h.trim());
  }

  // --- Test 1A: Column Names Validation ---
  if (detectedHeaders.length === 0 && rawRows.length === 0) {
    formatErrors.push({
      rowIndex: 1,
      ruleId: 0,
      ruleTitle: 'Test 1 (Format): Empty File / Missing Header Row',
      details: 'The uploaded file is empty or does not contain a header row. Expected format: a table with "donor_id" and "spouse_id" columns.',
      testCategory: 'format',
      formatSubtype: 'column_names',
    });

    return {
      entries: [],
      errors: formatErrors,
      isValid: false,
      formatTestPassed: false,
      formatErrors,
      integrityErrors: [],
      detectedColumns: [],
    };
  }

  const isDonorIdHeader = (col: string) => {
    const norm = col.toLowerCase().replace(/[\s_-]/g, '');
    return norm === 'donorid' || norm === 'donor' || norm === 'id';
  };

  const isSpouseIdHeader = (col: string) => {
    const norm = col.toLowerCase().replace(/[\s_-]/g, '');
    return norm === 'spouseid' || norm === 'spouse' || norm === 'partnerid' || norm === 'partner';
  };

  const hasDonorIdCol = detectedHeaders.some(isDonorIdHeader);
  const hasSpouseIdCol = detectedHeaders.some(isSpouseIdHeader);

  if (!hasDonorIdCol || !hasSpouseIdCol) {
    if (!hasDonorIdCol && !hasSpouseIdCol) {
      formatErrors.push({
        rowIndex: 1,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Unrecognized Column Headers',
        details: `The uploaded file headers [${detectedHeaders.join(', ')}] do not match the expected donor registry format. The registry requires only two columns: "donor_id" and "spouse_id". (Fields like names, emails, or phone numbers are not used).`,
        testCategory: 'format',
        formatSubtype: 'column_names',
      });
    } else if (!hasDonorIdCol) {
      formatErrors.push({
        rowIndex: 1,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Missing Required Column "donor_id"',
        details: `Missing required column "donor_id". Detected headers: [${detectedHeaders.join(', ')}]. The registry requires only two columns: "donor_id" and "spouse_id".`,
        testCategory: 'format',
        formatSubtype: 'column_names',
      });
    } else if (!hasSpouseIdCol) {
      formatErrors.push({
        rowIndex: 1,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Missing Expected Column "spouse_id"',
        details: `Missing expected column "spouse_id". Detected headers: [${detectedHeaders.join(', ')}]. The registry requires only two columns: "donor_id" and "spouse_id".`,
        testCategory: 'format',
        formatSubtype: 'column_names',
      });
    }

    // Check for obvious mismatched file uploads (e.g. donation ledger uploaded as registry or contact export)
    const foreignKeywords = ['fund', 'amount', 'received_date', 'transaction', 'trans_id', 'email', 'name', 'address', 'phone'];
    const detectedForeign = detectedHeaders.filter((h) => 
      foreignKeywords.some((k) => h.toLowerCase().includes(k))
    );
    if (detectedForeign.length > 0) {
      formatErrors.push({
        rowIndex: 1,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Incompatible Columns Detected',
        details: `Detected unrecognized columns: [${detectedForeign.join(', ')}]. Note: Contact details (names, emails, phones) are NOT required or used by GivingPulse. Please upload a 2-column registry containing only "donor_id" and "spouse_id".`,
        testCategory: 'format',
        formatSubtype: 'column_names',
      });
    }

    // Column format failure is blocking: stop here because row fields cannot be evaluated
    return {
      entries: [],
      errors: formatErrors,
      isValid: false,
      formatTestPassed: false,
      formatErrors,
      integrityErrors: [],
      detectedColumns: detectedHeaders,
    };
  }

  // --- Test 1B: Data Types Validation ---
  const seenDonorIds = new Map<number, number>(); // donorId -> rowIndex

  rawRows.forEach((row, idx) => {
    const fileRowIndex = idx + 2; // Row 1 is header, data starts at line 2

    const donorIdRaw = findValue(row, ['donor_id', 'donorid', 'donor id', 'id']);
    const spouseIdRaw = findValue(row, ['spouse_id', 'spouseid', 'spouse id', 'spouse']);

    let donorId: number | null = null;
    let donorIdHasValidType = false;

    // Check donor_id data type
    if (donorIdRaw === undefined || donorIdRaw === null || String(donorIdRaw).trim() === '') {
      formatErrors.push({
        rowIndex: fileRowIndex,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Missing Value for "donor_id"',
        details: 'The "donor_id" cannot be blank or null. Expected a positive integer data type.',
        donor_id: donorIdRaw,
        spouse_id: spouseIdRaw,
        testCategory: 'format',
        formatSubtype: 'data_types',
      });
    } else if (typeof donorIdRaw === 'boolean' || (typeof donorIdRaw === 'object' && !(donorIdRaw instanceof Number))) {
      formatErrors.push({
        rowIndex: fileRowIndex,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): Invalid Data Type for "donor_id"',
        details: `Expected integer data type for "donor_id", found ${typeof donorIdRaw}.`,
        donor_id: donorIdRaw,
        spouse_id: spouseIdRaw,
        testCategory: 'format',
        formatSubtype: 'data_types',
      });
    } else {
      const s = String(donorIdRaw).replace(/,/g, '').trim();
      // Check for non-digit characters (text, decimals, symbols)
      if (!/^-?\d+$/.test(s)) {
        if (s.includes('.')) {
          formatErrors.push({
            rowIndex: fileRowIndex,
            ruleId: 0,
            ruleTitle: 'Test 1 (Format): Invalid Data Type for "donor_id"',
            details: `Expected whole integer data type for "donor_id", found decimal value "${donorIdRaw}".`,
            donor_id: donorIdRaw,
            spouse_id: spouseIdRaw,
            testCategory: 'format',
            formatSubtype: 'data_types',
          });
        } else {
          formatErrors.push({
            rowIndex: fileRowIndex,
            ruleId: 0,
            ruleTitle: 'Test 1 (Format): Invalid Data Type for "donor_id"',
            details: `Expected integer data type for "donor_id", found text string "${donorIdRaw}".`,
            donor_id: donorIdRaw,
            spouse_id: spouseIdRaw,
            testCategory: 'format',
            formatSubtype: 'data_types',
          });
        }
      } else {
        const num = Number(s);
        if (num <= 0) {
          formatErrors.push({
            rowIndex: fileRowIndex,
            ruleId: 0,
            ruleTitle: 'Test 1 (Format): Invalid Value Range for "donor_id"',
            details: `"donor_id" must be a strictly positive integer (> 0), found ${num}.`,
            donor_id: donorIdRaw,
            spouse_id: spouseIdRaw,
            testCategory: 'format',
            formatSubtype: 'data_types',
          });
        } else {
          donorId = num;
          donorIdHasValidType = true;
        }
      }
    }

    // Check spouse_id data type
    let spouseId: number | null = null;
    const isSpouseBlank = spouseIdRaw === undefined || spouseIdRaw === null || String(spouseIdRaw).trim() === '';

    if (!isSpouseBlank) {
      if (typeof spouseIdRaw === 'boolean' || (typeof spouseIdRaw === 'object' && !(spouseIdRaw instanceof Number))) {
        formatErrors.push({
          rowIndex: fileRowIndex,
          ruleId: 0,
          ruleTitle: 'Test 1 (Format): Invalid Data Type for "spouse_id"',
          details: `Expected integer or blank data type for "spouse_id", found ${typeof spouseIdRaw}.`,
          donor_id: donorIdRaw,
          spouse_id: spouseIdRaw,
          testCategory: 'format',
          formatSubtype: 'data_types',
        });
      } else {
        const s = String(spouseIdRaw).replace(/,/g, '').trim();
        if (!/^-?\d+$/.test(s)) {
          if (s.includes('.')) {
            formatErrors.push({
              rowIndex: fileRowIndex,
              ruleId: 0,
              ruleTitle: 'Test 1 (Format): Invalid Data Type for "spouse_id"',
              details: `Expected whole integer or blank for "spouse_id", found decimal value "${spouseIdRaw}".`,
              donor_id: donorIdRaw,
              spouse_id: spouseIdRaw,
              testCategory: 'format',
              formatSubtype: 'data_types',
            });
          } else {
            formatErrors.push({
              rowIndex: fileRowIndex,
              ruleId: 0,
              ruleTitle: 'Test 1 (Format): Invalid Data Type for "spouse_id"',
              details: `Expected integer or blank for "spouse_id", found text string "${spouseIdRaw}".`,
              donor_id: donorIdRaw,
              spouse_id: spouseIdRaw,
              testCategory: 'format',
              formatSubtype: 'data_types',
            });
          }
        } else {
          const sNum = Number(s);
          if (sNum <= 0) {
            formatErrors.push({
              rowIndex: fileRowIndex,
              ruleId: 0,
              ruleTitle: 'Test 1 (Format): Invalid Value Range for "spouse_id"',
              details: `"spouse_id" must be a positive integer or blank, found ${sNum}.`,
              donor_id: donorIdRaw,
              spouse_id: spouseIdRaw,
              testCategory: 'format',
              formatSubtype: 'data_types',
            });
          } else {
            spouseId = sNum;
          }
        }
      }
    }

    // ==========================================
    // TEST 2: RELATIONAL INTEGRITY (RULES 1 & 2)
    // ==========================================
    if (donorIdHasValidType && donorId !== null) {
      // Rule 1: Unique donor_id
      if (seenDonorIds.has(donorId)) {
        integrityErrors.push({
          rowIndex: fileRowIndex,
          ruleId: 1,
          ruleTitle: 'Rule 1: Duplicate donor_id',
          details: `donor_id ${donorId} is duplicated (already registered at Row ${seenDonorIds.get(donorId)}).`,
          donor_id: donorIdRaw,
          spouse_id: spouseIdRaw,
          testCategory: 'integrity',
        });
      } else {
        seenDonorIds.set(donorId, fileRowIndex);
      }

      // Rule 2: Non-self referential spouse
      if (spouseId !== null && spouseId === donorId) {
        integrityErrors.push({
          rowIndex: fileRowIndex,
          ruleId: 2,
          ruleTitle: 'Rule 2: Self-referential spouse_id',
          details: `spouse_id cannot be equal to donor_id (${donorId}).`,
          donor_id: donorIdRaw,
          spouse_id: spouseIdRaw,
          testCategory: 'integrity',
        });
      }

      entries.push({
        donor_id: donorId,
        spouse_id: spouseId,
      });
    }
  });

  // ==========================================
  // TEST 2: RELATIONAL INTEGRITY (RULES 3 & 4)
  // ==========================================
  const donorMap = new Map<number, { spouse_id: number | null; rowIndex: number }>();
  entries.forEach((entry, idx) => {
    donorMap.set(entry.donor_id, {
      spouse_id: entry.spouse_id,
      rowIndex: idx + 2,
    });
  });

  entries.forEach((entry, idx) => {
    const fileRowIndex = idx + 2;
    if (entry.spouse_id !== null) {
      const targetSpouse = donorMap.get(entry.spouse_id);
      
      // Rule 3: every spouse_id, if populated, must also exist as a valid donor_id
      if (!targetSpouse) {
        integrityErrors.push({
          rowIndex: fileRowIndex,
          ruleId: 3,
          ruleTitle: 'Rule 3: Spouse ID not in registry',
          details: `spouse_id ${entry.spouse_id} does not exist as a registered donor_id in this file.`,
          donor_id: entry.donor_id,
          spouse_id: entry.spouse_id,
          testCategory: 'integrity',
        });
      } else {
        // Rule 4: every row with populated spouse_id must have a reciprocal row linking both donors together
        if (targetSpouse.spouse_id !== entry.donor_id) {
          const spouseListedTarget = targetSpouse.spouse_id === null ? 'None (blank)' : targetSpouse.spouse_id;
          integrityErrors.push({
            rowIndex: fileRowIndex,
            ruleId: 4,
            ruleTitle: 'Rule 4: Non-reciprocal spouse relationship',
            details: `Donor ${entry.donor_id} lists spouse ${entry.spouse_id}, but Row ${targetSpouse.rowIndex} for donor ${entry.spouse_id} lists spouse as ${spouseListedTarget}.`,
            donor_id: entry.donor_id,
            spouse_id: entry.spouse_id,
            testCategory: 'integrity',
          });
        }
      }
    }
  });

  // Merge errors, prioritizing Test 1 (Format errors) and sorting by row index
  const allErrors = [...formatErrors, ...integrityErrors];
  allErrors.sort((a, b) => a.rowIndex - b.rowIndex || a.ruleId - b.ruleId);

  return {
    entries: allErrors.length === 0 ? entries : [],
    errors: allErrors,
    isValid: allErrors.length === 0,
    formatTestPassed: formatErrors.length === 0,
    formatErrors,
    integrityErrors,
    detectedColumns: detectedHeaders,
  };
}

/**
 * Parses and validates donation data rows from CSV/Excel
 */
/**
 * Parses numeric currency from various formats ($1,200.00, 1200, ($50.00), 50.00 USD, etc.)
 */
export function parseCurrencyAmount(val: unknown): { amount: number; isValid: boolean; rawStr: string } {
  if (val === undefined || val === null || val === '') {
    return { amount: 0, isValid: false, rawStr: '' };
  }
  if (typeof val === 'number') {
    return { amount: isNaN(val) ? 0 : val, isValid: !isNaN(val), rawStr: String(val) };
  }
  const rawStr = String(val).trim();
  // Check for accounting format: (123.45) or ($123.45)
  const isAccountingNegative = /^\s*\([^)]+\)\s*$/.test(rawStr);
  const cleaned = rawStr.replace(/[^0-9.-]/g, '');
  let num = parseFloat(cleaned);
  if (isNaN(num)) {
    return { amount: 0, isValid: false, rawStr };
  }
  if (isAccountingNegative && num > 0) {
    num = -num;
  }
  return { amount: num, isValid: true, rawStr };
}

/**
 * Flexible Date parser supporting M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, Excel serials, ISO dates
 */
export function parseFlexibleDate(dateVal: unknown): Date | null {
  if (dateVal === undefined || dateVal === null || dateVal === '') return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal;
  
  if (typeof dateVal === 'number') {
    // Excel serial date format (days since Dec 30, 1899)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + dateVal * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const clean = String(dateVal).trim();
  if (!clean) return null;

  // Check if string is a numeric Excel serial
  if (/^\d{4,6}(\.\d+)?$/.test(clean)) {
    const num = parseFloat(clean);
    if (num > 1000 && num < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + num * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try M/D/YYYY or MM/DD/YYYY
  const mdyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (mdyMatch) {
    let p1 = parseInt(mdyMatch[1], 10);
    let p2 = parseInt(mdyMatch[2], 10);
    let year = parseInt(mdyMatch[3], 10);
    if (year < 100) year += 2000;
    
    // Check if month is > 12 (likely DD/MM/YYYY)
    let month = p1 - 1;
    let day = p2;
    if (p1 > 12 && p2 <= 12) {
      month = p2 - 1;
      day = p1;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Try YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback native Date
  const fallback = new Date(clean);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }
  
  return null;
}

/**
 * Parses and validates donation data rows from CSV/Excel
 */
export function parseAndValidateDonations(rawRows: Record<string, unknown>[]): {
  donations: DonationRecord[];
  errors: DonationValidationError[];
  funds: string[];
} {
  const donations: DonationRecord[] = [];
  const errors: DonationValidationError[] = [];
  const fundsSet = new Set<string>();

  rawRows.forEach((row, idx) => {
    const fileRowIndex = idx + 2;
    
    // Match fields with extensive aliases
    const idVal = findValue(row, [
      'id', 'trans_id', 'transaction_id', 'transaction id', 'transid',
      'donation_id', 'donation id', 'gift_id', 'gift id', 'record_id', 'record id'
    ]);
    const donorIdVal = findValue(row, [
      'donor_id', 'donorid', 'donor id', 'donor', 'account_id', 'accountid', 'account id',
      'constituent_id', 'constituentid', 'constituent id', 'contact_id', 'contactid', 'contact id',
      'id_number', 'id number', 'member_id', 'member id'
    ]);
    const dateVal = findValue(row, [
      'received_date', 'receiveddate', 'received date', 'date',
      'gift_date', 'giftdate', 'gift date', 'donation_date', 'donationdate', 'donation date',
      'payment_date', 'paymentdate', 'payment date', 'transaction_date', 'transactiondate', 'transaction date',
      'trans_date', 'trans date', 'contribution_date', 'contribution date',
      'posted_date', 'posted date', 'post_date', 'post date', 'entry_date', 'entry date',
      'effective_date', 'effective date', 'timestamp', 'time'
    ]);
    const fund = extractFundFromRow(row);
    const amountVal = findValue(row, [
      'amount', 'total', 'dollar_amount', 'dollar amount',
      'gift_amount', 'giftamount', 'gift amount', 'donation_amount', 'donationamount', 'donation amount',
      'net_amount', 'net amount', 'gross_amount', 'gross amount',
      'contribution', 'payment', 'value', 'total_amount', 'total amount',
      'amt', 'gift', 'sum', 'usd', 'dollars'
    ]);

    // Parse ID
    const id = idVal !== undefined && idVal !== null && String(idVal).trim() !== ''
      ? String(idVal).trim()
      : `trans_${idx + 1}`;

    // Parse donor_id: blank/null is allowed as anonymous/unassigned
    let donorId: number | null = null;
    if (donorIdVal !== undefined && donorIdVal !== null && String(donorIdVal).trim() !== '') {
      const cleanDonorStr = String(donorIdVal).replace(/,/g, '').trim();
      const num = Number(cleanDonorStr);
      if (Number.isInteger(num) && num > 0) {
        donorId = num;
      } else {
        const numOnly = cleanDonorStr.replace(/\D/g, '');
        if (numOnly.length > 0) {
          const parsed = parseInt(numOnly, 10);
          if (parsed > 0) {
            donorId = parsed;
          }
        }
        if (!donorId) {
          errors.push({
            rowIndex: fileRowIndex,
            field: 'donor_id',
            message: `Invalid donor_id "${donorIdVal}": must be a positive integer or blank.`,
            rawValue: donorIdVal,
          });
        }
      }
    }

    // Parse Date with resilient fallback
    let parsedDate = parseFlexibleDate(dateVal);
    let dateStr = '';
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      dateStr = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
    } else {
      parsedDate = new Date();
      dateStr = `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
      if (dateVal !== undefined && dateVal !== null && String(dateVal).trim() !== '') {
        errors.push({
          rowIndex: fileRowIndex,
          field: 'received_date',
          message: `Date "${dateVal}" could not be parsed; recorded with current date for analysis.`,
          rawValue: dateVal,
        });
      }
    }

    // Fund
    fundsSet.add(fund);

    // Parse Amount
    const { amount, isValid: isAmountValid, rawStr: rawAmountStr } = parseCurrencyAmount(amountVal);
    if (!isAmountValid) {
      errors.push({
        rowIndex: fileRowIndex,
        field: 'amount',
        message: `Invalid donation amount "${amountVal}": unable to parse numeric currency.`,
        rawValue: amountVal,
      });
    }

    // Always preserve donation record so transaction totals remain 100% accurate
    donations.push({
      id,
      donor_id: donorId,
      received_date: parsedDate,
      dateStr,
      fund,
      amount,
      rawAmount: rawAmountStr,
    });
  });

  return {
    donations,
    errors,
    funds: Array.from(fundsSet).sort(),
  };
}

export interface DiscoveredFundSummary {
  name: string;
  count: number;
  totalAmount: number;
}

/**
 * Extracts all unique fund categories with record counts and total amounts from raw donation rows
 */
export function extractDiscoveredFundsFromRows(rawRows: Record<string, unknown>[]): DiscoveredFundSummary[] {
  const fundMap = new Map<string, { count: number; totalAmount: number }>();

  rawRows.forEach((row) => {
    const fund = extractFundFromRow(row);
    const amountVal = findValue(row, [
      'amount', 'total', 'dollar_amount', 'dollar amount',
      'gift_amount', 'giftamount', 'gift amount', 'donation_amount', 'donationamount', 'donation amount',
      'net_amount', 'net amount', 'gross_amount', 'gross amount',
      'contribution', 'payment', 'value', 'total_amount', 'total amount'
    ]);
    const { amount } = parseCurrencyAmount(amountVal);

    const current = fundMap.get(fund) || { count: 0, totalAmount: 0 };
    current.count += 1;
    current.totalAmount += amount;
    fundMap.set(fund, current);
  });

  return Array.from(fundMap.entries()).map(([name, stats]) => ({
    name,
    count: stats.count,
    totalAmount: stats.totalAmount,
  })).sort((a, b) => b.totalAmount - a.totalAmount);
}

const MONTH_NAMES_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT_LIST = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Extracts all unique months represented in the donation data,
 * sorted newest to oldest with count and totalAmount.
 */
export function extractDiscoveredMonthsFromRows(rawRows: Record<string, unknown>[]): DiscoveredMonthSummary[] {
  const monthMap = new Map<string, { year: number; month: number; count: number; totalAmount: number }>();

  rawRows.forEach((row) => {
    const dateVal = findValue(row, [
      'received_date', 'receiveddate', 'received date', 'date',
      'gift_date', 'giftdate', 'gift date', 'donation_date', 'donationdate', 'donation date',
      'payment_date', 'paymentdate', 'payment date', 'transaction_date', 'transactiondate', 'transaction date',
      'trans_date', 'trans date', 'contribution_date', 'contribution date',
      'posted_date', 'posted date', 'post_date', 'post date', 'entry_date', 'entry date',
      'effective_date', 'effective date', 'timestamp', 'time'
    ]);
    const parsedDate = parseFlexibleDate(dateVal);
    if (!parsedDate || isNaN(parsedDate.getTime())) return;

    const year = parsedDate.getFullYear();
    const month = parsedDate.getMonth() + 1; // 1-12
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    const amountVal = findValue(row, [
      'amount', 'total', 'dollar_amount', 'dollar amount',
      'gift_amount', 'giftamount', 'gift amount', 'donation_amount', 'donationamount', 'donation amount',
      'net_amount', 'net amount', 'gross_amount', 'gross amount',
      'contribution', 'payment', 'value', 'total_amount', 'total amount',
      'amt', 'gift', 'sum', 'usd', 'dollars'
    ]);
    const { amount } = parseCurrencyAmount(amountVal);

    const current = monthMap.get(monthKey) || { year, month, count: 0, totalAmount: 0 };
    current.count += 1;
    current.totalAmount += amount;
    monthMap.set(monthKey, current);
  });

  return Array.from(monthMap.entries())
    .map(([monthKey, stats]) => {
      const monthIndex = stats.month - 1;
      const monthLabel = `${MONTH_NAMES_LIST[monthIndex]} ${stats.year}`;
      const shortLabel = `${MONTH_SHORT_LIST[monthIndex]} '${String(stats.year).slice(-2)}`;
      return {
        monthKey,
        monthLabel,
        shortLabel,
        year: stats.year,
        month: stats.month,
        count: stats.count,
        totalAmount: stats.totalAmount,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}


/**
 * Utility to find row values across possible column alias variations
 */
export function findValue(row: Record<string, unknown>, possibleKeys: string[]): unknown {
  const rowKeys = Object.keys(row);
  for (const target of possibleKeys) {
    const matchingKey = rowKeys.find(
      (k) => k.toLowerCase().replace(/[\s_-]/g, '') === target.toLowerCase().replace(/[\s_-]/g, '')
    );
    if (matchingKey !== undefined) {
      return row[matchingKey];
    }
  }
  return undefined;
}

/**
 * Extracts fund category from row using known aliases
 */
export function extractFundFromRow(row: Record<string, unknown>): string {
  const fundVal = findValue(row, [
    'fund', 'category', 'purpose', 'designation', 'campaign',
    'fund_name', 'fundname', 'fund name', 'account', 'allocation', 'description'
  ]);
  return fundVal !== undefined && fundVal !== null && String(fundVal).trim() !== ''
    ? String(fundVal).trim()
    : 'General';
}

/**
 * Parses File (CSV or XLSX) into raw object rows
 */
export async function parseFileToRawRows(file: File): Promise<Record<string, unknown>[]> {
  const result = await parseRegistryFile(file);
  return result.rawRows;
}

/**
 * Parses registry file (CSV or XLSX) and returns both extracted headers and row records
 */
export async function parseRegistryFile(file: File): Promise<{
  rawRows: Record<string, unknown>[];
  headers: string[];
}> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'xlsx' || extension === 'xls') {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rawRows: [], headers: [] };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const sheetMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headers: string[] = Array.isArray(sheetMatrix[0])
      ? (sheetMatrix[0] as unknown[]).map((c) => String(c ?? '').trim()).filter(Boolean)
      : [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return { rawRows, headers };
  } else {
    // CSV or text format
    const text = await file.text();
    const { headers, rows } = parseCSVWithHeaders(text);
    return { rawRows: rows, headers };
  }
}

/**
 * Parses CSV string and returns both the detected header list and array of row records
 */
export function parseCSVWithHeaders(csvContent: string): {
  headers: string[];
  rows: Record<string, unknown>[];
} {
  const lines: string[] = [];
  let currentLine = '';
  let insideQuote = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    if (char === '"') {
      insideQuote = !insideQuote;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !insideQuote) {
      if (char === '\r' && csvContent[i + 1] === '\n') {
        i++; // skip \n in CRLF
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse header
  const rawHeaders = splitCSVRow(lines[0]).map((h) => h.trim());
  const normalizedHeaders = rawHeaders.map((h) => h.toLowerCase());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowValues = splitCSVRow(lines[i]);
    const rowObj: Record<string, unknown> = {};
    normalizedHeaders.forEach((header, colIdx) => {
      rowObj[header] = rowValues[colIdx] !== undefined ? rowValues[colIdx].trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Robust CSV parser that handles quotes, commas inside quotes, whitespace
 */
export function parseCSVString(csvContent: string): Record<string, unknown>[] {
  return parseCSVWithHeaders(csvContent).rows;
}

function splitCSVRow(rowStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      if (inQuotes && rowStr[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
