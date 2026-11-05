import { NextRequest, NextResponse } from 'next/server'
import { reorderProjects, updateProject, getProjects } from '@/lib/db'

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectIds, moveProject } = body

    // 如果包含跨主机迁移或者目标主机更新
    if (moveProject && moveProject.projectId) {
      await updateProject(moveProject.projectId, {
        serverId: moveProject.serverId,
        serverName: moveProject.serverName,
        serverIp: moveProject.serverIp,
        serverTags: moveProject.serverTags,
      })
    }

    let updatedProjects = await getProjects()
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      updatedProjects = await reorderProjects(projectIds)
    }

    return NextResponse.json({ success: true, projects: updatedProjects })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
