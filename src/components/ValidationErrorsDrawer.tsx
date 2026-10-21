import React, { useState } from 'react';
import { RegistryValidationError } from '../types';
import { AlertCircle, X, Filter, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface ValidationErrorsDrawerProps {
  errors: RegistryValidationError[];
  fileName?: string;
  onClose: () => void;
}

export const ValidationErrorsDrawer: React.FC<ValidationErrorsDrawerProps> = ({
  errors,
  fileName,
  onClose,
}) => {
  const [selectedRuleFilter, setSelectedRuleFilter] = useState<number | 'all'>('all');

  const formatErrors = errors.filter((e) => e.ruleId === 0 || e.testCategory === 'format');
  const integrityErrors = errors.filter((e) => e.ruleId > 0 && e.testCategory !== 'format');

  const filteredErrors = selectedRuleFilter === 'all'
    ? errors
    : errors.filter((e) => e.ruleId === selectedRuleFilter);

  const ruleCounts = {
    format: formatErrors.length,
    r1: errors.filter((e) => e.ruleId === 1).length,
    r2: errors.filter((e) => e.ruleId === 2).length,
    r3: errors.filter((e) => e.ruleId === 3).length,
    r4: errors.filter((e) => e.ruleId === 4).length,
  };

  const hasColumnNameError = errors.some((e) => e.formatSubtype === 'column_names');

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-6 text-slate-800 shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-rose-200/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-rose-950 text-base flex items-center gap-2">
              <span>Donor Registry Validation Failed</span>
              <span className="text-xs font-mono font-medium bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded">
                {errors.length} {errors.length === 1 ? 'Error' : 'Errors'} Found
              </span>
            </h3>
            <p className="text-xs text-rose-800 mt-0.5">
              The provided file {fileName ? `("${fileName}")` : ''} did not pass the validation pipeline.
              Review the test stages and offending rows below to correct the file.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-rose-700 hover:text-rose-950 hover:bg-rose-100 transition-colors"
          title="Dismiss error report"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Two-Stage Validation Test Progression Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-3">
        {/* Test 1: Expected File Format (Column Names & Data Types) */}
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          formatErrors.length > 0 
            ? 'bg-rose-100/90 border-rose-300 text-rose-950 font-medium' 
            : 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium'
        }`}>
          <div className="flex items-center gap-2.5">
            {formatErrors.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>Test 1: Expected File Format</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-current">
                  First Test
                </span>
              </div>
              <div className="text-[11px] opacity-85 mt-0.5">
                Column names (donor_id, spouse_id) & integer data types
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
            formatErrors.length > 0 ? 'bg-rose-200 text-rose-900' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {formatErrors.length > 0 ? `${formatErrors.length} Failed` : 'Passed ✓'}
          </span>
        </div>

        {/* Test 2: Relational Integrity (Rules 1-4) */}
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          hasColumnNameError
            ? 'bg-slate-100 border-slate-200 text-slate-500'
            : integrityErrors.length > 0 
              ? 'bg-rose-100/90 border-rose-300 text-rose-950 font-medium' 
              : 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium'
        }`}>
          <div className="flex items-center gap-2.5">
            {hasColumnNameError ? (
              <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />
            ) : integrityErrors.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <div>
              <div className="font-bold">Test 2: Relational Integrity</div>
              <div className="text-[11px] opacity-85 mt-0.5">
                4 business rules (unique IDs & reciprocal spouse links)
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
            hasColumnNameError
              ? 'bg-slate-200 text-slate-600'
              : integrityErrors.length > 0
                ? 'bg-rose-200 text-rose-900'
                : 'Passed ✓'
          }`}>
            {hasColumnNameError
              ? 'Blocked by Test 1'
              : integrityErrors.length > 0
                ? `${integrityErrors.length} Failed`
                : 'Passed ✓'}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="my-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-rose-900 font-medium flex items-center gap-1 shrink-0 mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        <button
          onClick={() => setSelectedRuleFilter('all')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            selectedRuleFilter === 'all'
              ? 'bg-rose-800 text-white'
              : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
          }`}
        >
          All ({errors.length})
        </button>
        {ruleCounts.format > 0 && (
          <button
            onClick={() => setSelectedRuleFilter(0)}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
              selectedRuleFilter === 0
                ? 'bg-rose-800 text-white'
                : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
            }`}
          >
            <span>Test 1: Format ({ruleCounts.format})</span>
          </button>
        )}
        <button
          onClick={() => setSelectedRuleFilter(1)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            selectedRuleFilter === 1
              ? 'bg-rose-800 text-white'
              : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
          }`}
        >
          Rule 1: donor_id ({ruleCounts.r1})
        </button>
        <button
          onClick={() => setSelectedRuleFilter(2)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            selectedRuleFilter === 2
              ? 'bg-rose-800 text-white'
              : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
          }`}
        >
          Rule 2: spouse_id ({ruleCounts.r2})
        </button>
        <button
          onClick={() => setSelectedRuleFilter(3)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            selectedRuleFilter === 3
              ? 'bg-rose-800 text-white'
              : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
          }`}
        >
          Rule 3: unlisted spouse ({ruleCounts.r3})
        </button>
        <button
          onClick={() => setSelectedRuleFilter(4)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            selectedRuleFilter === 4
              ? 'bg-rose-800 text-white'
              : 'bg-rose-100 text-rose-900 hover:bg-rose-200'
          }`}
        >
          Rule 4: non-reciprocal ({ruleCounts.r4})
        </button>
      </div>

      {/* Error Grid Table */}
      <div className="max-h-72 overflow-y-auto border border-rose-200 rounded-lg bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-rose-100/70 text-rose-950 font-semibold sticky top-0 border-b border-rose-200">
            <tr>
              <th className="py-2.5 px-3 w-28">Row Index</th>
              <th className="py-2.5 px-3 w-48">Validation Check</th>
              <th className="py-2.5 px-3">Violation Details & Guidance</th>
              <th className="py-2.5 px-3 w-32 text-right">Offending Values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-100 font-mono text-[11px]">
            {filteredErrors.map((err, idx) => (
              <tr key={idx} className="hover:bg-rose-50/70 transition-colors">
                <td className="py-2 px-3 font-semibold text-rose-900 whitespace-nowrap">
                  {err.rowIndex === 1 ? 'Line 1 (Header)' : `Line ${err.rowIndex}`}
                </td>
                <td className="py-2 px-3 text-slate-800 font-sans">
                  {err.ruleId === 0 ? (
                    <div>
                      <span className="inline-block font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                        Test 1: Format
                      </span>
                      <div className="text-[10px] text-slate-600 font-semibold mt-0.5">
                        {err.formatSubtype === 'column_names' ? 'Column Names' : 'Data Type'}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="inline-block font-semibold text-rose-700">
                        Rule {err.ruleId}
                      </span>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {err.ruleTitle.replace(`Rule ${err.ruleId}: `, '')}
                      </div>
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 font-sans text-slate-700">
                  {err.details}
                </td>
                <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap tabular-nums">
                  {err.donor_id !== undefined || err.spouse_id !== undefined ? (
                    <>
                      <span title="donor_id">D: {String(err.donor_id ?? 'empty')}</span>
                      <br />
                      <span title="spouse_id">S: {String(err.spouse_id ?? 'empty')}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400">Header Level</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rules Explanatory Summary */}
      <div className="mt-3 text-[11px] text-rose-900 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-semibold">Validation Protocol:</span>
        <span>
          <b>First Test (Format):</b> Column headers must be <code className="font-mono bg-rose-100 px-1 rounded">donor_id</code> and <code className="font-mono bg-rose-100 px-1 rounded">spouse_id</code> with integer data types.
        </span>
        <span>
          <b>Second Test (Integrity):</b> Rule 1 (unique positive IDs), Rule 2 (non-self spouse), Rule 3 (spouse in registry), Rule 4 (mutual reciprocal pairing).
        </span>
      </div>
    </div>
  );
};
