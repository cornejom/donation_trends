# Demo Mode with Synthesized Registry, Spouse Pairs & Prior State Restoration

A sandboxed demo experience featuring the 1,250-record synthetic donation ledger (>1200 transactions), a synthesized 34-constituent donor registry with five reciprocal spouse pairs, contextual top banner and toolbar transitions, and single-click state restoration via "End the Demo".

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed through user input and will guide the implementation:

- **Confirmed Decision 1 (Spouse Pairing)**: The five spouse pairs (10 donor IDs) in the synthesized demo registry will be fixed and deterministic for reliable, reproducible demonstrations across sessions.
- **Confirmed Decision 2 (Demo Interface Indicators)**: When Demo Mode is active, the app displays both a prominent top Demo Mode banner with an immediate "End Demo" action and an "End the Demo" button in the top navigation bar replacing "Load Demo Data".
- **Confirmed Decision 3 (Action Button Gating)**: The "Clear Donations" button will be completely removed from the navigation bar while Demo Mode is active to prevent accidental partial ledger clearing during guided evaluations.
- **Confirmed Decision 4 (Zero Data Loss State Restoration)**: Clicking "End the Demo" restores the exact prior state of both donations and donor registry (including custom uploads, session registries, file names, and active filters) without page reloads.

---

## 1. Overview & Core Concept

- **What It Does**: Provides prospective evaluators and new users with an instant 1-click exploration experience using realistic giving data and spousal relationship structures. While active, the application operates in a protected "Demo Mode" state that safeguards existing user data by snapshotting pre-demo state and providing a frictionless "End the Demo" exit ramp.
- **Target Audience**: Non-profit executives, stewardship officers, and software evaluators assessing the GivingPulse donor analytics engine without needing to upload sensitive real-world files first.
- **Key Value**: Delivers an immediate "aha" moment with rich multi-fund data, coupled with guaranteed safety that any user work in progress before clicking demo is faithfully restored.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Entering Demo Mode**:
   - The user clicks **"Load Demo Data"** in the top navigation.
   - The application captures a snapshot of current state (`donations`, `registry`, `registrySource`, `registryFileName`, `donationFileName`, `availableFunds`, `sortField`, `sortDirection`).
   - The 1,250 synthetic donation records (>1200 transactions) are parsed and loaded.
   - The synthesized 34-donor registry (featuring 5 reciprocal spouse pairs and 24 individual donors) is loaded and validated against all 4 integrity rules.
   - Step 1 and Step 2 ingestion cards collapse, and the full GivingPulse analytics table and KPI summary cards animate into view.
2. **Interacting in Demo Mode**:
   - **Top Navigation**: "Load Demo Data" is replaced by **"End the Demo"** (styled with amber/indigo accent badge and exit icon). The "Clear Donations" button is completely removed.
   - **Demo Banner**: A clean, full-width banner sits atop the workspace:
     `Demo Mode Active · 1,250 synthetic donations & 34 registered donors (5 spouse pairs) loaded · [End Demo]`
   - Users can test sorting (Trend $/mo, Lifetime Total, Gift Frequency), fund filtering (Tithes, Building Fund, Helping Hands, Missions, Special Ministries), and Registry Manager inspection without permanently altering their database.
3. **Exiting Demo Mode ("End the Demo")**:
   - The user clicks **"End the Demo"** either from the top navigation bar or the demo banner.
   - The application immediately restores the captured prior state:
     - If the user had empty data before, it returns to the clean ingestion screen with Step 1 and Step 2 ready.
     - If the user had custom-uploaded donations or donor records, those exact records and file associations are restored.
   - The "End the Demo" button reverts back to "Load Demo Data", and the "Clear Donations" button is restored.

### Visual Styling & Theme

- **Aesthetic Direction**: Utilitarian, authoritative financial analytics dashboard following the Universal Frontend Design Constitution (60-30-10 color discipline, tabular numerals, anti-slop zero pills).
- **Color Tokens**:
  - Demo Banner: Light indigo tint (`bg-indigo-50/80 border-b border-indigo-100 text-indigo-900`) with high-contrast text and a subtle tag.
  - "End the Demo" Button: Distinctive hover state (`text-indigo-600 hover:text-indigo-800 font-semibold`) or amber-accented pill-free text button with exit glyph (`LogOut` or `Sparkles`).
- **Tabular Precision**: Monospace tabular numerals (`tabular-nums font-mono`) across all 188 transaction sums, monthly breakdown charts, and regression slopes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Fixed vs. Dynamic Random Spouse Pairing**
  - *Chosen Approach*: Fixed deterministic pairing of 10 donor IDs into 5 reciprocal couples (`44884963` <-> `44885160`, `130193437` <-> `130193438`, `72154416` <-> `72154730`, `72155409` <-> `72155445`, `112507374` <-> `119935460`).
  - *Why*: Ensures identical, reproducible analytics, slopes, and joint gift aggregations across every demo run, avoiding confusing variance during guided walkthroughs.
  - *Alternatives Considered*: Randomizing on each click was evaluated but discarded per user preference to ensure test repeatability.
- **Decision 2: Comprehensive State Snapshotting**
  - *Chosen Approach*: Full memory snapshot of `priorAppState` (donations, registry, source metadata, file names, fund selections).
  - *Why*: Prevents destructive data loss if an analyst who already loaded a custom donor registry clicks "Load Demo Data" to test a feature.
  - *Alternatives Considered*: Browser reload or localStorage clearing, which would discard unsaved user work.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App.tsx Navigation Bar                          │
│                                                                        │
│  [GP GivingPulse]   [Load Demo Data / End the Demo]   [Manage Registry]│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
            Click "Load Demo Data"           Click "End the Demo"
                    │                                 │
                    ▼                                 ▼
       ┌────────────────────────┐        ┌─────────────────────────┐
       │ Capture Prior State    │        │ Restore Prior State     │
       │ - donations            │        │ - setDonations(...)     │
       │ - registry             │        │ - setRegistry(...)      │
       │ - registrySource       │        │ - setRegistrySource(...)│
       │ - file names & filters │        │ - setAvailableFunds(...)│
       └───────────┬────────────┘        └─────────────────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ Ingest Demo Ledger     │
       │ - 188 donations        │
       │ - 34 synthesized donors│
       │ - 5 spouse pairs       │
       │ isDemoModeActive = true│
       └───────────┬────────────┘
                   │
                   ▼
 ┌───────────────────────────────────┐
 │       Active Demo Mode View       │
 │ - Top Demo Banner displayed       │
 │ - "Clear Donations" removed       │
 │ - "End the Demo" in toolbar       │
 │ - Analytics table fully computed  │
 └───────────────────────────────────┘
```

### Synthesized Demo Registry Specification

All 34 unique donor IDs from the synthetic donation data are included:
- **5 Reciprocal Spouse Pairs (10 IDs)**:
  1. `44884963` ↔ `44885160`
  2. `130193437` ↔ `130193438`
  3. `72154416` ↔ `72154730`
  4. `72155409` ↔ `72155445`
  5. `112507374` ↔ `119935460`
- **24 Single Donors (Individual IDs)**:
  - `141020566`, `78293576`, `137932428`, `72154488`, `176178135`, `128252109`, `130197458`, `72154849`, `72207062`, `181873593`, `44870082`, `72207269`, `44885040`, `87579291`, `123696098`, `88360187`, `96280578`, `90891223`, `95879874`, `72154588`, `115846828`, `174496052`, `95879710`, `174712236`.
- **Integrity Compliance**: Zero unreciprocated spouses, zero self-spouses, zero negative IDs, zero unregistered donor IDs in the ledger.

---

## 5. Verification & Testing Plan

1. **Demo Load & Ingestion**:
   - Click "Load Demo Data" from blank slate → 188 donations and 34 registry entries load instantly.
   - Verify 5 spouse pairs are recognized and display joint giving rollups.
   - Verify "Clear Donations" is absent from navigation.
   - Verify "End the Demo" is present in navigation and top banner.
2. **State Restoration Verification**:
   - Upload custom registry or enter custom donors → Click "Load Demo Data" → Click "End the Demo" → Verify pre-demo custom donors are restored exactly.
   - Click "Clear Donations" test on pre-demo state to confirm standard workflow resumes seamlessly.
