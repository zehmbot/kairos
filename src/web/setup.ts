/**
 * The setup card (Films page): what you need before making films, and what's done. Four steps: your films folder,
 * Claude Code (installed, then connected), voices (a fish.audio key) and your computer (ffmpeg and a browser).
 */
import {
  useCamera,
  useClaude,
  useExportInfo,
  useHealth,
  useVoiceStatus,
  useWorkspace,
} from "./api.ts";

export type SetupStepId = "folder" | "claude" | "voices" | "computer";
export const SETUP_STEPS: readonly SetupStepId[] = ["folder", "claude", "voices", "computer"];

/** What Kairos knows about each step; null while it's still asking. */
export interface SetupState {
  folder: boolean | null;
  claude: "missing" | "installed" | "connected" | null;
  voices: boolean | null;
  ffmpeg: boolean | null;
  browser: boolean | null;
}

export interface SetupProgress {
  done: Record<SetupStepId, boolean>;
  count: number;
  total: number;
  complete: boolean;
  /** Every answer is in: until then the card waits (it doesn't flash). */
  known: boolean;
}

export function setupProgress(state: SetupState): SetupProgress {
  const done: Record<SetupStepId, boolean> = {
    folder: state.folder === true,
    claude: state.claude === "connected",
    voices: state.voices === true,
    computer: state.ffmpeg === true && state.browser === true,
  };
  const count = SETUP_STEPS.filter((step) => done[step]).length;
  return {
    done,
    count,
    total: SETUP_STEPS.length,
    complete: count === SETUP_STEPS.length,
    known: Object.values(state).every((value) => value !== null),
  };
}

/** How to install ffmpeg on this computer, in one command. */
export function ffmpegInstall(platform: string): string {
  if (platform === "win32") return "winget install Gyan.FFmpeg";
  if (platform === "darwin") return "brew install ffmpeg";
  return "sudo apt install ffmpeg";
}

/** The card was closed with ×: it stays closed in this browser until Settings shows it again. */
const HIDDEN_KEY = "kairos.setup-hidden";

export function setupHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSetupHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, "1");
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {}
}

/** Everything the card shows, from what Kairos already knows. */
export function useSetup() {
  const workspace = useWorkspace();
  const claude = useClaude();
  const voice = useVoiceStatus();
  const exportInfo = useExportInfo();
  const camera = useCamera();
  const health = useHealth();
  const state: SetupState = {
    folder: workspace.data ? Boolean(workspace.data.path) : null,
    claude: claude.data
      ? claude.data.cli
        ? claude.data.connected
          ? "connected"
          : "installed"
        : "missing"
      : null,
    voices: voice.data ? Boolean(voice.data.key) : null,
    ffmpeg: exportInfo.data ? Boolean(exportInfo.data.ffmpeg) : null,
    browser: camera.data ? Boolean(camera.data.browser) : null,
  };
  return {
    state,
    progress: setupProgress(state),
    workspace: workspace.data ?? null,
    claude: claude.data ?? null,
    voice: voice.data ?? null,
    ffmpeg: exportInfo.data?.ffmpeg ?? null,
    browser: camera.data?.browser ?? null,
    platform: health.data?.platform ?? "",
    refetchClaude: () => void claude.refetch(),
  };
}
