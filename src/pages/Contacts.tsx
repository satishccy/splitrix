import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "react-qr-code";
import QrScanner from "qr-scanner";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { WalletConnect } from "../components/WalletConnect";
import { useContacts } from "../contexts/contacts";
import { MobileMenu } from "../components/MobileMenu";
import {
  ArrowLeftIcon,
  QrCodeIcon,
  UserPlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

// contact storage handled by context

function formatAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const Contacts: React.FC = () => {
  const { connected, account } = useWallet();
  const myAddress = account?.address?.toString() || "";

  const { contacts, addOrUpdateContact, removeContact, getContactLabel } =
    useContacts();
  const [isScanning, setIsScanning] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  // Persistence handled by provider

  useEffect(() => {
    if (!isScanning) {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
      return;
    }

    if (!videoRef.current) return;

    setScanError(null);
    setScannerReady(false);

    // Attempt to configure worker path for bundlers (Vite)
    try {
      // @ts-ignore - WORKER_PATH exists in qr-scanner
      QrScanner.WORKER_PATH = new URL(
        "qr-scanner/qr-scanner-worker.min.js",
        import.meta.url
      ).toString();
    } catch {
      // Fallback: allow default
    }

    const onDecode = (result: string) => {
      setIsScanning(false);
      const parsedAddress = parseScannedPayload(result);
      if (!parsedAddress) {
        setScanError("QR does not contain a valid address");
        return;
      }
      const suggestedName = suggestNameFromAddress(parsedAddress, contacts);
      const name = prompt(
        `Enter a name for ${formatAddress(parsedAddress)}`,
        suggestedName
      );
      if (!name) return;
      addOrUpdateContact({ name, address: parsedAddress });
    };

    const scanner = new QrScanner(
      videoRef.current,
      (res) => onDecode(typeof res === "string" ? res : (res as any).data),
      {
        maxScansPerSecond: 2,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
        onDecodeError: (err) => {
          // Non-fatal decode errors while scanning
          // Keep it quiet unless it's a permission or setup issue
          const message = String(err || "");
          if (
            message.toLowerCase().includes("not allowed") ||
            message.toLowerCase().includes("camera")
          ) {
            setScanError(message);
          }
        },
        calculateScanRegion: (video) => {
          // Center square region
          const smallest = Math.min(video.videoWidth, video.videoHeight);
          const size = Math.floor(smallest * 0.8);
          return {
            x: Math.floor((video.videoWidth - size) / 2),
            y: Math.floor((video.videoHeight - size) / 2),
            width: size,
            height: size,
          };
        },
      }
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => setScannerReady(true))
      .catch((err) => setScanError(String(err || "Failed to start scanner")));

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [isScanning]);

  // addOrUpdateContact / removeContact from provider

  const canAddManual = useMemo(() => {
    return (
      manualName.trim().length > 0 && isLikelyAddress(manualAddress.trim())
    );
  }, [manualName, manualAddress]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#01DCC8]/10 via-white to-[#F9F853]/10">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
                Manage Contacts
              </h1>
              <p className="text-base sm:text-xl text-gray-600">
                Connect your wallet to view your address and manage contacts
              </p>
            </div>
            <div className="bg-white/80 flex flex-col items-center justify-center backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/20">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Contacts
              </Link>
            </div>
            <WalletConnect />
            <MobileMenu />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Your Address
                </h2>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-gray-600 hover:text-[#01DCC8]"
                >
                  <ArrowLeftIcon className="h-5 w-5" /> Back
                </Link>
              </div>
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <QRCode value={myAddress} size={180} />
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-700">
                    {getContactLabel(myAddress)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 shadow-lg border border-white/20">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Scan To Add
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Ask your friend to open this Contacts page and show their QR.
                Scan it to save their address with a name.
              </p>
              <div className="space-y-4">
                {!isScanning ? (
                  <button
                    onClick={() => setIsScanning(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#01DCC8] to-[#00B4A6] text-white rounded-xl hover:opacity-90 transition-all shadow-md"
                  >
                    <QrCodeIcon className="h-5 w-5" /> Start Scanning
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-black/5">
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        muted
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600">
                        {scannerReady
                          ? "Point your camera at a QR code"
                          : "Starting camera..."}
                      </div>
                      <button
                        onClick={() => setIsScanning(false)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Stop
                      </button>
                    </div>
                    {scanError && (
                      <div className="text-xs text-red-600">{scanError}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 shadow-lg border border-white/20">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Add Manually
              </h2>
              <div className="grid grid-cols-1 gap-3">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#01DCC8]"
                />
                <input
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="Aptos address"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#01DCC8]"
                />
                <button
                  disabled={!canAddManual}
                  onClick={() => {
                    addOrUpdateContact({
                      name: manualName.trim(),
                      address: manualAddress.trim(),
                    });
                    setManualName("");
                    setManualAddress("");
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-md ${
                    canAddManual
                      ? "bg-gradient-to-r from-[#F9F853] to-[#E6E04A] text-gray-900 hover:opacity-90"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  <UserPlusIcon className="h-5 w-5" /> Save Contact
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 shadow-lg border border-white/20">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Saved Contacts
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Contacts are stored locally in your browser using localStorage.
              </p>
              {contacts.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                  No contacts saved yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {contacts.map((c) => (
                    <div
                      key={c.address}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {getContactLabel(c.address)} (
                          {formatAddress(c.address)})
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(c.address);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => removeContact(c.address)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm"
                        >
                          <TrashIcon className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function isLikelyAddress(value: string) {
  // Aptos addresses are hex, often 0x-prefixed
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(v)) return false;
  // Basic length guard: 1..64 nibbles after 0x
  const hexLen = v.slice(2).length;
  return hexLen > 0 && hexLen <= 64;
}

function parseScannedPayload(payload: string): string | null {
  const text = (payload || "").trim();
  // Allow plain address
  if (isLikelyAddress(text)) return text;
  // Allow simple namespace "addr:<hex>"
  if (text.toLowerCase().startsWith("addr:")) {
    const addr = text.slice(5).trim();
    if (isLikelyAddress(addr)) return addr;
  }
  // Allow JSON { address: "0x..." }
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj.address === "string" &&
      isLikelyAddress(obj.address)
    ) {
      return obj.address;
    }
  } catch {}
  return null;
}

function suggestNameFromAddress(
  address: string,
  all: { name: string; address: string }[]
) {
  const base = `Friend ${address.slice(2, 6).toUpperCase()}`;
  const taken = new Set(all.map((c) => c.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

export default Contacts;
