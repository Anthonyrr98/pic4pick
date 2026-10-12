// One inference session is reused briefly between photographs. Jobs stay serial
// because ONNX sessions cannot run concurrent inference in the same Worker.
export function createSpatialDepthClient({ createWorker, timeoutMs = 120_000, idleMs = 30_000 }) {
  let worker = null;
  let active = null;
  let idleTimer;
  let nextId = 0;
  const queue = [];
  const cancelled = () => new DOMException('Cancelled', 'AbortError');
  const stopWorker = () => {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
  };
  const clean = (job) => {
    clearTimeout(job.timer);
    job.signal.removeEventListener('abort', job.abort);
  };
  const finish = (job, error, result) => {
    if (active !== job) return;
    active = null;
    clean(job);
    if (error) { stopWorker(); job.reject(error); }
    else job.resolve(result);
    pump();
  };
  const pump = () => {
    if (active) return;
    if (!queue.length) {
      if (worker) idleTimer = setTimeout(stopWorker, idleMs);
      return;
    }
    clearTimeout(idleTimer);
    const job = queue.shift();
    active = job;
    try {
      if (!worker) {
        const currentWorker = createWorker();
        worker = currentWorker;
        worker.onmessage = ({ data }) => {
          if (worker !== currentWorker || !active || data.requestId !== active.id) return;
          if (data.type === 'progress') {
            const currentJob = active;
            try { currentJob.onProgress(data); }
            catch (error) { finish(currentJob, error); }
            return;
          }
          finish(active, data.type === 'result' ? null : new Error(data.message || '空间场景生成失败，请重试。'), data);
        };
        worker.onerror = () => {
          if (worker === currentWorker && active) finish(active, new Error('空间场景组件加载失败，请检查网络连接后重试。'));
        };
      }
      job.timer = setTimeout(() => finish(job, new Error('空间场景生成超时，请检查网络连接后重试。')), timeoutMs);
      job.onProgress({ stage: 'loading' });
      if (active !== job) return;
      worker.postMessage({ ...job.payload, requestId: job.id }, [job.payload.pixels]);
    } catch (error) { finish(job, error); }
  };
  return {
    request(payload, onProgress, signal) {
      if (signal.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        const job = { id: ++nextId, payload, onProgress, signal, resolve, reject };
        job.abort = () => {
          if (active === job) finish(job, cancelled());
          else {
            const index = queue.indexOf(job);
            if (index < 0) return;
            queue.splice(index, 1);
            clean(job);
            reject(cancelled());
          }
        };
        signal.addEventListener('abort', job.abort, { once: true });
        queue.push(job);
        pump();
      });
    },
    release() {
      stopWorker();
      const jobs = active ? [active, ...queue] : [...queue];
      active = null;
      queue.length = 0;
      jobs.forEach((job) => { clean(job); job.reject(cancelled()); });
    },
  };
}
