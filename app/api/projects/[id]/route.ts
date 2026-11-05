import { NextRequest, NextResponse } from 'next/server'
import { getProjectById, updateProject, deleteProject } from '@/lib/db'
import { validateProjectName } from '@/lib/validators'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const project = await getProjectById(id)
    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }
    return NextResponse.json(project)
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

    if (body.name !== undefined) {
      const nameValidation = validateProjectName(body.name)
      if (!nameValidation.valid) {
        return NextResponse.json(
          { error: nameValidation.error },
          { status: 400 }
        )
      }
    }

    const updated = await updateProject(id, body)
    if (!updated) {
      return NextResponse.json({ error: '项目未找到' }, { status: 404 })
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
    const ok = await deleteProject(id)
    if (!ok) {
      return NextResponse.json({ error: '项目未找到或删除失败' }, { status: 404 })
    }
    return NextResponse.json({ success: true, message: '项目已删除' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
