import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Contact = {
  name: string;
  address: string;
};

type ContactsContextValue = {
  contacts: Contact[];
  addOrUpdateContact: (contact: Contact) => void;
  removeContact: (address: string) => void;
  resolveName: (address: string) => string | null;
};

const CONTACTS_STORAGE_KEY = "splitrix_contacts_v1";

const ContactsContext = createContext<ContactsContextValue | undefined>(undefined);

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c: any) => c && typeof c.name === "string" && typeof c.address === "string"
    );
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]) {
  localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
}

export const ContactsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());

  useEffect(() => {
    saveContacts(contacts);
  }, [contacts]);

  const addOrUpdateContact = useCallback((contact: Contact) => {
    setContacts((prev) => {
      const existsIdx = prev.findIndex(
        (c) => c.address.toLowerCase() === contact.address.toLowerCase()
      );
      if (existsIdx >= 0) {
        const clone = prev.slice();
        clone[existsIdx] = { ...clone[existsIdx], name: contact.name };
        return clone;
      }
      return [...prev, contact].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const removeContact = useCallback((address: string) => {
    setContacts((prev) => prev.filter((c) => c.address !== address));
  }, []);

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

  const value: ContactsContextValue = {
    contacts,
    addOrUpdateContact,
    removeContact,
    resolveName,
  };

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
};

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}


