import { NextRequest, NextResponse } from 'next/server'
import {
  getServerById,
  updateServer,
  deleteServer,
  maskServerCredentials,
  createNotification,
} from '@/lib/db'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const server = await getServerById(id)
    if (!server) {
      return NextResponse.json({ error: '服务器未找到' }, { status: 404 })
    }
    return NextResponse.json(maskServerCredentials(server))
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
    const updated = await updateServer(id, body)
    if (!updated) {
      return NextResponse.json({ error: '服务器未找到' }, { status: 404 })
    }

    await createNotification({
      type: 'server',
      level: 'info',
      title: `主机配置已变更: 【${updated.name}】`,
      message: `主机节点 ${updated.ip}:${updated.port} 配置已更新完成`,
      metadata: {
        serverId: updated.id,
        serverName: updated.name,
        link: 'servers',
      },
    })

    return NextResponse.json(maskServerCredentials(updated))
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
    const existing = await getServerById(id)
    const serverName = existing?.name || id
    const serverIp = existing?.ip || ''

    const ok = await deleteServer(id)
    if (!ok) {
      return NextResponse.json({ error: '服务器未找到或删除失败' }, { status: 404 })
    }

    await createNotification({
      type: 'server',
      level: 'warning',
      title: `主机节点已移除`,
      message: `主机【${serverName}】${serverIp ? `(${serverIp}) ` : ''}已被系统移除。`,
      metadata: {
        serverId: id,
        serverName,
        link: 'servers',
      },
    })

    return NextResponse.json({ success: true, message: '服务器已删除' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

