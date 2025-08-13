import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { AptosAddress } from '../types';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
  creditorAddress: AptosAddress;
  totalDebt: number;
}

export const SettleDebtModal: React.FC<SettleDebtModalProps> = ({
  isOpen,
  onClose,
  groupId,
  creditorAddress,
  totalDebt,
}) => {
  const [paymentAmount, setPaymentAmount] = useState(
    (totalDebt / 100000000).toFixed(4) // Convert from octas to APT
  );
  const [isSettling, setIsSettling] = useState(false);
  const { settleDebt } = useContract();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentAmount) {
      alert('Please enter a payment amount');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const maxAmount = totalDebt / 100000000;
    if (amount > maxAmount) {
      alert(`Payment amount cannot exceed ${maxAmount.toFixed(4)} APT`);
      return;
    }

    setIsSettling(true);
    
    try {
      // Convert APT to octas (multiply by 10^8)
      const amountInOctas = Math.floor(amount * 100000000);
      await settleDebt.mutateAsync({
        groupId,
        creditorAddress,
        paymentAmount: amountInOctas,
      });
      
      onClose();
    } catch (error) {
      console.error('Failed to settle debt:', error);
      alert('Failed to settle debt. Please try again.');
    } finally {
      setIsSettling(false);
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
                  <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                    Settle Debt
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Paying to:</span>
                    <br />
                    <span className="font-mono text-xs break-all">{creditorAddress}</span>
                  </p>
                  <p className="text-sm text-gray-700 mt-2">
                    <span className="font-medium">Total debt:</span> {(totalDebt / 100000000).toFixed(4)} APT
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Amount (APT)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      max={(totalDebt / 100000000).toFixed(4)}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
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
                      disabled={isSettling}
                      className="flex-1 py-2 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 font-medium"
                    >
                      {isSettling ? 'Settling...' : 'Confirm & Pay'}
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