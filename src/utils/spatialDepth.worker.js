import { env, AutoModelForDepthEstimation, AutoProcessor, DepthEstimationPipeline, RawImage } from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmFactoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { resizeSpatialPixels } from './spatialPixels';

// Inference stays off the UI thread and does not require cross-origin isolation.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmFactoryUrl };
// A compatible CDN/mirror can host the model for deployments with limited Hub access.
if (import.meta.env.VITE_SPATIAL_MODEL_BASE_URL) {
  env.remoteHost = `${import.meta.env.VITE_SPATIAL_MODEL_BASE_URL.replace(/\/+$/, '')}/`;
}

class SpatialImage extends RawImage {
  async resize(width, height) {
    if (this.width === width && this.height === height) return this;
    return new SpatialImage(
      resizeSpatialPixels(this.data, this.width, this.height, this.channels, width, height),
      width, height, this.channels,
    );
  }
}

self.onmessage = async ({ data: { pixels, width, height, model, revision } }) => {
  try {
    // Load the pinned components directly: the generic v4 pipeline's file
    // discovery probes the mutable main revision even when revision is supplied.
    const options = {
      revision,
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (progress) => {
        if (progress.status === 'progress' && progress.file?.endsWith('.onnx')) {
          self.postMessage({ type: 'progress', progress: Math.round(progress.progress) });
        }
      },
    };
    const [depthModel, processor] = await Promise.all([
      AutoModelForDepthEstimation.from_pretrained(model, options),
      AutoProcessor.from_pretrained(model, options),
    ]);
    const estimator = new DepthEstimationPipeline({ task: 'depth-estimation', model: depthModel, processor });
    self.postMessage({ type: 'progress', stage: 'estimating' });
    const image = new SpatialImage(new Uint8ClampedArray(pixels), width, height, 4);
    const { depth } = await estimator(image);
    const values = new Uint8Array(depth.width * depth.height);
    for (let i = 0; i < values.length; i += 1) values[i] = depth.data[i * depth.channels];
    self.postMessage({ type: 'result', values, width: depth.width, height: depth.height }, [values.buffer]);
    await estimator.dispose();
  } catch (error) {
    console.warn('Spatial depth estimation failed:', error);
    self.postMessage({ type: 'error', message: '空间场景生成失败，请检查模型下载连接后重试。' });
  }
};
