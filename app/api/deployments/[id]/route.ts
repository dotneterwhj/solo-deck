import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentById } from '@/lib/db'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const deployment = getDeploymentById(id)
    if (!deployment) {
      return NextResponse.json({ error: '部署记录未找到' }, { status: 404 })
    }
    return NextResponse.json(deployment)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
