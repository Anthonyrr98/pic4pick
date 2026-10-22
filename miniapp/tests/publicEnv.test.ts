import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnvFile } from '../config/publicEnv'
test('Pic4Pick configuration names retain digits, quotes, BOM and CRLF correctly', () => {
  const values = parseEnvFile('\uFEFFPIC4PICK_SUPABASE_URL="https://read.example"\r\nPIC4PICK_SUPABASE_ANON_KEY=public=value\r\n# comment\r\n PIC4PICK_API_BASE_URL = https://api.example \r\n')
  assert.deepEqual(values, { PIC4PICK_SUPABASE_URL: 'https://read.example', PIC4PICK_SUPABASE_ANON_KEY: 'public=value', PIC4PICK_API_BASE_URL: 'https://api.example' })
})
