import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

const JourneyPage = lazy(async () => ({
  default: (await import("../features/journey/JourneyPage")).JourneyPage,
}));
const JournalPage = lazy(async () => ({
  default: (await import("../features/journal/JournalPage")).JournalPage,
}));

function routeElement(page: React.ReactNode) {
  return (
    <Suspense fallback={<main className="route-loading" aria-busy="true">正在翻开手账...</main>}>
      {page}
    </Suspense>
  );
}

export interface AppRouterProps {
  editorEnabled?: boolean;
  onEdit(): void;
}

export function AppRouter({ editorEnabled = true, onEdit }: AppRouterProps) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell editorEnabled={editorEnabled} onEdit={onEdit} />}>
          <Route index element={<Navigate to="/journey" replace />} />
          <Route path="/journey" element={routeElement(<JourneyPage />)} />
          <Route path="/journal" element={routeElement(<JournalPage />)} />
          <Route path="/journal/:entryId" element={routeElement(<JournalPage />)} />
          <Route path="*" element={<Navigate to="/journey" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
