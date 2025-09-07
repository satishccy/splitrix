import React, { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleDebtModal } from "../components/SettleDebtModal";
import {
  ArrowLeftIcon,
  PlusIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ReceiptRefundIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { AptosAddress } from "../types";
// import { toast } from "sonner";
import { useContract } from "../contexts/contract";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { WalletConnect } from "../components/WalletConnect";
import { MobileMenu } from "../components/MobileMenu";
import { useContacts } from "../contexts/contacts";

function hexToString(hex: string) {
  let str = "";
  for (let i = 2; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

export const GroupPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const [activeTab, setActiveTab] = useState<"balances" | "bills" | "members">("balances");
  // const { settleDebt } = useContract();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [settleInfo, setSettleInfo] = useState<{
    creditorAddress: AptosAddress;
    bills: Array<{ billId: number; memo: string; amountOwed: number }>;
  } | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<number | null>(null);

  const groupIdNum = groupId ? parseInt(groupId, 10) : 0;
  const { groupsOverview, isGroupsOverviewLoading } = useContract();
  const { account } = useWallet();
  const userAddress = account?.address?.toString() || "";
  const { getContactLabel } = useContacts();
  const group = useMemo(
    () => groupsOverview.find((g) => g.group_id === groupIdNum),
    [groupsOverview, groupIdNum]
  );

  const billStatus = useMemo(() => {
    if (!group || !expandedBillId || !userAddress) return null;
    const bill = group.bills.find((b) => b.bill_id === expandedBillId);
    if (!bill) return null;
    const full_debtors = group.members.filter((m) => m !== bill.payer);
    const missing_debtors = full_debtors.filter(
      (m) => !bill.debtors.some((d) => d.debtor === m)
    );
    const debtors_copy = [...bill.debtors];
    for (const d of missing_debtors) {
      debtors_copy.push({
        debtor: d,
        owed: bill.per_share_amount,
        is_paid: true,
      });
    }
    const paid_debtors = debtors_copy.filter((d) => d.is_paid);
    const unpaid_debtors = debtors_copy.filter((d) => !d.is_paid);
    const paid_debtors_sum = paid_debtors.reduce((sum, d) => sum + d.owed, 0);
    const unpaid_debtors_sum = unpaid_debtors.reduce(
      (sum, d) => sum + d.owed,
      0
    );
    return {
      paid_debtors,
      unpaid_debtors,
      paid_debtors_sum,
      unpaid_debtors_sum,
      is_mine: bill.payer === userAddress,
      has_unpaid: unpaid_debtors.length > 0,
    };
  }, [expandedBillId]);

  const userOwes = useMemo(() => {
    const map = new Map<string, number>();
    if (!group || !userAddress)
      return [] as { address: string; amount: number }[];
    for (const bill of group.bills) {
      if (bill.payer !== userAddress) {
        const debtor = bill.debtors.find(
          (d) => d.debtor === userAddress && !d.is_paid
        );
        if (debtor) {
          map.set(bill.payer, (map.get(bill.payer) || 0) + debtor.owed);
        }
      }
    }
    return Array.from(map.entries()).map(([address, amount]) => ({
      address,
      amount,
    }));
  }, [group, userAddress]);

  const userIsOwed = useMemo(() => {
    const map = new Map<string, number>();
    if (!group || !userAddress)
      return [] as { address: string; amount: number }[];
    for (const bill of group.bills) {
      if (bill.payer === userAddress) {
        for (const d of bill.debtors) {
          if (!d.is_paid) {
            map.set(d.debtor, (map.get(d.debtor) || 0) + d.owed);
          }
        }
      }
    }
    return Array.from(map.entries()).map(([address, amount]) => ({
      address,
      amount,
    }));
  }, [group, userAddress]);

  // Placeholder reserved for future multi-bill bulk settle

  const formatAddress = (address: AptosAddress) => {
    const name = getContactLabel(address);
    if (name) return `${name} (${address.slice(0, 6)}...${address.slice(-4)})`;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: number) => (amount / 100000000).toFixed(4); // Convert from octas to APT

  if (isGroupsOverviewLoading || !group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#01DCC8] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading group details...</p>
        </div>
      </div>
    );
  }

  // Calculate user's net balance for this group
  const totalOwed = userIsOwed.reduce((sum, debt) => sum + debt.amount, 0);
  const totalOwes = userOwes.reduce((sum, debt) => sum + debt.amount, 0);
  const netBalance = totalOwed - totalOwes;

  const formatNetBalance = (balance: number) => {
    const isPositive = balance >= 0;
    const absBalance = Math.abs(balance / 100000000);

    return {
      amount: absBalance.toFixed(4),
      label: isPositive ? "You are owed" : "You owe",
      className: isPositive
        ? "text-green-600 bg-green-50 border-green-200"
        : "text-red-600 bg-red-50 border-red-200",
    };
  };

  const balance = formatNetBalance(netBalance);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10">
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <Link to="/" className="cursor-pointer">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              <span className="bg-gradient-to-r from-[#01DCC8] to-[#F9F853] text-transparent bg-clip-text">
                Splitrix
              </span>
            </h1>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <Link
                to="/contacts"
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm sm:text-base"
              >
                Contacts
              </Link>
            </div>
            <div className="hidden sm:block">
              <WalletConnect />
            </div>
            <MobileMenu />
          </div>
        </div>
        {/* Header */}

        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
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
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Group #{groupIdNum}
                </h1>
                <p className="text-gray-600">Expense Group</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3 bg-gradient-to-r from-[#F9F853] to-[#E6E04A] text-gray-900 rounded-xl hover:from-[#F0F04A] hover:to-[#DEDE41] transition-all shadow-lg hover:shadow-xl font-semibold"
          >
            <PlusIcon className="h-5 w-5" /> Add
            <span className="hidden md:block">Expense</span>
          </button>
        </div>

        {/* Balance Summary */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 shadow-lg border border-white/20 mb-6 sm:mb-8">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
            Your Balance in This Group
          </h2>
          <div
            className={`inline-flex items-center px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border ${balance.className}`}
          >
            <span className="text-base sm:text-lg font-semibold">
              {balance.label}: {balance.amount} APT
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab("balances")}
                className={`flex-1 py-2 sm:py-4 px-4 sm:px-6 text-center font-medium transition-colors text-xs sm:text-sm items-center justify-center ${
                  activeTab === "balances"
                    ? "text-[#01DCC8] border-b-2 border-[#01DCC8] bg-[#01DCC8]/5"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <CurrencyDollarIcon className="h-5 w-5 inline-block mr-2" />
                Balances
              </button>
              <button
                onClick={() => setActiveTab("bills")}
                className={`flex-1 py-2 sm:py-4 px-4 sm:px-6 text-center font-medium transition-colors text-xs sm:text-sm items-center justify-center ${
                  activeTab === "bills"
                    ? "text-[#01DCC8] border-b-2 border-[#01DCC8] bg-[#01DCC8]/5"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <ReceiptRefundIcon className="h-5 w-5 inline-block mr-2" />
                Bills ({group.bills.length})
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`flex-1 py-2 sm:py-4 px-4 sm:px-6 text-center font-medium transition-colors text-xs sm:text-sm items-center justify-center ${
                  activeTab === "members"
                    ? "text-[#01DCC8] border-b-2 border-[#01DCC8] bg-[#01DCC8]/5"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <UserGroupIcon className="h-5 w-5 inline-block mr-2" />
                Members ({group.members.length})
              </button>
            </nav>
          </div>

          <div className="p-4 sm:p-6">
            {activeTab === "balances" ? (
              <div className="space-y-6">
                {/* You Owe Section */}
                {userOwes.length > 0 && (
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-red-600 mb-3 sm:mb-4 flex items-center gap-2">
                      <BanknotesIcon className="h-5 w-5" />
                      You Owe
                    </h3>
                    <div className="space-y-3">
                      {userOwes.map((debt) => (
                        <div
                          key={debt.address}
                          className="flex items-center justify-between p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl"
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
                            onClick={() => {
                              const creditorBills = (group?.bills || [])
                                .filter((b) => b.payer === debt.address)
                                .map((b) => {
                                  const d = b.debtors.find(
                                    (x) =>
                                      x.debtor === userAddress && !x.is_paid
                                  );
                                  return {
                                    billId: b.bill_id,
                                    memo: b.memo,
                                    amountOwed: d ? d.owed : 0,
                                  };
                                })
                                .filter((x) => x.amountOwed > 0);
                              setSettleInfo({
                                creditorAddress: debt.address,
                                bills: creditorBills,
                              });
                            }}
                            className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                          >
                            Settle
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* You Are Owed Section */}
                {userIsOwed.length > 0 && (
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-green-600 mb-3 sm:mb-4 flex items-center gap-2">
                      <CurrencyDollarIcon className="h-5 w-5" />
                      You Are Owed
                    </h3>
                    <div className="space-y-3">
                      {userIsOwed.map((debt) => (
                        <div
                          key={debt.address}
                          className="flex items-center justify-between p-3 sm:p-4 bg-green-50 border border-green-200 rounded-xl"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatAddress(debt.address)}
                            </p>
                            <p className="text-xs md:text-sm whitespace-nowrap text-gray-600">
                              Amount: {formatAmount(debt.amount)} APT
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium whitespace-nowrap text-xs md:text-lg">
                            Awaiting payment
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {userOwes.length === 0 && userIsOwed.length === 0 && (
                  <div className="text-center py-8">
                    <CurrencyDollarIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">
                      All settled up! No outstanding balances.
                    </p>
                  </div>
                )}
              </div>
            ) : activeTab === "bills" ? (
              <div className="space-y-3 sm:space-y-4">
                {!group || group.bills.length === 0 ? (
                  <div className="text-center py-8">
                    <ReceiptRefundIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">
                      No bills yet. Add your first expense to get started!
                    </p>
                  </div>
                ) : (
                  group.bills.map((b) => {
                    const isMine = b.payer === userAddress;
                    const hasUnpaid = b.debtors.some((d) => !d.is_paid);
                    return (
                      <div
                        key={b.bill_id}
                        className="p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedBillId(
                            expandedBillId === b.bill_id ? null : b.bill_id
                          )
                        }
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900">
                              {hexToString(b.memo)}
                            </h4>
                            {isMine && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                Your bill
                              </span>
                            )}
                            {hasUnpaid && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                Unpaid
                              </span>
                            )}
                          </div>
                      <div className="text-right flex flex-col gap-0 md:gap-1">
                            <p className="text-sm whitespace-nowrap sm:text-base font-bold text-gray-900">
                              {formatAmount(b.total_amount)} APT
                            </p>
                            <p className="text-xs whitespace-nowrap text-gray-500">
                              Bill #{b.bill_id}
                            </p>
                            <p className="text-xs whitespace-nowrap text-gray-500">
                              Payer: {formatAddress(b.payer)}
                            </p>
                          </div>
                        </div>
                        {expandedBillId === b.bill_id && billStatus && (
                          <div className="mt-3 sm:mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg border border-green-200 bg-green-50">
                              <p className="text-sm font-medium text-green-700 mb-2">
                                Paid
                              </p>
                              <div className="space-y-2">
                                {billStatus.paid_debtors.length === 0 ? (
                                  <p className="text-sm text-gray-600">
                                    No payments yet
                                  </p>
                                ) : (
                                  billStatus.paid_debtors.map((d) => (
                                    <div
                                      key={d.debtor}
                                      className="flex items-center justify-between"
                                    >
                                      <span className="font-mono text-xs">
                                        {formatAddress(d.debtor)}
                                      </span>
                                      <span className="text-xs text-gray-600">
                                        {formatAmount(b.per_share_amount)} APT
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                              <p className="text-sm font-medium text-red-700 mb-2">
                                Unpaid
                              </p>
                              <div className="space-y-2">
                                {billStatus.unpaid_debtors.length === 0 ? (
                                  <p className="text-sm text-gray-600">
                                    No pending payments
                                  </p>
                                ) : (
                                  billStatus.unpaid_debtors.map((d) => (
                                    <div
                                      key={d.debtor}
                                      className="flex items-center justify-between"
                                    >
                                      <span className="font-mono text-xs">
                                        {formatAddress(d.debtor)}
                                      </span>
                                      <span className="text-xs text-gray-600">
                                        {formatAmount(d.owed)} APT
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {group.members.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">No members found.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {group.members.map((m) => {
                      const isAdmin = m === group.admin;
                      const isMe = m === userAddress;
                      return (
                        <div key={m} className="flex items-center justify-between py-3">
                          <div>
                            <div className="font-medium text-gray-900">
                              {formatAddress(m)}
                            </div>
                            <div className="flex gap-2 mt-1">
                              {isAdmin && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Admin</span>
                              )}
                              {isMe && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">You</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(m)}
                              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <AddExpenseModal
          isOpen={showAddExpense}
          onClose={() => setShowAddExpense(false)}
          groupId={groupIdNum}
        />

        {settleInfo && (
          <SettleDebtModal
            isOpen={!!settleInfo}
            onClose={() => setSettleInfo(null)}
            groupId={groupIdNum}
            creditorAddress={settleInfo.creditorAddress}
            bills={settleInfo.bills}
          />
        )}
      </div>
    </div>
  );
};
