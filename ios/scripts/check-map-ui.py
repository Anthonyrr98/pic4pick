from pathlib import Path
import json
import base64
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PRESETS = json.loads((ROOT / 'ios/Sources/Pic4Pick/Resources/AdminMapPresets.json').read_text(encoding='utf-8'))
PIXEL = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP48PntfwAJdwPQbuEWqgAAAABJRU5ErkJggg==')
HTML = (ROOT / 'ios/Sources/Pic4Pick/Resources/GalleryMap.html').read_text(encoding='utf-8')
MAP_CONFIG = json.loads((ROOT / 'ios/Sources/Pic4Pick/Resources/PublicMapConfig.json').read_text(encoding='utf-8'))
INTERNAL_PREVIEW = os.environ.get('PIC4PICK_INTERNAL_MAP_PREVIEW') == '1'
PAYLOAD = {
    'config': {'VITE_MAP_STYLE_PRESET': 'street'},
    'locations': [
        {'id': 'beijing', 'title': '北京作品', 'latitude': 39.9, 'longitude': 116.4, 'photoIDs': ['a']},
        {'id': 'shanghai', 'title': '上海作品', 'latitude': 31.23, 'longitude': 121.47, 'photoIDs': ['b']},
    ],
    'focus': {'id': 'all', 'all': True}, 'reduceMotion': True, 'active': True,
}
BRIDGE = """window.testEvents=[];window.webkit={messageHandlers:{pic4pickMap:{postMessage(value){window.testEvents.push(value)}}}};"""
AMAP = """
window.amapChecks={maps:[],conversions:0};
class FakeMap {
  constructor(id,options){this.container=document.getElementById(id);this.options=options;this.events={};window.amapChecks.maps.push(this);
    this.timer=setTimeout(()=>this.events.complete?.(),20)}
  on(name,fn){this.events[name]=fn} resize(){this.resizeCount=(this.resizeCount||0)+1} setFitView(markers,immediate,padding){this.fitPadding=padding} setZoomAndCenter(z,c){this.center=c;this.zoom=z;this.cameraCount=(this.cameraCount||0)+1}
  destroy(){clearTimeout(this.timer);this.container.replaceChildren()}
}
class FakeMarker {
  constructor(options){this.content=options.content;this.setPosition(options.position)}
  setPosition(position){this.content.dataset.position=position.join(',')}
  setMap(map){if(!map){this.content.remove();return};this.content.style.position='absolute';this.content.style.left=(40+map.container.children.length*70)+'px';this.content.style.top='100px';map.container.append(this.content)}
}
window.AMap={Map:FakeMap,Marker:FakeMarker,Geocoder:class {
  getAddress(position,callback){callback('complete',{regeocode:{formattedAddress:'上海市测试公园',aois:[{name:'测试公园',distance:0,area:10}],addressComponent:{province:'上海市'}}})}
},convertFrom(position,type,callback){window.amapChecks.conversions++;callback('complete',{locations:[{lng:121.5,lat:31.2}]})}};
"""


def update(page, payload):
    count = page.evaluate("testEvents.filter(e=>e.type==='ready').length")
    page.evaluate('(payload)=>window.Pic4PickMap.update(payload)', payload)
    page.wait_for_function('(count)=>testEvents.filter(e=>e.type==="ready").length>count', arg=count, timeout=25000)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    try:
        if MAP_CONFIG.get('VITE_MAPBOX_PUBLIC_TOKEN'):
            context = browser.new_context(viewport={'width': 390, 'height': 780})
            context.add_init_script(BRIDGE)
            page = context.new_page()
            page.route('https://map-test.invalid/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HTML))
            style = {
                'version': 8,
                'sources': {'fixture': {'type': 'vector', 'attribution': '© Mapbox fixture',
                                        'tiles': ['https://api.mapbox.com/test-tiles/{z}/{x}/{y}.pbf']}},
                'layers': [{'id': 'fixture', 'type': 'fill', 'source': 'fixture', 'source-layer': 'land'}],
            }

            def mapbox_response(route):
                url = route.request.url
                if '/styles/v1/mapbox/light-v10' in url:
                    route.fulfill(json=style)
                elif '/test-tiles/' in url:
                    route.fulfill(content_type='application/x-protobuf', body=b'')
                else:
                    route.fulfill(json={})

            page.route('https://api.mapbox.com/**', mapbox_response)
            page.route('https://events.mapbox.com/**', lambda route: route.fulfill(status=204))
            page.set_viewport_size({'width': 340, 'height': 182})
            page.goto('https://map-test.invalid/')
            photo = PAYLOAD['locations'][0]
            detail = {**PAYLOAD, 'config': {'VITE_MAPBOX_PUBLIC_TOKEN': 'pk.fixture'}, 'photoDetailCard': True,
                      'locations': [photo], 'focus': {**photo, 'zoom': 10},
                      'photoMarkerURL': 'data:image/png;base64,' + base64.b64encode(PIXEL).decode()}
            page.evaluate('(detail)=>Pic4PickMap.update({...detail, active: false})', detail)
            assert page.locator('canvas').count() == 0, 'Prewarming the document must not start the map engine'
            update(page, detail)
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').at(-1).provider") == 'mapbox'
            marker = page.locator('.mapboxgl-marker.photo-marker img')
            box = marker.bounding_box()
            assert abs(box['x'] + box['width'] / 2 - 170) < 1
            assert abs(box['y'] + box['height'] / 2 - 91) < 1
            logo = page.locator('.mapboxgl-ctrl-logo')
            assert logo.count() == 1
            assert logo.is_visible() != INTERNAL_PREVIEW
            page.locator('.mapboxgl-ctrl-attrib-button').wait_for(state='visible')
            page.locator('.mapboxgl-canvas').evaluate("(canvas)=>canvas.dataset.retained = 'yes'")
            page.evaluate('(detail)=>Pic4PickMap.update({...detail, active: false})', detail)
            page.evaluate('(detail)=>Pic4PickMap.update(detail)', detail)
            assert page.locator('.mapboxgl-canvas[data-retained=yes]').count() == 1
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').length") == 1
            page.evaluate('Pic4PickMap.parkPhotoMap()')
            page.evaluate('(detail)=>Pic4PickMap.update(detail)', detail)
            assert page.locator('.mapboxgl-canvas[data-retained=yes]').count() == 1
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').length") == 1
            page.evaluate('Pic4PickMap.dispose()')
            assert page.locator('canvas').count() == 0
            update(page, detail)
            marker.wait_for()

            page.set_viewport_size({'width': 390, 'height': 780})
            page.goto('https://map-test.invalid/')
            page.evaluate('Pic4PickMap.setPanelLayout(180, 50)')
            payload = {**PAYLOAD, 'config': {'VITE_MAPBOX_PUBLIC_TOKEN': 'pk.fixture'}, 'compactMarkers': True,
                       'locations': [PAYLOAD['locations'][0], {**PAYLOAD['locations'][0], 'id': 'near-beijing', 'longitude': 116.401},
                                     PAYLOAD['locations'][1]],
                       'focus': {'id': 'beijing', 'latitude': 39.9, 'longitude': 116.4, 'zoom': 10}}
            with page.expect_response(lambda res: '/test-tiles/' in res.url and res.ok):
                update(page, payload)
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').at(-1).provider") == 'mapbox'
            assert logo.count() == 1
            assert logo.is_visible() != INTERNAL_PREVIEW
            toggle = page.locator('.mapboxgl-ctrl-attrib-button')
            assert toggle.count() == 1
            assert toggle.is_visible() != INTERNAL_PREVIEW
            if not INTERNAL_PREVIEW:
                page.wait_for_function("document.querySelector('.mapboxgl-ctrl-attrib-inner')?.textContent.includes('Mapbox fixture')")
                assert not page.locator('.mapboxgl-ctrl-attrib-inner').is_visible()
                toggle.click()
                assert page.locator('.mapboxgl-ctrl-attrib-inner').is_visible()
                toggle.click()
            page.mouse.click(195, 390)
            page.wait_for_function("testEvents.some(e=>e.type==='nearbyLocations'&&e.ids.join(',')==='beijing,near-beijing')")
            page.evaluate('Pic4PickMap.setPanelParallax(-50, 0, "linear", 280)')
            if not INTERNAL_PREVIEW:
                credit_box = toggle.bounding_box()
                assert credit_box['y'] + credit_box['height'] <= 501

            # If Mapbox is unreachable, the Gaode raster fallback must display.
            page.route('https://api.mapbox.com/styles/v1/mapbox/light-v10?**', lambda route: route.abort())
            page.route('https://*.is.autonavi.com/**', lambda route: route.fulfill(content_type='image/png', body=PIXEL))
            page.reload()
            update(page, {**payload, 'requireConfiguredStyle': True})
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').at(-1).provider") == 'maplibre'
            assert not page.evaluate("testEvents.some(e=>e.type==='failure')")
            assert page.locator('.marker.compact').count() == 3
            context.close()
            print('通过：Mapbox 矢量瓦片、折叠署名、附近作品点选及高德回退。')

        context = browser.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=1)
        context.route('https://*.is.autonavi.com/**', lambda route: route.fulfill(status=200, content_type='image/png', body=PIXEL))
        context.add_init_script(BRIDGE)
        page = context.new_page()
        page.route('https://map-test.invalid/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HTML))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('https://map-test.invalid/')
        page.wait_for_load_state('networkidle')
        assert page.locator('#map').count() == 1
        page.evaluate("""() => {
            const script = document.createElement('script');
            script.textContent = 'window.untrustedMapScriptRan = true';
            document.head.append(script);
        }""")
        assert page.evaluate("window.untrustedMapScriptRan") is None
        for preset in [item for item in PRESETS if item['kind'] == 'raster']:
            payload = {**PAYLOAD, 'config': {'VITE_MAP_STYLE_PRESET': preset['id']}}
            update(page, payload)
            assert page.evaluate("testEvents.filter(e=>e.type==='ready').at(-1).provider") == 'maplibre'
        page.get_by_role('button', name='北京作品', exact=True).click()
        page.wait_for_function("testEvents.some(e=>e.type==='location'&&e.id==='beijing')")
        page.screenshot(path=str(ROOT / '.artifacts/ios-parity-map.png'))
        detail = {**PAYLOAD, 'config': {'VITE_MAP_STYLE_PRESET': 'js_whitesmoke'},
                  'locations': PAYLOAD['locations'][:1], 'photoDetailCard': True,
                  'focus': {'id': 'photo', 'latitude': 39.9, 'longitude': 116.4, 'zoom': 10},
                  'photoMarkerURL': 'data:image/png;base64,' + base64.b64encode(PIXEL).decode()}
        with page.expect_request(lambda req: 'is.autonavi.com/appmaptile' in req.url and 'style=8' in req.url):
            update(page, detail)
        assert page.locator('.maplibregl-canvas').evaluate('(el)=>getComputedStyle(el).filter') == 'saturate(0.15)'
        assert page.locator('.photo-marker img').evaluate('(el)=>getComputedStyle(el).width') == '30px'
        assert page.locator('.maplibregl-ctrl-zoom-in').count() == 0
        assert not page.locator('.maplibregl-ctrl-attrib-inner').is_visible()
        page.locator('.maplibregl-ctrl-attrib-button').click()
        attribution = page.locator('.maplibregl-ctrl-attrib-inner')
        attribution.wait_for(state='visible', timeout=3000)
        assert '© 高德地图' in attribution.inner_text()
        assert not errors, errors
        camera_keys = {'focus', 'geocode', 'reduceMotion'}
        content = {key: value for key, value in detail.items() if key not in camera_keys}
        camera = {key: value for key, value in detail.items() if key in camera_keys}
        page.locator('.maplibregl-canvas').evaluate("(canvas)=>canvas.dataset.retained = 'yes'")
        page.evaluate('(parts)=>Pic4PickMap.updateParts(parts)', {'content': {**content, 'active': False}, 'camera': camera})
        page.evaluate('(content)=>Pic4PickMap.updateParts({content})', content)
        assert page.locator('.maplibregl-canvas[data-retained=yes]').count() == 1
        page.locator('.photo-marker img').wait_for()
        page.evaluate('Pic4PickMap.dispose()')
        assert page.locator('canvas').count() == 0
        context.close()

        context = browser.new_context(viewport={'width': 390, 'height': 780})
        context.add_init_script(BRIDGE)
        sdk = AMAP + """
window.amapDependencies = Function('return 0')();
for (const host of ['restapi.amap.com', 'jsapi-service.amap.com']) {
    const script = document.createElement('script');
    script.src = 'https://' + host + '/fixture.js';
    document.head.append(script);
}
"""
        context.route('https://webapi.amap.com/maps?**', lambda route: route.fulfill(
            content_type='application/javascript', body=sdk))
        for host in ('restapi.amap.com', 'jsapi-service.amap.com'):
            context.route(f'https://{host}/fixture.js', lambda route: route.fulfill(
                content_type='application/javascript', body='window.amapDependencies += 1;'))
        page = context.new_page()
        page.route('https://map-test.invalid/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HTML))
        page.goto('https://map-test.invalid/')
        page.wait_for_load_state('networkidle')
        for preset in [item for item in PRESETS if item['kind'] == 'amap-js']:
            payload = {**PAYLOAD, 'config': {'VITE_MAP_STYLE_PRESET': preset['id'],
                                            'VITE_AMAP_WEB_KEY': 'fixture', 'VITE_AMAP_SECURITY_JS_CODE': 'fixture'}}
            update(page, payload)
            assert page.evaluate('amapChecks.maps.at(-1).options.mapStyle') == preset['amapStyle']
        page.wait_for_function('window.amapDependencies === 2', timeout=3000)
        payload = {**payload, 'geocode': {'id': 'gps-test', 'latitude': 31.2, 'longitude': 121.5, 'coordinateSystem': 'gps'}}
        page.evaluate('(payload)=>Pic4PickMap.update({...payload, resolveAddress: false})', payload)
        assert page.evaluate('amapChecks.conversions') == 0
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        page.wait_for_function("testEvents.some(e=>e.type==='address'&&e.label==='测试公园')")
        assert page.evaluate('amapChecks.conversions') == 1
        page.get_by_role('button', name='上海作品', exact=True).click()
        page.wait_for_function("testEvents.some(e=>e.type==='location'&&e.id==='shanghai')")
        # Discovery uses the website's selected style and the original tile colors.
        payload = {**PAYLOAD, 'config': {'VITE_MAP_STYLE_PRESET': 'js_whitesmoke',
                                         'VITE_AMAP_MAP_STYLE': 'amap://styles/whitesmoke'},
                   'focus': {'id': 'initial', 'initial': True},
                   'compactMarkers': True, 'requireConfiguredStyle': True}
        page.evaluate('Pic4PickMap.setPanelLayout(203, 50)')
        update(page, {**payload, 'config': {'VITE_MAP_STYLE_PRESET': 'js_grey'}})
        assert page.evaluate('amapChecks.maps.at(-1).options.mapStyle') == 'amap://styles/grey'
        empty = {**payload, 'locations': []}
        update(page, empty)
        initial_zoom = page.evaluate('amapChecks.maps.at(-1).zoom')
        assert 3.5 < initial_zoom < 3.7
        assert page.evaluate('amapChecks.maps.at(-1).center[0]') == 106
        assert 24 < page.evaluate('amapChecks.maps.at(-1).center[1]') < 27
        # A late overseas location must leave the initial China camera in place.
        outside = {**payload, 'locations': [{**PAYLOAD['locations'][0], 'longitude': 2.35, 'latitude': 48.86}]}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', outside)
        assert page.evaluate('amapChecks.maps.at(-1).fitPadding === undefined')
        assert page.evaluate('amapChecks.maps.at(-1).zoom') == initial_zoom
        assert page.evaluate('amapChecks.maps.at(-1).center[0]') == 106
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', {**outside, 'focus': {'id': 'show-all', 'all': True}})
        assert page.evaluate('amapChecks.maps.at(-1).fitPadding[2]') == 228
        payload = {**payload, 'focus': {'id': 'reset', 'initial': True}}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        assert page.evaluate('amapChecks.maps.at(-1).options.mapStyle') == 'amap://styles/whitesmoke'
        assert page.evaluate('amapChecks.maps.at(-1).center[0]') == 106
        assert page.evaluate('amapChecks.maps.at(-1).zoom') == initial_zoom
        assert page.locator('.marker.compact').count() == 2
        dot = page.locator('.marker.compact span').first
        assert dot.evaluate('(el)=>getComputedStyle(el).width') == '6.5px'
        assert dot.evaluate('(el)=>getComputedStyle(el).borderTopColor') == 'rgb(255, 255, 255)'
        assert page.locator('.marker.compact').first.bounding_box()['width'] == 26
        # WKWebView's high-level map can fall back to raster DOM tiles instead of a canvas.
        assert page.evaluate("""() => {
            const layers = document.createElement('div');
            layers.className = 'amap-layers';
            layers.innerHTML = '<div class="amap-layer amap-layer-tile"></div><div class="amap-markers"></div>';
            document.querySelector('#map').append(layers);
            const [tiles, markers] = layers.children;
            const originalColors = getComputedStyle(tiles).filter === 'none' && getComputedStyle(markers).filter === 'none';
            layers.remove();
            return originalColors;
        }""")
        page.evaluate("document.querySelector('.marker.compact').dataset.retained = 'yes'")
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', {**payload, 'active': False})
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        assert page.locator('.marker.compact[data-retained=yes]').count() == 1
        # A Swift dictionary may arrive with the same properties in a different order.
        snapshot = page.evaluate("""() => {
            const map = amapChecks.maps.at(-1);
            map.setZoomAndCenter(5, [120, 30]);
            return [amapChecks.maps.length, map.cameraCount, map.center, map.zoom];
        }""")
        same_map = {**payload, 'config': dict(reversed(list(payload['config'].items())))}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', same_map)
        assert page.evaluate("""() => {
            const map = amapChecks.maps.at(-1);
            return [amapChecks.maps.length, map.cameraCount, map.center, map.zoom];
        }""") == snapshot
        same_markers = {**payload, 'locations': [
            {**point, 'photoIDs': [*point['photoIDs'], 'new-photo']} for point in payload['locations']
        ]}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', same_markers)
        assert page.locator('.marker.compact[data-retained=yes]').count() == 1
        camera = {'focus': {'id': 'bridge-focus', 'latitude': 31.23, 'longitude': 121.47, 'zoom': 12}, 'reduceMotion': True}
        page.evaluate('(camera)=>Pic4PickMap.updateParts({camera})', camera)
        assert page.evaluate('amapChecks.maps.at(-1).center') == [121.47, 31.23]
        assert page.evaluate('amapChecks.maps.at(-1).zoom') == 12
        assert page.locator('.marker.compact[data-retained=yes]').count() == 1
        content = {key: value for key, value in payload.items() if key not in camera_keys}
        count = page.evaluate('amapChecks.maps.at(-1).cameraCount')
        page.evaluate('(content)=>Pic4PickMap.updateParts({content})', content)
        assert page.evaluate('amapChecks.maps.at(-1).cameraCount') == count
        page.evaluate("""() => {
            window.beijingMarker = document.querySelector('[aria-label="北京作品"]');
            window.shanghaiMarker = document.querySelector('[aria-label="上海作品"]');
        }""")
        moved = {**payload['locations'][0], 'title': '北京新名称', 'longitude': 116.5}
        added = {**payload['locations'][0], 'id': 'guangzhou', 'title': '广州作品'}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', {**payload, 'locations': [moved, added]})
        assert page.evaluate("""() => {
            const updated = document.querySelector('[aria-label="北京新名称"]');
            return updated === beijingMarker && updated.dataset.position === '116.5,39.9'
                && !shanghaiMarker.isConnected && document.querySelector('[aria-label="广州作品"]');
        }""")
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        assert page.evaluate("""() => {
            const map = amapChecks.maps.at(-1);
            const snapshot = () => [amapChecks.maps.length, map.resizeCount, map.cameraCount, map.fitPadding].join('|');
            const before = snapshot();
            Pic4PickMap.setPanelLayout(225, 50);
            Pic4PickMap.setPanelLayout(500, 50);
            return before === snapshot()
                && document.querySelector('.marker.compact[data-retained=yes]') !== null;
        }""")
        page.evaluate('Pic4PickMap.setPanelLayout(10000, 50)')
        payload = {**payload, 'focus': {'id': 'expanded-fit', 'all': True}}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        assert page.evaluate('amapChecks.maps.at(-1).fitPadding[2]') <= 680, 'Expanded panel must not consume the entire map camera viewport'
        payload = {**payload, 'locations': PAYLOAD['locations'][:1],
                   'photoMarkerURL': 'data:image/png;base64,' + base64.b64encode(PIXEL).decode()}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        page.wait_for_function("document.querySelector('.photo-marker img')?.complete")
        assert page.locator('.photo-marker img').count() == 1
        assert page.locator('.photo-marker img').evaluate('(el)=>getComputedStyle(el).width') == '26px'
        assert page.locator('.photo-marker').bounding_box()['width'] == 44
        page.route('https://photo-test.invalid/**', lambda route: route.fulfill(status=404, body='missing'))
        payload = {**payload, 'photoMarkerURL': 'https://photo-test.invalid/missing.jpg'}
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        page.locator('.marker span').wait_for()
        assert page.locator('.photo-marker').count() == 0
        context.close()

        context = browser.new_context(viewport={'width': 390, 'height': 780})
        context.add_init_script(BRIDGE + "window.AMap={Map:class{constructor(){throw new Error('SDK unavailable')}}};")
        page = context.new_page()
        page.route('https://map-test.invalid/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HTML))
        page.goto('https://map-test.invalid/')
        page.evaluate('(payload)=>Pic4PickMap.update(payload)', payload)
        page.wait_for_function("testEvents.some(e=>e.type==='failure')")
        assert page.locator('canvas').count() == 0, 'Do not silently substitute another map style on SDK failure'
        assert page.evaluate("testEvents.filter(e=>e.type==='ready').length") == 0
        context.close()

        context = browser.new_context(viewport={'width': 390, 'height': 780}, device_scale_factor=3)
        context.add_init_script(BRIDGE + AMAP + """
            const BaseMap = AMap.Map;
            AMap.Map = class extends BaseMap {
                constructor(id, options) {
                    super(id, options);
                    this.container.innerHTML = '<div class="amap-layers"><canvas></canvas></div>'
                        + '<div class="amap-logo" style="position:absolute;bottom:0">高德地图</div>'
                        + '<div class="amap-copyright" style="position:absolute;bottom:0;left:90px">© AutoNavi</div>';
                }
            };
        """)
        page = context.new_page()
        page.route('https://map-test.invalid/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HTML))
        page.goto('https://map-test.invalid/')
        page.evaluate('Pic4PickMap.setPanelLayout(187, 50)')
        update(page, {**PAYLOAD, 'config': {'VITE_MAP_STYLE_PRESET': 'js_whitesmoke'}, 'compactMarkers': True,
                      'focus': {'id': 'initial', 'initial': True}})
        # The map engine and WebKit must see the same viewport for touch coordinates.
        assert page.locator('#map').evaluate('(el)=>el.clientWidth === innerWidth && el.clientHeight === innerHeight')
        assert page.evaluate('amapChecks.maps.at(-1).options.touchZoomCenter') is False
        assert abs(page.locator('#map').bounding_box()['width'] - 390) < 1
        assert abs(page.locator('.marker.compact').first.bounding_box()['width'] - 26) < 1
        amap_logo = page.locator('.amap-logo')
        assert amap_logo.count() == 1
        assert amap_logo.is_visible() != INTERNAL_PREVIEW
        credits = [page.locator('.amap-copyright')]
        if not INTERNAL_PREVIEW:
            credits.append(amap_logo)
        initial_boxes = [credit.bounding_box() for credit in credits]
        assert all(abs(box['y'] - 50) < 1 for box in initial_boxes)
        for height in (493, 710, 493, 187):
            page.evaluate('(height)=>Pic4PickMap.setPanelLayout(height, 50)', height)
            assert [credit.bounding_box() for credit in credits] == initial_boxes
        map_node = page.locator('#map')
        map_before = map_node.bounding_box()
        camera_before = page.evaluate('amapChecks.maps.at(-1).cameraCount')
        resize_before = page.evaluate('amapChecks.maps.at(-1).resizeCount')
        for offset in (-40, -128, -219, -128, 0):
            page.evaluate('(offset)=>Pic4PickMap.setPanelParallax(offset)', offset)
            assert map_node.bounding_box() == {**map_before, 'y': map_before['y'] + offset}
            assert [credit.bounding_box() for credit in credits] == initial_boxes
            assert page.evaluate('amapChecks.maps.at(-1).cameraCount') == camera_before
            assert page.evaluate('amapChecks.maps.at(-1).resizeCount') == resize_before
        # A single settle command animates the map while counter-moving its credits.
        page.evaluate("""() => {
            Pic4PickMap.setPanelParallax(-200, 500, 'linear');
            for (const animation of document.getAnimations()) {
                animation.pause();
                animation.currentTime = 250;
            }
        }""")
        assert abs(map_node.bounding_box()['y'] - (map_before['y'] - 100)) < 1
        assert [credit.bounding_box() for credit in credits] == initial_boxes
        page.evaluate('Pic4PickMap.setPanelParallax(-60)')
        assert map_node.bounding_box() == {**map_before, 'y': map_before['y'] - 60}
        assert [credit.bounding_box() for credit in credits] == initial_boxes
        assert page.evaluate('document.getAnimations().length') == 0
        context.close()
        print('通过：MapLibre Worker／高德配置、地点点击、GPS 地址、初始镜头与延迟坐标、圆点保留、面板留白、署名位置、样式失败处理。')
    finally:
        browser.close()
