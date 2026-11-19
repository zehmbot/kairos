import { useId, useState } from "react";
import { useVoiceKey, useVoiceModel, useVoiceStatus } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const MODEL_WORDS: Record<string, string> = {
  "s2.1-pro": "S2.1 Pro (best, the default)",
  "s2.1-pro-free": "S2.1 Pro Free (free developer tier)",
  "s2-pro": "S2 Pro",
  s1: "S1 (older)",
};

/** Settings → Voice: the fish.audio key (checked before it is saved, never shown again) and the model. */
export function VoiceSettings() {
  const status = useVoiceStatus();
  const saveKey = useVoiceKey();
  const setModel = useVoiceModel();
  const [key, setKey] = useState("");
  const [confirm, setConfirm] = useState(false);
  const keyId = useId();
  const modelId = useId();
  const data = status.data;

  return (
    <PixelPanel title="Voice (fish.audio)">
      <div className="stack">
        <p>
          Kairos makes voices with fish.audio. Add your API key once: it stays on this computer (in
          Kairos' settings folder) and is only ever sent to fish.audio.
        </p>
        {status.isError && <p className="field-error">{status.error.message}</p>}
        {data?.key ? (
          <div className="note-actions">
            <span className="voice-ok">Connected</span>
            <span>
              Key {data.hint}
              {data.key === "environment" ? " (from the environment or Kairos' .env file)" : ""}
            </span>
            {data.key === "settings" &&
              (confirm ? (
                <>
                  <span className="note-confirm">Forget this key?</span>
                  <PixelButton
                    data-size="small"
                    data-tone="danger"
                    onClick={() => saveKey.mutate(null, { onSuccess: () => setConfirm(false) })}
                  >
                    Remove
                  </PixelButton>
                  <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(false)}>
                    Keep
                  </PixelButton>
                </>
              ) : (
                <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(true)}>
                  Remove key
                </PixelButton>
              ))}
          </div>
        ) : null}
        <form
          className="voice-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) saveKey.mutate(key.trim(), { onSuccess: () => setKey("") });
          }}
        >
          <label htmlFor={keyId} className="field-label">
            {data?.key ? "Use another key" : "Your fish.audio API key"}
          </label>
          <div className="voice-key-row">
            <input
              id={keyId}
              className="px-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="Paste the key here"
              onChange={(event) => setKey(event.target.value)}
            />
            <PixelButton type="submit" disabled={!key.trim() || saveKey.isPending}>
              {saveKey.isPending ? "Checking…" : "Check and save"}
            </PixelButton>
          </div>
          <p className="hint">
            Get a key on fish.audio (API keys, in your account). Kairos checks it with fish.audio
            before saving it.
          </p>
          {saveKey.error && <p className="field-error">{saveKey.error.message}</p>}
        </form>
        {data && (
          <div className="field">
            <label htmlFor={modelId} className="field-label">
              Voice model
            </label>
            <select
              id={modelId}
              className="px-input"
              value={data.model}
              onChange={(event) => setModel.mutate(event.target.value)}
            >
              {data.models.map((model) => (
                <option key={model} value={model}>
                  {MODEL_WORDS[model] ?? model}
                </option>
              ))}
            </select>
            {setModel.error && <p className="field-error">{setModel.error.message}</p>}
          </div>
        )}
      </div>
    </PixelPanel>
  );
}
