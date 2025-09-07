import React, { useState, Fragment, useMemo, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { useContract } from "../contexts/contract";
import { NETWORK } from "../config/aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useContacts } from "../contexts/contacts";

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  groupId,
}) => {
  const [totalAmount, setTotalAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const { addExpense, refreshGroupsOverview, getGroupDetails } = useContract();
  const { account } = useWallet();
  const { getContactLabel } = useContacts();

  type DistMode = "shares" | "percent";
  const [mode, setMode] = useState<DistMode>("shares");
  const myAddr = (account?.address?.toString() || "").toLowerCase();

  type MemberWeight = {
    address: string;
    selected: boolean;
    value: number; // shares or percent value depending on mode
  };
  const [members, setMembers] = useState<MemberWeight[]>([]);

  useEffect(() => {
    try {
      const group = getGroupDetails(groupId);
      const defaults = group.members.map((m) => ({
        address: m,
        selected: true,
        value: 1,
      }));
      setMembers(defaults);
    } catch {
      setMembers([]);
    }
    // reset mode on open
    if (isOpen) setMode("shares");
  }, [isOpen, groupId, getGroupDetails, myAddr]);

  const selectedMembers = useMemo(
    () => members.filter((m) => m.selected),
    [members]
  );

  const percentSum = useMemo(() => {
    if (mode !== "percent") return 0;
    return selectedMembers.reduce(
      (sum, m) => sum + (isFinite(m.value) ? m.value : 0),
      0
    );
  }, [selectedMembers, mode]);

  const sharesTotal = useMemo(() => {
    if (mode !== "shares") return 0;
    return selectedMembers.reduce(
      (sum, m) => sum + Math.max(0, Math.floor(m.value)),
      0
    );
  }, [selectedMembers, mode]);

  const splitEqually = () => {
    setMembers((prev) => {
      const sel = prev.filter((p) => p.selected);
      const n = Math.max(1, sel.length);
      if (mode === "percent") {
        // Distribute basis points exactly among selected: e.g., 3 -> 3334,3333,3333 => 33.34,33.33,33.33
        const baseBps = Math.floor(10000 / n);
        let remainder = 10000 - baseBps * n;
        let assigned = 0;
        const out = prev.map((p) => {
          if (!p.selected) return p;
          const add = assigned < remainder ? 1 : 0;
          assigned += assigned < remainder ? 1 : 0;
          return { ...p, value: (baseBps + add) / 100 };
        });
        return out;
      }
      // shares
      return prev.map((p) => (p.selected ? { ...p, value: 1 } : p));
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setMembers((prev) => {
      const next = prev.map((p) => ({ ...p, selected: checked }));
      if (mode === "percent") {
        const sel = next.filter((p) => p.selected);
        const n = Math.max(1, sel.length);
        const baseBps = Math.floor(10000 / n);
        let remainder = 10000 - baseBps * n;
        let assigned = 0;
        return next.map((p) => {
          if (!p.selected) return { ...p, value: 0 };
          const add = assigned < remainder ? 1 : 0;
          assigned += assigned < remainder ? 1 : 0;
          return { ...p, value: (baseBps + add) / 100 };
        });
      }
      // shares mode: set default 1 for selected, 0 for unselected
      return next.map((p) => ({
        ...p,
        value: p.selected ? (p.value > 0 ? Math.floor(p.value) : 1) : 0,
      }));
    });
  };

  function computeBasisPoints(): {
    debtors: string[];
    sharesBp: number[];
  } | null {
    const debtors = selectedMembers.map((m) => m.address);
    if (debtors.length === 0) return null;

    if (mode === "percent") {
      // Convert percentage (two decimals allowed) into basis points with sum 10000
      const rawBps = selectedMembers.map((m) =>
        Math.round((m.value || 0) * 100)
      );
      const sum = rawBps.reduce((a, b) => a + b, 0);
      if (sum <= 0) return null;
      // Do NOT auto-adjust; the user must make it exactly 100.00%
      return { debtors, sharesBp: rawBps };
    }

    // shares mode: integer shares -> basis points with remainder distribution
    const shares = selectedMembers.map((m) => Math.max(0, Math.floor(m.value)));
    const total = shares.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    const base = shares.map((s) => Math.floor((s * 10000) / total));
    let sum = base.reduce((a, b) => a + b, 0);
    const sharesBp = [...base];
    let rem = 10000 - sum;
    let i = 0;
    while (rem > 0) {
      const idx = i % sharesBp.length;
      sharesBp[idx] += 1;
      rem -= 1;
      i += 1;
    }
    return { debtors, sharesBp };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!totalAmount || !memo.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // upto 8 decimal places only
    const amountStr = amount.toFixed(8);
    const amountParts = amountStr.split(".");
    if (amountParts.length > 2) {
      toast.error("Please enter a valid amount");
      return;
    }

    const amountInOctas = Math.floor(amount * 100_000_000);

    // Build debtors and shares in basis points
    const computed = computeBasisPoints();
    if (!computed) {
      toast.error("Please select payees and provide valid shares/percentages");
      return;
    }
    // Ensure total basis points equals 10000
    const bpSum = computed.sharesBp.reduce((a, b) => a + b, 0);
    if (bpSum !== 10000) {
      toast.error("Split must sum to 100.00%");
      return;
    }

    setIsAdding(true);

    try {
      const txHash = await addExpense(
        groupId,
        amountInOctas,
        Array.from(new TextEncoder().encode(memo.trim())),
        computed.debtors,
        computed.sharesBp
      );
      refreshGroupsOverview();
      toast.success("Expense added successfully", {
        action: {
          label: "View on Explorer",
          onClick: () => {
            window.open(
              `https://explorer.aptoslabs.com/txn/${txHash}?network=${NETWORK}`,
              "_blank"
            );
          },
        },
      });
      onClose();
      setTotalAmount("");
      setMemo("");
    } catch (error) {
      console.error("Failed to add expense:", error);
      toast.error("Failed to add expense. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium text-gray-900"
                  >
                    Add New Expense
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total Amount (APT)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="0.0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#01DCC8] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="e.g., Dinner at The Restaurant"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#01DCC8] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Split With
                      </label>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => toggleSelectAll(true)}
                          className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSelectAll(false)}
                          className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Clear
                        </button>
                        <div className="ml-2 inline-flex items-center gap-2 border border-gray-300 rounded px-2 py-1">
                          <label className="text-gray-600">Mode</label>
                          <select
                            value={mode}
                            onChange={(e) =>
                              setMode(e.target.value as DistMode)
                            }
                            className="bg-transparent outline-none"
                          >
                            <option value="shares">Shares</option>
                            <option value="percent">Percent</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {members.map((m, idx) => (
                        <div
                          key={m.address}
                          className="flex items-center gap-3"
                        >
                          <input
                            type="checkbox"
                            checked={m.selected}
                            onChange={(e) =>
                              setMembers((prev) => {
                                const clone = prev.slice();
                                clone[idx] = {
                                  ...clone[idx],
                                  selected: e.target.checked,
                                };
                                if (mode === "percent") {
                                  const selCount =
                                    clone.filter((p) => p.selected).length || 1;
                                  const baseBps = Math.floor(10000 / selCount);
                                  let remainder = 10000 - baseBps * selCount;
                                  let assigned = 0;
                                  return clone.map((p) => {
                                    if (!p.selected) return { ...p, value: 0 };
                                    const add = assigned < remainder ? 1 : 0;
                                    assigned += assigned < remainder ? 1 : 0;
                                    return {
                                      ...p,
                                      value: (baseBps + add) / 100,
                                    };
                                  });
                                } else {
                                  // shares mode: default 1 when selected, 0 when deselected for this entry
                                  return clone.map((p, i2) => {
                                    if (i2 === idx) {
                                      return {
                                        ...p,
                                        value: p.selected
                                          ? p.value > 0
                                            ? Math.floor(p.value)
                                            : 1
                                          : 0,
                                      };
                                    }
                                    return p;
                                  });
                                }
                              })
                            }
                          />
                          <div className="text-xs text-gray-700 flex-1 break-all">
                            {getContactLabel(m.address)
                              ? getContactLabel(m.address)
                              : `${m.address.slice(0, 6)}...${m.address.slice(-4)}`}
                          </div>
                          <div className="flex items-center gap-2">
                            {mode === "shares" ? (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={m.value}
                                  onChange={(e) =>
                                    setMembers((prev) => {
                                      const clone = prev.slice();
                                      clone[idx] = {
                                        ...clone[idx],
                                        value: Number(e.target.value),
                                      };
                                      return clone;
                                    })
                                  }
                                  className="w-20 px-2 py-1 border border-gray-300 rounded"
                                />
                                <span className="text-xs text-gray-600">
                                  shares
                                </span>
                              </>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={m.value}
                                  onChange={(e) =>
                                    setMembers((prev) => {
                                      const clone = prev.slice();
                                      clone[idx] = {
                                        ...clone[idx],
                                        value: Number(e.target.value),
                                      };
                                      return clone;
                                    })
                                  }
                                  className="w-24 px-2 py-1 border border-gray-300 rounded"
                                />
                                <span className="text-xs text-gray-600">%</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                      <button
                        type="button"
                        onClick={splitEqually}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Split equally
                      </button>
                      {mode === "percent" ? (
                        <div>Sum: {percentSum.toFixed(2)}%</div>
                      ) : (
                        <div>Total shares: {sharesTotal}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAdding}
                      className="flex-1 py-2 px-4 bg-gradient-to-r from-[#F9F853] to-[#E6E04A] text-gray-900 rounded-lg hover:from-[#F0F04A] hover:to-[#DEDE41] transition-all disabled:opacity-50 font-medium"
                    >
                      {isAdding ? "Adding..." : "Add Expense"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
