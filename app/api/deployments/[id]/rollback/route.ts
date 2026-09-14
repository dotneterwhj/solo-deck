import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentById } from '@/lib/db'
import { pipelineManager } from '@/lib/pipeline-runner'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const targetDeployment = getDeploymentById(id)
    if (!targetDeployment) {
      return NextResponse.json({ error: '目标部署记录不存在' }, { status: 404 })
    }

    const newDeployment = await pipelineManager.trigger(
      targetDeployment.projectId,
      'rollback',
      {
        hash: targetDeployment.commitHash,
        message: `回滚到版本 ${targetDeployment.versionTag || targetDeployment.commitHash || targetDeployment.id} (${targetDeployment.commitMessage || '历史成功版本'})`,
        versionTag: targetDeployment.versionTag,
      }
    )

    return NextResponse.json(newDeployment, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
