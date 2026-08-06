import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, getToken, isTauri, setToken, UnpairedError } from "./lib/api";
import { useData } from "./lib/useData";
import type { Activity, AppSettings } from "./lib/types";
import type { Nav } from "./lib/nav";
import { applyAccent } from "./lib/theme";
import { Sidebar } from "./components/Sidebar";
import { PairingScreen } from "./components/PairingScreen";
import { TodayPage } from "./pages/TodayPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ClassesPage } from "./pages/ClassesPage";
import { HomeworkTestsPage } from "./pages/HomeworkTestsPage";
import { TasksHubPage } from "./pages/TasksHubPage";
import { TimeTrackerPage } from "./pages/TimeTrackerPage";
import { IdeasPage } from "./pages/IdeasNotesPage";
import NotesPage from "./pages/NotesPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ActivityPage } from "./pages/ActivityPage";
import { CoursePage } from "./pages/CoursePage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrashPage } from "./pages/TrashPage";
import { ProjectPage } from "./pages/ProjectPage";
import { MeetingPage } from "./pages/MeetingPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RunningTimer } from "./components/RunningTimer";
import { UndoToast } from "./components/UndoToast";
import { VerseToast } from "./components/BibleVerse";

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
  const settings = useData<AppSettings[]>("/api/settings");
  const appSettings = settings.data?.[0] ?? null;
  const appName = appSettings?.app_name || "School Hub";

  useEffect(() => {
    if (appSettings?.accent) applyAccent(appSettings.accent);
  }, [appSettings?.accent]);

  useEffect(() => {
    if (!isTauri()) return;
    getCurrentWindow()
      .setTitle(appName)
      .catch(() => {});
  }, [appName]);

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
  else if (nav === "calendar") page = <CalendarPage />;
  else if (nav === "classes")
    page = <ClassesPage onOpenCourse={(id) => navigate({ kind: "course", id })} />;
  else if (nav === "homework") page = <HomeworkTestsPage />;
  else if (nav === "tasks") page = <TasksHubPage />;
  else if (nav === "tracker") page = <TimeTrackerPage />;
  else if (nav === "notes")
    page = (
      <NotesPage
        selectedId={null}
        onSelect={(id) => navigate({ kind: "note", id, returnTo: nav })}
        onBack={() => navigate("notes")}
      />
    );
  else if (nav === "ideas") page = <IdeasPage />;
  else if (nav === "activities")
    page = <ActivitiesPage onOpenActivity={(id) => navigate({ kind: "activity", id })} />;
  else if (nav === "integrations") page = <IntegrationsPage />;
  else if (nav === "settings") page = <SettingsPage />;
  else if (nav === "trash") page = <TrashPage />;
  else if (typeof nav === "object" && nav.kind === "course")
    page = <CoursePage courseId={nav.id} onOpenNote={(id, returnTo) => navigate({ kind: "note", id, returnTo: returnTo ?? nav })} />;
  else if (typeof nav === "object" && nav.kind === "note")
    page = (
      <NotesPage
        selectedId={nav.id}
        onSelect={(id) => navigate({ kind: "note", id, returnTo: nav.returnTo })}
        onBack={() => navigate(nav.returnTo ?? "notes")}
        returnTo={nav.returnTo}
      />
    );
  else if (typeof nav === "object" && nav.kind === "project")
    page = <ProjectPage projectId={nav.id} onBack={() => navigate({ kind: "course", id: nav.id })} />;
  else if (typeof nav === "object" && nav.kind === "meeting")
    page = <MeetingPage meetingId={nav.id} onBack={() => navigate({ kind: "activity", id: nav.id })} />;
  else page = <ActivityPage activityId={nav.id} onOpenNote={(id, returnTo) => navigate({ kind: "note", id, returnTo: returnTo ?? nav })} />;

  return (
    <ErrorBoundary>
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
            appName={appName}
          />
        </div>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <span className="font-semibold text-slate-900">{appName}</span>
          </div>
          <main className="flex-1 overflow-y-auto p-5 pb-12 md:p-8">{page}</main>
        </div>

        <RunningTimer onOpen={() => navigate("tracker")} />
        <UndoToast />
        <VerseToast />
      </div>
    </ErrorBoundary>
  );
}

export default App;
