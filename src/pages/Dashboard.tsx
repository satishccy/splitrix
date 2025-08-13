import React, { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { WalletConnect } from "../components/WalletConnect";
import { GroupCard } from "../components/GroupCard";
import { CreateGroupModal } from "../components/CreateGroupModal";
import { PlusIcon, CurrencyDollarIcon } from "@heroicons/react/24/outline";
import { useContract } from "../contexts/contract";
import { MiniBarChart } from "../components/MiniBarChart";
import { Link } from "react-router-dom";
import { MobileMenu } from "../components/MobileMenu";

export const Dashboard: React.FC = () => {
  const { connected } = useWallet();
  const { groupsOverview, isGroupsOverviewLoading } = useContract();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const formatTotalBalance = (balance: number) => {
    const isPositive = balance >= 0;
    const absBalance = Math.abs(balance / 100000000); // Convert from octas to APT

    return {
      amount: absBalance.toFixed(4),
      label: isPositive ? "Total Owed to You" : "Total You Owe",
      className: isPositive
        ? "text-green-600 bg-green-50 border-green-200"
        : "text-red-600 bg-red-50 border-red-200",
    };
  };

  const groupSummaries = groupsOverview.map((g) => ({
    id: g.group_id,
    userNetBalance: g.total_owed_to_you - g.total_owed_by_you,
    membersCount: g.members.length,
    admin: g.admin,
  }));

  const totals = groupsOverview.reduce(
    (acc, g) => {
      acc.owedByYou += g.total_owed_by_you;
      acc.owedToYou += g.total_owed_to_you;
      acc.paidByYou += g.total_paid_by_you;
      acc.paidToYou += g.total_paid_to_you;
      return acc;
    },
    { owedByYou: 0, owedToYou: 0, paidByYou: 0, paidToYou: 0 }
  );
  const totalBalance = totals.owedToYou - totals.owedByYou;

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
                Welcome to{" "}
                <span className="bg-gradient-to-r from-[#01DCC8] to-[#F9F853] text-transparent bg-clip-text">
                  Splitrix
                </span>
              </h1>
              <p className="text-base sm:text-xl text-gray-600">
                Split expenses effortlessly with your friends using the power of
                Aptos blockchain
              </p>
            </div>

            <div className="bg-white/80 flex flex-col items-center justify-center backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
              <CurrencyDollarIcon className="h-16 w-16 mx-auto mb-4 text-[#01DCC8]" />
              <p className="text-gray-700 mb-6">
                Connect your Aptos wallet to start managing shared expenses
              </p>
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Right sidebar (mobile first) */}
          <aside className="order-1 lg:order-2 lg:col-span-6">
            <div className="lg:sticky lg:top-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 shadow-lg border border-white/20">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 sm:mb-5">
                  Financial Overview
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
                    <div className="text-xs sm:text-sm text-gray-500">
                      Net Position
                    </div>
                    <div className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">
                      {formatTotalBalance(totalBalance).amount} APT
                    </div>
                    <div
                      className={`mt-4 inline-flex items-center px-3 py-2 rounded-xl border ${
                        formatTotalBalance(totalBalance).className
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-medium">
                        {formatTotalBalance(totalBalance).label}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:gap-6">
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 sm:p-5 shadow-sm">
                      <div className="text-xs sm:text-sm text-red-700">
                        Total Owed By You
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-semibold text-red-700">
                        {(totals.owedByYou / 100000000).toFixed(4)} APT
                      </div>
                    </div>
                    <div className="rounded-2xl border border-green-100 bg-green-50 p-4 sm:p-5 shadow-sm">
                      <div className="text-xs sm:text-sm text-green-700">
                        Total Owed To You
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-semibold text-green-700">
                        {(totals.owedToYou / 100000000).toFixed(4)} APT
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:gap-6">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 sm:p-5 shadow-sm">
                      <div className="text-xs sm:text-sm text-sky-700">
                        Total Paid By You
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-semibold text-sky-700">
                        {(totals.paidByYou / 100000000).toFixed(4)} APT
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 sm:p-5 shadow-sm">
                      <div className="text-xs sm:text-sm text-violet-700">
                        Total Paid To You
                      </div>
                      <div className="mt-1 text-xl sm:text-2xl font-semibold text-violet-700">
                        {(totals.paidToYou / 100000000).toFixed(4)} APT
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 sm:mt-8 rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="text-xs sm:text-sm font-medium text-gray-700">
                      Activity Breakdown
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500"></span>{" "}
                        You Owe
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-600"></span>{" "}
                        Owed To You
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-500"></span>{" "}
                        Paid By You
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-violet-500"></span>{" "}
                        Paid To You
                      </span>
                    </div>
                  </div>
                  <MiniBarChart
                    data={[
                      totals.owedByYou,
                      totals.owedToYou,
                      totals.paidByYou,
                      totals.paidToYou,
                    ]}
                    labels={[
                      "You Owe",
                      "Owed To You",
                      "Paid By You",
                      "Paid To You",
                    ]}
                    colors={["#ef4444", "#16a34a", "#0ea5e9", "#8b5cf6"]}
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* Left column - groups */}
          <div className="order-2 lg:order-1 lg:col-span-6 lg:max-h-[calc(100vh-180px)] lg:overflow-auto pr-1">
            {/* Groups Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Your Groups
              </h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-[#F9F853] to-[#E6E04A] text-gray-900 rounded-xl hover:from-[#F0F04A] hover:to-[#DEDE41] transition-all duration-200 shadow-md hover:shadow-lg font-semibold"
              >
                <PlusIcon className="h-5 w-5" />
                Create New Group
              </button>
            </div>

            {/* Groups Grid */}
            <div className="mb-8">
              {isGroupsOverviewLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#01DCC8] mx-auto"></div>
                  <p className="text-gray-600 mt-4">Loading your groups...</p>
                </div>
              ) : groupSummaries.length === 0 ? (
                <div className="text-center py-12">
                  <CurrencyDollarIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No groups yet
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Create your first expense group to get started
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {groupSummaries.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        <CreateGroupModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      </div>
    </div>
  );
};
