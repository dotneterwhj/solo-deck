import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface AuthConfig {
  enabled: boolean
  username: string
  password: string
  platformTitle: string
  sessionExpiresInHours: number
}

const CONFIG_DIR = path.join(process.cwd(), 'config')
const CONFIG_FILE = path.join(CONFIG_DIR, 'auth.json')

export const AUTH_COOKIE_NAME = 'cdpipeline_session'

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enabled: true,
  username: 'admin',
  password: 'admin123',
  platformTitle: 'Solo Deck 自动化发布与运维平台',
  sessionExpiresInHours: 24,
}

// 缓存与文件更新检测，避免每次磁盘 IO 失败
export function getAuthConfig(): AuthConfig {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_AUTH_CONFIG, null, 2), 'utf-8')
      return DEFAULT_AUTH_CONFIG
    }

    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(content)

    // 环境变量优先级高于配置文件（方便 Docker 容器化时通过 -e 注入）
    const envEnabled =
      process.env.AUTH_ENABLED !== undefined ? process.env.AUTH_ENABLED !== 'false' : undefined
    const envUser = process.env.AUTH_USERNAME
    const envPass = process.env.AUTH_PASSWORD

    return {
      enabled: envEnabled ?? parsed.enabled ?? DEFAULT_AUTH_CONFIG.enabled,
      username: envUser || parsed.username || DEFAULT_AUTH_CONFIG.username,
      password: envPass || parsed.password || DEFAULT_AUTH_CONFIG.password,
      platformTitle: parsed.platformTitle || DEFAULT_AUTH_CONFIG.platformTitle,
      sessionExpiresInHours:
        Number(parsed.sessionExpiresInHours) || DEFAULT_AUTH_CONFIG.sessionExpiresInHours,
    }
  } catch (err) {
    console.error('Failed to read config/auth.json, falling back to defaults:', err)
    return DEFAULT_AUTH_CONFIG
  }
}

/**
 * 校验用户名和密码
 */
export function verifyCredentials(inputUser: string, inputPass: string): boolean {
  const config = getAuthConfig()
  if (!config.enabled) return true

  const userOk = inputUser?.trim() === config.username.trim()
  const passOk = inputPass === config.password
  return userOk && passOk
}

/**
 * 获取签名密钥
 */
function getSigningSecret(): string {
  const config = getAuthConfig()
  return process.env.AUTH_SECRET || `salt_${config.username}_${config.password}_cdpipeline_2026`
}

/**
 * 创建带 HMAC 签名的 Session Token
 */
export function createSessionToken(username: string, rememberMe: boolean = true): { token: string; maxAgeSeconds: number } {
  const config = getAuthConfig()
  const hours = rememberMe ? config.sessionExpiresInHours : 2
  const maxAgeSeconds = hours * 3600
  const expiresAt = Date.now() + maxAgeSeconds * 1000

  const payload = JSON.stringify({
    u: username,
    exp: expiresAt,
    iat: Date.now(),
  })

  const b64Payload = Buffer.from(payload).toString('base64url')
  const secret = getSigningSecret()
  const signature = crypto.createHmac('sha256', secret).update(b64Payload).digest('hex')

  return {
    token: `${b64Payload}.${signature}`,
    maxAgeSeconds,
  }
}

/**
 * 验证 Session Token 合法性
 */
export function verifySessionToken(token: string): { username: string } | null {
  if (!token || !token.includes('.')) return null

  const [b64Payload, signature] = token.split('.')
  if (!b64Payload || !signature) return null

  try {
    const secret = getSigningSecret()
    const expectedSig = crypto.createHmac('sha256', secret).update(b64Payload).digest('hex')

    // 常量时间比对防时序侧信道攻击
    if (signature.length !== expectedSig.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null
    }

    const jsonStr = Buffer.from(b64Payload, 'base64url').toString('utf-8')
    const data = JSON.parse(jsonStr)

    if (!data.exp || data.exp < Date.now()) {
      return null // Token 已过期
    }

    return { username: data.u }
  } catch {
    return null
  }
}

/**
 * 从 HTTP 请求头或 Cookie 中解析当前登录用户
 */
export function getSessionFromRequest(request?: Request): { username: string } | null {
  const config = getAuthConfig()
  if (!config.enabled) {
    return { username: config.username }
  }

  if (!request) return null

  const cookieHeader = request.headers.get('cookie') || ''
  if (!cookieHeader) return null

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`))
  if (!match) return null

  const token = decodeURIComponent(match[1])
  return verifySessionToken(token)
}
