import { NextRequest, NextResponse } from 'next/server'
import {
  getNotifications,
  createNotification,
  markAllNotificationsAsRead,
  clearAllNotifications,
} from '@/lib/db'
import { NotificationType } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limitParam = searchParams.get('limit')
    const unreadOnlyParam = searchParams.get('unreadOnly')
    const typeParam = searchParams.get('type')

    const limit = limitParam ? parseInt(limitParam, 10) : 100
    const unreadOnly = unreadOnlyParam === 'true'
    const type = typeParam ? (typeParam as NotificationType) : undefined

    const data = await getNotifications({ limit, unreadOnly, type })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.title || !body.message) {
      return NextResponse.json({ error: '标题与内容为必填项' }, { status: 400 })
    }

    const notif = await createNotification({
      type: body.type || 'system',
      level: body.level || 'info',
      title: body.title,
      message: body.message,
      read: Boolean(body.read),
      metadata: body.metadata,
    })

    return NextResponse.json(notif, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'mark_all_read') {
      await markAllNotificationsAsRead()
      return NextResponse.json({ success: true, message: '已将所有通知标记为已读' })
    }
    return NextResponse.json({ error: '无效的操作指令' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await clearAllNotifications()
    return NextResponse.json({ success: true, message: '已清空所有系统通知' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
