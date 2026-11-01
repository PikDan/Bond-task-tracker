import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { UserProvider } from "./context/UserContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { ToastProvider } from "./context/ToastContext";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <WorkspaceProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </WorkspaceProvider>
      </UserProvider>
    </QueryClientProvider>
  </StrictMode>,
);
