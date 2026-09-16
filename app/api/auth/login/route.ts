import { NextRequest, NextResponse } from 'next/server'
import { verifyCredentials, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password, rememberMe } = body

    if (!username || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 })
    }

    const isValid = verifyCredentials(username, password)
    if (!isValid) {
      return NextResponse.json({ error: '账号或密码错误，请核对后重试' }, { status: 401 })
    }

    const { token, maxAgeSeconds } = createSessionToken(username, rememberMe !== false)

    const response = NextResponse.json({
      ok: true,
      user: { username },
    })

    // 动态检测协议：支持直连 HTTPS 或 Nginx 反代 (X-Forwarded-Proto)，避免 HTTP 协议（如云服务器直接 IP:端口访问）下 Cookie 被浏览器丢弃
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const isHttps =
      process.env.AUTH_COOKIE_SECURE !== undefined
        ? process.env.AUTH_COOKIE_SECURE === 'true'
        : req.nextUrl.protocol === 'https:' || forwardedProto === 'https'

    // 设置安全 HttpOnly 会话 Cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      secure: isHttps,
    })

    return response
  } catch (err: any) {
    console.error('Login error:', err)
    return NextResponse.json({ error: '登录处理异常: ' + (err?.message || '未知错误') }, { status: 500 })
  }
}
