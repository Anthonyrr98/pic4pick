import test from 'node:test';
import assert from 'node:assert/strict';
import { addLocationMarker } from '../src/utils/locationMarker.js';

test('upload and edit marker coordinates retain longitude order and escape search labels', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ style: {} }) } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else delete globalThis.document; });
  class Popup { setHTML(html) { this.html = html; return this; } }
  class Marker {
    constructor(element) { this.element = element; }
    setLngLat(point) { this.point = point; return this; }
    setPopup(popup) { this.popup = popup; return this; }
    addTo(map) { this.map = map; return this; }
    togglePopup() { this.open = true; }
  }
  const map = {};
  const plain = addLocationMarker({ Popup, Marker }, map, 31.23, 121.47);
  const named = addLocationMarker({ Popup, Marker }, map, 31.23, 121.47, { label: '<script>&"' });
  assert.deepEqual(plain.point, [121.47, 31.23]);
  assert.equal(plain.map, map);
  assert.equal(plain.open, true);
  assert.equal(plain.popup.html, '纬度: 31.230000<br>经度: 121.470000');
  assert.equal(named.popup.html, '&lt;script&gt;&amp;&quot;<br>纬度: 31.230000<br>经度: 121.470000');
  assert.equal(named.element.className, 'custom-marker');
});
