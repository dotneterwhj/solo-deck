import { NextRequest, NextResponse } from 'next/server'
import { getServerById, updateServer, deleteServer } from '@/lib/db'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const server = getServerById(id)
    if (!server) {
      return NextResponse.json({ error: '服务器未找到' }, { status: 404 })
    }
    return NextResponse.json(server)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await req.json()
    const updated = updateServer(id, body)
    if (!updated) {
      return NextResponse.json({ error: '服务器未找到' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const ok = deleteServer(id)
    if (!ok) {
      return NextResponse.json({ error: '服务器未找到或删除失败' }, { status: 404 })
    }
    return NextResponse.json({ success: true, message: '服务器已删除' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
