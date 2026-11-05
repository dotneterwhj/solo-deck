import { NextRequest, NextResponse } from 'next/server'
import { getProjectById } from '@/lib/db'
import { pipelineManager } from '@/lib/pipeline-runner'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params
    const project = await getProjectById(projectId)
    if (!project) {
      return NextResponse.json({ error: '项目未找到' }, { status: 404 })
    }

    let payload: any = {}
    try {
      payload = await req.json()
    } catch {
      // payload might be form-urlencoded or empty
    }

    // Extract Git commit info if standard GitHub/GitLab payload
    const commitHash =
      payload?.after?.substring(0, 7) ||
      payload?.head_commit?.id?.substring(0, 7) ||
      Math.random().toString(16).substring(2, 9)

    const commitMessage =
      payload?.head_commit?.message ||
      payload?.commits?.[0]?.message ||
      `Git Webhook 触发部署 (分支: ${project.branch})`

    const deployment = await pipelineManager.trigger(projectId, 'webhook', {
      hash: commitHash,
      message: commitMessage,
    })

    return NextResponse.json({
      success: true,
      message: 'Webhook 触发流水线成功',
      deploymentId: deployment.id,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
