import { NextRequest, NextResponse } from 'next/server'
import { reorderServers, getServers, maskServerCredentials } from '@/lib/db'

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { serverIds } = body

    if (!Array.isArray(serverIds) || serverIds.length === 0) {
      return NextResponse.json({ error: 'serverIds 必须为非空数组' }, { status: 400 })
    }

    const updatedServers = reorderServers(serverIds).map(maskServerCredentials)
    return NextResponse.json({ success: true, servers: updatedServers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
