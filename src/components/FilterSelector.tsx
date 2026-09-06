import React from 'react';
import { Sparkles, Check } from 'lucide-react';
import type { FilterId } from '../types/photobooth';
import { PHOTOBOOTH_FILTERS } from '../utils/filters';

interface FilterSelectorProps {
  activeFilter: FilterId;
  onSelectFilter: (id: FilterId) => void;
}

export const FilterSelector: React.FC<FilterSelectorProps> = ({
  activeFilter,
  onSelectFilter,
}) => {
  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Sparkles className="w-4 h-4 text-rose-400" />
          <span>Photobooth Film Filters</span>
        </div>
        <span className="text-[11px] text-zinc-500">5 Curated Aesthetics</span>
      </div>

      {/* Filter Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {PHOTOBOOTH_FILTERS.map((filter) => {
          const isSelected = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onSelectFilter(filter.id)}
              className={`text-left p-2.5 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? 'border-rose-500 bg-rose-500/10 shadow-md shadow-rose-950/40 ring-1 ring-rose-500'
                  : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              {/* Preview color swatch band */}
              <div
                className="w-full h-8 rounded-lg mb-2 flex items-center justify-center relative overflow-hidden border border-white/10"
                style={{
                  background:
                    filter.id === 'haru-pastel'
                      ? 'linear-gradient(135deg, #e0e7ff 0%, #fce7f3 100%)'
                      : filter.id === 'life4cuts-noir'
                      ? 'linear-gradient(135deg, #09090b 0%, #71717a 100%)'
                      : filter.id === 'disposable-98'
                      ? 'linear-gradient(135deg, #fef08a 0%, #f97316 100%)'
                      : filter.id === 'golden-sunset'
                      ? 'linear-gradient(135deg, #fb923c 0%, #e11d48 100%)'
                      : filter.id === 'indie-35mm'
                      ? 'linear-gradient(135deg, #0d9488 0%, #c2410c 100%)'
                      : 'linear-gradient(135deg, #3f3f46 0%, #a1a1aa 100%)',
                }}
              >
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-zinc-100 truncate">{filter.name}</span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5 line-clamp-2">
                  {filter.tagline}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
