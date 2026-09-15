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

    // 设置安全 HttpOnly 会话 Cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (err: any) {
    console.error('Login error:', err)
    return NextResponse.json({ error: '登录处理异常: ' + (err?.message || '未知错误') }, { status: 500 })
  }
}
