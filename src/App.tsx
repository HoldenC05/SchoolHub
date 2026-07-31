import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, getToken, isTauri, setToken, UnpairedError } from "./lib/api";
import { useData } from "./lib/useData";
import type { Activity } from "./lib/types";
import type { Nav } from "./lib/nav";
import { Sidebar } from "./components/Sidebar";
import { PairingScreen } from "./components/PairingScreen";
import { TodayPage } from "./pages/TodayPage";
import { PlannerPage } from "./pages/PlannerPage";
import { ClassesPage } from "./pages/ClassesPage";
import { HomeworkTestsPage } from "./pages/HomeworkTestsPage";
import { NotesPage, IdeasPage } from "./pages/IdeasNotesPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ActivityPage } from "./pages/ActivityPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";

function App() {
  const [nav, setNav] = useState<Nav>("today");
  const [pairingState, setPairingState] = useState<"checking" | "paired" | "unpaired">("checking");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const checkPairing = useCallback(async () => {
    const pair = window.location.hash.match(/[#&]pair=([^&]+)/);
    if (pair && pair[1]) {
      setToken(pair[1]);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (isTauri()) {
      try {
        const token = await invoke<string>("get_pairing_token");
        if (token) setToken(token);
      } catch (e) {
        console.error("failed to read pairing token", e);
      }
    }
    if (!getToken()) {
      setPairingState("unpaired");
      return;
    }
    try {
      await api.get<unknown[]>("/api/tags");
      setPairingState("paired");
    } catch (e) {
      if (e instanceof UnpairedError) {
        setToken("");
        setPairingState("unpaired");
      } else {
        setPairingState("paired");
      }
    }
  }, []);

  useEffect(() => {
    checkPairing();
  }, [checkPairing]);

  const activities = useData<Activity[]>("/api/activities");

  const navigate = useCallback((n: Nav) => {
    setNav(n);
    setMobileNavOpen(false);
  }, []);

  if (pairingState === "checking") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Connecting…
      </div>
    );
  }

  if (pairingState === "unpaired") {
    return <PairingScreen />;
  }

  let page: ReactNode;
  if (nav === "today") page = <TodayPage />;
  else if (nav === "planner") page = <PlannerPage />;
  else if (nav === "classes") page = <ClassesPage />;
  else if (nav === "homework") page = <HomeworkTestsPage />;
  else if (nav === "notes") page = <NotesPage />;
  else if (nav === "ideas") page = <IdeasPage />;
  else if (nav === "activities")
    page = <ActivitiesPage onOpenActivity={(id) => navigate({ kind: "activity", id })} />;
  else if (nav === "integrations") page = <IntegrationsPage />;
  else page = <ActivityPage activityId={nav.id} />;

  return (
    <div className="flex h-full">
      <div
        className={`fixed inset-y-0 left-0 z-40 md:static md:z-auto ${
          mobileNavOpen ? "block" : "hidden md:block"
        }`}
      >
        <Sidebar
          nav={nav}
          onNavigate={navigate}
          activities={activities.data}
          onAddActivity={() => navigate("activities")}
        />
      </div>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-semibold text-slate-100">School Hub</span>
        </div>
        <main className="flex-1 overflow-y-auto p-5 pb-12 md:p-8">{page}</main>
      </div>
    </div>
  );
}

export default App;
