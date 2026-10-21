import React, { useState } from 'react';
import { DonorRegistryEntry } from '../types';
import { validateDonorRegistry } from '../utils/validation';
import { downloadRegistryCSV, getDefaultRegistryExportFilename } from '../utils/registryManager';
import { X, Plus, Trash2, Download, Search, CheckCircle, AlertTriangle, Check } from 'lucide-react';

interface RegistryManagerModalProps {
  registry: DonorRegistryEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSaveRegistry: (updated: DonorRegistryEntry[]) => void;
}

export const RegistryManagerModal: React.FC<RegistryManagerModalProps> = ({
  registry,
  isOpen,
  onClose,
  onSaveRegistry,
}) => {
  const [entries, setEntries] = useState<DonorRegistryEntry[]>(registry);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New entry form state
  const [newDonorId, setNewDonorId] = useState('');
  const [newSpouseId, setNewSpouseId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Existing donor inline spouse population state
  const [editingDonorId, setEditingDonorId] = useState<number | null>(null);
  const [spouseInputVal, setSpouseInputVal] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Prompt confirmation for Delete All
  const [showDeleteAllPrompt, setShowDeleteAllPrompt] = useState(false);

  // Sync state when modal opens
  React.useEffect(() => {
    setEntries(registry);
    setEditingDonorId(null);
    setSpouseInputVal('');
    setInlineError(null);
    setShowDeleteAllPrompt(false);
  }, [registry, isOpen]);

  if (!isOpen) return null;

  // Run validation on current in-memory edits (an empty registry is valid)
  const rawRowsForValidation = entries.map((e) => ({
    donor_id: e.donor_id,
    spouse_id: e.spouse_id !== null ? e.spouse_id : '',
  }));
  const validationResult = entries.length === 0
    ? {
        entries: [],
        errors: [],
        isValid: true,
        formatTestPassed: true,
        formatErrors: [],
        integrityErrors: [],
        detectedColumns: ['donor_id', 'spouse_id'],
      }
    : validateDonorRegistry(rawRowsForValidation, ['donor_id', 'spouse_id']);

  // Filtered entries for search
  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    const term = searchTerm.trim().toLowerCase();
    if (term === 'new' || term === 'new from ledger') {
      return Boolean(e.isNewFromLedger);
    }
    return (
      String(e.donor_id).includes(term) ||
      (e.spouse_id !== null && String(e.spouse_id).includes(term)) ||
      (e.isNewFromLedger && 'new from ledger'.includes(term))
    );
  });

  // Handle adding donor
  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const dId = parseInt(newDonorId.trim(), 10);
    if (isNaN(dId) || dId <= 0) {
      setFormError('Donor ID must be a positive integer.');
      return;
    }

    if (entries.some((entry) => entry.donor_id === dId)) {
      setFormError(`Donor ID ${dId} already exists in the registry.`);
      return;
    }

    let sId: number | null = null;
    if (newSpouseId.trim() !== '') {
      sId = parseInt(newSpouseId.trim(), 10);
      if (isNaN(sId) || sId <= 0) {
        setFormError('Spouse ID must be a positive integer or blank.');
        return;
      }
      if (sId === dId) {
        setFormError('Spouse ID cannot equal Donor ID (Rule 2).');
        return;
      }
      if (!entries.some((entry) => entry.donor_id === sId)) {
        setFormError(`Spouse ID #${sId} is not in the registry. Only valid registered donor IDs can be added.`);
        return;
      }
    }

    let updated = [...entries, { donor_id: dId, spouse_id: sId }];

    // If valid spouse ID was provided, reciprocally link
    if (sId !== null) {
      const existingSpouseIdx = updated.findIndex((entry) => entry.donor_id === sId);
      if (existingSpouseIdx >= 0) {
        updated = updated.map((entry, idx) =>
          idx === existingSpouseIdx ? { ...entry, spouse_id: dId } : entry
        );
      }
    }

    setEntries(updated);
    setNewDonorId('');
    setNewSpouseId('');
  };

  // Handle start editing spouse for an existing donor
  const handleStartEditSpouse = (donorId: number, currentSpouseId: number | null) => {
    setEditingDonorId(donorId);
    setSpouseInputVal(currentSpouseId !== null ? String(currentSpouseId) : '');
    setInlineError(null);
  };

  const handleCancelEditSpouse = () => {
    setEditingDonorId(null);
    setSpouseInputVal('');
    setInlineError(null);
  };

  // Populate or update spouse ID for an existing donor with strict validation
  const handleSaveSpouse = (donorId: number) => {
    setInlineError(null);
    const trimmed = spouseInputVal.trim();

    if (!trimmed) {
      // Clear/unlink current spouse
      const current = entries.find((e) => e.donor_id === donorId);
      if (current && current.spouse_id !== null) {
        handleUnlinkSpouses(donorId, current.spouse_id);
      }
      setEditingDonorId(null);
      return;
    }

    const targetSpouseId = parseInt(trimmed, 10);
    if (isNaN(targetSpouseId) || targetSpouseId <= 0) {
      setInlineError('Spouse ID must be a positive integer.');
      return;
    }

    if (targetSpouseId === donorId) {
      setInlineError('Spouse ID cannot equal Donor ID (Rule 2).');
      return;
    }

    // Rule 3: Only valid donor IDs can be added into the spouse ID field
    const targetEntry = entries.find((e) => e.donor_id === targetSpouseId);
    if (!targetEntry) {
      setInlineError(`Donor ID #${targetSpouseId} does not exist in the registry. Only valid registered donor IDs can be added.`);
      return;
    }

    let updated = [...entries];

    // If target spouse already had another spouse linked, unlink that previous spouse
    if (targetEntry.spouse_id !== null && targetEntry.spouse_id !== donorId) {
      const oldSpouseOfTarget = targetEntry.spouse_id;
      updated = updated.map((e) =>
        e.donor_id === oldSpouseOfTarget ? { ...e, spouse_id: null } : e
      );
    }

    // If current donor already had a previous spouse linked, unlink that previous spouse
    const currentDonorEntry = entries.find((e) => e.donor_id === donorId);
    if (
      currentDonorEntry &&
      currentDonorEntry.spouse_id !== null &&
      currentDonorEntry.spouse_id !== targetSpouseId
    ) {
      const oldSpouseOfCurrent = currentDonorEntry.spouse_id;
      updated = updated.map((e) =>
        e.donor_id === oldSpouseOfCurrent ? { ...e, spouse_id: null } : e
      );
    }

    // Reciprocally link donorId <-> targetSpouseId (satisfying Rule 4)
    updated = updated.map((e) => {
      if (e.donor_id === donorId) {
        return { ...e, spouse_id: targetSpouseId };
      }
      if (e.donor_id === targetSpouseId) {
        return { ...e, spouse_id: donorId };
      }
      return e;
    });

    setEntries(updated);
    setEditingDonorId(null);
    setSpouseInputVal('');
    setInlineError(null);
  };

  // Handle deleting entry
  const handleDeleteEntry = (donorId: number) => {
    const target = entries.find((e) => e.donor_id === donorId);
    let updated = entries.filter((e) => e.donor_id !== donorId);

    // If deleted donor had a spouse, unlink the spouse to keep reciprocal validity
    if (target && target.spouse_id !== null) {
      updated = updated.map((e) =>
        e.donor_id === target.spouse_id ? { ...e, spouse_id: null } : e
      );
    }

    setEntries(updated);
  };

  // Handle unlinking spouse
  const handleUnlinkSpouses = (donorId: number, spouseId: number) => {
    const updated = entries.map((e) => {
      if (e.donor_id === donorId || e.donor_id === spouseId) {
        return { ...e, spouse_id: null };
      }
      return e;
    });
    setEntries(updated);
  };

  // Handle deleting all donors with confirmation
  const handleConfirmDeleteAll = () => {
    setEntries([]);
    onSaveRegistry([]);
    setEditingDonorId(null);
    setSpouseInputVal('');
    setInlineError(null);
    setShowDeleteAllPrompt(false);
  };

  // Commit changes
  const handleSaveAndClose = () => {
    if (!validationResult.isValid) {
      setFormError('Please resolve all validation errors before saving the registry.');
      return;
    }
    onSaveRegistry(entries);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Donor Registry Manager</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manually add, link spouses, inspect integrity, and download the active registry.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Validation Status Strip */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {validationResult.isValid ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle className="w-4 h-4" />
                Registry is valid ({entries.length === 0 ? 'Empty registry' : `All 4 business rules satisfied · ${entries.length} registered donors`})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                <AlertTriangle className="w-4 h-4" />
                {validationResult.errors.length} validation rule violation(s) present
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadRegistryCSV(entries)}
              disabled={entries.length === 0}
              title={entries.length === 0 ? undefined : `Download as ${getDefaultRegistryExportFilename()}`}
              className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-medium px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAllPrompt(true)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 text-rose-700 hover:text-rose-800 font-medium px-2.5 py-1 bg-white border border-rose-300 rounded hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Delete all donors from the registry"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All
            </button>
          </div>
        </div>

        {/* Form to add donor */}
        <form onSubmit={handleAddEntry} className="px-6 py-3.5 bg-slate-50/50 border-b border-slate-200">
          <div className="text-xs font-semibold text-slate-800 mb-2">Add New Donor to Registry</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[140px]">
              <input
                type="number"
                placeholder="Donor ID (e.g. 100101)"
                value={newDonorId}
                onChange={(e) => setNewDonorId(e.target.value)}
                className="w-full text-xs font-mono px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
                required
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <input
                type="number"
                placeholder="Spouse ID (optional, e.g. 100102)"
                value={newSpouseId}
                onChange={(e) => setNewSpouseId(e.target.value)}
                className="w-full text-xs font-mono px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded hover:bg-slate-800 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add to Registry
            </button>
          </div>
          {formError && (
            <div className="text-[11px] text-rose-600 font-medium mt-1.5">{formError}</div>
          )}
        </form>

        {/* Search & List */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Donor or Spouse ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs font-mono pl-8 pr-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Showing {filteredEntries.length} of {entries.length} donors
            </span>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-16">#</th>
                  <th className="py-2.5 px-4">Donor ID</th>
                  <th className="py-2.5 px-4">Spouse ID</th>
                  <th className="py-2.5 px-4">Relationship Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredEntries.map((entry, idx) => (
                  <tr key={entry.donor_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{entry.donor_id}</span>
                        {entry.isNewFromLedger && (
                          <span
                            className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200"
                            title="Newly added from uploaded donation records"
                          >
                            New from ledger
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-slate-700">
                      {editingDonorId === entry.donor_id ? (
                        <div className="flex flex-col gap-1.5 py-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <select
                              value={spouseInputVal}
                              onChange={(e) => {
                                setSpouseInputVal(e.target.value);
                                setInlineError(null);
                              }}
                              className="text-xs font-mono px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 max-w-[230px]"
                            >
                              <option value="">-- Choose Valid Donor ID --</option>
                              {entries.filter((c) => c.donor_id !== entry.donor_id && c.spouse_id === null).length > 0 && (
                                <optgroup label="Available Donors (No Spouse Assigned)">
                                  {entries
                                    .filter((c) => c.donor_id !== entry.donor_id && c.spouse_id === null)
                                    .map((c) => (
                                      <option key={c.donor_id} value={c.donor_id}>
                                        #{c.donor_id}
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                              {entries.filter((c) => c.donor_id !== entry.donor_id && c.spouse_id !== null).length > 0 && (
                                <optgroup label="Other Registered Donors">
                                  {entries
                                    .filter((c) => c.donor_id !== entry.donor_id && c.spouse_id !== null)
                                    .map((c) => (
                                      <option key={c.donor_id} value={c.donor_id}>
                                        #{c.donor_id} (Currently with #{c.spouse_id})
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                            </select>
                            <input
                              type="number"
                              placeholder="Or type ID"
                              value={spouseInputVal}
                              onChange={(e) => {
                                setSpouseInputVal(e.target.value);
                                setInlineError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveSpouse(entry.donor_id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEditSpouse();
                                }
                              }}
                              className="w-24 text-xs font-mono px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveSpouse(entry.donor_id)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                              title="Save spouse ID"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditSpouse}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {inlineError && (
                            <div className="text-[11px] text-rose-600 font-sans font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{inlineError}</span>
                            </div>
                          )}
                        </div>
                      ) : entry.spouse_id !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">#{entry.spouse_id}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-sans italic text-[11px]">Blank</span>
                          <button
                            type="button"
                            onClick={() => handleStartEditSpouse(entry.donor_id, null)}
                            className="flex items-center gap-1 text-[11px] font-medium text-indigo-700 hover:text-indigo-950 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors cursor-pointer"
                            title="Populate spouse ID with an existing valid donor ID"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Spouse ID</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-4 font-sans text-xs">
                      {entry.spouse_id !== null ? (
                        <span className="text-indigo-700 font-medium flex items-center gap-2">
                          <span>Linked with #{entry.spouse_id}</span>
                          <button
                            onClick={() => handleUnlinkSpouses(entry.donor_id, entry.spouse_id!)}
                            className="text-[10px] text-slate-500 hover:text-rose-600 underline"
                          >
                            Unlink
                          </button>
                        </span>
                      ) : (
                        <span className="text-slate-500">Individual donor</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => handleDeleteEntry(entry.donor_id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove donor"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs font-sans">
                      No matching donor records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteAllPrompt(true)}
              disabled={entries.length === 0}
              className="px-3 py-1.5 text-xs font-medium text-rose-700 hover:text-rose-800 bg-white border border-rose-300 rounded hover:bg-rose-50 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Delete all donors from the registry"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All
            </button>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Changes will update your active session and persist to storage.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              Apply & Save Registry
            </button>
          </div>
        </div>
      </div>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllPrompt && (
        <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-rose-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete All Donors?</h3>
                <p className="text-xs text-slate-500">
                  Confirm deletion of all {entries.length} donors
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed bg-rose-50/60 p-3 rounded-lg border border-rose-100">
              Are you sure you want to delete all <span className="font-semibold text-slate-900">{entries.length} donors</span> from the registry? All donor IDs and spouse relationships will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteAllPrompt(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
