import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { AptosAddress } from '../types';
import { useContract } from '../contexts/contract';
import { toast } from 'sonner';
import { useContacts } from '../contexts/contacts';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
  creditorAddress: AptosAddress;
  bills: Array<{ billId: number; memo: string; amountOwed: number }>;
}

function hexToString(hex: string) {
  let str = "";
  for (let i = 2; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

export const SettleDebtModal: React.FC<SettleDebtModalProps> = ({
  isOpen,
  onClose,
  groupId,
  creditorAddress,
  bills,
}) => {
  const { settleDebt, refreshGroupsOverview } = useContract();
  const { getContactLabel } = useContacts();
  const [settlingByBill, setSettlingByBill] = useState<Record<number, boolean>>({});
  const [remaining, setRemaining] = useState(bills);
  const [settlingAll, setSettlingAll] = useState(false);

  const formatAmount = (amount: number) => (amount / 100000000).toFixed(4);

  const handleSettleBill = async (billId: number, amountOwed: number) => {
    if (settlingByBill[billId]) return;
    setSettlingByBill((s) => ({ ...s, [billId]: true }));
    try {
      await settleDebt(groupId, creditorAddress, [billId], [amountOwed]);
      toast.success('Bill settled');
      refreshGroupsOverview();
      setRemaining((prev) => prev.filter((b) => b.billId !== billId));
    } catch (error) {
      console.error('Failed to settle debt:', error);
      toast.error('Failed to settle debt. Please try again.');
    } finally {
      setSettlingByBill((s) => ({ ...s, [billId]: false }));
    }
  };

  const handleSettleAll = async () => {
    if (settlingAll || remaining.length === 0) return;
    setSettlingAll(true);
    try {
      const billIds = remaining.map((b) => b.billId);
      const amounts = remaining.map((b) => b.amountOwed);
      await settleDebt(groupId, creditorAddress, billIds, amounts);
      toast.success('All bills settled');
      refreshGroupsOverview();
      setRemaining([]);
    } catch (error) {
      console.error('Failed to settle all debts:', error);
      toast.error('Failed to settle all. Please try again.');
    } finally {
      setSettlingAll(false);
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

                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Paying to:</span>
                    <br />
                    <span className="font-mono text-xs break-all">
                      {getContactLabel(creditorAddress) ? `${getContactLabel(creditorAddress)} (${creditorAddress})` : creditorAddress}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-end mb-3">
                  <button
                    onClick={handleSettleAll}
                    disabled={settlingAll || remaining.length === 0}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {settlingAll ? 'Paying all...' : 'Settle All'}
                  </button>
                </div>

                <div className="space-y-3">
                  {remaining.length === 0 ? (
                    <div className="text-center text-sm text-gray-600">All selected debts settled.</div>
                  ) : (
                    remaining.map((b) => (
                      <div key={b.billId} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl">
                        <div>
                          <p className="font-medium text-gray-900">{hexToString(b.memo)}</p>
                          <p className="text-sm text-gray-600">Amount: {formatAmount(b.amountOwed)} APT</p>
                        </div>
                        <button
                          onClick={() => handleSettleBill(b.billId, b.amountOwed)}
                          disabled={!!settlingByBill[b.billId] || settlingAll}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                        >
                          {settlingByBill[b.billId] ? 'Paying...' : 'Settle'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};