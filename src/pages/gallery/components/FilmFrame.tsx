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

export function FilmFrameEdges({ orientation = 'landscape' }: {
  orientation?: 'landscape' | 'portrait';
}) {
  const frame = frames[orientation];
  return <>{Object.entries(frame.edges).map(([edge, viewBox]) => (
    <svg key={edge} className={`film-negative-edge film-negative-edge--${edge}`}
      viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <image href={frame.src} width={frame.width} height={frame.height} />
    </svg>
  ))}</>;
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
