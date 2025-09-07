import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useContract } from "../contexts/contract";
import { toast } from "sonner";
import { NETWORK } from "../config/aptos";
import { useContacts } from "../contexts/contacts";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [members, setMembers] = useState<string[]>([""]);
  const [isCreating, setIsCreating] = useState(false);
  const { createGroup, refreshGroupsOverview } = useContract();
  const { contacts, getContactLabel } = useContacts();

  const formatAddress = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  const addMemberField = () => {
    setMembers([...members, ""]);
  };

  const removeMemberField = (index: number) => {
    if (members.length > 1) {
      setMembers(members.filter((_, i) => i !== index));
    }
  };

  const updateMember = (index: number, value: string) => {
    const newMembers = [...members];
    newMembers[index] = value;
    setMembers(newMembers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validMembers = members.filter((member) => member.trim().length > 0);
    if (validMembers.length === 0) {
      toast.error("Please add at least one member address");
      return;
    }

    // Prevent duplicate addresses (case-insensitive)
    const normalized = validMembers.map((m) => m.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
      toast.error("Duplicate addresses are not allowed");
      return;
    }

    setIsCreating(true);

    try {
      const txHash = await createGroup(validMembers);
      refreshGroupsOverview();
      toast.success("Group created successfully", {
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
      setMembers([""]);
    } catch (error) {
      console.error("Failed to create group:", error);
      toast.error("Failed to create group. Please try again.");
    } finally {
      setIsCreating(false);
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
                    Create New Group
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
                      Member Addresses
                    </label>
                    <div className="space-y-3">
                      {members.map((member, index) => {
                        const name = member ? getContactLabel(member) : null;
                        return (
                          <div key={index} className="space-y-1">
                            <div className="flex gap-2">
                              <input
                                list="contacts-addresses"
                                type="text"
                                value={member}
                                onChange={(e) => updateMember(index, e.target.value)}
                                placeholder="0x..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#01DCC8] focus:border-transparent"
                              />
                              {members.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeMemberField(index)}
                                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              )}
                            </div>
                            {name && (
                              <div className="text-xs text-gray-600">
                                Selected: <span className="font-medium">{name}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <datalist id="contacts-addresses">
                        {contacts.map((c) => (
                          <option key={c.address} value={c.address}>{`${c.name} (${formatAddress(c.address)})`}</option>
                        ))}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      onClick={addMemberField}
                      className="mt-2 flex items-center gap-2 text-sm text-[#01DCC8] hover:text-[#00B4A6] transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add another member
                    </button>
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
                      disabled={isCreating}
                      className="flex-1 py-2 px-4 bg-gradient-to-r from-[#01DCC8] to-[#00B4A6] text-white rounded-lg hover:from-[#00C4B8] hover:to-[#009A8C] transition-all disabled:opacity-50"
                    >
                      {isCreating ? "Creating..." : "Create Group"}
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
