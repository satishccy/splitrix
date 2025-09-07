import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { aptos, CONTRACT_ADDRESS, MODULE_NAME } from "../config/aptos";

export type Contact = {
  name: string;
  address: string;
};

type ContactsContextValue = {
  contacts: Contact[];
  addOrUpdateContact: (contact: Contact) => Promise<void>;
  removeContact: (address: string) => Promise<void>;
  resolveName: (address: string) => string | null;
  refreshContacts: () => Promise<void>;
  getContactLabel: (address: string) => string | null;
};

const ContactsContext = createContext<ContactsContextValue | undefined>(
  undefined
);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = clean.length;
  const out = new Uint8Array(Math.ceil(len / 2));
  for (let i = 0, j = 0; i < len; i += 2, j += 1) {
    const byte = clean.slice(i, i + 2);
    out[j] = parseInt(byte.padEnd(2, "0"), 16);
  }
  return out;
}

function bytesToString(bytesOrHex: number[] | string | Uint8Array): string {
  try {
    let u8: Uint8Array;
    if (typeof bytesOrHex === "string") {
      if (bytesOrHex.startsWith("0x") || /^[0-9a-fA-F]+$/.test(bytesOrHex)) {
        u8 = hexToBytes(bytesOrHex);
      } else {
        return bytesOrHex;
      }
    } else if (bytesOrHex instanceof Uint8Array) {
      u8 = bytesOrHex;
    } else {
      u8 = new Uint8Array(bytesOrHex);
    }
    return new TextDecoder().decode(u8);
  } catch {
    // Fallback ASCII
    if (typeof bytesOrHex === "string") return bytesOrHex;
    const arr =
      bytesOrHex instanceof Uint8Array
        ? Array.from(bytesOrHex)
        : (bytesOrHex as number[]);
    return String.fromCharCode(...arr);
  }
}

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { account, connected, signAndSubmitTransaction } = useWallet();
  const [contacts, setContacts] = useState<Contact[]>([]);

  const FN = useMemo(
    () => ({
      GET_CONTACTS:
        `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_contacts` as `${string}::${string}::${string}`,
      UPSERT_CONTACT:
        `${CONTRACT_ADDRESS}::${MODULE_NAME}::upsert_contact` as `${string}::${string}::${string}`,
      REMOVE_CONTACT:
        `${CONTRACT_ADDRESS}::${MODULE_NAME}::remove_contact` as `${string}::${string}::${string}`,
    }),
    []
  );

  const loadOnChainContacts = useCallback(async () => {
    if (!account || !connected) {
      setContacts([]);
      return;
    }
    try {
      const res = (await aptos.view<any>({
        payload: {
          function: FN.GET_CONTACTS,
          functionArguments: [account.address.toString()],
        },
      })) as any[];
      const addrs: string[] = res[0] ?? [];
      const namesBytes: Array<number[] | string | Uint8Array> = res[1] ?? [];
      const list: Contact[] = addrs.map((addr, idx) => ({
        address: addr,
        name: bytesToString(namesBytes[idx] || []),
      }));
      // sort by name for stable UI
      list.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(list);
    } catch (e) {
      console.error("Failed to load contacts:", e);
      setContacts([]);
    }
  }, [account, connected]);

  useEffect(() => {
    loadOnChainContacts();
  }, [loadOnChainContacts]);

  const addOrUpdateContact = useCallback(
    async (contact: Contact) => {
      if (!account || !connected) return;
      const nameBytes = Array.from(new TextEncoder().encode(contact.name));
      try {
        const tx = await signAndSubmitTransaction({
          data: {
            function: FN.UPSERT_CONTACT,
            functionArguments: [contact.address, nameBytes],
          },
        });
        const r = await aptos.waitForTransaction({ transactionHash: tx.hash });
        if (r.success) {
          await loadOnChainContacts();
        }
      } catch (e) {
        console.error("upsert_contact failed:", e);
        throw e;
      }
    },
    [account, connected, signAndSubmitTransaction, loadOnChainContacts]
  );

  const removeContact = useCallback(
    async (address: string) => {
      if (!account || !connected) return;
      try {
        const tx = await signAndSubmitTransaction({
          data: {
            function: FN.REMOVE_CONTACT,
            functionArguments: [address],
          },
        });
        const r = await aptos.waitForTransaction({ transactionHash: tx.hash });
        if (r.success) {
          await loadOnChainContacts();
        }
      } catch (e) {
        console.error("remove_contact failed:", e);
        throw e;
      }
    },
    [account, connected, signAndSubmitTransaction, loadOnChainContacts]
  );

  const addressToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) {
      map.set(c.address.toLowerCase(), c.name);
    }
    return map;
  }, [contacts]);

  const resolveName = useCallback(
    (address: string) => addressToName.get(address.toLowerCase()) || null,
    [addressToName]
  );

  const getContactLabel = useCallback(
    (address: string) => {
      const addr = address || "";
      const isMe =
        account?.address?.toString().toLowerCase() === addr.toLowerCase();
      if (isMe) return `Me`;
      const name = resolveName(addr);
      if (name) return `${name}`;
      return null;
    },
    [account, resolveName]
  );

  const value: ContactsContextValue = {
    contacts,
    addOrUpdateContact,
    removeContact,
    resolveName,
    refreshContacts: loadOnChainContacts,
    getContactLabel,
  };

  return (
    <ContactsContext.Provider value={value}>
      {children}
    </ContactsContext.Provider>
  );
};

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}
