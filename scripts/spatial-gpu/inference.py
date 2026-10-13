"""Resident SharpDepth v1.0 + UniDepthV1, same settings as the reviewed samples.
Only JSON commands on stdin; model logs go to stderr. No network model loading.
"""
import os, sys, json, time, io, base64, contextlib
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2]
runtime=Path(os.environ.get('SPATIAL_RUNTIME_DIR',str(root/'.artifacts/spatial-compare')))
sys.path[:0]=[str(runtime/'vendor/sharpdepth'),str(runtime/'vendor/unidepth')]
with contextlib.redirect_stdout(sys.stderr):
    import cv2, numpy as np, torch
    from PIL import Image, ImageOps
    from safetensors.torch import load_file
    from unidepth.models import UniDepthV1
    import unidepth.layers.nystrom_attention as nystrom_module
    from xformers_nystrom_compat import NystromAttention
    nystrom_module.NystromAttention=NystromAttention
    from src.sharpdepth.pipeline.pipeline import SharpDepthPipeline
    if not torch.cuda.is_available(): raise RuntimeError('SharpDepth requires a CUDA GPU on this worker')
    torch.set_num_threads(6)
    torch.backends.cudnn.benchmark=False
    checkpoint=next((runtime/'models/sharpdepth').rglob('model_index.json')).parent
    pipeline=SharpDepthPipeline.from_pretrained(str(checkpoint),local_files_only=True).to('cuda',dtype=torch.float32)
    pipeline.set_progress_bar_config(disable=True)
    config=json.loads((runtime/'models/unidepth/config.json').read_text())
    unidepth=UniDepthV1(config=config)
    weights=load_file(str(runtime/'models/unidepth/model.safetensors'))
    missing=set(unidepth.state_dict())-set(weights)
    if missing!={'pixel_encoder.norm.weight','pixel_encoder.norm.bias'} or unidepth.pixel_encoder.use_norm:
        raise RuntimeError('Unexpected UniDepth checkpoint architecture')
    for name in missing: weights[name]=unidepth.state_dict()[name]
    unidepth.load_state_dict(weights,strict=True)
    del weights
    def forbid_unused_norm(module,args): raise RuntimeError('Unexpected disabled encoder normalization')
    unidepth.pixel_encoder.norm.register_forward_pre_hook(forbid_unused_norm)
    unidepth=unidepth.eval().cuda()
print(json.dumps({'type':'ready','gpu':torch.cuda.get_device_name(),'model':'sharpdepth-v1-unidepth-v1-vitl-fp32-768'}),flush=True)
for line in sys.stdin:
    request=json.loads(line)
    try:
        start=time.perf_counter()
        with Image.open(request['path']) as source: image=ImageOps.exif_transpose(source).convert('RGB')
        image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        torch.manual_seed(0)
        with torch.inference_mode(),contextlib.redirect_stdout(sys.stderr):
            prediction=pipeline(image,unidepth,processing_res=768,denoising_steps=1,color_map=None,show_progress_bar=False)
        torch.cuda.synchronize()
        raw=prediction.depth_np.astype(np.float32)
        if not np.isfinite(raw).all() or not (raw>0).any(): raise RuntimeError('Invalid model depth output')
        floor=max(1e-6,float(np.percentile(raw[raw>0],.1)))
        near=1/np.maximum(raw,floor)
        if near.max()<=near.min(): raise RuntimeError('Model returned a flat depth map')
        normalized=(near-near.min())/(near.max()-near.min())
        size=(round(image.width*784/max(image.size)),round(image.height*784/max(image.size)))
        normalized=cv2.resize(normalized,size,interpolation=cv2.INTER_LINEAR)
        buffer=io.BytesIO()
        Image.fromarray(np.round(np.clip(normalized,0,1)*255).astype(np.uint8)).save(buffer,format='PNG')
        result=dict(type='result',id=request['id'],width=size[0],height=size[1],
            png=base64.b64encode(buffer.getvalue()).decode('ascii'),seconds=time.perf_counter()-start,
            peak_allocated_bytes=torch.cuda.max_memory_allocated(),peak_reserved_bytes=torch.cuda.max_memory_reserved())
        del prediction,raw,near,normalized,image
        torch.cuda.empty_cache()
        print(json.dumps(result),flush=True)
    except Exception as error:
        torch.cuda.empty_cache()
        print(json.dumps({'type':'error','id':request['id'],'message':str(error)}),flush=True)
