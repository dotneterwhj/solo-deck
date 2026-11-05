import { NextRequest, NextResponse } from 'next/server'
import { getProjectById } from '@/lib/db'
import { checkProjectHealth } from '@/lib/health-checker'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const project = await getProjectById(id)
    if (!project) {
      return NextResponse.json({ error: '项目未找到' }, { status: 404 })
    }

    const result = await checkProjectHealth(project)
    return NextResponse.json({
      success: true,
      result,
      project: await getProjectById(id),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const project = await getProjectById(id)
    if (!project) {
      return NextResponse.json({ error: '项目未找到' }, { status: 404 })
    }

    const result = await checkProjectHealth(project)
    return NextResponse.json({
      success: true,
      result,
      project: await getProjectById(id),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
