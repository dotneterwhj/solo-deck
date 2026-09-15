import { NextRequest, NextResponse } from 'next/server'
import { getProjectById, createProject, createNotification } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceProject = getProjectById(id)

    if (!sourceProject) {
      return NextResponse.json({ error: '指定的源项目不存在，无法克隆' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))

    const newPort = Number(body.port) || sourceProject.port || 3000

    // 如果健康探针 URL 包含源项目的端口，智能自动适配替换为新项目的端口
    let newHealthCheckUrl = body.healthCheckUrl
    if (newHealthCheckUrl === undefined) {
      if (sourceProject.healthCheckUrl) {
        newHealthCheckUrl = sourceProject.healthCheckUrl.replace(
          new RegExp(`:${sourceProject.port}(/|$)`),
          `:${newPort}$1`
        )
      } else {
        newHealthCheckUrl = ''
      }
    }

    const cloned = createProject({
      name: body.name?.trim() || `${sourceProject.name}-copy`,
      description:
        body.description !== undefined
          ? body.description
          : `克隆自 ${sourceProject.name}，部署至 ${body.serverName || sourceProject.serverName}`,
      repository: sourceProject.repository,
      branch: body.branch?.trim() || sourceProject.branch || 'main',
      gitUsername: sourceProject.gitUsername || '',
      gitToken: sourceProject.gitToken || '',
      runtime: sourceProject.runtime,
      deployTargetMode: body.deployTargetMode || sourceProject.deployTargetMode || 'docker',
      status: 'stopped',
      serverId: body.serverId || sourceProject.serverId || '',
      serverIp: body.serverIp || sourceProject.serverIp || '127.0.0.1',
      serverName: body.serverName || sourceProject.serverName || '目标主机',
      serverTags: body.serverTags || sourceProject.serverTags || [],
      port: newPort,
      deployPath: body.deployPath?.trim() || sourceProject.deployPath || '/opt/app',
      installCommand: body.installCommand || sourceProject.installCommand || '',
      buildCommand: body.buildCommand || sourceProject.buildCommand || '',
      startCommand: body.startCommand || sourceProject.startCommand || '',
      healthCheckUrl: newHealthCheckUrl,
      envVars: body.envVars ? JSON.parse(JSON.stringify(body.envVars)) : (sourceProject.envVars ? JSON.parse(JSON.stringify(sourceProject.envVars)) : []),
      runnerMode: body.runnerMode || sourceProject.runnerMode || 'simulation',
      artifactType: sourceProject.artifactType || 'auto',
      dockerDeliveryMode: sourceProject.dockerDeliveryMode || 'auto',
      dockerRegistry: sourceProject.dockerRegistry ? { ...sourceProject.dockerRegistry } : undefined,
      lastDeployed: '未部署',
    })

    createNotification({
      type: 'project',
      level: 'info',
      title: `项目流水线克隆成功: 【${cloned.name}】`,
      message: `已由【${sourceProject.name}】成功克隆新项目，目标端口 :${newPort}，部署主机: ${cloned.serverName}。`,
      metadata: {
        projectId: cloned.id,
        projectName: cloned.name,
        link: 'project',
      },
    })

    return NextResponse.json(cloned, { status: 201 })
  } catch (err: any) {
    console.error('Clone project error:', err)
    return NextResponse.json({ error: '克隆项目失败: ' + (err?.message || '未知错误') }, { status: 500 })
  }
}
