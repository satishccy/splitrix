import React, { useEffect, useState } from "react";
import {
  Network,
  useWallet,
  WalletReadyState,
} from "@aptos-labs/wallet-adapter-react";
import { WalletIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const WalletConnect: React.FC = () => {
  const {
    connected,
    account,
    connect,
    disconnect,
    wallets,
    network,
    changeNetwork,
  } = useWallet();
  const [isPetraWalletInstalled, setIsPetraWalletInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const router = useNavigate();

  useEffect(() => {
    const petraWallet = wallets.find((wallet) => wallet.name === "Petra");
    if (petraWallet) {
      setIsPetraWalletInstalled(
        petraWallet.readyState === WalletReadyState.Installed
      );
    }
  }, [wallets]);

  const handleConnect = async () => {
    if (isPetraWalletInstalled) {
      try {
        setIsConnecting(true);
        await connect("Petra");
        if (network && network?.name !== import.meta.env.VITE_APP_NETWORK) {
          await changeNetwork(import.meta.env.VITE_APP_NETWORK as Network);
        }
        toast.success("Wallet connected");
      } catch (error) {
        console.error(`Error connecting to Petra: ${error}`);
        toast.error("Failed to connect wallet");
      } finally {
        setIsConnecting(false);
      }
    } else {
      window.open("https://petra.app/", "_blank");
      toast.info("Redirecting to install Petra wallet");
    }
  };

  if (connected && account) {
    return (
      <div className="hidden sm:flex items-center gap-4">
        <div className="bg-gradient-to-r from-[#01DCC8] to-[#F9F853] text-transparent bg-clip-text font-medium">
          {`${account.address.toString().slice(0, 6)}...${account.address
            .toString()
            .slice(-4)}`}
        </div>
        <button
          onClick={async () => {
            try {
              await disconnect();
              router("/");
              toast("Disconnected wallet");
            } catch (err) {
              toast.error("Failed to disconnect");
            }
          }}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#01DCC8] to-[#00B4A6] text-white rounded-lg hover:from-[#00C4B8] hover:to-[#009A8C] transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <WalletIcon className="h-5 w-5" />
      {isConnecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
};
