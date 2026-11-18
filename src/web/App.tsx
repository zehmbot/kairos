import { Navigate, Route, Routes } from "react-router";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { useHubEventStream } from "./hubEvents.ts";
import { AssetsPage } from "./pages/AssetsPage.tsx";
import { FilmPage } from "./pages/FilmPage.tsx";
import { FilmsPage } from "./pages/FilmsPage.tsx";
import { RendersPage } from "./pages/RendersPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  useHubEventStream();

  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/films" element={<FilmsPage />} />
          <Route path="/films/:id" element={<FilmPage />} />
          <Route path="/renders" element={<RendersPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/films" replace />} />
        </Routes>
      </main>
    </div>
  );
}
