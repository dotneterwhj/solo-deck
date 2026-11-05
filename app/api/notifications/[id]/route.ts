import { NextRequest, NextResponse } from 'next/server'
import { markNotificationAsRead, deleteNotification } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const success = await markNotificationAsRead(id)
    if (!success) {
      return NextResponse.json({ error: '未找到指定通知或标记失败' }, { status: 404 })
    }
    return NextResponse.json({ success: true, message: '通知已标记为已读' })
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
    const success = await deleteNotification(id)
    if (!success) {
      return NextResponse.json({ error: '未找到指定通知或删除失败' }, { status: 404 })
    }
    return NextResponse.json({ success: true, message: '通知已删除' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
