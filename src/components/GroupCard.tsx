import React from 'react';
import { Link } from 'react-router-dom';
import { GroupSummary } from '../types';
import { UserGroupIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useContacts } from '../contexts/contacts';

interface GroupCardProps {
  group: GroupSummary;
}

export const GroupCard: React.FC<GroupCardProps> = ({ group }) => {
  const { getContactLabel } = useContacts();
  const formatBalance = (balance: number) => {
    const isPositive = balance >= 0;
    const absBalance = Math.abs(balance / 100000000); // Convert from octas to APT
    
    return {
      amount: absBalance.toFixed(4),
      label: isPositive ? 'You are owed' : 'You owe',
      className: isPositive 
        ? 'text-green-600 bg-green-50 border-green-200' 
        : 'text-red-600 bg-red-50 border-red-200'
    };
  };

  const balance = formatBalance(group.userNetBalance);
  const adminName = getContactLabel(group.admin);

  return (
    <Link to={`/group/${group.id}`} className="block group">
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 group-hover:border-[#01DCC8]/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#01DCC8] to-[#00B4A6] rounded-lg">
              <UserGroupIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Group #{group.id}</h3>
              <p className="text-xs sm:text-sm text-gray-500">Owner: {adminName ? `${adminName} (${group.admin.slice(0, 6)}...${group.admin.slice(-4)})` : `${group.admin.slice(0, 6)}...${group.admin.slice(-4)}`} • {group.membersCount} members</p>
            </div>
          </div>
          <ChevronRightIcon className="h-5 w-5 text-gray-400 group-hover:text-[#01DCC8] transition-colors" />
        </div>
        
        <div className={`inline-flex items-center px-2.5 py-1.5 rounded-lg border ${balance.className}`}>
          <span className="text-xs sm:text-sm font-medium">
            {balance.label}: {balance.amount} APT
          </span>
        </div>
      </div>
    </Link>
  );
};