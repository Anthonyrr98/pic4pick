export function parseEnvFile(source: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}
