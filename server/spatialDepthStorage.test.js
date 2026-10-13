import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialDepthKey, uploadSpatialDepth, createSpatialDepthHandler } from './spatialDepthStorage.js';
const id = '11111111-1111-1111-1111-111111111111';
const generation = '22222222-2222-2222-2222-222222222222';
const row = { generation, status: 'ready', storage_backend: 'oss', depth_path: `${id}/${generation}.png` };
const response = () => ({ statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(v) { this.statusCode=v; return this; }, json(v) { this.body=v; return this; } });
test('signing is restricted to approved visible photos and canonical ready OSS objects', async () => {
  for (const [photo, spatial, expected] of [
    [undefined, row, 404], [{status:'pending'}, row, 404], [{status:'approved',hidden:true},row,404],
    [{status:'approved'}, {...row,status:'pending'},404], [{status:'approved'},{...row,storage_backend:'supabase'},404],
    [{status:'approved'},{...row,depth_path:'origin/private.jpg'},503], [{status:'approved',hidden:false},row,200],
  ]) {
    let signatures=0;
    const handler=createSpatialDepthHandler({ db: async (table) => table==='photos' ? (photo?[photo]:[]) : [spatial],
      getClient: () => ({ signatureUrl(key,options) { signatures++; assert.equal(key,`spatial-depth/${id}/${generation}.png`); assert.equal(options.expires,300); return 'https://example.test/signed'; } }) });
    const res=response(); await handler({params:{id}},res);
    assert.equal(res.statusCode,expected); assert.equal(signatures,expected===200?1:0); assert.equal(res.headers['Cache-Control'],'no-store');
  }
});
test('invalid identifiers and paths cannot sign arbitrary objects', async () => {
  assert.throws(() => spatialDepthKey(id,generation,'../origin/x.png'));
  assert.throws(() => spatialDepthKey('bad',generation));
  let queried=false;
  const res=response();
  await createSpatialDepthHandler({db:async()=>{queried=true;}})({params:{id:'../../x'}},res);
  assert.equal(res.statusCode,400); assert.equal(queried,false);
});
test('uploads force private ACL even when the photo bucket is public', async () => {
  const png=Buffer.alloc(24); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.writeUInt32BE(768,16); png.writeUInt32BE(512,20);
  let uploaded=false;
  await uploadSpatialDepth({put:async(key,bytes,options)=>{uploaded=true; assert.equal(options.headers['x-oss-object-acl'],'private'); assert.equal(bytes,png); assert.equal(key,`spatial-depth/${id}/${generation}.png`);}},id,generation,png);
  assert.equal(uploaded,true);
  await assert.rejects(uploadSpatialDepth({},id,generation,Buffer.from('bad')));
});
