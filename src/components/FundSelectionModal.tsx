import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Filter, CheckSquare, Square, AlertCircle, ArrowRight, Calendar } from 'lucide-react';
import { DiscoveredFundSummary } from '../utils/validation';
import { DiscoveredMonthSummary } from '../types';

interface FundSelectionModalProps {
  isOpen: boolean;
  fileName: string;
  funds: DiscoveredFundSummary[];
  months: DiscoveredMonthSummary[];
  initialCutoffMonth?: string;
  onClose: () => void;
  onConfirm: (selectedFundNames: string[], cutoffMonth: string) => void;
}

export const FundSelectionModal: React.FC<FundSelectionModalProps> = ({
  isOpen,
  fileName,
  funds,
  months,
  initialCutoffMonth,
  onClose,
  onConfirm,
}) => {
  // All categories selected by default
  const [selectedFunds, setSelectedFunds] = useState<Set<string>>(() => new Set(funds.map((f) => f.name)));

  // Selected cutoff month (defaults to latest month, which is months[0]?.monthKey)
  const defaultCutoffMonth = useMemo(() => {
    if (initialCutoffMonth && months.some((m) => m.monthKey === initialCutoffMonth)) {
      return initialCutoffMonth;
    }
    return months[0]?.monthKey || '';
  }, [months, initialCutoffMonth]);

  const [selectedCutoffMonth, setSelectedCutoffMonth] = useState<string>(defaultCutoffMonth);

  // Reset/sync when opened with new funds or months
  useEffect(() => {
    if (isOpen) {
      setSelectedFunds(new Set(funds.map((f) => f.name)));
      setSelectedCutoffMonth(defaultCutoffMonth);
    }
  }, [isOpen, funds, defaultCutoffMonth]);

  // Derived metrics
  const allSelected = selectedFunds.size === funds.length && funds.length > 0;
  const noneSelected = selectedFunds.size === 0;

  const { selectedCount, selectedGifts, selectedTotalAmount } = useMemo(() => {
    let gifts = 0;
    let total = 0;
    funds.forEach((f) => {
      if (selectedFunds.has(f.name)) {
        gifts += f.count;
        total += f.totalAmount;
      }
    });
    return {
      selectedCount: selectedFunds.size,
      selectedGifts: gifts,
      selectedTotalAmount: total,
    };
  }, [funds, selectedFunds]);

  const totalGiftsInFile = useMemo(() => funds.reduce((acc, f) => acc + f.count, 0), [funds]);
  const totalAmountInFile = useMemo(() => funds.reduce((acc, f) => acc + f.totalAmount, 0), [funds]);

  if (!isOpen) return null;

  const handleToggle = (name: string) => {
    setSelectedFunds((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedFunds(new Set(funds.map((f) => f.name)));
  };

  const handleClearAll = () => {
    setSelectedFunds(new Set());
  };

  const handleProceed = () => {
    if (selectedFunds.size === 0) return;
    onConfirm(Array.from(selectedFunds), selectedCutoffMonth || months[0]?.monthKey || '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fund-selection-title"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/60">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 id="fund-selection-title" className="text-base font-bold text-slate-900 leading-snug">
                Select Fund Categories to Process
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {fileName ? (
                  <>
                    From file <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{fileName}</code>
                    {' · '}
                  </>
                ) : null}
                Choose which donation categories to ingest into GivingPulse analysis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close fund selection modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Stats & Action Controls Bar */}
        <div className="px-6 py-3.5 bg-indigo-50/40 border-b border-indigo-100/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>
              Discovered: <strong className="text-slate-900 font-semibold">{funds.length}</strong> categories
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Total in file: <strong className="text-slate-900 font-semibold">{totalGiftsInFile.toLocaleString()}</strong> gifts
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-slate-700 font-medium">
              ${totalAmountInFile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Dynamic Selection Action Buttons */}
          <div className="flex items-center gap-2">
            {!allSelected && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Select all fund categories"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Select All</span>
              </button>
            )}

            {!noneSelected && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Clear all selections to select specific categories"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Category Table */}
        <div className="overflow-y-auto flex-1 min-h-[180px] max-h-[50vh] bg-white">
          {funds.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              No fund categories detected in the specified file.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-10 border-b border-slate-200 shadow-2xs">
                <tr>
                  <th scope="col" className="py-2.5 px-4 text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={allSelected ? handleClearAll : handleSelectAll}
                        className="text-slate-500 hover:text-indigo-600 focus:outline-none cursor-pointer"
                        title={allSelected ? 'Deselect all' : 'Select all'}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                            allSelected
                              ? 'bg-indigo-600 text-white'
                              : noneSelected
                              ? 'border border-slate-300 bg-white hover:border-slate-400'
                              : 'bg-indigo-200 text-indigo-700 border border-indigo-400'
                          }`}
                        >
                          {allSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          {!allSelected && !noneSelected && <span className="w-2 h-0.5 bg-indigo-700 rounded-full" />}
                        </div>
                      </button>
                      <span>Fund</span>
                    </div>
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">
                    # of Gifts
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">
                    $ Amount
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">
                    % of Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {funds.map((fund) => {
                  const isChecked = selectedFunds.has(fund.name);
                  const pct = totalAmountInFile > 0 ? (fund.totalAmount / totalAmountInFile) * 100 : 0;
                  return (
                    <tr
                      key={fund.name}
                      onClick={() => handleToggle(fund.name)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleToggle(fund.name);
                        }
                      }}
                      tabIndex={0}
                      role="checkbox"
                      aria-checked={isChecked}
                      className={`cursor-pointer transition-colors select-none ${
                        isChecked
                          ? 'bg-indigo-50/50 hover:bg-indigo-50/80 text-slate-900 font-medium'
                          : 'bg-white hover:bg-slate-50/70 text-slate-500'
                      }`}
                    >
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${
                              isChecked
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span className={`truncate ${isChecked ? 'text-slate-900 font-semibold' : 'text-slate-600'}`}>
                            {fund.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono whitespace-nowrap text-slate-600">
                        {fund.count.toLocaleString()}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${isChecked ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                        ${fund.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-4 text-right font-mono whitespace-nowrap text-slate-500">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Analysis Cutoff Month Selector Section */}
        {months.length > 0 && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label htmlFor="cutoff-month-select" className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Analysis Cutoff Month (Latest Month to Include)</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Exclude incomplete or partial months (e.g., if the latest month in the data is currently ongoing).
                </p>
              </div>

              <div className="sm:w-72 shrink-0">
                <select
                  id="cutoff-month-select"
                  value={selectedCutoffMonth}
                  onChange={(e) => setSelectedCutoffMonth(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs font-mono"
                >
                  {months.map((m, idx) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {m.monthLabel} {idx === 0 ? '(Latest)' : ''} · {m.count.toLocaleString()} gifts · ${m.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedCutoffMonth && months.length > 0 && selectedCutoffMonth !== months[0]?.monthKey && (
              <div className="mt-2 text-[11px] text-amber-800 bg-amber-50/90 border border-amber-200 rounded-md px-2.5 py-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>
                  Gifts after <strong>{months.find((m) => m.monthKey === selectedCutoffMonth)?.monthLabel || selectedCutoffMonth}</strong> will be excluded from the analysis window.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {noneSelected ? (
              <span className="text-amber-700 font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Select at least one fund category to proceed
              </span>
            ) : (
              <div className="text-slate-600">
                Selected: <strong className="text-slate-900 font-semibold">{selectedCount}</strong> of {funds.length} categories
                {' · '}
                <span className="text-slate-700 font-medium">{selectedGifts.toLocaleString()} gifts</span>
                {' · '}
                <span className="font-mono text-slate-900 font-semibold">
                  ${selectedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProceed}
              disabled={noneSelected}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shadow-xs ${
                noneSelected
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-98'
              }`}
            >
              <span>Process {selectedCount} {selectedCount === 1 ? 'Fund' : 'Funds'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
