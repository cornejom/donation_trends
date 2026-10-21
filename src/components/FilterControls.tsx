import React, { useState, useEffect } from 'react';
import { AnalysisWindow, TrendMetric, SortOption, TrendCalculationModel, DiscoveredMonthSummary } from '../types';
import { Calendar, Layers, ArrowUpDown, Filter, SlidersHorizontal, CheckSquare, Square } from 'lucide-react';

interface FilterControlsProps {
  window: AnalysisWindow | null;
  maxMonthsSetting: number | 'all';
  onMaxMonthsChange: (months: number | 'all') => void;
  availableMonths?: DiscoveredMonthSummary[];
  cutoffMonth?: string;
  onCutoffMonthChange?: (month: string) => void;
  funds: string[];
  selectedFund: string | 'all';
  onFundChange: (fund: string | 'all') => void;
  trendMetric: TrendMetric;
  onTrendMetricChange: (metric: TrendMetric) => void;
  sortOption: SortOption;
  onSortOptionChange: (sort: SortOption) => void;
  excludeZeroDonors: boolean;
  onExcludeZeroDonorsChange: (exclude: boolean) => void;
  calculationModel: TrendCalculationModel;
  onCalculationModelChange: (model: TrendCalculationModel) => void;
  totalDonorsCount: number;
  filteredDonorsCount: number;
}

export const FilterControls: React.FC<FilterControlsProps> = ({
  window,
  maxMonthsSetting,
  onMaxMonthsChange,
  availableMonths,
  cutoffMonth,
  onCutoffMonthChange,
  funds,
  selectedFund,
  onFundChange,
  trendMetric,
  onTrendMetricChange,
  sortOption,
  onSortOptionChange,
  excludeZeroDonors,
  onExcludeZeroDonorsChange,
  calculationModel,
  onCalculationModelChange,
  totalDonorsCount,
  filteredDonorsCount,
}) => {
  const [customInput, setCustomInput] = useState<string>(() => {
    if (typeof maxMonthsSetting === 'number' && !([3, 6, 12, 18, 24] as number[]).includes(maxMonthsSetting)) {
      return String(maxMonthsSetting);
    }
    return '';
  });

  useEffect(() => {
    if (typeof maxMonthsSetting === 'number' && !([3, 6, 12, 18, 24] as number[]).includes(maxMonthsSetting)) {
      setCustomInput(String(maxMonthsSetting));
    } else {
      setCustomInput('');
    }
  }, [maxMonthsSetting]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-xs space-y-4">
      {/* Top Bar: Time Window Display, Cutoff Month Dropdown & Quick Period Selector */}
      <div className="flex flex-wrap items-center justify-start gap-4 sm:gap-6 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 w-[495px] shrink-0">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-600">
                Active Analysis Time Window
              </div>
              <div className="text-sm font-semibold text-slate-900 font-mono flex items-center gap-2 whitespace-nowrap">
                {window ? (
                  <>
                    <span>{window.startMonthLabel}</span>
                    <span className="text-slate-600 font-sans">to</span>
                    <span>{window.endMonthLabel}</span>
                    <span className="text-xs font-sans font-normal text-slate-600">
                      ({window.totalMonths} {window.totalMonths === 1 ? 'month' : 'consecutive months'})
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 font-sans font-normal">Awaiting donation data</span>
                )}
              </div>
            </div>
          </div>

          {availableMonths && availableMonths.length > 0 && onCutoffMonthChange && (
            <div className="flex items-center gap-2 sm:pl-4 sm:border-l sm:border-slate-200">
              <label htmlFor="toolbar-cutoff-select" className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                Cutoff Month:
              </label>
              <select
                id="toolbar-cutoff-select"
                value={cutoffMonth || availableMonths[0]?.monthKey || ''}
                onChange={(e) => onCutoffMonthChange(e.target.value)}
                className="w-[150px] px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                title="Select the latest month to include in the analysis (useful if latest month data is incomplete)"
              >
                {availableMonths.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.monthLabel}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Max Months Selection Tabs */}
        <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
          <span className="text-[11px] font-medium text-slate-600 px-1.5">Max Months:</span>
          {([3, 6, 12, 18, 24, 'all'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMaxMonthsChange(m)}
              className={`px-2 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                maxMonthsSetting === m
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'all' ? 'All' : m}
            </button>
          ))}
          <div className="flex items-center pl-1 ml-0.5 border-l border-slate-200">
            <input
              type="number"
              min={1}
              max={240}
              placeholder="#"
              value={customInput}
              onChange={(e) => {
                const valStr = e.target.value;
                setCustomInput(valStr);
                const parsed = parseInt(valStr, 10);
                if (!isNaN(parsed) && parsed > 0) {
                  onMaxMonthsChange(parsed);
                }
              }}
              className={`w-11 px-1 py-0.5 text-xs font-mono font-medium rounded text-center transition-colors border ${
                typeof maxMonthsSetting === 'number' && !([3, 6, 12, 18, 24] as number[]).includes(maxMonthsSetting)
                  ? 'bg-white text-slate-900 border-slate-300 shadow-2xs ring-1 ring-slate-400 font-semibold'
                  : 'bg-transparent text-slate-600 border-slate-200/80 hover:bg-white/70 hover:border-slate-300 placeholder:text-slate-400'
              } focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900`}
              title="Specify any custom number of max months"
              aria-label="Custom max months"
            />
          </div>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* 1. Categorical Fund Filter */}
        <div>
          <label className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Fund Category Filter</span>
          </label>
          <select
            value={selectedFund}
            onChange={(e) => onFundChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs font-medium cursor-pointer"
          >
            <option value="all">All Funds Combined</option>
            {funds.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Trend Basis ($ vs %) */}
        <div>
          <label className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span>Trend Measurement Basis</span>
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => onTrendMetricChange('dollar')}
              className={`py-1.5 px-2 text-xs font-medium rounded transition-colors text-center ${
                trendMetric === 'dollar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dollar Value ($/mo)
            </button>
            <button
              onClick={() => onTrendMetricChange('proportional')}
              className={`py-1.5 px-2 text-xs font-medium rounded transition-colors text-center ${
                trendMetric === 'proportional'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Proportion (%/mo)
            </button>
          </div>
        </div>

        {/* 3. Sort Order */}
        <div>
          <label className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span>Sort Donors By</span>
          </label>
          <select
            value={sortOption}
            onChange={(e) => onSortOptionChange(e.target.value as SortOption)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs font-medium cursor-pointer"
          >
            <option value="largestAbsChange">Largest Trend Shift (± Magnitude)</option>
            <option value="trendDesc">Trend ($/mo) Descending</option>
            <option value="trendAsc">Trend ($/mo) Ascending</option>
            <option value="proportionalDesc">Proportional Trend (%/mo Descending)</option>
            <option value="totalDesc">Total Giving Volume ($ Descending)</option>
            <option value="avgMonthlyDesc">Monthly Average ($ Descending)</option>
            <option value="activeMonthsDesc">Active Giving Months (High to Low)</option>
            <option value="donorIdAsc">Donor ID (Numerical Ascending)</option>
          </select>
        </div>

        {/* 4. Calculation Model Alternative */}
        <div>
          <label className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Calculation Algorithm</span>
          </label>
          <select
            value={calculationModel}
            onChange={(e) => onCalculationModelChange(e.target.value as TrendCalculationModel)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs font-medium cursor-pointer"
          >
            <option value="ols">OLS Linear Regression (Standard)</option>
            <option value="theilSen">Theil-Sen Robust Median Slope</option>
            <option value="windowShift">Period Difference (2nd Half vs 1st Half)</option>
          </select>
        </div>
      </div>

      {/* Bottom Bar: Zero Donor Toggle & Count Indicator */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <button
          onClick={() => onExcludeZeroDonorsChange(!excludeZeroDonors)}
          className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-medium cursor-pointer select-none"
        >
          {excludeZeroDonors ? (
            <CheckSquare className="w-4 h-4 text-slate-900" />
          ) : (
            <Square className="w-4 h-4 text-slate-400" />
          )}
          <span>Filter out donors with zero donations in the analysis window</span>
        </button>

        <div className="text-slate-500 text-xs font-mono">
          Showing <span className="text-slate-900 font-semibold">{filteredDonorsCount}</span> of{' '}
          <span className="text-slate-900 font-semibold">{totalDonorsCount}</span> donor units
          {excludeZeroDonors && totalDonorsCount > filteredDonorsCount && (
            <span className="text-slate-600 font-sans ml-1">
              ({totalDonorsCount - filteredDonorsCount} inactive hidden)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
