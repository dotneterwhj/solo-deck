import { NextRequest, NextResponse } from 'next/server'
import { getAuthConfig, getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const config = getAuthConfig()

  if (!config.enabled) {
    return NextResponse.json({
      enabled: false,
      authenticated: true,
      user: { username: config.username },
      platformTitle: config.platformTitle,
    })
  }

  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({
      enabled: true,
      authenticated: false,
      user: null,
      platformTitle: config.platformTitle,
    })
  }

  return NextResponse.json({
    enabled: true,
    authenticated: true,
    user: { username: session.username },
    platformTitle: config.platformTitle,
  })
}
