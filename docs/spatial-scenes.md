# 空间场景：SharpDepth＋UniDepth 后台预计算

图库灯箱中的「空间场景」读取已生成的深度图，用原照片做景深重投影。桌面移动鼠标、手机倾斜或拖动即可探索。采用用户选定的 SharpDepth v1.0＋UniDepthV1 ViT-L14；不经过 BiRefNet 抠图、前景颜色估计或分层背景补全。它仍是单张照片的 2.5D 效果，不能还原被遮挡的背景。

## 上传和查看

- 作品保存成功后，数据库触发器自动创建持久化任务，上传接口不等待推理。初次上线同时补算现有作品。
- GPU worker 在拥有者的 Windows 电脑上主动领取任务。没有开放电脑的入站推理端口，也不需要修改 Render 的 GPU 配置。
- 原图经过 EXIF 方向纠正，缩至最长边 2048；模型使用 FP32、处理分辨率 768、一步去噪、每张固定 seed 0，与已评审样片一致。
- 输出深度采用相同的逆深度归一化与正值下限，保存为最长边 784 的 8 位灰度 PNG。这不是新的模型处理分辨率。
- 深度图存到照片 OSS Bucket 的 `spatial-depth/<photo_id>/<generation>.png`，每个对象强制设置 private ACL。`photo_spatial` 仍在 Supabase 保存版本、状态、路径、尺寸和 storage_backend。后台 `/api/photos/:id/spatial-depth` 再次检查照片审核和隐藏状态，再签发有效期 5 分钟的 HTTPS 链接；签名响应禁止缓存。
- 浏览器不下载模型、不运行推理、不上传照片像素。开启场景后加载原照片和深度 PNG，使用 WebGL 渲染；最多缓存最近三张的深度，按照片 ID＋生成版本失效。
- 打开照片弹窗停留 800 毫秒后，仅预加载当前照片的深度数据；不会预先重读照片像素、创建渲染器或申请倾斜权限。切换照片、关闭弹窗或页面转入后台时取消未完成的预加载。浏览器报告 `navigator.connection.saveData` 或开启减少动态效果时，不自动预加载；无法提供省流量设置的浏览器按普通模式处理。
- 点击空间场景时并行读取照片和深度数据，并复用当前弹窗已经完成或正在进行的预加载任务。后台仅查询一次未准备好的照片，不轮询、不显示错误；用户主动点击后才等待后台结果，预加载失败也可在点击时重试。深度缓存按最近使用顺序最多保留三个结果。
- 结果尚未准备时显示后台等待提示，最长等待 30 秒后提示稍后重试。失败、取消或切换照片时保留普通照片。没有回退到旧的浏览器小模型。

## 队列和恢复

`spatial_jobs` 只有 service role 可读写。领取使用 `FOR UPDATE SKIP LOCKED` 和 5 分钟租约；一台电脑串行处理，不并发争抢显存。失败指数退避、最多 5 次。照片的原图或预览 URL 改变时创建新生成版本；旧版本或旧租约不能发布结果。修改标题、评分等元数据不重复推理。删除照片会级联删除任务和结果记录。

电脑离线或 worker 关闭时，新任务保留在数据库。已完成的结果继续从云端读取。空闲 60 秒后终止模型进程释放 GPU，空闲查询间隔降至 30 秒；有任务时重新加载模型。首次请求包含初始化成本，不能按样片预热后的 1.7 秒估算。

worker 每小时清理 OSS 深度目录和兼容存储中超过一小时且没有结果记录引用的旧文件，保留刚上传但尚未提交的文件，避免与发布竞态。删除和替换后的孤立文件会在电脑在线时清理。

## 本机运行

需要 Node.js 22，根目录和 server 目录分别安装 npm 依赖。此电脑沿用已验证的隔离 Python 环境、官方模型缓存和 Windows 兼容代码，不改动 Anaconda 的依赖：

```text
.artifacts/spatial-compare/.gpu-venv/Scripts/python.exe
.artifacts/spatial-compare/models/sharpdepth/
.artifacts/spatial-compare/models/unidepth/
.artifacts/spatial-compare/vendor/sharpdepth/
.artifacts/spatial-compare/vendor/unidepth/
```

主迁移为 `supabase/migrations/20261012154139_sharpdepth_spatial_jobs.sql`，另有 `20261012162348_spatial_expired_lease_recovery.sql` 处理最后一次尝试的过期租约。它们创建队列、公开结果投影、受限 Storage 读取策略、任务 RPC 和照片触发器。线上应先应用迁移，再启动 worker，最后发布前端。

worker 使用本机已有 `server/.env` 中的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和 `ALIYUN_OSS_*` 配置；不把密钥放进 `VITE_*`、网页或 Git。图片下载只允许配置的 HTTPS 照片存储主机及 `origin/`、`ore/`、`pic4pick/` 路径，不跟随重定向，输入最多 50 MiB。

可选本机配置：

```dotenv
SPATIAL_PYTHON=F:/Github/pic4pick/.artifacts/spatial-compare/.gpu-venv/Scripts/python.exe
SPATIAL_RUNTIME_DIR=F:/Github/pic4pick/.artifacts/spatial-compare
SPATIAL_IMAGE_HOSTS=pic4pick.oss-cn-beijing.aliyuncs.com,websiteanthony.oss-cn-beijing.aliyuncs.com
```

前台运行、单张检查、无窗口运行及当前用户登录后自动启动：

```powershell
npm run spatial:worker
node scripts/spatial-gpu/worker.mjs --once
& scripts/spatial-gpu/start.ps1
& scripts/spatial-gpu/install-startup.ps1
```

当前用户的启动项名为 `Pic4Pick Spatial GPU.lnk`；移除此启动项即可取消开机自动运行。电脑重启后凭据和模型仍需保留在上述路径。日志在 `.artifacts/spatial-worker/worker.log`、`worker-errors.log`；新启动的 worker 同时追加 `activity.jsonl`。实例锁避免重复启动。

## 验证和发布

- `node --test scripts/spatial-input.test.mjs scripts/precomputed-spatial-depth.test.mjs`：取消、版本缓存、后台等待、离线提示、尺寸检查及姿态映射。
- `scripts/spatial-gpu/db-contract-test.sql`：临时事务验证领取、重试、旧租约、照片替换、隐藏访问、匿名权限与删除级联，最终回滚。
- `scripts/spatial-smoke.mjs`：自动化 UI 回归使用云端结果接口的受控网络响应；真实 GPU 计算由 worker 单独验证。
- `npm run build` 不再生成推理 Worker、ONNX 或 WASM，也不运行模型镜像下载步骤。前端发布沿用独立 OSS Bucket，后台 Node 上传服务不需要增加 GPU 依赖。

照片像素读取仍需 OSS/CDN 对当前站点允许 CORS；失败时沿用现有受限图片代理。生产照片存储允许 `https://pic.rlzhao.com`；本地验证需使用允许本地来源的图片代理。iOS 倾斜权限仍由按钮点击直接触发，拒绝后可拖动。减少动态效果、WebGL 不可用及上下文丢失时恢复普通照片。

## 模型来源

沿用 [SharpDepth 官方 v1.0](https://github.com/Qualcomm-AI-research/SharpDepth/releases/tag/v1.0)、[UniDepth 官方代码](https://github.com/lpiccinelli-eth/UniDepth) 与此前固定下载的 UniDepthV1 权重。SharpDepth 保留官方许可和 NOTICE；UniDepth 上游采用 CC BY-NC 4.0。Windows 环境使用已验证的官方 Nyström 注意力算法与 PyTorch 兼容层，未安装不匹配此 GPU 的旧 xFormers 二进制。

## 私有 OSS 迁移

`20261012164932_spatial_depth_oss_storage.sql` 新增存储位置标记和仅 service role 可调用的 OSS 完成 RPC。先应用迁移、发布签名后端和兼容前端，再切换数据，最后重启 GPU worker。旧 Supabase 结果仍可被兼容前端读取。

```powershell
node --env-file=server/.env scripts/spatial-gpu/transfer-to-oss.mjs
node --env-file=server/.env scripts/spatial-gpu/transfer-to-oss.mjs --switch
node --env-file=server/.env scripts/spatial-gpu/transfer-to-oss.mjs --remove-source
```

默认只复制，逐个校验 SHA256、尺寸、private ACL 和匿名访问 403；本机备份与清单保存在忽略的 `.artifacts/spatial-oss-transfer/`。切换通过照片 ID 和生成版本条件更新，随后验证线上 300 秒签名链接、站点 CORS 和文件哈希。只有全批校验成功，清理模式才删除 Supabase 的重复文件。不要在前端仍读取 Supabase 时运行清理。

Render 免费实例休眠后，第一次获取链接可能包含后台唤醒时间；签名接口客户端超时为 60 秒。签名失效不删除原文件，重新打开空间效果会重新获取链接。照片隐藏后不再签发新链接，已经签发的链接最多仍有效 5 分钟。
