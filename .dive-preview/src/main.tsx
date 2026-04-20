import { createRoot } from "react-dom/client";
import { MotherDuckSDKProvider, useConnectionStatus } from "./md-sdk";
import { Loader2, AlertCircle } from "lucide-react";
import Dive from "./dive";

function ConnectionGate({ children }: { children: React.ReactNode }) {
  const { isConnected, isConnecting, error } = useConnectionStatus();
  if (isConnecting) return (
    <div className="flex items-center justify-center h-screen gap-2 text-[#6a6a6a]">
      <Loader2 className="animate-spin" size={20} />
      Connecting to MotherDuck…
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-screen gap-2 text-red-600">
      <AlertCircle size={20} />
      Connection failed: {error.message}
    </div>
  );
  if (!isConnected) return null;
  return <>{children}</>;
}

const rawToken = import.meta.env.VITE_MOTHERDUCK_TOKEN;
// Guard against an unexpanded shell var in .env (e.g. "$motherduck_token")
// leaking through as a literal string — that would connect, fail, and block
// the whole dive behind the ConnectionGate.
const tokenLooksReal = !!rawToken && !rawToken.startsWith("$") && rawToken.length > 20;
const token = tokenLooksReal ? rawToken : "";
const root = createRoot(document.getElementById("root")!);
// Always wrap in the provider so useSQLQuery can mount. Without a token the
// provider sits in "idle" state and queries never fire — the dive still
// renders univer from localStorage, and falls back to an empty snapshot if
// neither localStorage nor MotherDuck has data.
// Always render the Dive directly — the component has its own loading and
// error states for when the MotherDuck connection is slow or fails. The gate
// would block univer from loading while the wasm-client is still connecting.
root.render(
  <MotherDuckSDKProvider token={token}>
    <Dive />
  </MotherDuckSDKProvider>
);
