import { Download, Trash2 } from "lucide-react";

interface SavedMemory {
  id: string;
  dataUrl: string;
  timestamp: number;
}

interface MemoryGalleryProps {
  memories: SavedMemory[];
  onDeleteMemory: (id: string) => void;
}

export const MemoryGallery: React.FC<MemoryGalleryProps> = ({
  memories,
  onDeleteMemory,
}) => {
  if (memories.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <span>Memories with Babe 💕</span>
          <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
            {memories.length}
          </span>
        </div>
        <span className="text-[11px] text-zinc-500">
          Saved on this device
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-1">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className="group relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-rose-500/50 transition-all shadow-md"
          >
            <img
              src={mem.dataUrl}
              alt="Memory"
              className="w-full h-44 object-contain bg-zinc-950 p-1"
            />
            {/* Hover overlay actions */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
              <a
                href={mem.dataUrl}
                download={`babe-memory-${mem.timestamp}.png`}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => onDeleteMemory(mem.id)}
                className="p-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="px-2 py-1 bg-zinc-950/90 text-[10px] text-zinc-500 truncate border-t border-zinc-800/80 text-center">
              {new Date(mem.timestamp).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
