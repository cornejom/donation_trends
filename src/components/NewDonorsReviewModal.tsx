import React, { useState, useEffect } from 'react';
import { DonorRegistryEntry } from '../types';
import { UnregisteredDonorSummary } from '../utils/registryManager';
import { X, Check, UserPlus, AlertCircle, HeartHandshake } from 'lucide-react';

interface NewDonorsReviewModalProps {
  isOpen: boolean;
  newDonors: UnregisteredDonorSummary[];
  existingRegistry: DonorRegistryEntry[];
  fileName?: string;
  onClose: () => void;
  onApproveAndAdd: (approvedEntries: DonorRegistryEntry[]) => void;
}

export const NewDonorsReviewModal: React.FC<NewDonorsReviewModalProps> = ({
  isOpen,
  newDonors,
  existingRegistry,
  fileName,
  onClose,
  onApproveAndAdd,
}) => {
  // Track selected IDs to approve
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Track spouse assignments per new donor: Map<donor_id, spouse_id | null>
  const [spouseAssignments, setSpouseAssignments] = useState<Record<number, number | null>>({});

  useEffect(() => {
    // Select all by default when modal opens
    setSelectedIds(new Set(newDonors.map((d) => d.donor_id)));
    setSpouseAssignments({});
  }, [newDonors, isOpen]);

  if (!isOpen || newDonors.length === 0) return null;

  const totalGifts = newDonors.reduce((sum, d) => sum + d.giftCount, 0);
  const totalAmount = newDonors.reduce((sum, d) => sum + d.totalAmount, 0);

  const toggleSelect = (donorId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(donorId)) {
        next.delete(donorId);
      } else {
        next.add(donorId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === newDonors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newDonors.map((d) => d.donor_id)));
    }
  };

  const handleSpouseChange = (donorId: number, spouseIdStr: string) => {
    const val = spouseIdStr.trim();
    if (!val) {
      setSpouseAssignments((prev) => ({ ...prev, [donorId]: null }));
    } else {
      const parsed = parseInt(val, 10);
      setSpouseAssignments((prev) => ({
        ...prev,
        [donorId]: isNaN(parsed) || parsed <= 0 ? null : parsed,
      }));
    }
  };

  const handleApprove = () => {
    if (selectedIds.size === 0) {
      onClose();
      return;
    }

    // Build the approved entries
    const approvedEntries: DonorRegistryEntry[] = [];
    selectedIds.forEach((id) => {
      approvedEntries.push({
        donor_id: id,
        spouse_id: spouseAssignments[id] ?? null,
        isNewFromLedger: true,
      });
    });

    onApproveAndAdd(approvedEntries);
    onClose();
  };

  // Registered existing donors available to pair with
  const availableExistingDonors = existingRegistry.filter((d) => d.spouse_id === null);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl flex flex-col max-h-[90vh] animate-in fade-in-50 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-200">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                New Donor IDs Found in Donation Ledger
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {fileName ? <span>File: <code className="font-mono text-slate-700">{fileName}</code> · </span> : null}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-4 text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <b>{newDonors.length} new donor ID(s)</b> discovered across{' '}
              <b>{totalGifts} gifts</b> totaling{' '}
              <b>${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            </span>
          </div>
          <span className="text-[11px] text-indigo-700 font-sans">
            Approved IDs will be tagged with a <b>New from ledger</b> status badge
          </span>
        </div>

        {/* New Donors Table */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="select-all-new"
                checked={selectedIds.size === newDonors.length && newDonors.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
              />
              <label htmlFor="select-all-new" className="font-semibold text-slate-700 cursor-pointer">
                Select All ({selectedIds.size} of {newDonors.length} selected)
              </label>
            </div>
            <span className="text-slate-500 text-[11px]">
              Optional: assign a spouse for spousal giving aggregation
            </span>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-12 text-center">Add</th>
                  <th className="py-2.5 px-4">New Donor ID</th>
                  <th className="py-2.5 px-4 text-center">Gifts in File</th>
                  <th className="py-2.5 px-4 text-right">Total Given</th>
                  <th className="py-2.5 px-4">Optional Spouse Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {newDonors.map((item) => {
                  const isChecked = selectedIds.has(item.donor_id);
                  const currentSpouse = spouseAssignments[item.donor_id] ?? '';

                  return (
                    <tr
                      key={item.donor_id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isChecked ? 'bg-white' : 'bg-slate-50/50 opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(item.donor_id)}
                          className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
                        />
                      </td>

                      {/* Donor ID */}
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>#{item.donor_id}</span>
                          <span className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                            New
                          </span>
                        </div>
                      </td>

                      {/* Gifts */}
                      <td className="py-2.5 px-4 text-center text-slate-700">
                        {item.giftCount}
                      </td>

                      {/* Total Amount */}
                      <td className="py-2.5 px-4 text-right font-semibold text-slate-900 tabular-nums">
                        ${item.totalAmount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Spouse Assignment */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <HeartHandshake className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <select
                            disabled={!isChecked}
                            value={currentSpouse}
                            onChange={(e) => handleSpouseChange(item.donor_id, e.target.value)}
                            className="text-xs font-mono px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:opacity-50 disabled:bg-slate-100 max-w-[210px]"
                          >
                            <option value="">-- No Spouse (Blank) --</option>
                            {availableExistingDonors.length > 0 && (
                              <optgroup label="Available Registered Donors">
                                {availableExistingDonors
                                  .filter((d) => d.donor_id !== item.donor_id)
                                  .map((d) => (
                                    <option key={d.donor_id} value={d.donor_id}>
                                      #{d.donor_id} (Unpaired)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {/* Other new donors in this batch */}
                            {newDonors.filter((d) => d.donor_id !== item.donor_id).length > 0 && (
                              <optgroup label="Other New Donors In File">
                                {newDonors
                                  .filter((d) => d.donor_id !== item.donor_id)
                                  .map((d) => (
                                    <option key={d.donor_id} value={d.donor_id}>
                                      #{d.donor_id} (New)
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500">
            {selectedIds.size} of {newDonors.length} new donor IDs will be added to the registry.
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded transition-colors cursor-pointer"
            >
              Skip / Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve & Add to Registry ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
