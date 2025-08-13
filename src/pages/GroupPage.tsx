import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AddExpenseModal } from '../components/AddExpenseModal';
import { SettleDebtModal } from '../components/SettleDebtModal';
import { 
  ArrowLeftIcon, 
  PlusIcon, 
  UserGroupIcon,
  CurrencyDollarIcon,
  ReceiptRefundIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';
import { CounterpartyBalance, AptosAddress } from '../types';
import { useContract } from '../contexts/contract';

export const GroupPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { getGroupDetails } = useContract();
  const [activeTab, setActiveTab] = useState<'balances' | 'bills'>('balances');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [settleDebt, setSettleDebt] = useState<{
    creditorAddress: AptosAddress;
    amount: number;
  } | null>(null);

  const groupIdNum = groupId ? parseInt(groupId, 10) : 0;
  const { data: group, isLoading } = useGroupDetails(groupIdNum);

  const formatAddress = (address: AptosAddress) => 
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  const formatAmount = (amount: number) => 
    (amount / 100000000).toFixed(4); // Convert from octas to APT

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#01DCC8] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading group details...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Group not found</h2>
          <Link to="/" className="text-[#01DCC8] hover:text-[#00B4A6] transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Calculate user's net balance for this group
  const totalOwed = group.userIsOwed.reduce((sum, debt) => sum + debt.amount, 0);
  const totalOwes = group.userOwes.reduce((sum, debt) => sum + debt.amount, 0);
  const netBalance = totalOwed - totalOwes;

  const formatNetBalance = (balance: number) => {
    const isPositive = balance >= 0;
    const absBalance = Math.abs(balance / 100000000);
    
    return {
      amount: absBalance.toFixed(4),
      label: isPositive ? 'You are owed' : 'You owe',
      className: isPositive 
        ? 'text-green-600 bg-green-50 border-green-200' 
        : 'text-red-600 bg-red-50 border-red-200'
    };
  };

  const balance = formatNetBalance(netBalance);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/"
            className="p-2 text-gray-600 hover:text-[#01DCC8] hover:bg-white/50 rounded-lg transition-all"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-[#01DCC8] to-[#00B4A6] rounded-lg">
                <UserGroupIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Group #{group.id}</h1>
                <p className="text-gray-600">Expense Group</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#F9F853] to-[#E6E04A] text-gray-900 rounded-xl hover:from-[#F0F04A] hover:to-[#DEDE41] transition-all shadow-lg hover:shadow-xl font-semibold"
          >
            <PlusIcon className="h-5 w-5" />
            Add Expense
          </button>
        </div>

        {/* Balance Summary */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Balance in This Group</h2>
          <div className={`inline-flex items-center px-4 py-3 rounded-xl border ${balance.className}`}>
            <span className="text-lg font-semibold">
              {balance.label}: {balance.amount} APT
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('balances')}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  activeTab === 'balances'
                    ? 'text-[#01DCC8] border-b-2 border-[#01DCC8] bg-[#01DCC8]/5'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <CurrencyDollarIcon className="h-5 w-5 inline-block mr-2" />
                Balances
              </button>
              <button
                onClick={() => setActiveTab('bills')}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  activeTab === 'bills'
                    ? 'text-[#01DCC8] border-b-2 border-[#01DCC8] bg-[#01DCC8]/5'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <ReceiptRefundIcon className="h-5 w-5 inline-block mr-2" />
                Bills ({group.bills.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'balances' ? (
              <div className="space-y-6">
                {/* You Owe Section */}
                {group.userOwes.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
                      <BanknotesIcon className="h-5 w-5" />
                      You Owe
                    </h3>
                    <div className="space-y-3">
                      {group.userOwes.map((debt) => (
                        <div
                          key={debt.address}
                          className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatAddress(debt.address)}
                            </p>
                            <p className="text-sm text-gray-600">
                              Amount: {formatAmount(debt.amount)} APT
                            </p>
                          </div>
                          <button
                            onClick={() => setSettleDebt({
                              creditorAddress: debt.address,
                              amount: debt.amount,
                            })}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            Settle
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* You Are Owed Section */}
                {group.userIsOwed.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-green-600 mb-4 flex items-center gap-2">
                      <CurrencyDollarIcon className="h-5 w-5" />
                      You Are Owed
                    </h3>
                    <div className="space-y-3">
                      {group.userIsOwed.map((debt) => (
                        <div
                          key={debt.address}
                          className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatAddress(debt.address)}
                            </p>
                            <p className="text-sm text-gray-600">
                              Amount: {formatAmount(debt.amount)} APT
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium">
                            Awaiting payment
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {group.userOwes.length === 0 && group.userIsOwed.length === 0 && (
                  <div className="text-center py-8">
                    <CurrencyDollarIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">All settled up! No outstanding balances.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {group.bills.length === 0 ? (
                  <div className="text-center py-8">
                    <ReceiptRefundIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No bills yet. Add your first expense to get started!</p>
                  </div>
                ) : (
                  group.bills.map((bill) => (
                    <div
                      key={bill.id}
                      className="p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{bill.memo}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Paid by: {formatAddress(bill.payer)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">
                            {formatAmount(bill.total_amount)} APT
                          </p>
                          <p className="text-xs text-gray-500">Bill #{bill.id}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <AddExpenseModal
          isOpen={showAddExpense}
          onClose={() => setShowAddExpense(false)}
          groupId={group.id}
        />

        {settleDebt && (
          <SettleDebtModal
            isOpen={!!settleDebt}
            onClose={() => setSettleDebt(null)}
            groupId={group.id}
            creditorAddress={settleDebt.creditorAddress}
            totalDebt={settleDebt.amount}
          />
        )}
      </div>
    </div>
  );
};