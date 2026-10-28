import type { CSSProperties, ReactNode } from 'react';

type FrameArtwork = {
  src: string;
  width: number;
  height: number;
  edges: Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>;
  sourceWidth?: number;
  sourceHeight?: number;
  transform?: string;
};

// Crop the supplied artwork at render time. The opaque centre is never placed
// over a photograph, and the source PNG files remain unchanged.
const frames: Record<'landscape' | 'portrait', FrameArtwork> = {
  landscape: {
    src: '/film-frames/135-landscape.png', width: 1536, height: 1024,
    edges: {
      top: '80 76 1376 123', right: '1414 199 42 618',
      bottom: '80 817 1376 125', left: '80 199 44 618',
    },
  },
  portrait: {
    src: '/film-frames/135-portrait.png', width: 1024, height: 1536,
    edges: {
      top: '64 65 896 65', right: '828 130 132 1276',
      bottom: '64 1406 896 63', left: '64 130 134 1276',
    },
  },
};

const fujiC200Frames: Record<'landscape' | 'portrait', FrameArtwork> = {
  landscape: {
    src: '/film-frames/fuji-c200.png', width: 1536, height: 1024,
    edges: { top: '0 0 1536 160', bottom: '0 856 1536 168' },
  },
  portrait: {
    src: '/film-frames/fuji-c200.png', width: 1024, height: 1536,
    sourceWidth: 1536, sourceHeight: 1024,
    transform: 'translate(1024 0) rotate(90)',
    edges: { right: '864 0 160 1536', left: '0 0 168 1536' },
  },
};

const kodakGold200Frames: Record<'landscape' | 'portrait', FrameArtwork> = {
  landscape: {
    src: '/film-frames/kodak-gold-200.png', width: 1536, height: 1024,
    edges: { top: '0 0 1536 160', bottom: '0 842 1536 182' },
  },
  portrait: {
    src: '/film-frames/kodak-gold-200.png', width: 1024, height: 1536,
    sourceWidth: 1536, sourceHeight: 1024,
    transform: 'translate(1024 0) rotate(90)',
    edges: { right: '864 0 160 1536', left: '0 0 182 1536' },
  },
};

const fujiSimpleAceFrames: Record<'landscape' | 'portrait', FrameArtwork> = {
  landscape: {
    src: '/film-frames/fuji-simple-ace.png', width: 1536, height: 1024,
    edges: { top: '0 0 1536 160', bottom: '0 826 1536 198' },
  },
  portrait: {
    src: '/film-frames/fuji-simple-ace.png', width: 1024, height: 1536,
    sourceWidth: 1536, sourceHeight: 1024,
    transform: 'translate(1024 0) rotate(90)',
    edges: { right: '864 0 160 1536', left: '0 0 198 1536' },
  },
};

const stockFrames = {
  'fuji-c200': fujiC200Frames,
  'kodak-gold-200': kodakGold200Frames,
  'fuji-simple-ace': fujiSimpleAceFrames,
};

export const getFilmFrameStock = (filmStock = '') => {
  const stock = filmStock.trim();
  if (/^fuji\s*c200$/i.test(stock)) return 'fuji-c200';
  if (/^kodak\s+gold\s*200$/i.test(stock)) return 'kodak-gold-200';
  if (/^富士(?:胶片)?一次性相机$|^(?:fuji(?:film)?\s+)?simple\s*ace(?:\s*400)?$/i.test(stock)) return 'fuji-simple-ace';
  return '';
};

function FrameImage({ frame }: { frame: FrameArtwork }) {
  return <image href={frame.src} width={frame.sourceWidth ?? frame.width}
    height={frame.sourceHeight ?? frame.height} transform={frame.transform} />;
}

export function FilmFrameEdges({ orientation = 'landscape', filmStock = '', repeatHorizontal = false, repeatVertical = false }: {
  orientation?: 'landscape' | 'portrait';
  filmStock?: string;
  repeatHorizontal?: boolean;
  repeatVertical?: boolean;
}) {
  const stock = getFilmFrameStock(filmStock);
  const frame = (stock ? stockFrames[stock] : frames)[orientation];
  return <>{Object.entries(frame.edges).map(([edge, viewBox]) => {
    if (!viewBox) return null;
    // Wide panels repeat full strips so the perforations and lettering retain
    // their original proportions instead of stretching across the dialog.
    if (repeatHorizontal && (edge === 'top' || edge === 'bottom')) {
      const [x, y, width, height] = viewBox.split(' ').map(Number);
      const leftCrop = Number(frame.edges.left?.split(' ')[2] ?? 0);
      const rightCrop = Number(frame.edges.right?.split(' ')[2] ?? 0);
      const tileWidth = width - leftCrop - rightCrop;
      const tileViewBox = [x + leftCrop, y, tileWidth, height].join(' ');
      return (
        <div key={edge} className={`film-negative-edge film-negative-edge--${edge} film-negative-edge--repeated`}
          aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <svg key={index} className="film-negative-edge-tile" viewBox={tileViewBox}
              style={{ width: `calc(var(--film-edge-${edge}) * ${tileWidth / height})` }}
              aria-hidden="true" focusable="false">
              <FrameImage frame={frame} />
            </svg>
          ))}
        </div>
      );
    }
    if (repeatVertical && (edge === 'left' || edge === 'right')) {
      const [, , width, height] = viewBox.split(' ').map(Number);
      return (
        <div key={edge} className={`film-negative-edge film-negative-edge--${edge} film-negative-edge--repeated-vertical`}
          aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <svg key={index} className="film-negative-edge-tile" viewBox={viewBox}
              style={{ width: '100%', height: `calc(var(--film-edge-${edge}) * ${height / width})` }}
              aria-hidden="true" focusable="false">
              <FrameImage frame={frame} />
            </svg>
          ))}
        </div>
      );
    }
    return <svg key={edge} className={`film-negative-edge film-negative-edge--${edge}`}
      viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <FrameImage frame={frame} />
    </svg>;
  })}</>;
}

// Keep the supplied control artwork intact; exclude only its transparent margins.
export function FilmControlFrame() {
  return (
    <svg className="film-control-frame" viewBox="57 194 1666 492"
      preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <image href="/film-frames/35mm-controls.png" width="1774" height="887" />
    </svg>
  );
}

export function FilmFrame({ enabled, aspectRatio, filmStock = '', children }: {
  enabled: boolean;
  aspectRatio: number;
  filmStock?: string;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  const orientation = aspectRatio > 1 ? 'landscape' : 'portrait';
  const stock = getFilmFrameStock(filmStock);
  return (
    <div className={`film-negative film-negative--${orientation}${stock ? ` film-negative--${stock}` : ''}`}
      style={{ '--film-photo-ratio': aspectRatio } as CSSProperties}>
      {children}
      <FilmFrameEdges orientation={orientation} filmStock={filmStock} />
    </div>
  );
}
