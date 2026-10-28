# 照片详情的高德地址

只在打开照片信息的“地理位置”标签时调用现有高德 JS API 2.0 `AMap.Geocoder.getAddress`，显示返回的 `regeocode.formattedAddress`。复用已有 `VITE_AMAP_WEB_KEY`（兼容 `VITE_AMAP_KEY`）和安全密钥，不新增 REST 服务密钥或代理。地址栏与地图气泡共享结果，React 文本及气泡 HTML 分别沿用默认转义与 `escapeHtml`。

输入优先使用本张照片已成功读取的 EXIF GPS，其次为照片记录中的经纬度。EXIF GPS 通过 `AMap.convertFrom(..., 'gps', ...)` 转换，并将同一转换结果传给地图。历史数据库坐标沿用当前应用/地图选点的坐标约定，不根据数值猜测坐标系或修改记录。详情中的数值经纬度仍显示原记录/EXIF 数据。需要批量修正历史原始 GPS 坐标时，应另行核实来源并记录坐标系。

当前标签页内最多缓存 100 个成功结果，相同坐标的并发查询合并。总等待上限 8 秒；失败、无地址、缺少配置或超时保留国家与城市文字。关闭弹窗或切换照片取消当前等待，旧结果不能覆盖当前照片；失败不进入缓存。EXIF 读取也按照片来源隔离，忽略切换后才返回的旧结果。

测试：`node --test scripts/photo-address.test.mjs`。覆盖缺失/非法坐标、按需加载、请求合并、不同照片、GPS 转换、独立取消、超时及失败重试。

参考：[高德逆地理编码](https://lbs.amap.com/api/javascript-api-v2/guide/services/geocoder)、[GPS 坐标转换](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)。
