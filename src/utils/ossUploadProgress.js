// Progress is optional: a failed poll must never interrupt the upload itself.
export const watchOssUploadProgress = ({ apiUrl, uploadId, token, file, onProgress }) => {
  const controller = new AbortController();
  let stopped = false;
  let busy = false;
  const poll = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/progress/${encodeURIComponent(uploadId)}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (!response.ok || stopped) return;
      const { data } = await response.json();
      if (stopped || !data) return;
      const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
      const stages = {
        processing: [94, '正在生成高清预览...'],
        original: [94 + percent * 0.03, `正在保存云端原图：${percent}%`],
        preview: [97, '原图已保存，正在保存高清预览...'],
        complete: [98, '图片已保存，正在确认作品信息...'],
      };
      const stage = stages[data.stage];
      if (stage) onProgress?.(stage[0], file.size, file.size, { stage: 'confirming', label: stage[1] });
    } catch { /* The upload response remains authoritative. */ }
    finally { busy = false; }
  };
  const timer = setInterval(poll, 2000);
  void poll();
  return () => { stopped = true; clearInterval(timer); controller.abort(); };
};
