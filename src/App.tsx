import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DonorRegistryEntry,
  RegistryValidationError,
  DonationRecord,
  DonationValidationError,
  AnalysisWindow,
  DonorTrendSummary,
  TrendMetric,
  SortOption,
  SortField,
  SortDirection,
  TrendCalculationModel,
  DiscoveredMonthSummary,
} from './types';
import {
  validateDonorRegistry,
  parseAndValidateDonations,
  parseFileToRawRows,
  parseRegistryFile,
  parseCSVWithHeaders,
  parseCSVString,
  extractDiscoveredFundsFromRows,
  extractDiscoveredMonthsFromRows,
  extractFundFromRow,
  DiscoveredFundSummary,
} from './utils/validation';
import {
  getSavedSessionRegistry,
  saveSessionRegistry,
  createRegistryFromDonationIds,
  reconcileRegistryWithDonations,
  downloadRegistryCSV,
  getDefaultRegistryExportFilename,
  findUnregisteredDonors,
  UnregisteredDonorSummary,
} from './utils/registryManager';
import {
  PriorAppState,
  PersistedAppState,
  loadStateFromLocalStorageSync,
  saveStateToLocalStorageSync,
  loadStateFromIndexedDB,
  saveStateToIndexedDB,
} from './utils/statePersistence';
import { computeAnalysisWindow, runDonationAnalysis } from './utils/analysis';
import {
  SAMPLE_DONATIONS_CSV,
  SAMPLE_VALID_REGISTRY_CSV,
  SAMPLE_INVALID_REGISTRY_CSV,
  SAMPLE_FORMAT_ERROR_REGISTRY_CSV,
  SAMPLE_DATA_TYPE_ERROR_REGISTRY_CSV,
} from './data/sampleData';
import { RunChart } from './components/RunChart';
import { ValidationErrorsDrawer } from './components/ValidationErrorsDrawer';
import { RegistryManagerModal } from './components/RegistryManagerModal';
import { NewDonorsReviewModal } from './components/NewDonorsReviewModal';
import { FundSelectionModal } from './components/FundSelectionModal';
import { FilterControls } from './components/FilterControls';
import {
  Upload,
  FileSpreadsheet,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Download,
  AlertTriangle,
  HeartHandshake,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Lock,
  AlertCircle,
  Share2,
  Check,
  SlidersHorizontal,
  X,
} from 'lucide-react';

const SHARED_APP_URL = 'https://ais-pre-mcndw6y6z2oppwetgn7tbx-716962693128.us-west2.run.app';

// Synchronous read on module load for instant 0ms hydration on page reload
const initialSavedState = loadStateFromLocalStorageSync();

export default function App() {
  // --- State: Registry ---
  const [registry, setRegistry] = useState<DonorRegistryEntry[]>(() => initialSavedState?.registry ?? []);
  const [registrySource, setRegistrySource] = useState<'uploaded' | 'previous_session' | 'auto_detected' | 'sample' | 'none'>(
    () => initialSavedState?.registrySource ?? 'none'
  );
  const [registryErrors, setRegistryErrors] = useState<RegistryValidationError[]>(() => {
    if (initialSavedState?.registryFileName?.includes('sample_format_error') || initialSavedState?.registryFileName?.includes('wrong_columns')) {
      return [];
    }
    return initialSavedState?.registryErrors ?? [];
  });
  const [registryFileName, setRegistryFileName] = useState<string>(() => {
    if (initialSavedState?.registryFileName?.includes('sample_format_error') || initialSavedState?.registryFileName?.includes('wrong_columns')) {
      return '';
    }
    return initialSavedState?.registryFileName ?? '';
  });
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [previousSessionRegistry, setPreviousSessionRegistry] = useState<DonorRegistryEntry[] | null>(() => {
    return initialSavedState?.previousSessionRegistry ?? initialSavedState?.priorAppState?.previousSessionRegistry ?? getSavedSessionRegistry();
  });

  // --- State: Demo Mode & Snapshot Restoration ---
  const [isDemoModeActive, setIsDemoModeActive] = useState<boolean>(() => initialSavedState?.isDemoModeActive ?? false);
  const [priorAppState, setPriorAppState] = useState<PriorAppState | null>(() => initialSavedState?.priorAppState ?? null);
  const [demoScrollTrigger, setDemoScrollTrigger] = useState<number>(0);

  // --- State: Donations ---
  const [donations, setDonations] = useState<DonationRecord[]>(() => initialSavedState?.donations ?? []);
  const [donationErrors, setDonationErrors] = useState<DonationValidationError[]>(() => initialSavedState?.donationErrors ?? []);
  const [donationFileName, setDonationFileName] = useState<string>(() => initialSavedState?.donationFileName ?? '');
  const [availableFunds, setAvailableFunds] = useState<string[]>(() => initialSavedState?.availableFunds ?? []);
  const [reconciledCountNotice, setReconciledCountNotice] = useState<number | null>(() => initialSavedState?.reconciledCountNotice ?? null);
  const [pendingNewDonors, setPendingNewDonors] = useState<UnregisteredDonorSummary[]>(() => initialSavedState?.pendingNewDonors ?? []);
  const [isNewDonorsModalOpen, setIsNewDonorsModalOpen] = useState(false);

  // --- State: Analysis Filters & Controls ---
  const [maxMonthsSetting, setMaxMonthsSetting] = useState<number | 'all'>(() => initialSavedState?.maxMonthsSetting ?? 12);
  const [cutoffMonth, setCutoffMonth] = useState<string | undefined>(() => initialSavedState?.cutoffMonth);
  const [discoveredMonths, setDiscoveredMonths] = useState<DiscoveredMonthSummary[]>(() => initialSavedState?.discoveredMonths ?? []);
  const [selectedFund, setSelectedFund] = useState<string | 'all'>(() => initialSavedState?.selectedFund ?? 'all');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>(() => initialSavedState?.trendMetric ?? 'dollar');
  const [sortField, setSortField] = useState<SortField>(() => initialSavedState?.sortField ?? 'slopeDollar');
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => initialSavedState?.sortDirection ?? 'desc');
  const [sortOption, setSortOption] = useState<SortOption>(() => initialSavedState?.sortOption ?? 'trendDesc');
  const [calculationModel, setCalculationModel] = useState<TrendCalculationModel>(() => initialSavedState?.calculationModel ?? 'ols');
  const [excludeZeroDonors, setExcludeZeroDonors] = useState<boolean>(() => initialSavedState?.excludeZeroDonors ?? true);

  // --- State: Expanded Run Chart Accordion ---
  const [expandedDonorKeys, setExpandedDonorKeys] = useState<Set<string>>(
    () => new Set(initialSavedState?.expandedDonorKeys ?? [])
  );

  // --- State: Pending Ingestion Fund Selection ---
  const [pendingDonationRawRows, setPendingDonationRawRows] = useState<Record<string, unknown>[] | null>(null);
  const [pendingDonationFileName, setPendingDonationFileName] = useState<string>('');
  const [discoveredFunds, setDiscoveredFunds] = useState<DiscoveredFundSummary[]>([]);
  const [isFundSelectionModalOpen, setIsFundSelectionModalOpen] = useState(false);
  const [isPendingDemo, setIsPendingDemo] = useState(false);

  // --- State: Copy Share Link Feedback ---
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARED_APP_URL);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      const input = document.createElement('input');
      input.value = SHARED_APP_URL;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Hidden file input refs
  const registryFileInputRef = useRef<HTMLInputElement>(null);
  const donationFileInputRef = useRef<HTMLInputElement>(null);

  // Reference to the demo banner and analysis section for smooth scrolling
  const demoBannerRef = useRef<HTMLDivElement | null>(null);
  const analysisRef = useRef<HTMLDivElement | null>(null);
  const prevDemoActiveRef = useRef(isDemoModeActive);
  const isInitialMountRef = useRef(true);

  // Dedicated helper to scroll the analysis dashboard to the top of the viewport
  // positioned directly beneath the sticky header and sticky DEMO MODE ACTIVE banner.
  const scrollToAnalysis = (behavior: ScrollBehavior = 'smooth') => {
    const performScroll = (forceInstant = false) => {
      const headerEl = document.querySelector('header');
      const bannerEl = document.getElementById('demo-mode-banner') || demoBannerRef.current;
      const analysisEl = document.getElementById('analysis-section') || analysisRef.current;

      const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 64;
      const bannerHeight = bannerEl ? bannerEl.getBoundingClientRect().height : (isDemoModeActive ? 42 : 0);
      const totalStickyOffset = Math.round(headerHeight + bannerHeight);

      if (analysisEl) {
        // Calculate exact target Y position where analysis sits flush right below the sticky banner
        const rect = analysisEl.getBoundingClientRect();
        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const targetY = Math.max(0, Math.round(rect.top + currentScrollY - totalStickyOffset));

        const scrollMode: ScrollBehavior = forceInstant ? 'auto' : behavior;

        window.scrollTo({ top: targetY, behavior: scrollMode });
        if (document.documentElement) {
          document.documentElement.scrollTo({ top: targetY, behavior: scrollMode });
        }
        if (document.body) {
          document.body.scrollTo({ top: targetY, behavior: scrollMode });
        }

        // Dynamically ensure scrollMarginTop matches the combined sticky offset
        analysisEl.style.scrollMarginTop = `${totalStickyOffset}px`;
      } else {
        // Fallback if analysisEl is not yet mounted: scroll to top 0
        window.scrollTo({ top: 0, behavior });
      }
    };

    // Staggered attempts to guarantee scroll after React re-renders and unmounts modals:
    performScroll();

    requestAnimationFrame(() => {
      performScroll();
    });

    const t1 = setTimeout(() => performScroll(), 60);
    const t2 = setTimeout(() => performScroll(), 160);
    const t3 = setTimeout(() => performScroll(), 320);

    // Final instant check: ensures position if smooth scrolling was cancelled in iframe
    const t4 = setTimeout(() => {
      performScroll(true);
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  };

  const scrollToDemo = scrollToAnalysis;

  // Whenever demo mode is activated or demo dataset is loaded, scroll the analysis
  // directly beneath the DEMO MODE ACTIVE banner.
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevDemoActiveRef.current = isDemoModeActive;
      return;
    }

    if (isDemoModeActive || demoScrollTrigger > 0) {
      scrollToAnalysis();
    }
    prevDemoActiveRef.current = isDemoModeActive;
  }, [isDemoModeActive, demoScrollTrigger]);

  // Track hydration and latest state for persistence
  const isHydratedRef = useRef(false);
  const latestStateRef = useRef<PersistedAppState | null>(null);

  // Keep latestStateRef updated for unload and debounced save
  latestStateRef.current = {
    version: 2,
    timestamp: Date.now(),
    registry,
    registrySource,
    registryErrors,
    registryFileName,
    previousSessionRegistry: previousSessionRegistry && previousSessionRegistry.length > 0 ? previousSessionRegistry : getSavedSessionRegistry(),
    isDemoModeActive,
    priorAppState,
    donations,
    donationFileName,
    donationErrors,
    availableFunds,
    reconciledCountNotice,
    pendingNewDonors,
    isNewDonorsModalOpen,
    maxMonthsSetting,
    cutoffMonth,
    discoveredMonths,
    selectedFund,
    trendMetric,
    sortField,
    sortDirection,
    sortOption,
    calculationModel,
    excludeZeroDonors,
    expandedDonorKeys: Array.from(expandedDonorKeys),
  };

  // Reconcile with IndexedDB on mount if it contains newer or larger dataset
  useEffect(() => {
    let isCancelled = false;

    const savedReg = getSavedSessionRegistry();
    if (savedReg && savedReg.length > 0) {
      setPreviousSessionRegistry((curr) => curr ?? savedReg);
    }

    async function hydrateFromIndexedDB() {
      try {
        const idbState = await loadStateFromIndexedDB();
        if (isCancelled || !idbState) {
          isHydratedRef.current = true;
          return;
        }

        const localTimestamp = initialSavedState?.timestamp ?? 0;
        if (!initialSavedState || idbState.timestamp > localTimestamp) {
          setRegistry(idbState.registry);
          if (idbState.registryFileName?.includes('sample_format_error') || idbState.registryFileName?.includes('wrong_columns')) {
            setRegistryErrors([]);
            setRegistryFileName('');
          } else {
            setRegistryErrors(idbState.registryErrors);
            setRegistryFileName(idbState.registryFileName);
          }
          if (idbState.previousSessionRegistry && idbState.previousSessionRegistry.length > 0) {
            setPreviousSessionRegistry(idbState.previousSessionRegistry);
          }
          setIsDemoModeActive(idbState.isDemoModeActive);
          setPriorAppState(idbState.priorAppState);
          setDonations(idbState.donations);
          setDonationFileName(idbState.donationFileName);
          setDonationErrors(idbState.donationErrors);
          setAvailableFunds(idbState.availableFunds);
          setReconciledCountNotice(idbState.reconciledCountNotice);
          setPendingNewDonors(idbState.pendingNewDonors);
          setIsNewDonorsModalOpen(idbState.isNewDonorsModalOpen);
          setMaxMonthsSetting(idbState.maxMonthsSetting);
          if (idbState.cutoffMonth) setCutoffMonth(idbState.cutoffMonth);
          if (idbState.discoveredMonths) setDiscoveredMonths(idbState.discoveredMonths);
          setSelectedFund(idbState.selectedFund);
          setTrendMetric(idbState.trendMetric);
          setSortField(idbState.sortField);
          setSortDirection(idbState.sortDirection);
          setSortOption(idbState.sortOption);
          setCalculationModel(idbState.calculationModel);
          setExcludeZeroDonors(idbState.excludeZeroDonors);
          setExpandedDonorKeys(new Set(idbState.expandedDonorKeys));
        }
      } catch (err) {
        console.warn('Hydration from IndexedDB error:', err);
      } finally {
        isHydratedRef.current = true;
      }
    }

    hydrateFromIndexedDB();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Debounced auto-save effect whenever state changes
  useEffect(() => {
    if (!isHydratedRef.current) return;

    const timer = setTimeout(() => {
      if (latestStateRef.current) {
        saveStateToLocalStorageSync(latestStateRef.current);
        saveStateToIndexedDB(latestStateRef.current);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [
    registry,
    registrySource,
    registryErrors,
    registryFileName,
    isDemoModeActive,
    priorAppState,
    donations,
    donationFileName,
    donationErrors,
    availableFunds,
    reconciledCountNotice,
    pendingNewDonors,
    isNewDonorsModalOpen,
    maxMonthsSetting,
    cutoffMonth,
    discoveredMonths,
    selectedFund,
    trendMetric,
    sortField,
    sortDirection,
    sortOption,
    calculationModel,
    excludeZeroDonors,
    expandedDonorKeys,
  ]);

  // Flush state immediately on unload or page hide (e.g. tab refresh, window reload, dev update)
  useEffect(() => {
    const handleUnload = () => {
      if (latestStateRef.current && isHydratedRef.current) {
        saveStateToLocalStorageSync(latestStateRef.current);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  // --- Handle Registry Ingestion ---
  const handleRegistryUpload = async (file: File) => {
    setRegistryFileName(file.name);
    setRegistryErrors([]);
    try {
      const { rawRows, headers } = await parseRegistryFile(file);
      const { entries, errors, isValid } = validateDonorRegistry(rawRows, headers);

      if (!isValid) {
        setRegistryErrors(errors);
        setRegistrySource('none');
        return;
      }

      setRegistry(entries);
      setRegistrySource('uploaded');
      saveSessionRegistry(entries);
      setPreviousSessionRegistry(entries);

      // If donations already loaded, check for unregistered donor IDs
      if (donations.length > 0) {
        const unregistered = findUnregisteredDonors(entries, donations);
        if (unregistered.length > 0) {
          setPendingNewDonors(unregistered);
          setIsNewDonorsModalOpen(true);
        }
      }
    } catch (err) {
      console.error(err);
      setRegistrySource('none');
      setRegistryErrors([{
        rowIndex: 1,
        ruleId: 0,
        ruleTitle: 'Test 1 (Format): File Read Failure',
        details: 'Unable to parse the uploaded file as a valid CSV or Excel spreadsheet. Please ensure the file is not corrupted.',
        testCategory: 'format',
        formatSubtype: 'column_names',
      }]);
    }
  };

  const handleUsePreviousSessionRegistry = () => {
    const regToUse = (previousSessionRegistry && previousSessionRegistry.length > 0)
      ? previousSessionRegistry
      : getSavedSessionRegistry();
    if (!regToUse || regToUse.length === 0) return;
    setRegistry(regToUse);
    setRegistrySource('previous_session');
    setRegistryErrors([]);
    setPreviousSessionRegistry(regToUse);
    saveSessionRegistry(regToUse);

    // If donations already exist, check for unregistered donor IDs
    if (donations.length > 0) {
      const unregistered = findUnregisteredDonors(regToUse, donations);
      if (unregistered.length > 0) {
        setPendingNewDonors(unregistered);
        setIsNewDonorsModalOpen(true);
      }
    }
  };

  const handleProceedWithoutRegistry = () => {
    setRegistrySource('auto_detected');
    setRegistry([]);
    setRegistryErrors([]);

    // If donations already exist, build registry immediately
    if (donations.length > 0) {
      const donationIds = donations.map((d) => d.donor_id);
      const autoReg = createRegistryFromDonationIds(donationIds);
      setRegistry(autoReg);
      saveSessionRegistry(autoReg);
    }
  };

  // Step 1 completion check: user has specified how the registry will be handled
  const isStep1Complete = registrySource !== 'none';

  // --- Handle Donation File Ingestion ---
  const handleDonationUpload = async (file: File) => {
    // If user hasn't selected a registry in Step 1, auto-synthesize from donation log
    if (registrySource === 'none') {
      setRegistrySource('auto_detected');
    }
    setDonationErrors([]);
    try {
      const rawRows = await parseFileToRawRows(file);
      if (!rawRows || rawRows.length === 0) {
        setDonationErrors([{
          rowIndex: 1,
          field: 'Empty File',
          message: 'The uploaded file appears to be empty or contains no data rows.',
        }]);
        return;
      }
      const funds = extractDiscoveredFundsFromRows(rawRows);
      const months = extractDiscoveredMonthsFromRows(rawRows);
      setPendingDonationRawRows(rawRows);
      setPendingDonationFileName(file.name);
      setDiscoveredFunds(funds);
      setDiscoveredMonths(months);
      if (months.length > 0) {
        setCutoffMonth(months[0].monthKey);
      }
      setIsPendingDemo(false);
      setIsFundSelectionModalOpen(true);
    } catch (err) {
      console.error(err);
      setDonationErrors([{
        rowIndex: 1,
        field: 'File Read Failure',
        message: 'Failed to parse the donation file. Please ensure it is a valid CSV or Excel file.',
      }]);
    }
  };

  const handleConfirmFundSelection = (selectedFundNames: string[], selectedCutoffMonth?: string) => {
    if (!pendingDonationRawRows) return;

    if (selectedCutoffMonth) {
      setCutoffMonth(selectedCutoffMonth);
    }

    // Filter raw rows to only include selected fund categories (case-insensitive & trimmed)
    const normalizedSelectedFunds = new Set(selectedFundNames.map((s) => s.trim().toLowerCase()));
    const filteredRows = pendingDonationRawRows.filter((row) => {
      const fund = extractFundFromRow(row);
      return normalizedSelectedFunds.has(fund.trim().toLowerCase());
    });

    // Reset fund filter to 'all' so the dashboard presents all processed categories
    setSelectedFund('all');

    if (isPendingDemo) {
      // 0. Snapshot existing app state before loading demo data if not already in demo mode
      if (!isDemoModeActive) {
        setPriorAppState({
          registry: [...registry],
          registrySource,
          registryErrors: [...registryErrors],
          registryFileName,
          previousSessionRegistry: previousSessionRegistry ? [...previousSessionRegistry] : null,
          donations: [...donations],
          donationErrors: [...donationErrors],
          donationFileName,
          availableFunds: [...availableFunds],
          reconciledCountNotice,
          pendingNewDonors: [...pendingNewDonors],
          isNewDonorsModalOpen,
          maxMonthsSetting,
          cutoffMonth,
          discoveredMonths,
          selectedFund,
          trendMetric,
          sortField,
          sortDirection,
          sortOption,
          calculationModel,
          excludeZeroDonors,
          expandedDonorKeys: Array.from(expandedDonorKeys),
        });
      }
      setIsDemoModeActive(true);

      // 1. Load valid sample registry (40 unique donors, 5 reciprocal spouse pairs, all 6-digit IDs)
      const regRows = parseCSVString(SAMPLE_VALID_REGISTRY_CSV);
      const { entries } = validateDonorRegistry(regRows);

      // 2. Load filtered sample donations
      const { donations: parsedDonations, errors, funds } = parseAndValidateDonations(filteredRows);
      setDonationErrors(errors);
      setDonations(parsedDonations);
      setAvailableFunds(funds);
      setDonationFileName('sample_donations_ledger.csv');
      setSelectedFund('all');

      // 3. Reconcile
      const donorIds = parsedDonations.map((d) => d.donor_id);
      const { updatedRegistry, appendedCount } = reconcileRegistryWithDonations(entries, donorIds);
      setRegistry(updatedRegistry);
      setRegistrySource('sample');
      setRegistryFileName('sample_donor_registry.csv');
      saveSessionRegistry(updatedRegistry);
      setPreviousSessionRegistry(updatedRegistry);
      setRegistryErrors([]);
      if (appendedCount > 0) {
        setReconciledCountNotice(appendedCount);
      }

      // 4. Default sorting to "Trend ($/mo)" descending
      setSortField('slopeDollar');
      setSortDirection('desc');
      setSortOption('trendDesc');
      setTrendMetric('dollar');

      // All charts in the trend leaderboard start collapsed when demo data is loaded
      setExpandedDonorKeys(new Set());

      // Whenever demo mode is activated, scroll the analysis directly beneath the DEMO MODE ACTIVE banner
      setDemoScrollTrigger((prev) => prev + 1);
      scrollToAnalysis();
    } else {
      processRawDonationRows(filteredRows, pendingDonationFileName);
    }

    setIsFundSelectionModalOpen(false);
    setPendingDonationRawRows(null);
    setPendingDonationFileName('');
    setDiscoveredFunds([]);
    setIsPendingDemo(false);
  };

  const handleCancelFundSelection = () => {
    setIsFundSelectionModalOpen(false);
    setPendingDonationRawRows(null);
    setPendingDonationFileName('');
    setDiscoveredFunds([]);
    setIsPendingDemo(false);
    if (donationFileInputRef.current) {
      donationFileInputRef.current.value = '';
    }
  };

  const processRawDonationRows = (rawRows: Record<string, unknown>[], fileNameStr: string) => {
    const { donations: parsedDonations, errors, funds } = parseAndValidateDonations(rawRows);
    setDonationErrors(errors);
    setDonations(parsedDonations);
    setAvailableFunds(funds);
    setDonationFileName(fileNameStr);
    setSelectedFund('all');

    const donationIds = parsedDonations.map((d) => d.donor_id);

    if (registry.length === 0 || registrySource === 'auto_detected') {
      // Auto-create/refresh registry from the incoming donation file
      const autoReg = createRegistryFromDonationIds(donationIds);
      setRegistry(autoReg);
      setRegistrySource('auto_detected');
      saveSessionRegistry(autoReg);
    } else {
      // Check for unregistered donor IDs and prompt user with review modal
      const unregistered = findUnregisteredDonors(registry, parsedDonations);
      if (unregistered.length > 0) {
        setPendingNewDonors(unregistered);
        setIsNewDonorsModalOpen(true);
      }
    }
  };

  // --- Handle Approving New Donor IDs from Review Modal ---
  const handleApproveNewDonors = (approvedEntries: DonorRegistryEntry[]) => {
    let updated = [...registry];

    approvedEntries.forEach((newEntry) => {
      // Add if not already present
      if (!updated.some((r) => r.donor_id === newEntry.donor_id)) {
        updated.push({
          ...newEntry,
          isNewFromLedger: true,
        });
      }

      // If spouse was assigned, link reciprocally (Rule 4)
      if (newEntry.spouse_id !== null) {
        const sId = newEntry.spouse_id;
        const spouseIndex = updated.findIndex((r) => r.donor_id === sId);
        if (spouseIndex >= 0) {
          updated[spouseIndex] = {
            ...updated[spouseIndex],
            spouse_id: newEntry.donor_id,
          };
        }
      }
    });

    setRegistry(updated);
    saveSessionRegistry(updated);
    setPreviousSessionRegistry(updated);
    setReconciledCountNotice(approvedEntries.length);
    setPendingNewDonors([]);
  };

  // --- 1-Click Sample Dataset Loader (Demo Mode) ---
  const handleLoadSampleDataset = () => {
    const donationRows = parseCSVString(SAMPLE_DONATIONS_CSV);
    const funds = extractDiscoveredFundsFromRows(donationRows);
    const months = extractDiscoveredMonthsFromRows(donationRows);
    setPendingDonationRawRows(donationRows);
    setPendingDonationFileName('sample_donations_ledger.csv');
    setDiscoveredFunds(funds);
    setDiscoveredMonths(months);
    if (months.length > 0) {
      setCutoffMonth(months[0].monthKey);
    }
    setIsPendingDemo(true);
    setExpandedDonorKeys(new Set());
    setIsFundSelectionModalOpen(true);
  };

  // --- End the Demo (Restores app state to prior to demo loading) ---
  const handleEndDemo = () => {
    if (priorAppState) {
      setRegistry(priorAppState.registry);
      setRegistrySource(priorAppState.registrySource);
      setRegistryErrors(priorAppState.registryErrors);
      setRegistryFileName(priorAppState.registryFileName);
      setPreviousSessionRegistry(priorAppState.previousSessionRegistry);
      setDonations(priorAppState.donations);
      setDonationErrors(priorAppState.donationErrors);
      setDonationFileName(priorAppState.donationFileName);
      setAvailableFunds(priorAppState.availableFunds);
      setReconciledCountNotice(priorAppState.reconciledCountNotice);
      setPendingNewDonors(priorAppState.pendingNewDonors);
      setIsNewDonorsModalOpen(priorAppState.isNewDonorsModalOpen);
      setMaxMonthsSetting(priorAppState.maxMonthsSetting);
      setCutoffMonth(priorAppState.cutoffMonth);
      setDiscoveredMonths(priorAppState.discoveredMonths ?? []);
      setSelectedFund(priorAppState.selectedFund);
      setTrendMetric(priorAppState.trendMetric);
      setSortField(priorAppState.sortField);
      setSortDirection(priorAppState.sortDirection);
      setSortOption(priorAppState.sortOption);
      setCalculationModel(priorAppState.calculationModel);
      setExcludeZeroDonors(priorAppState.excludeZeroDonors);
      setExpandedDonorKeys(new Set(priorAppState.expandedDonorKeys));
      if (priorAppState.registry && priorAppState.registry.length > 0) {
        saveSessionRegistry(priorAppState.registry);
      }
      if (priorAppState.previousSessionRegistry && priorAppState.previousSessionRegistry.length > 0) {
        setPreviousSessionRegistry(priorAppState.previousSessionRegistry);
      } else {
        const cached = getSavedSessionRegistry();
        if (cached && cached.length > 0) setPreviousSessionRegistry(cached);
      }
    } else {
      // Clean fallback if prior state wasn't captured
      setDonations([]);
      setDonationErrors([]);
      setDonationFileName('');
      setAvailableFunds([]);
      setCutoffMonth(undefined);
      setDiscoveredMonths([]);
      setRegistry([]);
      setRegistrySource('none');
      setRegistryErrors([]);
      setRegistryFileName('');
      setReconciledCountNotice(null);
      setExpandedDonorKeys(new Set());
      const cached = getSavedSessionRegistry();
      if (cached && cached.length > 0) setPreviousSessionRegistry(cached);
    }

    if (donationFileInputRef.current) donationFileInputRef.current.value = '';
    if (registryFileInputRef.current) registryFileInputRef.current.value = '';
    setIsDemoModeActive(false);
    setPriorAppState(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Test Validation Drawer (Test 1 Format & Test 2 Integrity) ---
  const handleLoadFormatErrorSampleRegistry = () => {
    const { headers, rows } = parseCSVWithHeaders(SAMPLE_FORMAT_ERROR_REGISTRY_CSV);
    const { errors } = validateDonorRegistry(rows, headers);
    setRegistryErrors(errors);
    setRegistryFileName('sample_format_error_wrong_columns.csv');
    setRegistrySource('none');
  };

  const handleLoadDataTypeErrorSampleRegistry = () => {
    const { headers, rows } = parseCSVWithHeaders(SAMPLE_DATA_TYPE_ERROR_REGISTRY_CSV);
    const { errors } = validateDonorRegistry(rows, headers);
    setRegistryErrors(errors);
    setRegistryFileName('sample_datatype_error_invalid_types.csv');
    setRegistrySource('none');
  };

  const handleLoadInvalidSampleRegistry = () => {
    const { headers, rows } = parseCSVWithHeaders(SAMPLE_INVALID_REGISTRY_CSV);
    const { errors } = validateDonorRegistry(rows, headers);
    setRegistryErrors(errors);
    setRegistryFileName('sample_integrity_rules_error.csv');
    setRegistrySource('none');
  };

  // --- Clear Donations ---
  const handleClearDonations = () => {
    setDonations([]);
    setDonationErrors([]);
    setDonationFileName('');
    setAvailableFunds([]);
    setCutoffMonth(undefined);
    setDiscoveredMonths([]);
    setReconciledCountNotice(null);
    setExpandedDonorKeys(new Set());
    setSortField('slopeDollar');
    setSortDirection('desc');
    setSortOption('trendDesc');
    setTrendMetric('dollar');
    if (donationFileInputRef.current) donationFileInputRef.current.value = '';
    // Note: Donor registry (registry, registryFileName, registrySource, registryErrors) is NOT affected
  };

  // Ensure we always have the list of months represented in the current donation data (newest to oldest)
  const availableMonths = useMemo(() => {
    if (discoveredMonths && discoveredMonths.length > 0) {
      return discoveredMonths;
    }
    if (donations.length > 0) {
      const monthMap = new Map<string, { year: number; month: number; count: number; totalAmount: number }>();
      donations.forEach((d) => {
        const year = d.received_date.getFullYear();
        const month = d.received_date.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const current = monthMap.get(monthKey) || { year, month, count: 0, totalAmount: 0 };
        current.count += 1;
        current.totalAmount += d.amount;
        monthMap.set(monthKey, current);
      });
      const MONTH_NAMES_LIST = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const MONTH_SHORT_LIST = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return Array.from(monthMap.entries())
        .map(([monthKey, stats]) => ({
          monthKey,
          monthLabel: `${MONTH_NAMES_LIST[stats.month - 1]} ${stats.year}`,
          shortLabel: `${MONTH_SHORT_LIST[stats.month - 1]} '${String(stats.year).slice(-2)}`,
          year: stats.year,
          month: stats.month,
          count: stats.count,
          totalAmount: stats.totalAmount,
        }))
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }
    return [];
  }, [discoveredMonths, donations]);

  // --- Pipeline Computation ---
  const analysisWindow: AnalysisWindow | null = useMemo(() => {
    if (donations.length === 0) return null;
    return computeAnalysisWindow(donations, maxMonthsSetting, cutoffMonth);
  }, [donations, maxMonthsSetting, cutoffMonth]);

  const { summaries, overallTotals } = useMemo(() => {
    if (!analysisWindow || donations.length === 0) {
      return {
        summaries: [],
        overallTotals: {
          totalRaised: 0,
          totalGifts: 0,
          averagePerMonth: 0,
          overallSlopeDollar: 0,
          activeHouseholdsCount: 0,
        },
      };
    }
    return runDonationAnalysis(
      donations,
      registry,
      analysisWindow,
      selectedFund,
      calculationModel
    );
  }, [donations, registry, analysisWindow, selectedFund, calculationModel]);

  // --- Filter and Sort Donors ---
  const filteredAndSortedSummaries = useMemo(() => {
    let result = [...summaries];

    // Filter out zero donors if requested
    if (excludeZeroDonors) {
      result = result.filter((s) => !s.hasZeroTotal);
    }

    // Sort by selected field and direction
    result.sort((a, b) => {
      let diff = 0;

      if (sortField === 'largestAbsChange') {
        const getMetricVal = (s: DonorTrendSummary) => {
          if (calculationModel === 'theilSen') return Math.abs(s.theilSenSlope);
          if (calculationModel === 'windowShift') return Math.abs(s.windowShiftDollar);
          return Math.abs(trendMetric === 'dollar' ? s.slopeDollar : s.slopeProportional);
        };
        diff = getMetricVal(b) - getMetricVal(a);
        return sortDirection === 'desc' ? diff : -diff;
      }

      if (sortField === 'donorId') {
        const idA = a.household.primaryDonorId ?? 999999999;
        const idB = b.household.primaryDonorId ?? 999999999;
        diff = idA - idB;
        return sortDirection === 'asc' ? diff : -diff;
      }

      if (sortField === 'totalAmount') {
        diff = b.totalAmount - a.totalAmount;
        return sortDirection === 'desc' ? diff : -diff;
      }

      if (sortField === 'averageMonthly') {
        diff = b.averageMonthly - a.averageMonthly;
        return sortDirection === 'desc' ? diff : -diff;
      }

      if (sortField === 'activeMonths') {
        diff = b.activeMonthsCount - a.activeMonthsCount;
        return sortDirection === 'desc' ? diff : -diff;
      }

      if (sortField === 'slopeDollar') {
        const valA = calculationModel === 'theilSen' ? a.theilSenSlope : calculationModel === 'windowShift' ? a.windowShiftDollar : a.slopeDollar;
        const valB = calculationModel === 'theilSen' ? b.theilSenSlope : calculationModel === 'windowShift' ? b.windowShiftDollar : b.slopeDollar;
        diff = valB - valA;
        return sortDirection === 'desc' ? diff : -diff;
      }

      if (sortField === 'slopeProportional') {
        const valA = calculationModel === 'theilSen' ? a.theilSenProportional : calculationModel === 'windowShift' ? a.windowShiftProportional : a.slopeProportional;
        const valB = calculationModel === 'theilSen' ? b.theilSenProportional : calculationModel === 'windowShift' ? b.windowShiftProportional : b.slopeProportional;
        diff = valB - valA;
        return sortDirection === 'desc' ? diff : -diff;
      }

      return 0;
    });

    return result;
  }, [summaries, excludeZeroDonors, sortField, sortDirection, trendMetric, calculationModel]);

  // Handle clicking column header to toggle ascending/descending
  const handleHeaderSort = (field: SortField) => {
    if (sortField === field) {
      const nextDir: SortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
      setSortDirection(nextDir);
      if (field === 'slopeDollar') setSortOption(nextDir === 'desc' ? 'trendDesc' : 'trendAsc');
      if (field === 'donorId' && nextDir === 'asc') setSortOption('donorIdAsc');
      if (field === 'totalAmount' && nextDir === 'desc') setSortOption('totalDesc');
      if (field === 'averageMonthly' && nextDir === 'desc') setSortOption('avgMonthlyDesc');
      if (field === 'activeMonths' && nextDir === 'desc') setSortOption('activeMonthsDesc');
      if (field === 'slopeProportional' && nextDir === 'desc') setSortOption('proportionalDesc');
    } else {
      const defaultDir: SortDirection = field === 'donorId' ? 'asc' : 'desc';
      setSortField(field);
      setSortDirection(defaultDir);
      if (field === 'largestAbsChange') setSortOption('largestAbsChange');
      if (field === 'slopeDollar') setSortOption(defaultDir === 'desc' ? 'trendDesc' : 'trendAsc');
      if (field === 'donorId') setSortOption('donorIdAsc');
      if (field === 'totalAmount') setSortOption('totalDesc');
      if (field === 'averageMonthly') setSortOption('avgMonthlyDesc');
      if (field === 'activeMonths') setSortOption('activeMonthsDesc');
      if (field === 'slopeProportional') setSortOption('proportionalDesc');
    }
  };

  // Handle selecting sort option from toolbar dropdown
  const handleSortOptionChange = (option: SortOption) => {
    setSortOption(option);
    switch (option) {
      case 'largestAbsChange':
        setSortField('largestAbsChange');
        setSortDirection('desc');
        break;
      case 'trendDesc':
        setSortField('slopeDollar');
        setSortDirection('desc');
        break;
      case 'trendAsc':
        setSortField('slopeDollar');
        setSortDirection('asc');
        break;
      case 'proportionalDesc':
        setSortField('slopeProportional');
        setSortDirection('desc');
        break;
      case 'totalDesc':
        setSortField('totalAmount');
        setSortDirection('desc');
        break;
      case 'avgMonthlyDesc':
        setSortField('averageMonthly');
        setSortDirection('desc');
        break;
      case 'activeMonthsDesc':
        setSortField('activeMonths');
        setSortDirection('desc');
        break;
      case 'donorIdAsc':
        setSortField('donorId');
        setSortDirection('asc');
        break;
    }
  };

  // Toggle run chart accordion
  const toggleDonorExpand = (key: string) => {
    setExpandedDonorKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedDonorKeys(new Set(filteredAndSortedSummaries.map((s) => s.household.key)));
  };

  const collapseAll = () => {
    setExpandedDonorKeys(new Set());
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. TOP BAR CONTRACT: exactly 3 zones (wordmark - 4 nav items - 1 primary CTA) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider">
              GP
            </div>
            <span className="font-bold text-base tracking-tight text-slate-900 whitespace-nowrap">
              GivingPulse
            </span>
          </div>

          {/* Zone 2: Navigation & Utility Actions */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
            {isDemoModeActive ? (
              <button
                onClick={handleEndDemo}
                className="bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs"
                title="End demo and restore previous app state"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>End the Demo</span>
              </button>
            ) : (
              <button
                onClick={handleLoadSampleDataset}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Load Demo Data</span>
              </button>
            )}
            <button
              onClick={() => setIsRegistryModalOpen(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Registry Editor ({registry.length})</span>
            </button>
            <button
              onClick={() => downloadRegistryCSV(registry)}
              disabled={registry.length === 0}
              title={registry.length === 0 ? undefined : `Export as ${getDefaultRegistryExportFilename()}`}
              className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                registry.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'hover:text-slate-900 cursor-pointer'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Registry CSV</span>
            </button>
            {!isDemoModeActive && (
              <button
                onClick={handleClearDonations}
                disabled={donations.length === 0}
                className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  donations.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'hover:text-rose-600 cursor-pointer'
                }`}
                title="Delete donation records without affecting the donor registry"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Donations</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Actions & Share Link */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleCopyShareLink}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                copiedLink
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
              title="Copy the public web app link to share with viewers (without chat/artifacts)"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-semibold text-emerald-700">Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Share App</span>
                </>
              )}
            </button>
            <button
              onClick={() => setIsRegistryModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Manage Registry</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top Demo Banner (active during demo mode) */}
      {isDemoModeActive && (
        <div
          ref={demoBannerRef}
          id="demo-mode-banner"
          className="bg-amber-50 border-b border-amber-200/90 px-6 py-2.5 text-xs text-amber-950 sticky top-16 z-30 scroll-mt-16 shadow-2xs"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/90 text-amber-900 border border-amber-300">
                <Sparkles className="w-3 h-3 text-amber-700" />
                DEMO MODE ACTIVE
              </span>
              <span className="text-amber-900 text-xs">
                Loaded synthetic ledger with <strong>{donations.length.toLocaleString()} donation records</strong>, <strong>{registry.length} synthesized donors</strong>, and <strong>5 reciprocal spouse pairs</strong> (10 paired donors).
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRegistryModalOpen(true)}
                className="px-2.5 py-1 rounded text-[11px] font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100/60 transition-colors cursor-pointer"
              >
                Inspect Registry (5 Pairs)
              </button>
              <button
                onClick={handleEndDemo}
                className="px-3 py-1 rounded text-xs font-semibold text-amber-950 bg-amber-300 hover:bg-amber-400 border border-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="End demo and restore previous app state"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-900" />
                <span>End the Demo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        {/* Reconciled Notification Banner */}
        {reconciledCountNotice !== null && reconciledCountNotice > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-xs text-indigo-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-700" />
              <span>
                <b>Registry Reconciled:</b> Automatically appended {reconciledCountNotice} new donor ID(s)
                discovered in the donation data to your active registry.
              </span>
            </div>
            <button
              onClick={() => setReconciledCountNotice(null)}
              className="text-indigo-700 hover:text-indigo-950 font-medium underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Validation Errors Drawer (if registry failed 4-rule integrity check) */}
        {registryErrors.length > 0 && (
          <ValidationErrorsDrawer
            errors={registryErrors}
            fileName={registryFileName}
            onClose={() => setRegistryErrors([])}
          />
        )}

        {/* Donation Errors Drawer */}
        {donationErrors.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-6 text-slate-800 shadow-sm transition-all">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-rose-200/80">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-rose-950 text-base flex items-center gap-2">
                    <span>Donation File Ingestion Issue</span>
                    <span className="text-xs font-mono font-medium bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded">
                      {donationErrors.length} {donationErrors.length === 1 ? 'Error' : 'Errors'} Found
                    </span>
                  </h3>
                  <p className="text-xs text-rose-800 mt-0.5">
                    {donationFileName ? `File "${donationFileName}": ` : ''}
                    Unable to parse valid donation records. Please inspect the details below:
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDonationErrors([])}
                className="p-1 rounded text-rose-700 hover:text-rose-950 hover:bg-rose-100 transition-colors cursor-pointer"
                title="Dismiss error report"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-3 max-h-60 overflow-y-auto space-y-2">
              {donationErrors.map((err, idx) => (
                <div key={idx} className="bg-white/90 p-2.5 rounded-lg border border-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-rose-900">Row {err.rowIndex} ({err.field}):</span>{' '}
                    <span className="text-slate-700">{err.message}</span>
                    {err.rawValue !== undefined && (
                      <span className="font-mono text-[11px] text-slate-500 ml-1.5 bg-slate-100 px-1 py-0.5 rounded">
                        Raw: {String(err.rawValue)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1 & 2: INGESTION STAGE CARDS */}
        {donations.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Step 1: Donor Registry Ingestion */}
            <div className={`border rounded-xl p-6 shadow-xs flex flex-col justify-between transition-colors ${
              isStep1Complete ? 'bg-white border-slate-200' : 'bg-white border-slate-300 ring-1 ring-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isStep1Complete ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                    }`}>
                      {isStep1Complete ? <CheckCircle2 className="w-3.5 h-3.5" /> : '1'}
                    </div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Step 1: Donor Registry Handling
                    </h2>
                  </div>
                  {isStep1Complete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Step 1 Complete
                      </span>
                      <button
                        onClick={() => {
                          if (registry.length > 0) {
                            saveSessionRegistry(registry);
                            setPreviousSessionRegistry(registry);
                          }
                          setRegistrySource('none');
                          setRegistry([]);
                          setRegistryFileName('');
                          setRegistryErrors([]);
                        }}
                        className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
                        title="Change Step 1 selection"
                      >
                        Reset
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      Action Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  Specify how your donor registry will be handled before uploading donation records. Provide a 2-column registry (<code className="font-mono text-slate-800">donor_id</code>,{' '}
                  <code className="font-mono text-slate-800">spouse_id</code>) in CSV or Excel, load previous session, or choose to auto-detect from the ledger.
                </p>

                {/* 3 Choices */}
                <div className="space-y-2 mb-4">
                  {/* Upload file */}
                  <input
                    type="file"
                    ref={registryFileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleRegistryUpload(e.target.files[0]);
                    }}
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                  />
                  <button
                    onClick={() => registryFileInputRef.current?.click()}
                    className={`w-full flex items-center justify-between p-3 border rounded-lg text-left text-xs transition-all cursor-pointer ${
                      registrySource === 'uploaded'
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 text-slate-900 font-medium'
                        : 'border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Upload className={`w-4 h-4 ${registrySource === 'uploaded' ? 'text-indigo-600' : 'text-slate-700'}`} />
                      <div>
                        <div className="font-semibold text-slate-900">Upload Registry File</div>
                        <div className="text-[11px] text-slate-500">CSV or Excel (.xlsx, .xls)</div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                      registrySource === 'uploaded'
                        ? 'text-indigo-700 bg-indigo-100/80 border-indigo-300 font-semibold'
                        : 'text-slate-600 bg-white border-slate-200'
                    }`}>
                      {registrySource === 'uploaded' ? 'Active' : 'Choose'}
                    </span>
                  </button>

                  {/* Previous session option */}
                  <button
                    onClick={handleUsePreviousSessionRegistry}
                    className={`w-full flex items-center justify-between p-3 border rounded-lg text-left text-xs transition-all cursor-pointer ${
                      registrySource === 'previous_session'
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 text-slate-900 font-medium'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Clock className={`w-4 h-4 ${registrySource === 'previous_session' ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold text-slate-900">Use Previous Session Registry</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {previousSessionRegistry && previousSessionRegistry.length > 0
                            ? `${previousSessionRegistry.length} donors cached from previous session`
                            : '40 donors cached from previous session'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                      registrySource === 'previous_session'
                        ? 'text-indigo-700 bg-indigo-100/80 border-indigo-300 font-semibold'
                        : 'text-slate-600 bg-white border-slate-200'
                    }`}>
                      {registrySource === 'previous_session' ? 'Active' : 'Use'}
                    </span>
                  </button>

                  {/* Proceed without registry */}
                  <button
                    onClick={handleProceedWithoutRegistry}
                    className={`w-full flex items-center justify-between p-3 border rounded-lg text-left text-xs transition-all cursor-pointer ${
                      registrySource === 'auto_detected'
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 text-slate-900 font-medium'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className={`w-4 h-4 ${registrySource === 'auto_detected' ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold text-slate-900">Proceed Without Registry</div>
                        <div className="text-[11px] text-slate-500">
                          Auto-synthesize registry from donation log donor IDs
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                      registrySource === 'auto_detected'
                        ? 'text-indigo-700 bg-indigo-100/80 border-indigo-300 font-semibold'
                        : 'text-slate-600 bg-white border-slate-200'
                    }`}>
                      {registrySource === 'auto_detected' ? 'Active' : 'Select'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Status footer for registry */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {!isStep1Complete && (
                    <span className="text-amber-700 font-medium flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Select how to handle registry above to unlock Step 2
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-slate-400">
                  Expected columns: <code className="font-mono text-slate-600">donor_id</code>, <code className="font-mono text-slate-600">spouse_id</code>
                </span>
              </div>
            </div>

            {/* Step 2: Donation Data Ingestion */}
            <div className={`border rounded-xl p-6 shadow-xs flex flex-col justify-between transition-colors ${
              !isStep1Complete ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      !isStep1Complete ? 'bg-slate-300 text-slate-500' : 'bg-slate-900 text-white'
                    }`}>
                      2
                    </div>
                    <h2 className={`text-sm font-bold ${!isStep1Complete ? 'text-slate-500' : 'text-slate-900'}`}>
                      Step 2: Donation Records File (Required)
                    </h2>
                  </div>
                  {!isStep1Complete ? (
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" />
                      Locked (Waiting on Step 1)
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Ready for Upload
                    </span>
                  )}
                </div>
                <p className={`text-xs mb-4 leading-relaxed ${!isStep1Complete ? 'text-slate-400' : 'text-slate-600'}`}>
                  Upload your donation ledger (<code className="font-mono text-slate-700">id, donor_id, received_date, fund, amount</code>).
                  Supports currency formats like <span className="font-mono">$1,500.00</span> and dates in CSV or Excel.
                </p>

                {/* Upload box */}
                <input
                  type="file"
                  ref={donationFileInputRef}
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = '';
                  }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleDonationUpload(e.target.files[0]);
                  }}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                />

                <div
                  onClick={() => donationFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files?.[0]) {
                      handleDonationUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-0 group ${
                    isStep1Complete
                      ? 'border-indigo-200 hover:border-indigo-500 bg-indigo-50/20 hover:bg-indigo-50/50'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30'
                  }`}
                >
                  <FileSpreadsheet className="w-8 h-8 text-indigo-600 mx-auto mb-2 group-hover:scale-105 transition-transform" />
                  <div className="text-xs font-semibold text-slate-900 group-hover:text-indigo-900">
                    Click to browse or drop your donation ledger
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Accepts CSV, XLSX, and XLS formats
                  </div>
                  {!isStep1Complete && (
                    <div className="text-[10px] text-indigo-600 font-medium mt-1.5 bg-indigo-50/80 inline-block px-2 py-0.5 rounded border border-indigo-200/60">
                      Auto-synthesizes registry from donor IDs if Step 1 is unselected
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE SESSION DASHBOARD VIEW */}
        {donations.length > 0 && (
          <div ref={analysisRef} id="analysis-section" className="space-y-6 scroll-mt-28">
            {/* Top Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                  <span>Total Gifts In Window</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                  ${overallTotals.totalRaised.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {overallTotals.totalGifts} transactions recorded
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                  <HeartHandshake className="w-3.5 h-3.5 text-slate-500" />
                  <span>Giving Units (Households)</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                  {overallTotals.activeHouseholdsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {registry.length} registered individuals in registry
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>Average Monthly Volume</span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                  ${overallTotals.averagePerMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Across {analysisWindow?.totalMonths ?? 0} active months
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                  {overallTotals.overallSlopeDollar >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>Overall Giving Slope</span>
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums ${
                    overallTotals.overallSlopeDollar >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {overallTotals.overallSlopeDollar >= 0 ? '+' : ''}$
                  {overallTotals.overallSlopeDollar.toFixed(2)}/mo
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Aggregate trajectory of organization
                </div>
              </div>
            </div>

            {/* Filter & Analysis Control Toolbar */}
            <FilterControls
              window={analysisWindow}
              maxMonthsSetting={maxMonthsSetting}
              onMaxMonthsChange={setMaxMonthsSetting}
              availableMonths={availableMonths}
              cutoffMonth={cutoffMonth}
              onCutoffMonthChange={setCutoffMonth}
              funds={availableFunds}
              selectedFund={selectedFund}
              onFundChange={setSelectedFund}
              trendMetric={trendMetric}
              onTrendMetricChange={setTrendMetric}
              sortOption={sortOption}
              onSortOptionChange={handleSortOptionChange}
              excludeZeroDonors={excludeZeroDonors}
              onExcludeZeroDonorsChange={setExcludeZeroDonors}
              calculationModel={calculationModel}
              onCalculationModelChange={setCalculationModel}
              totalDonorsCount={summaries.length}
              filteredDonorsCount={filteredAndSortedSummaries.length}
            />

            {/* Donor Leaderboard Table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              {/* Table Header Bar */}
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>Donor Trend Leaderboard</span>
                    <span className="text-xs font-mono font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {filteredAndSortedSummaries.length} Donors
                    </span>
                    <span className="text-[11px] font-normal text-slate-500 font-sans">
                      (Sorted by {
                        sortField === 'largestAbsChange'
                          ? 'Largest Trend Shift'
                          : sortField === 'donorId'
                          ? 'Donor ID'
                          : sortField === 'totalAmount'
                          ? 'Total Given'
                          : sortField === 'averageMonthly'
                          ? 'Monthly Average'
                          : sortField === 'activeMonths'
                          ? 'Active Months'
                          : sortField === 'slopeDollar'
                          ? 'Trend ($/mo)'
                          : 'Proportional Trend (%)'
                      } {sortDirection === 'asc' ? '▲ Ascending' : '▼ Descending'})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any column header to sort ascending or descending. Click any donor row to expand the monthly run chart.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={expandAll}
                    className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center text-slate-400">
                        Chart
                      </th>
                      {/* Column 2: Donor / Household Unit */}
                      <th
                        onClick={() => handleHeaderSort('donorId')}
                        className={`py-3 px-4 cursor-pointer select-none transition-colors group ${
                          sortField === 'donorId'
                            ? 'bg-indigo-100/90 text-indigo-950 font-bold border-b-2 border-indigo-600'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Donor ID"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Donor / Household Unit</span>
                          {sortField === 'donorId' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 3: Total Given */}
                      <th
                        onClick={() => handleHeaderSort('totalAmount')}
                        className={`py-3 px-4 text-right cursor-pointer select-none transition-colors group ${
                          sortField === 'totalAmount'
                            ? 'bg-indigo-100/90 text-indigo-950 font-bold border-b-2 border-indigo-600'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Total Given"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Total Given</span>
                          {sortField === 'totalAmount' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 4: Monthly Avg */}
                      <th
                        onClick={() => handleHeaderSort('averageMonthly')}
                        className={`py-3 px-4 text-right cursor-pointer select-none transition-colors group ${
                          sortField === 'averageMonthly'
                            ? 'bg-indigo-100/90 text-indigo-950 font-bold border-b-2 border-indigo-600'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Monthly Average"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Monthly Avg</span>
                          {sortField === 'averageMonthly' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 5: Active Mo */}
                      <th
                        onClick={() => handleHeaderSort('activeMonths')}
                        className={`py-3 px-4 text-center cursor-pointer select-none transition-colors group ${
                          sortField === 'activeMonths'
                            ? 'bg-indigo-100/90 text-indigo-950 font-bold border-b-2 border-indigo-600'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Active Giving Months"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Active Mo</span>
                          {sortField === 'activeMonths' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 6: Trend ($/mo) */}
                      <th
                        onClick={() => handleHeaderSort('slopeDollar')}
                        className={`py-3 px-4 text-right cursor-pointer select-none transition-colors group ${
                          sortField === 'slopeDollar'
                            ? 'bg-indigo-100 text-indigo-950 font-bold border-b-2 border-indigo-600 shadow-xs'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Dollar Trend ($/month)"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{calculationModel === 'theilSen' ? 'Theil-Sen ($/mo)' : calculationModel === 'windowShift' ? 'Shift ($/mo)' : 'Trend ($/mo)'}</span>
                          {sortField === 'slopeDollar' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 7: Proportional (%) */}
                      <th
                        onClick={() => handleHeaderSort('slopeProportional')}
                        className={`py-3 px-4 text-right cursor-pointer select-none transition-colors group ${
                          sortField === 'slopeProportional'
                            ? 'bg-indigo-100/90 text-indigo-950 font-bold border-b-2 border-indigo-600'
                            : 'hover:bg-slate-100 hover:text-slate-900 text-slate-700'
                        }`}
                        title="Click to sort by Proportional Trend (%/month)"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Proportional (%)</span>
                          {sortField === 'slopeProportional' ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-700 stroke-[2.5] shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      </th>
                      {/* Column 8: Trajectory (Visual indicator only, not sortable) */}
                      <th className="py-3 px-4 text-center text-slate-700 font-semibold select-none">
                        Trajectory
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAndSortedSummaries.map((summary) => {
                      const isExpanded = expandedDonorKeys.has(summary.household.key);
                      const activeSlope = calculationModel === 'theilSen' ? summary.theilSenSlope : calculationModel === 'windowShift' ? summary.windowShiftDollar : summary.slopeDollar;
                      const activeProp = calculationModel === 'theilSen' ? summary.theilSenProportional : calculationModel === 'windowShift' ? summary.windowShiftProportional : summary.slopeProportional;
                      const isPos = activeSlope > 0.01;
                      const isNeg = activeSlope < -0.01;

                      return (
                        <React.Fragment key={summary.household.key}>
                          <tr
                            onClick={() => toggleDonorExpand(summary.household.key)}
                            className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                              isExpanded ? 'bg-slate-50/60' : ''
                            }`}
                          >
                            {/* Accordion trigger icon */}
                            <td className="py-3 px-4 text-center text-slate-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 inline text-slate-900" />
                              ) : (
                                <ChevronRight className="w-4 h-4 inline" />
                              )}
                            </td>

                            {/* Donor ID & Spousal Info */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900 font-mono flex items-center gap-2">
                                {summary.household.isAnonymous ? (
                                  <span className="text-slate-700 font-sans italic font-normal">
                                    Anonymous / Loose Collections
                                  </span>
                                ) : summary.household.isSpousePair ? (
                                  <>
                                    <span>#{summary.household.primaryDonorId}</span>
                                    <span className="text-slate-400 font-sans font-normal">&</span>
                                    <span>#{summary.household.spouseDonorId}</span>
                                  </>
                                ) : (
                                  <span>#{summary.household.primaryDonorId}</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                                {summary.household.isAnonymous
                                  ? 'Unassigned plate gifts'
                                  : summary.household.isSpousePair
                                  ? 'Spouse pair combined'
                                  : 'Individual giving unit'}
                              </div>
                            </td>

                            {/* Total Given */}
                            <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 tabular-nums">
                              ${summary.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Monthly Avg */}
                            <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                              ${summary.averageMonthly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Active Months */}
                            <td className="py-3 px-4 text-center font-mono text-slate-600 tabular-nums">
                              {summary.activeMonthsCount} / {summary.monthlyPoints.length}
                            </td>

                            {/* Trend Slope ($/mo) */}
                            <td
                              className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                                isPos ? 'text-emerald-700' : isNeg ? 'text-rose-600' : 'text-slate-600'
                              }`}
                            >
                              {activeSlope >= 0 ? '+' : ''}${activeSlope.toFixed(2)}/mo
                            </td>

                            {/* Proportional Slope (%/mo) */}
                            <td
                              className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                                isPos ? 'text-emerald-700' : isNeg ? 'text-rose-600' : 'text-slate-600'
                              }`}
                            >
                              {activeProp >= 0 ? '+' : ''}
                              {activeProp.toFixed(1)}%/mo
                            </td>

                            {/* Spark Trajectory Indicator */}
                            <td className="py-3 px-4 text-center">
                              {isPos ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <TrendingUp className="w-3.5 h-3.5" />
                                  <span>Growing</span>
                                </span>
                              ) : isNeg ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                                  <TrendingDown className="w-3.5 h-3.5" />
                                  <span>Decline</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[11px] text-slate-600">
                                  Flat
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Run Chart Row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-4 bg-slate-50/50">
                                <RunChart
                                  summary={summary}
                                  trendMetric={trendMetric}
                                  model={calculationModel}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {filteredAndSortedSummaries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                          No donors match the active filters. Try unchecking "Filter out zero donors" or selecting All Funds.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Registry Manager Modal */}
      <RegistryManagerModal
        registry={registry}
        isOpen={isRegistryModalOpen}
        onClose={() => setIsRegistryModalOpen(false)}
        onSaveRegistry={(updated) => {
          setRegistry(updated);
          saveSessionRegistry(updated);
          setPreviousSessionRegistry(updated);
          if (updated.length > 0) {
            setRegistrySource((prev) => (prev === 'none' ? 'uploaded' : prev));
          } else {
            setRegistrySource('none');
          }
        }}
      />

      {/* New Donors Review & Approval Modal */}
      <NewDonorsReviewModal
        isOpen={isNewDonorsModalOpen}
        newDonors={pendingNewDonors}
        existingRegistry={registry}
        fileName={donationFileName}
        onClose={() => setIsNewDonorsModalOpen(false)}
        onApproveAndAdd={handleApproveNewDonors}
      />

      {/* Fund Category & Cutoff Month Selection Modal */}
      <FundSelectionModal
        isOpen={isFundSelectionModalOpen}
        fileName={pendingDonationFileName}
        funds={discoveredFunds}
        months={discoveredMonths}
        initialCutoffMonth={cutoffMonth}
        onClose={handleCancelFundSelection}
        onConfirm={handleConfirmFundSelection}
      />
    </div>
  );
}
