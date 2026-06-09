import crypto from 'crypto'

export function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

export function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex')
}
