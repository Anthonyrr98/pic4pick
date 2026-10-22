import { defineConfig } from '@tarojs/cli'
import path from 'node:path'
import fs from 'node:fs'
import { parseEnvFile } from './publicEnv'
import { resolveTencentMapStyle } from './tencentMapStyle'

// Only these public fields enter the client. Never spread process.env into DefinePlugin.
const envFile = path.resolve(__dirname, '../.env.local')
const values = fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, 'utf8')) : {}
const read = (key: string) => process.env[key] ?? values[key] ?? ''
const publicConfig = {
  apiBaseUrl: read('PIC4PICK_API_BASE_URL'),
  supabaseUrl: read('PIC4PICK_SUPABASE_URL'),
  supabaseAnonKey: read('PIC4PICK_SUPABASE_ANON_KEY'),
  mediaBaseUrl: read('PIC4PICK_MEDIA_BASE_URL'),
  titleFontUrl: read('PIC4PICK_TITLE_FONT_URL'),
  bodyFontUrl: read('PIC4PICK_BODY_FONT_URL'),
  tencentMapStyle: resolveTencentMapStyle(read('PIC4PICK_TENCENT_MAP_SUBKEY'), read('PIC4PICK_TENCENT_MAP_STYLE_ID')),
}
if (/^sb_secret_/.test(publicConfig.supabaseAnonKey)) throw new Error('客户端禁止使用 Supabase secret key')
try {
  const payload = JSON.parse(Buffer.from(publicConfig.supabaseAnonKey.split('.')[1] || '', 'base64url').toString())
  if (payload.role === 'service_role') throw new Error('客户端禁止使用 service_role')
} catch (error) {
  if (error instanceof Error && error.message.includes('service_role')) throw error
}

export default defineConfig<'webpack5'>({
  projectName: 'pic4pick', date: '2026-10-13', designWidth: 750,
  deviceRatio: { 750: 1 }, sourceRoot: 'src', outputRoot: 'dist',
  framework: 'react', compiler: { type: 'webpack5', errorLevel: 1 },
  plugins: ['@tarojs/plugin-platform-weapp'],
  defineConstants: { __PIC4PICK_CONFIG__: JSON.stringify(publicConfig) },
  copy: { patterns: [{ from: 'src/assets', to: 'dist/assets' }], options: {} },
  mini: {
    compile: { include: [path.resolve(__dirname, '../../packages/shared')] },
    postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
    webpackChain(chain) {
      // Shared pure code must always resolve the miniapp's dependencies.
      chain.resolve.modules.prepend(path.resolve(__dirname, '../node_modules'))
    },
  },
})
