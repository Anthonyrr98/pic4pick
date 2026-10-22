import type { CSSProperties, ReactNode } from 'react';

// Crop the supplied artwork at render time. The opaque centre is never placed
// over a photograph, and the source PNG files remain unchanged.
const frames = {
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

export function FilmFrameEdges({ orientation = 'landscape', repeatHorizontal = false }: {
  orientation?: 'landscape' | 'portrait';
  repeatHorizontal?: boolean;
}) {
  const frame = frames[orientation];
  return <>{Object.entries(frame.edges).map(([edge, viewBox]) => {
    // Wide panels repeat full strips so the perforations and lettering retain
    // their original proportions instead of stretching across the dialog.
    if (repeatHorizontal && (edge === 'top' || edge === 'bottom')) {
      const [x, y, width, height] = viewBox.split(' ').map(Number);
      const leftCrop = Number(frame.edges.left.split(' ')[2]);
      const rightCrop = Number(frame.edges.right.split(' ')[2]);
      const tileWidth = width - leftCrop - rightCrop;
      const tileViewBox = [x + leftCrop, y, tileWidth, height].join(' ');
      return (
        <div key={edge} className={`film-negative-edge film-negative-edge--${edge} film-negative-edge--repeated`}
          aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <svg key={index} className="film-negative-edge-tile" viewBox={tileViewBox}
              style={{ width: `calc(var(--film-edge-${edge}) * ${tileWidth / height})` }}
              aria-hidden="true" focusable="false">
              <image href={frame.src} width={frame.width} height={frame.height} />
            </svg>
          ))}
        </div>
      );
    }
    return <svg key={edge} className={`film-negative-edge film-negative-edge--${edge}`}
      viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <image href={frame.src} width={frame.width} height={frame.height} />
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

export function FilmFrame({ enabled, aspectRatio, children }: {
  enabled: boolean;
  aspectRatio: number;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  const orientation = aspectRatio > 1 ? 'landscape' : 'portrait';
  return (
    <div className={`film-negative film-negative--${orientation}`}
      style={{ '--film-photo-ratio': aspectRatio } as CSSProperties}>
      {children}
      <FilmFrameEdges orientation={orientation} />
    </div>
  );
}
