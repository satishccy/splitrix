import React, { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { Network, useWallet } from "@aptos-labs/wallet-adapter-react";

interface MobileMenuProps {
  className?: string;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ className }) => {
  const [open, setOpen] = useState(false);
  const { connected, account, connect, disconnect, network, changeNetwork } = useWallet();

  return (
    <>
      <button
        className={`inline-flex items-center justify-center rounded-lg p-2 border border-gray-200 text-gray-700 hover:bg-gray-50 sm:hidden ${
          className || ""
        }`}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      <Transition appear show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50 sm:hidden" onClose={() => setOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-start justify-end p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-x-8"
                enterTo="opacity-100 translate-x-0"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 translate-x-8"
              >
                <Dialog.Panel className="w-full max-w-xs transform overflow-hidden rounded-2xl bg-white p-4 text-left align-middle shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      Menu
                    </Dialog.Title>
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"
                      aria-label="Close menu"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    {connected && account ? (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">
                          {`${account.address.toString().slice(0, 6)}...${account.address
                            .toString()
                            .slice(-4)}`}
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await disconnect();
                              setOpen(false);
                            } catch {}
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          try {
                            await connect("Petra");
                            if (network && network?.name !== import.meta.env.VITE_APP_NETWORK) {
                              await changeNetwork(import.meta.env.VITE_APP_NETWORK as Network);
                            }
                            setOpen(false);
                          } catch {}
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-[#01DCC8] to-[#00B4A6] text-white text-sm"
                      >
                        Connect Wallet
                      </button>
                    )}
                  </div>

                  <nav className="space-y-2">
                    <Link
                      to="/"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Home
                    </Link>
                    <Link
                      to="/contacts"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Contacts
                    </Link>
                  </nav>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default MobileMenu;


