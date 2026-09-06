import React from 'react';
import { Layout, Palette, Heart, Smile } from 'lucide-react';
import type { StripLayout, CoupleProfile } from '../types/photobooth';
import { FRAME_COLORS, CUTE_STICKERS } from '../utils/filters';

interface StripCustomizerProps {
  layout: StripLayout;
  frameColorId: string;
  couple: CoupleProfile;
  selectedStickers: string[];
  onSelectLayout: (layout: StripLayout) => void;
  onSelectFrameColor: (frameId: string) => void;
  onToggleSticker: (sticker: string) => void;
  onUpdateCoupleNote: (note: string) => void;
}

export const StripCustomizer: React.FC<StripCustomizerProps> = ({
  layout,
  frameColorId,
  couple,
  selectedStickers,
  onSelectLayout,
  onSelectFrameColor,
  onToggleSticker,
  onUpdateCoupleNote,
}) => {
  const layouts: { id: StripLayout; name: string; desc: string; icon: string }[] = [
    { id: '3-cut', name: '3-Cut Strip', desc: '1x3 Film Booth (Classic)', icon: '❚❚❚' },
    { id: '4-cut', name: '4-Cut Strip', desc: '1x4 Tall Korean Classic', icon: '❚❚❚❚' },
    { id: '2-cut', name: '2-Cut Duo', desc: 'Top & Bottom 2-Photo', icon: '❚❚' },
    { id: 'grid-4', name: '2x2 Photocard', desc: 'Square 4-Photo Card', icon: '⊞' },
    { id: 'split-duo', name: 'Side-by-Side', desc: 'Wide 2-Cut Duo', icon: '▥' },
  ];

  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-xl space-y-4 text-xs">
      {/* 1. Layout Selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <Layout className="w-3.5 h-3.5 text-rose-400" />
          <span>Strip Format</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelectLayout(l.id)}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                layout === l.id
                  ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                  : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400'
              }`}
            >
              <div className="font-mono text-sm font-bold text-zinc-200 mb-0.5">{l.icon}</div>
              <div className="font-bold text-zinc-100">{l.name}</div>
              <div className="text-[10px] text-zinc-500">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Frame Color Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
            <Palette className="w-3.5 h-3.5 text-rose-400" />
            <span>Frame Aesthetic</span>
          </div>
          <span className="text-[11px] text-zinc-500">
            {FRAME_COLORS.find((f) => f.id === frameColorId)?.name}
          </span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {FRAME_COLORS.map((frame) => (
            <button
              key={frame.id}
              type="button"
              onClick={() => onSelectFrameColor(frame.id)}
              title={frame.name}
              className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                frameColorId === frame.id
                  ? 'scale-110 border-rose-500 ring-2 ring-rose-500/40'
                  : 'border-zinc-700 hover:scale-105'
              }`}
              style={{ backgroundColor: frame.bgHex }}
            >
              {frameColorId === frame.id && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: frame.accentHex }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Cute Stickers Row */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <Smile className="w-3.5 h-3.5 text-rose-400" />
          <span>Couple Stickers</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CUTE_STICKERS.map((sticker) => {
            const isPicked = selectedStickers.includes(sticker);
            return (
              <button
                key={sticker}
                type="button"
                onClick={() => onToggleSticker(sticker)}
                className={`text-sm px-2 py-1 rounded-lg border transition-all ${
                  isPicked
                    ? 'border-rose-500 bg-rose-500/20 scale-105'
                    : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                {sticker}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Caption Input */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <Heart className="w-3.5 h-3.5 text-rose-400" />
          <span>Strip Caption (Optional)</span>
        </div>
        <input
          type="text"
          value={couple.loveNote}
          onChange={(e) => onUpdateCoupleNote(e.target.value)}
          placeholder="e.g. always and only for you, babe 🤍"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-rose-500 transition-colors"
        />
      </div>
    </div>
  );
};
