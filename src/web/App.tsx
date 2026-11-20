import { useEffect, useRef } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Sidebar } from "./components/Sidebar.tsx";
import { Tooltips } from "./components/Tooltips.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { useHubEventStream } from "./hubEvents.ts";
import { AssetsPage } from "./pages/AssetsPage.tsx";
import { FilmPage } from "./pages/FilmPage.tsx";
import { FilmsPage } from "./pages/FilmsPage.tsx";
import { RendersPage } from "./pages/RendersPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { SkillsPage } from "./pages/SkillsPage.tsx";
import { TemplateEditorPage } from "./pages/TemplateEditorPage.tsx";
import { TemplatesPage } from "./pages/TemplatesPage.tsx";

/** Keeps `--main-h` at the main area's height, so columns can be exactly as tall as what you see. */
function useMainHeight() {
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = main.current;
    if (!element) return;
    const update = () =>
      element.style.setProperty("--main-h", `${Math.round(element.clientHeight)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return main;
}

export function App() {
  useHubEventStream();
  const main = useMainHeight();

  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main" ref={main}>
        <Routes>
          <Route path="/films" element={<FilmsPage />} />
          <Route path="/films/:id" element={<FilmPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/new" element={<TemplateEditorPage />} />
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
          <Route path="/renders" element={<RendersPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/films" replace />} />
        </Routes>
      </main>
      <Tooltips />
    </div>
  );
}
