# 空间场景

在图库中打开一张照片，点击灯箱右上角的「空间场景」。生成完成后，桌面移动鼠标、手机轻轻倾斜或拖动照片，即可查看随景深变化的视差。再次点击按钮恢复普通照片。

这是单张照片的 2.5D 景深重投影：不同远近的区域产生不同位移。它不能还原被主体遮住的背景，也不等同于苹果系统的空间场景算法。视角范围保持较小，以减轻人物轮廓、树枝和遮挡边缘的拉伸。生成时略微放大画面以隐藏外侧露出的边缘；原图下载不受影响。

## 加载与隐私

- 开启前不下载模型、不运行推理、不请求倾斜权限。
- [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small) 的 q8 模型约 27 MB，首次使用还会加载 WASM 引擎和组件。后续可使用浏览器缓存；清理缓存后需要重新下载。
- 模型通过 Transformers.js 在 Web Worker 中本地运行，照片像素不会上传到推理服务。图片仍从原有图片服务读取，正式站点的模型从站点 CDN 下载；没有配置镜像的开发环境默认从 Hugging Face 下载。
- ONNX WASM 运行文件随前端构建发布，使用单线程，不需要 COOP/COEP 响应头。
- Worker 使用像素数组完成图片缩放，不依赖 OffscreenCanvas，以兼容部分 Safari/WebKit 的 Worker 环境。
- 推理输入最长边限制为 768 px，显示纹理最长边限制为 2048 px。最多缓存最近三张照片的深度图，关闭页面后释放。
- 取消生成、切换照片和关闭灯箱会终止未完成的 Worker。完成推理后也会终止 Worker，避免长期占用模型内存。

## 手机与兼容性

手机倾斜需要 HTTPS 和设备姿态 API。iOS 的权限请求直接由按钮点击触发，发生在下载和推理之前。拒绝权限后仍可拖动照片；在空间场景开启期间，横向拖动用于探索景深，上一张/下一张按钮和键盘导航仍然可用。普通模式保留滑动切换照片。

开启系统或浏览器的「减少动态效果」会关闭空间场景并禁用按钮。模型下载失败、图片读取失败、WebGL 不可用或图形上下文丢失时，保留普通照片并显示可重试的提示。

图片服务需要允许跨域像素读取。已有照片能够通过 `<img>` 展示，并不代表它允许被 Canvas/WebGL 读取。OSS/CDN 应返回允许站点来源的 `Access-Control-Allow-Origin`。读取失败时，对于项目已有的 OSS `origin/`、`ore/`、`pic4pick/` 路径，空间场景会通过 `VITE_API_BASE_URL` 指向的现有图片代理重试；其他外部图片不会发送给代理。代理也必须允许当前站点来源，本地测试需在图片服务或后端 CORS 配置中允许开发地址。无需为此放宽数据库权限。

## 模型镜像

正式站点使用 `https://pic.rlzhao.com/spatial-models/`。本地发布时，在构建后执行 `npm run prepare:spatial-model` 下载固定版本的模型到 `dist/`，检查权重的 SHA-256 并附带许可证，再执行 OSS 发布。北京 OSS 工作流也包含此步骤。需要下载代理时，可设置 `SPATIAL_DOWNLOAD_PROXY`，此变量不会进入前端构建。

其他部署可以设置自己的镜像：

```dotenv
VITE_SPATIAL_MODEL_BASE_URL=https://your-model-cdn.example/
```

镜像需要允许跨域访问，并保持 Hugging Face 的文件路径结构：

```text
onnx-community/depth-anything-v2-small/resolve/
  0d8d94ea44f483e26c9c33dad1a97c453ef9b80c/
    config.json
    preprocessor_config.json
    onnx/model_quantized.onnx
```

模型固定版本以保持输出和资源可复现。镜像分发时保留模型的 Apache 2.0 许可证信息。修改环境变量后重新构建前端。

## 验证

先启动 `npm run dev`，然后运行：

```bash
npm run test:spatial
```

默认使用受控深度图验证真实 WebGL 渲染、鼠标交互、移动端姿态权限、角度边界、缓存、取消、切换照片、错误回退和减少动态效果，不依赖模型网络下载。通过以下环境变量可以运行真实模型推理或切换到 WebKit：

```powershell
$env:SPATIAL_REAL_MODEL = '1'
node scripts/spatial-smoke.mjs

Remove-Item Env:SPATIAL_REAL_MODEL
$env:SPATIAL_BROWSER = 'webkit'
node scripts/spatial-smoke.mjs
```

生产构建可以启动 `npm run preview -- --host 127.0.0.1`，再设置 `UI_BASE_URL=http://127.0.0.1:4173` 运行同一脚本。截图写入 `.artifacts/spatial/`；浏览器模拟的姿态测试仍需补充真实 iPhone Safari 的手持体验验证。
