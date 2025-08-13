import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  useCallback,
} from "react";
import { aptos, FUNCTIONS } from "../config/aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { toast } from "sonner";

type ContractContextType = {
  getAvailableGroups: () => Promise<number[]>;
  createGroup: (members: string[]) => Promise<string>;
  groupsOverview: GroupOverview[];
  refreshGroupsOverview: () => void;
  isGroupsOverviewLoading: boolean;
  addExpense: (
    groupId: number,
    totalAmount: number,
    memo: Array<number>
  ) => Promise<string>;
  getGroupDetails: (groupId: number) => GroupOverview;
  settleDebt: (
    groupId: number,
    creditorAddress: string,
    paymentAmount: number
  ) => Promise<string>;
};

function getDefaultContractContext(): ContractContextType {
  return {
    getAvailableGroups: async () => [],
    createGroup: async () => "",
    groupsOverview: [],
    refreshGroupsOverview: () => {},
    isGroupsOverviewLoading: true,
    addExpense: async () => "",
    getGroupDetails: () => {
      throw new Error("Wallet not connected");
    },
    settleDebt: async () => "",
  };
}

const ContractContext = createContext<ContractContextType>(
  getDefaultContractContext()
);

interface BillView {
  bill_id: number;
  memo: string;
  payer: string;
  total_amount: number;
  per_share_amount: number;
  debtors: string[];
  debtors_paid: number[];
}

interface GroupView {
  group_id: number;
  admin: string;
  members: string[];
  bills: BillView[];
}

interface DebtorStatus {
  debtor: string;
  owed: number;
  is_paid: boolean;
}

interface BillOverview {
  bill_id: number;
  memo: string;
  payer: string;
  total_amount: number;
  per_share_amount: number;
  debtors: DebtorStatus[];
}

interface GroupOverview {
  group_id: number;
  admin: string;
  members: string[];
  bills: BillOverview[];
  total_owed_by_you: number;
  total_owed_to_you: number;
  total_paid_to_you: number;
  total_paid_by_you: number;
}

export const ContractProvider = ({ children }: { children: ReactNode }) => {
  const { signAndSubmitTransaction, account, connected } = useWallet();

  const [groupsOverview, setGroupsOverview] = useState<GroupOverview[]>([]);

  const [isGroupsOverviewLoading, setIsGroupsOverviewLoading] = useState(false);

  useEffect(() => {
    if (account && connected) {
      setIsGroupsOverviewLoading(true);
      try {
        getGroupsOverviewForMember().then((data: GroupView[]) => {
          const processedGroups = processGroupView(
            data,
            account.address.toString()
          );
          setGroupsOverview(processedGroups);
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to load groups overview");
      } finally {
        setIsGroupsOverviewLoading(false);
      }
    }
  }, [account, connected]);

  const processGroupView = (data: GroupView[], account: string) => {
    const groups: GroupOverview[] = [];
    console.log(data);
    for (const group of data) {
      const bills: BillOverview[] = [];
      for (let i = 0; i < group.bills.length; i++) {
        const bill = group.bills[i];
        const debtors: DebtorStatus[] = [];
        for (let j = 0; j < bill.debtors.length; j++) {
          const debtor = bill.debtors[j];
          const debtorPaid = bill.debtors_paid[j];
          const debtorStatus: DebtorStatus = {
            debtor,
            owed: bill.per_share_amount - debtorPaid,
            is_paid: debtorPaid >= bill.per_share_amount,
          };
          debtors.push(debtorStatus);
        }
        const billOverview: BillOverview = {
          bill_id: bill.bill_id,
          memo: bill.memo,
          payer: bill.payer,
          total_amount: bill.total_amount,
          per_share_amount: bill.per_share_amount,
          debtors,
        };
        bills.push(billOverview);
      }
      const totalOwedToYou = bills.reduce((acc, bill) => {
        if (bill.payer === account) {
          return (
            acc +
            bill.debtors.reduce((acc, debtor) => {
              if (!debtor.is_paid) {
                return acc + debtor.owed;
              } else {
                return acc;
              }
            }, 0)
          );
        } else {
          return acc;
        }
      }, 0);
      const totalOwedByYou = bills.reduce((acc, bill) => {
        if (bill.payer !== account) {
          return (
            acc +
            bill.debtors.reduce((acc, debtor) => {
              if (debtor.debtor === account && !debtor.is_paid) {
                return acc + debtor.owed;
              } else {
                return acc;
              }
            }, 0)
          );
        } else {
          return acc;
        }
      }, 0);
      const totalPaidByYou = bills.reduce((acc, bill) => {
        if (bill.payer !== account) {
          return (
            acc +
            bill.debtors.reduce((acc, debtor) => {
              if (debtor.debtor === account && debtor.is_paid) {
                return acc + bill.per_share_amount;
              } else {
                return acc;
              }
            }, 0)
          );
        } else {
          return acc;
        }
      }, 0);
      const totalPaidToYou = bills.reduce((acc, bill) => {
        if (bill.payer === account) {
          return (
            acc +
            bill.debtors.reduce((acc, debtor) => {
              if (debtor.debtor === account && debtor.is_paid) {
                return acc + bill.per_share_amount;
              } else {
                return acc;
              }
            }, 0)
          );
        } else {
          return acc;
        }
      }, 0);
      const groupOverview: GroupOverview = {
        group_id: Number(group.group_id),
        admin: group.admin,
        members: group.members,
        bills,
        total_owed_by_you: totalOwedByYou,
        total_owed_to_you: totalOwedToYou,
        total_paid_by_you: totalPaidByYou,
        total_paid_to_you: totalPaidToYou,
      };
      groups.push(groupOverview);
    }
    return groups;
  };

  const refreshGroupsOverview = () => {
    if (account && connected) {
      setIsGroupsOverviewLoading(true);
      try {
        getGroupsOverviewForMember().then((data: GroupView[]) => {
          const processedGroups = processGroupView(
            data,
            account.address.toString()
          );
          setGroupsOverview(processedGroups);
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to refresh groups overview");
      } finally {
        setIsGroupsOverviewLoading(false);
      }
    }
  };

  const getAvailableGroups = async () => {
    return [];
  };

  const createGroup = async (members: string[]) => {
    if (!account || !connected) {
      throw new Error("Wallet not connected");
    }
    if (members.length < 1) {
      throw new Error("At least 1 member is required to create a group");
    }
    const tx = await signAndSubmitTransaction({
      data: {
        function: FUNCTIONS.CREATE_GROUP,
        functionArguments: [members],
      },
    });
    const result = await aptos.waitForTransaction({
      transactionHash: tx.hash,
    });
    if (result.success) {
      return result.hash;
    } else {
      throw new Error(`Failed to create group`);
    }
  };

  const addExpense = async (
    groupId: number,
    totalAmount: number,
    memo: Array<number>
  ) => {
    if (!account || !connected) {
      throw new Error("Wallet not connected");
    }
    const tx = await signAndSubmitTransaction({
      data: {
        function: FUNCTIONS.ADD_EXPENSE,
        functionArguments: [groupId, totalAmount, memo],
      },
    });
    const result = await aptos.waitForTransaction({
      transactionHash: tx.hash,
    });
    if (result.success) {
      return result.hash;
    } else {
      throw new Error(`Failed to add expense`);
    }
  };

  const settleDebt = async (
    groupId: number,
    creditorAddress: string,
    paymentAmount: number
  ) => {
    if (!account || !connected) {
      throw new Error("Wallet not connected");
    }
    const tx = await signAndSubmitTransaction({
      data: {
        function: FUNCTIONS.SETTLE_DEBT,
        typeArguments: [],
        functionArguments: [groupId, creditorAddress, paymentAmount],
      },
    });
    const result = await aptos.waitForTransaction({
      transactionHash: tx.hash,
    });
    if (result.success) {
      return result.hash;
    } else {
      throw new Error(`Failed to settle debt`);
    }
  };

  const getGroupsOverviewForMember = async () => {
    if (!account || !connected) {
      throw new Error("Wallet not connected");
    }
    try {
      const a = await aptos.view<GroupView[]>({
        payload: {
          function: FUNCTIONS.GET_GROUPS,
          functionArguments: [account.address.toString()],
        },
      });
      const array = a as any[];
      return array[0] as GroupView[];
    } catch (error) {
      console.error(error);
      return [];
    }
  };

  const getGroupDetails = useCallback(
    (groupId: number) => {
      if (!account || !connected) {
        throw new Error("Wallet not connected");
      }
      const group = groupsOverview.find((group) => group.group_id === groupId);
      if (!group) {
        throw new Error("Group not found");
      }
      return group;
    },
    [account, connected, groupsOverview]
  );

  return (
    <ContractContext.Provider
      value={{
        getAvailableGroups,
        createGroup,
        groupsOverview,
        refreshGroupsOverview,
        isGroupsOverviewLoading,
        addExpense,
        settleDebt,
        getGroupDetails,
      }}
    >
      {children}
    </ContractContext.Provider>
  );
};

export const useContract = () => {
  const context = useContext(ContractContext);
  if (!context) {
    throw new Error("useContract must be used within an ContractProvider");
  }
  return context;
};
