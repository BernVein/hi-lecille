import type { CapturedPhoto, CoupleProfile, FilterId, StripLayout } from '../types/photobooth';
import { FRAME_COLORS, PHOTOBOOTH_FILTERS } from './filters';

interface RenderStripOptions {
  photos: CapturedPhoto[];
  layout: StripLayout;
  filterId: FilterId;
  frameColorId: string;
  couple: CoupleProfile;
  stickers: string[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Render high-resolution photostrip onto HTML5 Canvas
 */
export async function generatePhotostripCanvas(options: RenderStripOptions): Promise<HTMLCanvasElement> {
  const { photos, layout, filterId, frameColorId, couple, stickers } = options;

  const frameConfig = FRAME_COLORS.find((f) => f.id === frameColorId) || FRAME_COLORS[0];
  const filterConfig = PHOTOBOOTH_FILTERS.find((f) => f.id === filterId) || PHOTOBOOTH_FILTERS[0];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  // Dimensions based on layout
  let width = 600;
  let height = 1800;
  let photoSlots = 4;
  let cols = 1;
  let rows = 4;

  if (layout === '3-cut') {
    width = 600;
    height = 1560;
    photoSlots = 3;
    cols = 1;
    rows = 3;
  } else if (layout === '2-cut') {
    width = 640;
    height = 1400;
    photoSlots = 2;
    cols = 1;
    rows = 2;
  } else if (layout === 'grid-4') {
    width = 1000;
    height = 1200;
    photoSlots = 4;
    cols = 2;
    rows = 2;
  } else if (layout === 'split-duo') {
    width = 1200;
    height = 800;
    photoSlots = 2;
    cols = 2;
    rows = 1;
  } else {
    // default 4-cut vertical
    width = 600;
    height = 1850;
    photoSlots = 4;
    cols = 1;
    rows = 4;
  }

  // Scale up for crisp retina export
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  // Background Frame
  ctx.fillStyle = frameConfig.bgHex;
  ctx.fillRect(0, 0, width, height);

  // Draw 35mm Film Sprockets if film aesthetic is chosen
  const isFilm = Boolean(frameConfig.isFilmStrip);
  if (isFilm) {
    drawFilmSprocketTracks(ctx, width, height);
  } else {
    // Subtle paper border
    ctx.strokeStyle = frameConfig.borderHex;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  // Header / Padding
  const topPadding = layout === 'grid-4' || layout === 'split-duo' ? 44 : 40;
  const bottomFooterHeight = layout === 'split-duo' ? 100 : 160;
  const sideMargin = isFilm ? 64 : (layout === 'grid-4' ? 36 : 32);
  const gap = layout === 'grid-4' ? 24 : 20;

  const contentWidth = width - sideMargin * 2;
  const contentHeight = height - topPadding - bottomFooterHeight;

  const photoWidth = (contentWidth - gap * (cols - 1)) / cols;
  const photoHeight = (contentHeight - gap * (rows - 1)) / rows;

  // Load and draw photos
  const loadedImgs = await Promise.all(
    photos.slice(0, photoSlots).map((p) => loadImage(p.dataUrl).catch(() => null))
  );

  for (let i = 0; i < photoSlots; i++) {
    const colIndex = i % cols;
    const rowIndex = Math.floor(i / cols);

    const x = sideMargin + colIndex * (photoWidth + gap);
    const y = topPadding + rowIndex * (photoHeight + gap);

    const img = loadedImgs[i];

    ctx.save();
    // Photo cutout clipping
    ctx.beginPath();
    ctx.roundRect(x, y, photoWidth, photoHeight, 6);
    ctx.clip();

    if (img) {
      // Apply canvas filter
      if (filterConfig.cssFilter && filterConfig.cssFilter !== 'none') {
        ctx.filter = filterConfig.cssFilter;
      }

      // Draw photo with object-fit: cover center
      const imgAspect = img.width / img.height;
      const targetAspect = photoWidth / photoHeight;
      let drawW = photoWidth;
      let drawH = photoHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > targetAspect) {
        drawW = photoHeight * imgAspect;
        offsetX = -(drawW - photoWidth) / 2;
      } else {
        drawH = photoWidth / imgAspect;
        offsetY = -(drawH - photoHeight) / 2;
      }

      ctx.drawImage(img, x + offsetX, y + offsetY, drawW, drawH);

      // Reset filter for tint overlays
      ctx.filter = 'none';

      // Tint overlay (for Haru pastel, warm sunset, vintage)
      if (filterConfig.tintColor) {
        ctx.fillStyle = filterConfig.tintColor;
        ctx.fillRect(x, y, photoWidth, photoHeight);
      }

      // Vignette effect
      if (filterConfig.vignette) {
        const radGrad = ctx.createRadialGradient(
          x + photoWidth / 2,
          y + photoHeight / 2,
          photoWidth * 0.35,
          x + photoWidth / 2,
          y + photoHeight / 2,
          photoWidth * 0.75
        );
        radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = radGrad;
        ctx.fillRect(x, y, photoWidth, photoHeight);
      }

      // Retro orange date stamp for Disposable '98
      if (filterConfig.dateStamp) {
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#ff8a00';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        const dateStr = `'${new Date().getFullYear().toString().slice(-2)}  ${String(new Date().getMonth() + 1).padStart(2, '0')}  ${String(new Date().getDate()).padStart(2, '0')}`;
        ctx.fillText(dateStr, x + photoWidth - 110, y + photoHeight - 14);
        ctx.shadowBlur = 0;
      }
    } else {
      // Placeholder if slot is empty
      ctx.fillStyle = frameConfig.bgHex === '#18181b' ? '#27272a' : '#f5f5f4';
      ctx.fillRect(x, y, photoWidth, photoHeight);
      ctx.fillStyle = frameConfig.textHex;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Snap #${i + 1}`, x + photoWidth / 2, y + photoHeight / 2);
    }

    ctx.restore();

    // Subtle photo border
    ctx.strokeStyle = frameConfig.bgHex === '#18181b' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, photoWidth, photoHeight);
  }

  // Footer: Date, optional note, stickers & barcode
  const footerStartY = height - bottomFooterHeight + 20;

  ctx.fillStyle = frameConfig.textHex;
  ctx.textAlign = 'center';

  // Love Note / Caption
  if (couple.loveNote) {
    ctx.font = 'italic 14px serif';
    ctx.fillText(`"${couple.loveNote}"`, width / 2, footerStartY + 14);
  }

  // Stickers row
  if (stickers && stickers.length > 0) {
    ctx.font = '20px sans-serif';
    ctx.fillText(stickers.join('  '), width / 2, footerStartY + 44);
  }

  // Bottom timestamp & cute barcode
  const dateStampY = height - 24;
  ctx.font = '10px monospace';
  ctx.globalAlpha = 0.6;
  const dateStr = couple.dateText || new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  ctx.fillText(`LDR PHOTOBOOTH • ${dateStr} • ${filterConfig.name.toUpperCase()}`, width / 2, dateStampY);

  // Decorative mini barcode
  drawMiniBarcode(ctx, width / 2 - 40, dateStampY + 6, 80, 8, frameConfig.textHex);

  ctx.globalAlpha = 1.0;
  return canvas;
}

function drawMiniBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
) {
  ctx.fillStyle = color;
  const bars = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 2];
  let curX = x;
  const totalBarUnits = bars.reduce((a, b) => a + b, 0);
  const unitWidth = width / totalBarUnits;

  bars.forEach((b, idx) => {
    const w = b * unitWidth;
    if (idx % 2 === 0) {
      ctx.fillRect(curX, y, w, height);
    }
    curX += w;
  });
}

function drawFilmSprocketTracks(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sprocketW = 20;
  const sprocketH = 26;
  const trackLeftX = 14;
  const trackRightX = width - 14 - sprocketW;
  const totalSprockets = Math.floor((height - 40) / 44);
  const stepY = (height - 40) / totalSprockets;

  for (let i = 0; i < totalSprockets; i++) {
    const y = 20 + i * stepY + (stepY - sprocketH) / 2;

    // Left sprocket hole
    ctx.fillStyle = '#f4f4f5';
    ctx.beginPath();
    ctx.roundRect(trackLeftX, y, sprocketW, sprocketH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Right sprocket hole
    ctx.beginPath();
    ctx.roundRect(trackRightX, y, sprocketW, sprocketH, 4);
    ctx.fill();
    ctx.stroke();

    // Film markings text alongside sprockets
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';

    if (i % 3 === 0) {
      const markIdx = Math.floor(i / 3);
      const textL = markIdx === 0 ? '▲ 12A' : markIdx === 1 ? '35mm' : markIdx === 2 ? '▶ 13' : '▲ 13A';
      const textR = markIdx === 0 ? 'KODAK' : markIdx === 1 ? '400' : markIdx === 2 ? 'SAFETY' : 'FILM';

      ctx.save();
      ctx.translate(trackLeftX + sprocketW + 14, y + sprocketH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(textL, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(trackRightX - 14, y + sprocketH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(textR, 0, 0);
      ctx.restore();
    }
  }
}
