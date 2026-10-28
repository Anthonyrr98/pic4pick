# 项目约定

## 胶片照片上传与边框

- 上传或编辑胶片照片时，保留正确的胶片分类及胶卷类型（前端 `filmStock`、存储字段 `film_stock`；兼容已有 `film_stock:` 标签）。新上传照片也应按胶卷类型自动匹配边框，图库卡片与灯箱保持一致，不要按照片 ID 单独绑定。
- 当前用户指定的边框对应关系：
  - `Fuji C200` → `public/film-frames/fuji-c200.png`。
  - `Kodak Gold 200` → `public/film-frames/kodak-gold-200.png`。
  - `富士一次性相机` / `FUJIFILM SIMPLE ACE 400` → `public/film-frames/fuji-simple-ace.png`，使用用户最后提供的“富士胶片空白电影框扫描效果.png”版本。
- 边框识别入口为 `src/pages/gallery/components/FilmFrame.tsx` 的 `getFilmFrameStock`。新增胶卷素材时在这里扩展对应关系，并适配图库、灯箱及横竖方向。
- 保留原照片完整画面，只使用素材的胶片边缘，不将素材中间区域覆盖到照片上。其他胶卷暂用默认边框。
