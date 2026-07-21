"use client";

import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import PublicLandingPage from "./components/PublicLandingPage";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setHasSession(Boolean(data.session));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setHasSession(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (hasSession === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
          />
          Načítavam Esblu...
        </div>
      </main>
    );
  }

  return hasSession ? <Dashboard /> : <PublicLandingPage />;
}
