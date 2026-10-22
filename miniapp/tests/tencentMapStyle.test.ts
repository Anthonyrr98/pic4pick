import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTencentMapStyle } from '../config/tencentMapStyle'

test('unconfigured native map retains the platform default', () => {
  assert.equal(resolveTencentMapStyle('', '  '), null)
})

test('native style uses the supplied key and ID together', () => {
  assert.deepEqual(resolveTencentMapStyle(' test-key ', ' 7 '), { subkey: 'test-key', layerStyle: 7 })
})

test('partial native map configuration is rejected', () => {
  assert.throws(() => resolveTencentMapStyle('test-key', ''), /需同时配置/)
  assert.throws(() => resolveTencentMapStyle('', '7'), /需同时配置/)
})

test('invalid IDs and web style identifiers cannot become native styles', () => {
  for (const id of ['0', '-1', '1.5', '1e2', 'Infinity', '9007199254740992', 'js_whitesmoke', 'amap://styles/whitesmoke']) {
    assert.throws(() => resolveTencentMapStyle('test-key', id), /正整数/)
  }
})
