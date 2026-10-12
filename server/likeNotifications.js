import nodemailer from 'nodemailer';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : '';
  } catch {
    return '';
  }
};

export function readLikeMailConfig(env = process.env) {
  if (env.LIKE_EMAIL_ENABLED !== 'true') return null;
  const user = (env.SMTP_USER || '').trim();
  const recipient = (env.LIKE_NOTIFICATION_TO || user).trim();
  const password = env.SMTP_PASS || '';
  const host = (env.SMTP_HOST || 'smtp.163.com').trim();
  const port = Number(env.SMTP_PORT || 465);
  const isMailbox = (value) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
  if (!isMailbox(user) || !isMailbox(recipient) || !password.trim() || !host
    || !Number.isInteger(port) || port < 1 || port > 65535
    || (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE))) {
    throw new Error('点赞邮件配置不完整：检查 SMTP_USER、SMTP_PASS、LIKE_NOTIFICATION_TO、SMTP_HOST、SMTP_PORT 和 SMTP_SECURE');
  }
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  return {
    user,
    recipient,
    siteUrl: safeUrl(env.PUBLIC_SITE_URL),
    transport: {
      host, port, secure,
      requireTLS: !secure,
      auth: { user, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
}

export function buildLikeMessage(config, photo, likes, date = new Date(), clientIp = null) {
  const title = String(photo.title || '未命名照片').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const photoUrl = safeUrl(photo.image_url);
  const time = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const lines = [
    `你的照片「${title}」收到一个新的点赞！`,
    `当前点赞数：${likes}`,
    `时间：${time}（北京时间）`,
    `照片 ID：${photo.id}`,
    ...(clientIp ? [`点赞 IP：${clientIp}`] : []),
    ...(photoUrl ? [`查看照片：${photoUrl}`] : []),
    ...(config.siteUrl ? [`打开图库：${config.siteUrl}`] : []),
  ];
  return {
    from: { name: 'Pic4Pick', address: config.user },
    to: config.recipient,
    subject: `Pic4Pick ·「${title.slice(0, 80)}」收到新点赞`,
    text: lines.join('\n'),
    html: `<h2>你的照片收到一个新的点赞</h2><p>「${escapeHtml(title)}」</p>`
      + `<p>当前点赞数：<strong>${escapeHtml(likes)}</strong></p>`
      + `<p>时间：${escapeHtml(time)}（北京时间）</p><p>照片 ID：${escapeHtml(photo.id)}</p>`
      + (clientIp ? `<p>点赞 IP：${escapeHtml(clientIp)}</p>` : '')
      + (photoUrl ? `<p><a href="${escapeHtml(photoUrl)}">查看照片</a></p>` : '')
      + (config.siteUrl ? `<p><a href="${escapeHtml(config.siteUrl)}">打开图库</a></p>` : ''),
  };
}

export function createLikeNotificationService({
  db, logger, env = process.env, createTransport = nodemailer.createTransport,
}) {
  const unavailable = () => ({
    notify: async () => false,
    sendTest: async () => {
      throw Object.assign(new Error('点赞邮件未启用或 SMTP 配置不完整'), { status: 503 });
    },
  });
  let config;
  try {
    config = readLikeMailConfig(env);
  } catch (error) {
    logger.warn(error.message);
    return unavailable();
  }
  if (!config) return unavailable();
  const transporter = createTransport(config.transport);

  return {
    async sendTest() {
      try {
        await transporter.verify();
        await transporter.sendMail(buildLikeMessage(config, { id: 'test', title: '邮件通知测试' }, 1));
      } catch (error) {
        logger.warn('点赞测试邮件发送失败', { code: error.code || 'UNKNOWN' });
        throw Object.assign(new Error('测试邮件发送失败，请检查 SMTP 配置和后端日志'), { status: 502 });
      }
    },
    async notify(result) {
      try {
        const rows = await db('photos', new URLSearchParams({
          id: `eq.${result.id}`, select: 'id,title,image_url',
          status: 'eq.approved', hidden: 'eq.false', limit: '1',
        }));
        const photo = rows?.[0];
        if (!photo) return false;
        await transporter.sendMail(buildLikeMessage(config, photo, result.likes, new Date(), result.clientIp));
        logger.info('点赞邮件已发送', { photoId: result.id });
        return true;
      } catch (error) {
        // SMTP responses may contain private addresses; log only the diagnostic code.
        logger.warn('点赞邮件发送失败', { photoId: result.id, code: error.code || 'UNKNOWN' });
        return false;
      }
    },
  };
}
