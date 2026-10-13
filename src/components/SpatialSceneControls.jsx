import './SpatialScene.css';

const getSceneHint = ({ ready, status, motionAllowed, reducedMotion }) => reducedMotion
  ? '已开启减少动态效果，空间场景已暂停。'
  : ready ? (motionAllowed ? '轻轻倾斜手机，或拖动照片探索景深' : '移动鼠标，或拖动照片探索景深') : status.message;

export function SpatialSceneControls({ scene, disabled }) {
  const { active, status, toggle, reducedMotion } = scene;
  const hint = getSceneHint(scene);
  return (
    <div className="spatial-scene-control">
      <button
        type="button"
        className={`spatial-scene-toggle ${active ? 'is-active' : ''}`}
        aria-label="空间场景"
        aria-pressed={active}
        aria-describedby={hint ? 'spatial-scene-status' : undefined}
        disabled={disabled || reducedMotion}
        onClick={toggle}
        title={active ? '关闭空间场景' : '开启空间场景'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5 M12 12v10" />
        </svg>
        <span>{status.phase === 'loading' && active ? '加载中…' : '空间场景'}</span>
        {status.phase === 'loading' && active && <span className="spatial-scene-spinner" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function SpatialSceneStatus({ scene }) {
  const hint = getSceneHint(scene);
  if (!hint) return null;
  return (
    <p id="spatial-scene-status" className={`spatial-scene-status ${scene.status.phase === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">
      {hint}
    </p>
  );
}
