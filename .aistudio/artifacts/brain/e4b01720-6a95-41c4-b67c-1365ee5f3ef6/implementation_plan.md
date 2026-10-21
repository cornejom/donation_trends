# Analysis Cutoff Month Selection

Allow users to specify the final cutoff month included in GivingPulse analysis—both during initial data ingestion alongside fund category selection and later from the dashboard analysis toolbar—to exclude incomplete current-month donation data.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core user preferences were confirmed during the interactive clarification phase:

- **Confirmed Ingestion Placement**: The cutoff month selection appears directly inside the Step 2 Ingestion Dialog alongside fund category selection.
- **Confirmed Toolbar Adjustability**: Users can dynamically adjust the cutoff month anytime later directly from the dashboard analysis toolbar without re-uploading files.
- **Confirmed Chronological Ordering**: The list of available months is presented in reverse chronological order (newest to oldest), with the latest month in the dataset selected by default.
- **Default State**: When a file or demo dataset is loaded, the most recent month detected in the data is selected by default to preserve full historical view while giving the user one-click control to step back to the prior complete month.

---

## 1. Overview & Core Concept

- **What It Does**: Non-profit donation data often contains gifts recorded in the current, active month. Because the current month has not ended, analyzing it as a full period distorts monthly gift volumes, trajectory slopes, and giving velocity. This feature allows users to set a cutoff month $M_{\text{cutoff}}$ such that all gifts dated after the last day of $M_{\text{cutoff}}$ are excluded from analysis windows, linear regressions, donor leaderboard metrics, and trend charts.
- **Target Persona**: Non-profit data managers, gift officers, and executive directors reviewing giving trends who want clean, closed-period analytics without mid-month reporting distortion.
- **Key Value**: Accurate, statistically sound trend calculation without manual spreadsheet editing before upload.

---

## 2. User Experience & Visual Design

### Key User Flows

#### Flow A: Ingestion Dialog (Step 2)
```
┌────────────────────────────────────────────────────────────────────────┐
│ Select Fund Categories & Analysis Cutoff Month                         │
│ File: donations_2026.csv · 4 Funds · 24 Months Represented             │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Fund Categories to Process                                          │
│    [x] General Fund ($241,500)   [x] Capital Campaign ($180,200)       │
│    [x] Youth Program ($42,100)   [x] Benevolence ($12,400)             │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Analysis Cutoff Month (Latest Month to Include)                     │
│    Exclude incomplete or partial months (e.g., ongoing current month).  │
│                                                                        │
│    Cutoff Month: [ June 2026 (Latest in data) ▼ ]                      │
│                    June 2026 (Latest in data) · 142 gifts · $34,200   │
│                    May 2026 · 210 gifts · $52,800                     │
│                    April 2026 · 198 gifts · $49,100                   │
│                    ... (sorted newest to oldest)                      │
├────────────────────────────────────────────────────────────────────────┤
│ [ Cancel ]                                [ Process Selected Data -> ] │
└────────────────────────────────────────────────────────────────────────┘
```

#### Flow B: Dashboard Analysis Toolbar
```
┌────────────────────────────────────────────────────────────────────────┐
│ [Calendar] Active Time Window: Jun '25 to May '26 (12 mo)              │
│                                                                        │
│ Cutoff Month: [ May 2026 ▼ ]   Max Months: [3Mo][6Mo][12Mo][24Mo][All] │
├────────────────────────────────────────────────────────────────────────┤
│ Fund Filter: [All Funds ▼]   Basis: [$ / mo | % / mo]   Sort: [Shift ▼]│
└────────────────────────────────────────────────────────────────────────┘
```

### Visual Identity & Layout Restraint
- **Zero-Pill Compliance**: Month selection options use clean, unboxed text labels with bullet/slash metadata separators (`June 2026 · 142 gifts · $34,200`).
- **Tabular Figures**: All currency totals and counts within month selectors use `tabular-nums` for crisp vertical alignment.
- **Single Elevation & Palette Discipline**: The ingestion modal incorporates a dedicated section card utilizing subtle neutral borders (`border-slate-200`) and soft surface fills (`bg-slate-50/50`), adhering strictly to the 60-30-10 neutral color distribution.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Month Representation and Extraction
- **Chosen Approach**: Parse all valid donation dates from the ingested rows into year-month keys (`YYYY-MM`) and display labels (`"MMMM YYYY"`). Compute total gifts and dollar volume for each detected month.
- **Why**: Allows users to see at a glance whether the latest month is genuinely partial (e.g., only 5 gifts vs. typical 150 gifts/month) and make an informed decision on whether to step back.
- **Alternative Considered**: Only showing a plain date picker. Rejected because a drop-down of actual months represented in the data prevents selecting out-of-range dates and provides immediate context.

### Decision 2: Analysis Window Recomputation
- **Chosen Approach**: When a cutoff month $M_{\text{cutoff}}$ is set, the analysis window computes backwards from $M_{\text{cutoff}}$ for $N$ months (governed by the active `maxMonthsSetting`). Any donation with `received_date` strictly after the end of $M_{\text{cutoff}}$ is excluded.
- **Why**: Keeps historical comparisons aligned with the chosen cutoff period while respecting the user's selected time horizon (e.g., trailing 12 months ending in May 2026).
- **Alternative Considered**: Truncating donations before initial ingestion. Rejected because user wants to adjust the cutoff month later from the dashboard toolbar without needing to re-upload.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             Raw Donation Data                            │
│           (CSV / Excel file upload OR sample dataset in demo mode)       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
                ┌───────────────────────────────────────────┐
                │ extractDiscoveredMonthsFromRows(rawRows)  │
                │ extractDiscoveredFundsFromRows(rawRows)   │
                └────────────────────┬──────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │     FundSelectionModal        │
                     │  - Fund selection checkboxes  │
                     │  - Cutoff month selector      │
                     │    (newest to oldest)         │
                     └───────────────┬───────────────┘
                                     │ onConfirm(funds, cutoffMonth)
                                     ▼
                         ┌───────────────────────┐
                         │    App State Store    │
                         │  - selectedFund       │
                         │  - cutoffMonth        │
                         │  - maxMonthsSetting   │
                         │  - donations          │
                         └───────────┬───────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  ┌───────────────────────────────┐       ┌──────────────────────────────┐
  │ computeAnalysisWindow(...)    │       │ FilterControls (Toolbar)     │
  │ - Filters donations <= cutoff │       │ - Displays active window     │
  │ - Establishes trailing window │       │ - Cutoff month select menu   │
  │ - Computes OLS trajectories   │       │ - Max months segmented tabs  │
  └───────────────────────────────┘       └──────────────────────────────┘
```

### Key State & Interface Updates
1. **Data Types (`src/types/index.ts`)**:
   - `DiscoveredMonthSummary`: `{ monthKey: string; monthLabel: string; count: number; totalAmount: number; year: number; month: number; }`
   - Add `cutoffMonth?: string | null` to `AnalysisWindow` and `PriorAppState` for seamless demo/restore.
2. **Date Extraction Utility (`src/utils/validation.ts`)**:
   - Add `extractDiscoveredMonthsFromRows(rawRows: Record<string, unknown>[]): DiscoveredMonthSummary[]` to extract, aggregate, and sort months newest-to-oldest.
3. **Ingestion Dialog (`src/components/FundSelectionModal.tsx`)**:
   - Expand props to accept `months: DiscoveredMonthSummary[]`, `initialCutoffMonth?: string`, and `onConfirm: (selectedFunds: string[], cutoffMonth: string) => void`.
   - Render cutoff month selector section beneath the fund category checkboxes with descriptive helper text.
4. **Toolbar (`src/components/FilterControls.tsx`)**:
   - Add `availableMonths: DiscoveredMonthSummary[]`, `cutoffMonth: string`, and `onCutoffMonthChange: (month: string) => void`.
   - Add Cutoff Month dropdown selector within the toolbar.
5. **Analysis Calculation (`src/utils/analysis.ts`)**:
   - Update `computeAnalysisWindow(donations, maxMonthsSetting, cutoffMonthKey)` to anchor the end date to the selected `cutoffMonthKey`.
6. **State Persistence (`src/utils/statePersistence.ts`)**:
   - Persist `cutoffMonth` in IndexedDB / localStorage session state.
