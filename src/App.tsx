import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./pages/Dashboard";
import { GroupPage } from "./pages/GroupPage";
import Contacts from "./pages/Contacts";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { ContractProvider } from "./contexts/contract";
import { Toaster } from "sonner";
import { ContactsProvider } from "./contexts/contacts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 30 * 1000, // 30 seconds
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        optInWallets={["Petra"]}
        autoConnect={true}
        dappConfig={{
          network: import.meta.env.VITE_APP_NETWORK as Network,
        }}
      >
        <ContractProvider>
          <ContactsProvider>
            <Router>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/group/:groupId" element={<GroupPage />} />
                <Route path="/contacts" element={<Contacts />} />
              </Routes>
            </Router>
            <Toaster richColors position="bottom-right" />
          </ContactsProvider>
        </ContractProvider>
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}

export default App;
