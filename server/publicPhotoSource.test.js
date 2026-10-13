import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicPhotoSource } from './publicPhotoSource.js';
const host='pic4pick.oss-cn-beijing.aliyuncs.com';
test('proxy only reads known photo buckets and never private depth objects',()=>{
  assert.equal(parsePublicPhotoSource(`https://${host}/origin/a.jpg`,host).legacy,false);
  const legacy=parsePublicPhotoSource('https://websiteanthony.oss-cn-beijing.aliyuncs.com/pic4pick/2025/pre/a.JPG?secret=discard',host);
  assert.equal(legacy.legacy,true); assert.equal(legacy.url,'https://websiteanthony.oss-cn-beijing.aliyuncs.com/pic4pick/2025/pre/a.JPG');
  for(const source of [`http://${host}/origin/x`, `https://evil.aliyuncs.com/origin/x`, `https://${host}/spatial-depth/private.png`,
    `https://${host}/origin/%2e%2e%2fsecret`, `https://user:pass@${host}/origin/x`, `https://${host}:444/origin/x`]) assert.equal(parsePublicPhotoSource(source,host),null);
});
