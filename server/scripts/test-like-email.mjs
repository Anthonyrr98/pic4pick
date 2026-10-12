import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { readLikeMailConfig, buildLikeMessage } from '../likeNotifications.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
try {
  const config = readLikeMailConfig();
  if (!config) throw new Error('请先设置 LIKE_EMAIL_ENABLED=true');
  const transporter = nodemailer.createTransport(config.transport);
  await transporter.verify();
  console.log('SMTP 连接和认证成功。');
  if (process.argv.includes('--send')) {
    await transporter.sendMail(buildLikeMessage(config, { id: 'test', title: '邮件通知测试' }, 1));
    console.log('测试通知已提交给邮件服务器，请检查收件箱和垃圾邮件。');
  }
} catch (error) {
  console.error('邮件检查失败：', error.code || (error.message.startsWith('请先') || error.message.startsWith('点赞邮件配置')
    ? error.message : '检查 SMTP 配置、授权码及服务器网络连接'));
  process.exitCode = 1;
}
