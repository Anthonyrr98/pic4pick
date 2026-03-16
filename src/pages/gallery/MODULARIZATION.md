/**
 * Gallery.jsx 模块化重构方案
 * 
 * 本方案将超过 1500 行的 Gallery.jsx 拆分为多个专业模块
 */

# Gallery 模块化架构

## 目录结构

```
src/pages/gallery/
├── index.ts                          # 模块导出索引
├── Gallery.jsx                       # 主组件（已大幅精简）
├── utils/
│   ├── geoUtils.ts                  # 地理位置工具（经纬度转换、距离计算、省份识别）
│   ├── timeUtils.ts                 # 时间工具（日期格式化、时间计算）
│   ├── photoDataUtils.ts            # 照片数据处理（映射、分组、聚合）
│   └── photoFilterUtils.ts          # 照片排序和筛选逻辑
├── constants/
│   └── locationData.ts              # 位置常量数据（省份、城市、坐标）
├── hooks/
│   ├── useMapInit.ts                # 地图初始化 Hooks
│   ├── useExifAndLocation.ts        # EXIF 和位置获取 Hooks
│   └── usePhotoData.ts              # 照片数据加载和点赞 Hooks
└── components/
    ├── LightboxPanel.tsx            # Lightbox 面板组件
    ├── LocationPanel.tsx            # 位置面板组件
    ├── CurationPanel.tsx            # 精选面板组件
    ├── PhotoGrid.tsx                # 照片网格组件
    └── TabStrip.tsx                 # 标签页组件
```

## 模块说明

### Utils（工具函数）

#### geoUtils.ts
- `decimalToDMS()` - 十进制度数转换为度分秒格式
- `calculateDistance()` - 计算两点间距离
- `getProvinceFromCoords()` - 根据经纬度识别省份

#### timeUtils.ts
- `getShotTimeInfo()` - 获取拍摄时间信息
- `getTimeValue()` - 获取照片排序的时间值

#### photoDataUtils.ts
- `extractLocationParts()` - 从文本提取省市县信息
- `buildCityPhotoMap()` - 构建城市-照片映射
- `buildCurationGroups()` - 构建精选分组
- `buildPhotosByLocation()` - 构建按地点聚合的照片列表

#### photoFilterUtils.ts
- `filterAndSortPhotos()` - 主筛选函数，支持最新、精选、随览、附近、远方五种排序

### Constants（常量数据）

#### locationData.ts
- `provinceCityData` - 省份和城市数据
- `cityMeta` - 城市坐标元数据
- `MUNICIPALITY_PROVINCES` - 直辖市集合
- `tabs` - 筛选标签定义
- `explorePins` - 探索地图的标记点

### Hooks（自定义 Hooks）

#### useMapInit.ts
- `useGaodeMapInit()` - 高德地图初始化，支持自动回退到 MapLibre
- `useFocusMapOnCity()` - 地图聚焦到指定城市

#### useExifAndLocation.ts
- `useExifData()` - 从图片读取 EXIF 地理数据
- `useBrowserLocation()` - 获取浏览器当前位置

#### usePhotoData.ts
- `usePhotoData()` - 加载照片数据（支持 Supabase 和 localStorage）
- `useLikePhoto()` - 点赞功能

### Components（React 组件）

#### LightboxPanel.tsx
- 显示照片详情和拍摄参数
- 支持点赞功能
- 响应式设计（桌面端和移动端）

#### LocationPanel.tsx
- 显示地点的照片列表
- 支持点击照片打开 Lightbox

#### CurationPanel.tsx
- 显示省份和城市的精选卡片
- 支持展开/收起分类
- 3D 倾斜效果

#### PhotoGrid.tsx
- 照片网格展示
- 无限滚动加载
- 点赞功能集成

#### TabStrip.tsx
- 筛选标签页
- 动态指示器位置

## 迁移步骤

### 1. 备份原文件
```bash
cp src/pages/Gallery.jsx src/pages/Gallery.jsx.backup
```

### 2. 创建新的 Gallery.jsx
使用新的模块化结构重写主组件，导入所有子模块和工具函数。

### 3. 测试
- 测试所有筛选功能（最新、精选、随览、附近、远方）
- 测试地图功能（高德地图和 MapLibre 回退）
- 测试点赞功能
- 测试响应式设计

### 4. 清理
- 删除备份文件
- 更新导入路径

## 优势

✅ **代码组织清晰** - 功能按类型分离，易于维护
✅ **可复用性强** - 工具函数和 Hooks 可在其他页面使用
✅ **易于测试** - 每个模块可独立测试
✅ **性能优化** - 支持代码分割和懒加载
✅ **类型安全** - 使用 TypeScript 提供完整的类型提示
✅ **易于扩展** - 新增功能只需添加新模块

## 注意事项

1. **导入路径** - 确保所有导入路径正确
2. **依赖关系** - 注意模块间的依赖顺序
3. **样式文件** - 保持原有的 CSS 文件不变
4. **环境变量** - 确保 VITE_AMAP_KEY 正确配置
5. **Supabase 配置** - 确保 Supabase 客户端正确初始化

## 后续优化建议

1. **提取更多子组件** - 如 MetaPopover、MapMarkers 等
2. **状态管理** - 考虑使用 Context API 或 Redux 管理全局状态
3. **性能优化** - 使用 React.memo 优化组件渲染
4. **错误边界** - 添加 Error Boundary 处理错误
5. **单元测试** - 为工具函数和 Hooks 编写单元测试
