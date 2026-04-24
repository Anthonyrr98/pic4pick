# 地图初始化重构 - 使用指南

> 原始文档来源：`MAP_REFACTOR_GUIDE.md`

## 问题

地图初始化逻辑在多处重复，导致：
- 代码冗余
- 维护困难
- 不一致的行为
- 难以测试

## 解决方案

创建了 `useMapInitialize` Hook 来统一管理地图初始化逻辑。

## 使用方法（示例）

```javascript
import { useMapInitialize } from '../hooks/useMapInitialize';

function MyMapComponent() {
  const { map, addMarker, flyTo } = useMapInitialize({
    containerId: 'my-map',
    latitude: 39.9042,
    longitude: 116.4074,
    zoom: 10,
  });

  return <div id="my-map" style={{ width: '100%', height: '400px' }} />;
}
```

