import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { useContract } from "../contexts/contract";
import { NETWORK } from "../config/aptos";

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
  const { addExpense, refreshGroupsOverview } = useContract();

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

    setIsAdding(true);

    try {
      const txHash = await addExpense(
        groupId,
        amountInOctas,
        Array.from(new TextEncoder().encode(memo.trim()))
      );
      refreshGroupsOverview();
      toast.success("Expense added successfully", {
        action: {
          label: "View on Explorer",
          onClick: () => {
            window.open(
              `https://explorer.aptoslabs.com/tx/${txHash}?network=${NETWORK}`,
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
