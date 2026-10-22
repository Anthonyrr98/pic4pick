# 小程序后端兼容入口：部署审查

日期：2026-10-14。用户明确授权后，三文件提交 `558882c8a8450a65086abf86ea0f69ce1ddd59c6` 已推送 main，并部署成功。

## 已核实的目标

Render 工作区：用户选择的 `My Workspace`（`tea-d90lh9ojs32c73dasnr0`）。现有服务 `pic4pick-backend`（`srv-d90lk9f7f7vs73cos0b0`），[服务控制台](https://dashboard.render.com/web/srv-d90lk9f7f7vs73cos0b0)。

源仓库 `Anthonyrr98/pic4pick`，分支 `main`，根目录 `server`，自动按提交部署。部署前线上为 `1fa18ec`、远端 main 为 `2c69c67`，两版 server 无差异。本次仅追加兼容入口，部署 `dep-db7dqpqvcj2c73e070r0` 已达到 live。

## 本次服务端变更

仅提交以下三个文件即可部署兼容入口：

- `server/server-enhanced.js`：命名原处理函数，通过注册函数保留原 PATCH 并追加 POST。
- `server/miniappCompatibility.js`：新增 `POST /api/photos/:id/likes`、`POST /api/admin/photos/:id/update`。原 POST/PATCH 共用处理函数、限流实例和 JWT/管理员校验。
- `server/miniappCompatibility.test.js`：检查方法切换不能绕过限流、点赞参数/IP/RPC保持一致，以及管理员鉴权和部分更新体。

不增加数据库迁移、环境变量、服务或费用；不提交当前未完成验收的小程序及网页共享层改动。可审查补丁：`.artifacts/wechat-migration-validation/backend-compatibility.patch`，已用 `git apply --reverse --check` 核对它与当前三个文件一致。

提交实际范围已核实：3 文件、64 行增加、4 行删除。其余迁移工作树保留。[提交](https://github.com/Anthonyrr98/pic4pick/commit/558882c8a8450a65086abf86ea0f69ce1ddd59c6)。

已通过 80 项原后端/业务/兼容测试。推送 main 会触发 Render 自动部署，同时会重新运行仓库已有 GitHub Pages 工作流及开启时的 OSS 网页发布工作流；该提交不包含网页代码变更。

## 部署与验证

本次已先复核远端 main 与本地 HEAD 一致，暂存区严格仅上述三文件，然后提交和推送。没有重复调用 trigger_deploy。

等待新提交的部署状态为 live，再运行：

```powershell
node scripts/check-miniapp-backend.mjs --expect=compat
```

该脚本不携带管理员凭据，也不发送合法点赞增量。它检查 health 为 200、原/新增管理接口无 token 为 401、原/新增点赞接口非法增量为 400。这些入口在数据库写入前拒绝请求，不修改照片/点赞、不发送邮件。此检查只能验证入口和保护条件，不能代替真实 JWT、成功点赞/邮件、上传/编辑的受控联调。

部署前 `--expect=legacy` 五项全部通过，确认新增 POST 为 404。部署后 `--expect=compat` 五项全部通过：health 200，原/新增管理 401，原/新增点赞非法增量 400。部署后的 error 级别日志查询返回 0 条，查询范围从本次部署开始至检查时刻。

[GitHub Pages 工作流](https://github.com/Anthonyrr98/pic4pick/actions/runs/38496934352) completed / success。[OSS 网页工作流](https://github.com/Anthonyrr98/pic4pick/actions/runs/38496934228) completed / skipped。

回退时 revert 本次三文件提交再推送，沿用原自动部署。回退后小程序的 POST 点赞/编辑入口将不再可用，原网页 PATCH 继续保留。不得覆盖或重置当前工作树中的其他迁移改动。
