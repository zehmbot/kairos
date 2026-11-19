import { useEffect, useState } from "react";
import type { Asset } from "../../shared/types.ts";
import { assetFileUrl } from "../api.ts";
import { PixelIcon } from "./PixelIcon.tsx";

/** A font from the library, loaded once under its own family name, for the "Aa" sample. */
function useAssetFont(asset: Asset): string | null {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    if (asset.kind !== "font") return;
    const name = `kairos-asset-${asset.id.replace(/[^a-z0-9]/gi, "-")}`;
    const face = new FontFace(name, `url(${assetFileUrl(asset.id)})`);
    let cancelled = false;
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        if (!cancelled) setFamily(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset]);
  return family;
}

/** What an asset looks like: the picture, the video's first frame, a sound player, or "Aa" in the font. */
export function AssetPreview({ asset, small = false }: { asset: Asset; small?: boolean }) {
  const font = useAssetFont(asset);
  const url = assetFileUrl(asset.id);
  switch (asset.kind) {
    case "image":
      return <img className="asset-media" src={url} alt="" loading="lazy" />;
    case "video":
      // "#t=0.5" shows a frame instead of a black first frame.
      return (
        <video
          className="asset-media"
          src={`${url}#t=0.5`}
          preload="metadata"
          muted
          controls={!small}
        />
      );
    case "sound":
      return small ? (
        <PixelIcon name="sound" size={32} />
      ) : (
        <span className="asset-sound">
          <PixelIcon name="sound" size={32} />
          {/* biome-ignore lint/a11y/useMediaCaption: sound effects and music have no words to caption. */}
          <audio src={url} controls preload="none" />
        </span>
      );
    case "font":
      return (
        <span className="asset-font" style={font ? { fontFamily: font } : undefined}>
          Aa
        </span>
      );
  }
}
