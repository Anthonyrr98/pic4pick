import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { buildLikeMessage, createLikeNotificationService, readLikeMailConfig } from './likeNotifications.js';

const env = {
  LIKE_EMAIL_ENABLED: 'true', SMTP_USER: 'owner@163.com', SMTP_PASS: 'test-authorization-code',
};
const photo = { id: 'photo-1', title: '春日', image_url: 'https://photos.example.com/spring.jpg' };
const fixture = (overrides = {}) => {
  const messages = [];
  const queries = [];
  const logs = [];
  let transportOptions;
  const service = createLikeNotificationService({
    env,
    db: async (...args) => { queries.push(args); return [photo]; },
    logger: { warn: (...args) => logs.push(args), info: (...args) => logs.push(args) },
    createTransport: (options) => {
      transportOptions = options;
      return { verify: async () => true, sendMail: async (message) => { messages.push(message); } };
    },
    ...overrides,
  });
  return { service, messages, queries, logs, options: () => transportOptions };
};

test('163 configuration uses encrypted SMTP and defaults recipient to the sender', () => {
  const config = readLikeMailConfig(env);
  assert.equal(config.recipient, env.SMTP_USER);
  assert.equal(config.transport.host, 'smtp.163.com');
  assert.equal(config.transport.port, 465);
  assert.equal(config.transport.secure, true);
  assert.equal(config.transport.auth.pass, env.SMTP_PASS);
  const startTls = readLikeMailConfig({ ...env, SMTP_PORT: '587' });
  assert.equal(startTls.transport.secure, false);
  assert.equal(startTls.transport.requireTLS, true);
});

test('disabled notifications do not access SMTP or the database', async () => {
  const f = fixture({ env: { ...env, LIKE_EMAIL_ENABLED: 'false' } });
  assert.equal(await f.service.notify({ id: photo.id, likes: 2 }), false);
  assert.equal(f.queries.length, 0);
  assert.equal(f.options(), undefined);
  await assert.rejects(f.service.sendTest(), { status: 503 });
});

test('an administrator can verify and send a test email without changing photos or likes', async () => {
  const f = fixture();
  await f.service.sendTest();
  assert.equal(f.queries.length, 0);
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0].subject, /邮件通知测试/);
});

test('test email failure returns a generic error without disclosing SMTP details', async () => {
  const f = fixture({ createTransport: () => ({ verify: async () => {
    throw Object.assign(new Error('private SMTP response'), { code: 'ETIMEDOUT' });
  } }) });
  await assert.rejects(f.service.sendTest(), { status: 502, message: '测试邮件发送失败，请检查 SMTP 配置和后端日志' });
  assert.ok(!JSON.stringify(f.logs).includes('private SMTP response'));
});

test('invalid configuration disables notifications and does not log secrets', async () => {
  const f = fixture({ env: { ...env, SMTP_PORT: 'invalid' } });
  assert.equal(await f.service.notify({ id: photo.id, likes: 2 }), false);
  assert.equal(f.queries.length, 0);
  assert.equal(f.logs.length, 1);
  assert.ok(!JSON.stringify(f.logs).includes(env.SMTP_PASS));
  for (const invalid of [
    { SMTP_PASS: '' }, { SMTP_USER: 'invalid' }, { SMTP_PORT: '0' },
    { SMTP_SECURE: 'yes' }, { LIKE_NOTIFICATION_TO: 'a@example.com,b@example.com' },
  ]) assert.throws(() => readLikeMailConfig({ ...env, ...invalid }), /配置不完整/);
});

test('sends to the configured owner using stored photo metadata and the committed like count', async () => {
  const f = fixture({ env: { ...env, LIKE_NOTIFICATION_TO: 'recipient@163.com' } });
  assert.equal(await f.service.notify({ id: photo.id, likes: 7 }), true);
  assert.equal(f.messages.length, 1);
  const message = f.messages[0];
  assert.equal(message.to, 'recipient@163.com');
  assert.equal(message.from.address, 'owner@163.com');
  assert.match(message.subject, /春日/);
  assert.match(message.text, /当前点赞数：7/);
  assert.match(message.text, /https:\/\/photos.example.com\/spring.jpg/);
  const [table, params] = f.queries[0];
  assert.equal(table, 'photos');
  assert.equal(params.get('id'), 'eq.photo-1');
  assert.equal(params.get('status'), 'eq.approved');
  assert.equal(params.get('hidden'), 'eq.false');
});

test('photo deleted or hidden before delivery is skipped', async () => {
  const f = fixture({ db: async () => [] });
  assert.equal(await f.service.notify({ id: photo.id, likes: 2 }), false);
  assert.equal(f.messages.length, 0);
});

test('a like email contains the server-derived visitor IP in both bodies', async () => {
  const f = fixture();
  await f.service.notify({ id: photo.id, likes: 2, clientIp: '2001:db8::42' });
  assert.match(f.messages[0].text, /点赞 IP：2001:db8::42/);
  assert.match(f.messages[0].html, /点赞 IP：2001:db8::42/);
});

test('database and SMTP failures are contained and logged without private SMTP responses', async () => {
  const f = fixture({
    createTransport: () => ({ sendMail: async () => {
      throw Object.assign(new Error('private SMTP response'), { code: 'EAUTH' });
    } }),
  });
  assert.equal(await f.service.notify({ id: photo.id, likes: 2 }), false);
  assert.match(JSON.stringify(f.logs), /EAUTH/);
  assert.ok(!JSON.stringify(f.logs).includes('private SMTP response'));
  const unavailable = fixture({ db: async () => { throw new Error('DB unavailable'); } });
  assert.equal(await unavailable.service.notify({ id: photo.id, likes: 2 }), false);
  assert.equal(unavailable.messages.length, 0);
});

test('HTML escapes titles and links, strips subject line breaks, and rejects unsafe URLs', () => {
  const config = readLikeMailConfig({ ...env, PUBLIC_SITE_URL: 'https://gallery.example.com/#/' });
  const message = buildLikeMessage(config, {
    ...photo, title: '<script>alert(1)</script>\r\nInjected: header',
    image_url: 'javascript:alert(1)',
  }, 2, new Date('2026-10-12T00:00:00Z'));
  assert.ok(!message.html.includes('<script>'));
  assert.ok(message.html.includes('&lt;script&gt;'));
  assert.ok(!message.html.includes('javascript:'));
  assert.ok(!/[\r\n]/.test(message.subject));
  assert.ok(message.text.includes('8:00:00'));
  assert.ok(message.html.includes('https://gallery.example.com/#/'));
  const unsafeConfig = readLikeMailConfig({ ...env, PUBLIC_SITE_URL: 'https://user:pass@example.com' });
  assert.equal(unsafeConfig.siteUrl, '');
});

test('Nodemailer produces a multipart email with a UTF-8 subject and both message bodies', async () => {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transporter.sendMail(buildLikeMessage(readLikeMailConfig(env), photo, 3));
  const rawMessage = result.message.toString();
  assert.match(rawMessage, /Content-Type: multipart\/alternative/);
  assert.match(rawMessage, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(rawMessage, /Content-Type: text\/html; charset=utf-8/);
  assert.deepEqual(result.envelope.to, ['owner@163.com']);
});
