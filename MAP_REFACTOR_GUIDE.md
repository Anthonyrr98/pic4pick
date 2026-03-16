# 地图初始化重构 - 使用指南

## 问题
地图初始化逻辑在多处重复，导致：
- 代码冗余
- 维护困难
- 不一致的行为
- 难以测试

## 解决方案
创建了 `useMapInitialize` Hook 来统一管理地图初始化逻辑。

## 使用方法

### 基础用法

```javascript
import { useMapInitialize } from '../hooks/useMapInitialize';

function MyMapComponent() {
  const { map, addMarker, flyTo } = useMapInitialize({
    containerId: 'my-map',
    latitude: 39.9042,
    longitude: 116.4074,
    zoom: 10,
    onMapReady: (map) => {
      console.log('地图加载完成', map);
    },
  });

  return (
    <div>
      <div id="my-map" style={{ width: '100%', height: '400px' }} />
      <button onClick={() => flyTo(31.2304, 121.4737, 12)}>
        飞到上海
      </button>
    </div>
  );
}
```

### 添加标记

```javascript
function MapWithMarkers() {
  const { map, addMarker, removeMarker } = useMapInitialize({
    containerId: 'map',
    onMapReady: (map) => {
      // 地图加载完成后添加标记
      addMarker('marker-1', 39.9042, 116.4074, {
        color: '#FF0000',
        onClick: () => {
          console.log('标记被点击');
        },
      });
    },
  });

  const handleAddMarker = () => {
    addMarker('marker-2', 31.2304, 121.4737, {
      color: '#00FF00',
    });
  };

  const handleRemoveMarker = () => {
    removeMarker('marker-1');
  };

  return (
    <div>
      <div id="map" style={{ width: '100%', height: '400px' }} />
      <button onClick={handleAddMarker}>添加标记</button>
      <button onClick={handleRemoveMarker}>移除标记</button>
    </div>
  );
}
```

### 位置选择器

```javascript
function LocationPicker({ onLocationChange }) {
  const { map, addMarker, clearMarkers, getCenter } = useMapInitialize({
    containerId: 'location-picker',
    latitude: 39.9042,
    longitude: 116.4074,
    zoom: 10,
    onMapReady: (map) => {
      // 点击地图添加标记
      map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        clearMarkers();
        addMarker('selected', lat, lng, {
          color: '#FF0000',
        });
        onLocationChange?.(lat, lng);
      });
    },
  });

  const handleConfirm = () => {
    const center = getCenter();
    if (center) {
      onLocationChange?.(center.latitude, center.longitude);
    }
  };

  return (
    <div>
      <div id="location-picker" style={{ width: '100%', height: '400px' }} />
      <button onClick={handleConfirm}>确认位置</button>
    </div>
  );
}
```

## API 参考

### useMapInitialize(options)

#### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| containerId | string | 'map-container' | 地图容器 ID |
| latitude | number | 39.9042 | 初始纬度 |
| longitude | number | 116.4074 | 初始经度 |
| zoom | number | 3 | 初始缩放级别 |
| onMapReady | function | - | 地图加载完成回调 |
| onMarkerClick | function | - | 标记点击回调 |

#### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| map | object | 地图实例 |
| container | HTMLElement | 地图容器元素 |
| addMarker | function | 添加标记 |
| removeMarker | function | 移除标记 |
| clearMarkers | function | 清除所有标记 |
| flyTo | function | 飞到指定位置 |
| setCenter | function | 设置中心点 |
| setZoom | function | 设置缩放级别 |
| getCenter | function | 获取当前中心点 |
| getZoom | function | 获取当前缩放级别 |
| destroyMap | function | 销毁地图 |

### addMarker(id, lat, lng, options)

添加地图标记。

```javascript
addMarker('marker-1', 39.9042, 116.4074, {
  color: '#FF0000',
  onClick: () => {
    console.log('标记被点击');
  },
});
```

### removeMarker(id)

移除指定标记。

```javascript
removeMarker('marker-1');
```

### clearMarkers()

清除所有标记。

```javascript
clearMarkers();
```

### flyTo(lat, lng, zoom)

飞到指定位置。

```javascript
flyTo(31.2304, 121.4737, 12);
```

### setCenter(lat, lng)

设置地图中心点。

```javascript
setCenter(39.9042, 116.4074);
```

### setZoom(zoom)

设置缩放级别。

```javascript
setZoom(10);
```

### getCenter()

获取当前中心点。

```javascript
const center = getCenter();
console.log(center.latitude, center.longitude);
```

### getZoom()

获取当前缩放级别。

```javascript
const zoom = getZoom();
console.log(zoom);
```

## 迁移指南

### 之前的代码

```javascript
// 重复的地图初始化代码
useEffect(() => {
  const container = document.getElementById('map');
  if (!container) return;

  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [116.4074, 39.9042],
    zoom: 10,
  });

  map.on('load', () => {
    // 地图加载完成
  });

  return () => {
    map.remove();
  };
}, []);
```

### 迁移后的代码

```javascript
// 使用 Hook
const { map } = useMapInitialize({
  containerId: 'map',
  latitude: 39.9042,
  longitude: 116.4074,
  zoom: 10,
  onMapReady: (map) => {
    // 地图加载完成
  },
});
```

## 优势

1. **代码复用**: 一次编写，多处使用
2. **统一行为**: 所有地图使用相同的初始化逻辑
3. **易于维护**: 修改一处，全局生效
4. **错误处理**: 统一的错误处理机制
5. **类型安全**: 清晰的 API 接口
6. **易于测试**: 可以单独测试 Hook

## 注意事项

1. **容器 ID**: 确保容器 ID 唯一
2. **清理**: Hook 会自动清理地图实例
3. **依赖**: 需要安装 `maplibre-gl` 包
4. **样式**: 需要引入 `maplibre-gl/dist/maplibre-gl.css`

## 下一步

1. 在 Gallery.jsx 中使用此 Hook
2. 在 Admin.jsx 中使用此 Hook
3. 在 LocationPicker 组件中使用此 Hook
4. 移除重复的地图初始化代码
