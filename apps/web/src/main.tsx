import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { App } from "./app/App";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";
import { AuthProvider } from "./auth/auth-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={450}>
        <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
