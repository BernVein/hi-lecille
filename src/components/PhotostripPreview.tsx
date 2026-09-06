import React, { useState } from "react";
import { Button } from "@heroui/react";
import { Download, Copy, Share2, Sparkles, Check, Heart } from "lucide-react";
import confetti from "canvas-confetti";
import type {
  CapturedPhoto,
  CoupleProfile,
  FilterId,
  StripLayout,
} from "../types/photobooth";
import { FRAME_COLORS, PHOTOBOOTH_FILTERS } from "../utils/filters";
import { generatePhotostripCanvas } from "../utils/canvasExport";

interface PhotostripPreviewProps {
  photos: CapturedPhoto[];
  layout: StripLayout;
  filterId: FilterId;
  frameColorId: string;
  couple: CoupleProfile;
  selectedStickers: string[];
  onSaveToGallery?: (dataUrl: string) => void;
}

export const PhotostripPreview: React.FC<PhotostripPreviewProps> = ({
  photos,
  layout,
  filterId,
  frameColorId,
  couple,
  selectedStickers,
  onSaveToGallery,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const frameConfig =
    FRAME_COLORS.find((f) => f.id === frameColorId) || FRAME_COLORS[0];
  const filterConfig =
    PHOTOBOOTH_FILTERS.find((f) => f.id === filterId) || PHOTOBOOTH_FILTERS[0];

  // Determine number of required slots for the chosen layout
  const slotCount = layout === "3-cut" ? 3 : layout === "2-cut" || layout === "split-duo" ? 2 : 4;
  const filledPhotos = photos.slice(0, slotCount);

  // Export to Canvas
  const handleExport = async (action: "download" | "copy" | "share") => {
    if (photos.length === 0) return;
    setIsExporting(true);
    try {
      const canvas = await generatePhotostripCanvas({
        photos: filledPhotos,
        layout,
        filterId,
        frameColorId,
        couple,
        stickers: selectedStickers,
      });

      const dataUrl = canvas.toDataURL("image/png");
      onSaveToGallery?.(dataUrl);

      if (action === "download") {
        const a = document.createElement("a");
        const filename = `babe-photostrip-${Date.now()}.png`;
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ["#f43f5e", "#ec4899", "#fb7185", "#fda4af"],
        });
      } else if (action === "copy") {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                "image/png": blob,
              }),
            ]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch (err) {
            console.warn("Clipboard write failed:", err);
          }
        });
      } else if (action === "share") {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], "babe-photostrip.png", {
            type: "image/png",
          });
          if (
            navigator.share &&
            navigator.canShare &&
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              title: "Memories with Babe 💕",
              text: "Our photostrip memory with babe 🤍",
              files: [file],
            });
          } else {
            // fallback download
            handleExport("download");
          }
        });
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const isFilm = Boolean(frameConfig.isFilmStrip);
  const sprocketCount = layout === "3-cut" ? 10 : layout === "2-cut" ? 7 : 12;

  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 shadow-xl flex flex-col items-center">
      <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
          <span>Your Film Strip</span>
        </div>
        <span className="text-[11px] text-zinc-500">
          {slotCount}-Photo Layout
        </span>
      </div>

      {/* The Styled Photobooth Physical Strip Box */}
      <div className="w-full flex justify-center py-2">
        <div
          className={`shadow-2xl rounded-sm transition-all duration-300 relative border overflow-hidden ${
            isFilm ? "px-2 py-3 sm:px-2.5 sm:py-3.5 max-w-[290px] sm:max-w-[310px]" : "p-3.5 sm:p-4 max-w-[280px] sm:max-w-[300px]"
          } w-full`}
          style={{
            backgroundColor: frameConfig.bgHex,
            borderColor: frameConfig.borderHex,
            color: frameConfig.textHex,
          }}
        >
          <div className="flex w-full items-stretch">
            {/* Left Film Sprocket Holes (for 35mm film style) */}
            {isFilm && (
              <div className="w-5 shrink-0 flex flex-col justify-around items-center py-1 select-none pointer-events-none pr-1">
                {Array.from({ length: sprocketCount }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5 my-0.5">
                    <div className="w-2.5 h-3 rounded-[2px] bg-zinc-100 shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)] border border-zinc-400" />
                    {i % 3 === 0 && (
                      <span className="text-[6px] font-mono text-amber-400/90 font-bold leading-none scale-75 whitespace-nowrap">
                        {i === 0 ? "▲ 12A" : i === 3 ? "35mm" : i === 6 ? "▶ 13" : "▲ 13A"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Core Strip Body */}
            <div className="flex-1 px-1">
              {/* Photo slots container */}
              <div
                className={`grid gap-2 mb-3 ${
                  layout === "grid-4" || layout === "split-duo"
                    ? "grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                {Array.from({ length: slotCount }).map((_, idx) => {
                  const photo = filledPhotos[idx];
                  return (
                    <div
                      key={idx}
                      className="aspect-[4/3] rounded bg-zinc-800/40 relative overflow-hidden border border-black/10 flex items-center justify-center"
                    >
                      {photo ? (
                        <>
                          <img
                            src={photo.dataUrl}
                            alt={`Pose ${idx + 1}`}
                            style={{ filter: filterConfig.cssFilter }}
                            className="w-full h-full object-cover"
                          />
                          {/* Tint overlay */}
                          {filterConfig.tintColor && (
                            <div
                              className="absolute inset-0 pointer-events-none mix-blend-color"
                              style={{ backgroundColor: filterConfig.tintColor }}
                            />
                          )}
                          {/* Vignette */}
                          {filterConfig.vignette && (
                            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.3)_100%)]" />
                          )}
                          {/* Retro 90s Date stamp */}
                          {filterConfig.dateStamp && (
                            <span className="absolute bottom-1 right-1.5 text-[10px] font-mono font-bold text-amber-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                              '98 06 08
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <Sparkles className="w-5 h-5 mx-auto mb-1 text-zinc-500 opacity-50" />
                          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                            Snap #{idx + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer of the physical strip */}
              <div className="text-center space-y-1 pt-1.5 border-t border-black/5">
                {couple.loveNote && (
                  <div className="text-[11px] italic opacity-85">
                    "{couple.loveNote}"
                  </div>
                )}
                {selectedStickers.length > 0 && (
                  <div className="text-sm tracking-wider pt-0.5">
                    {selectedStickers.join(" ")}
                  </div>
                )}
                <div className="text-[8px] font-mono opacity-70 pt-0.5 tracking-widest uppercase">
                  {isFilm ? "35mm FILM • " : ""}FOR BABE • {filterConfig.name}
                </div>
                <div className="text-[7px] font-mono opacity-40 tracking-wider">
                  b & l • butuan
                </div>
              </div>
            </div>

            {/* Right Film Sprocket Holes (for 35mm film style) */}
            {isFilm && (
              <div className="w-5 shrink-0 flex flex-col justify-around items-center py-1 select-none pointer-events-none pl-1">
                {Array.from({ length: sprocketCount }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5 my-0.5">
                    <div className="w-2.5 h-3 rounded-[2px] bg-zinc-100 shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)] border border-zinc-400" />
                    {i % 3 === 0 && (
                      <span className="text-[6px] font-mono text-amber-400/90 font-bold leading-none scale-75 whitespace-nowrap">
                        {i === 0 ? "KODAK" : i === 3 ? "400" : i === 6 ? "SAFETY" : "FILM"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-zinc-800">
        <Button
          size="sm"
          variant="primary"
          isDisabled={isExporting || filledPhotos.length === 0}
          onClick={() => handleExport("download")}
          className="bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs py-2 shadow-md shadow-rose-950/50"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          Save PNG
        </Button>

        <Button
          size="sm"
          variant="outline"
          isDisabled={isExporting || filledPhotos.length === 0}
          onClick={() => handleExport("copy")}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs py-2"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 mr-1" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          isDisabled={isExporting || filledPhotos.length === 0}
          onClick={() => handleExport("share")}
          className="text-xs py-2 font-semibold"
        >
          <Share2 className="w-3.5 h-3.5 mr-1" />
          Share
        </Button>
      </div>
    </div>
  );
};
