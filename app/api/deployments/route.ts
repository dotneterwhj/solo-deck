import { NextRequest, NextResponse } from 'next/server'
import { getDeployments } from '@/lib/db'
import { pipelineManager } from '@/lib/pipeline-runner'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId') || undefined
    const deployments = await getDeployments(projectId)
    return NextResponse.json(deployments)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, triggerType = 'manual', commitInfo } = body

    if (!projectId) {
      return NextResponse.json({ error: '缺少 projectId 参数' }, { status: 400 })
    }

    const deployment = await pipelineManager.trigger(projectId, triggerType, commitInfo)
    return NextResponse.json(deployment, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
