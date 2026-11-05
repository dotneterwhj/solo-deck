import { NextRequest, NextResponse } from 'next/server'
import { getProjectById, createProject, createNotification } from '@/lib/db'
import { validateProjectName } from '@/lib/validators'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceProject = await getProjectById(id)

    if (!sourceProject) {
      return NextResponse.json({ error: '指定的源项目不存在，无法克隆' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))

    const targetName = body.name !== undefined ? body.name : `${sourceProject.name}-copy`
    const nameValidation = validateProjectName(targetName)
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.error }, { status: 400 })
    }

    let newServerPort: number[] = []
    if (Array.isArray(body.serverPort)) {
      newServerPort = body.serverPort.map(Number).filter((p: number) => !isNaN(p) && p > 0)
    } else if (typeof body.serverPort === 'string' && body.serverPort.trim()) {
      newServerPort = body.serverPort.split(/[,，\s]+/).map(Number).filter((p: number) => !isNaN(p) && p > 0)
    } else if (body.port) {
      newServerPort = [Number(body.port)]
    } else if (sourceProject.serverPort && sourceProject.serverPort.length > 0) {
      newServerPort = [...sourceProject.serverPort]
    } else {
      newServerPort = [3000]
    }
    if (newServerPort.length === 0) newServerPort = [3000]
    const primaryPort = newServerPort[0] || 3000
    const sourcePrimaryPort = sourceProject.serverPort?.[0] || 3000

    // 如果健康探针 URL 包含源项目的端口，智能自动适配替换为新项目的端口
    let newHealthCheckUrl = body.healthCheckUrl
    if (newHealthCheckUrl === undefined) {
      if (sourceProject.healthCheckUrl) {
        newHealthCheckUrl = sourceProject.healthCheckUrl.replace(
          new RegExp(`:${sourcePrimaryPort}(/|$)`),
          `:${primaryPort}$1`
        )
      } else {
        newHealthCheckUrl = ''
      }
    }

    const cloned = await createProject({
      name: targetName,
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
      serverPort: newServerPort,
      containerPort: body.containerPort || sourceProject.containerPort || newServerPort,
      portMappings: body.portMappings || (newServerPort.map((sp, idx) => ({
        host: sp,
        container: (sourceProject.containerPort && sourceProject.containerPort[idx]) || (sourceProject.portMappings && sourceProject.portMappings[idx]?.container) || sp,
      }))),
      deployPath: body.deployPath?.trim() || sourceProject.deployPath || '/opt/app',
      installCommand: body.installCommand || sourceProject.installCommand || '',
      buildCommand: body.buildCommand || sourceProject.buildCommand || '',
      startCommand: body.startCommand || sourceProject.startCommand || '',
      healthCheckUrl: newHealthCheckUrl,
      envVars: body.envVars ? JSON.parse(JSON.stringify(body.envVars)) : (sourceProject.envVars ? JSON.parse(JSON.stringify(sourceProject.envVars)) : []),
      runnerMode: body.runnerMode || sourceProject.runnerMode || 'simulation',
      artifactType: sourceProject.artifactType || 'auto',
      dockerDeliveryMode: sourceProject.dockerDeliveryMode || 'auto',
      dockerBuildArgs: body.dockerBuildArgs || (sourceProject.dockerBuildArgs ? JSON.parse(JSON.stringify(sourceProject.dockerBuildArgs)) : []),
      dockerRegistry: sourceProject.dockerRegistry ? { ...sourceProject.dockerRegistry } : undefined,
      lastDeployed: '未部署',
    })

    await createNotification({
      type: 'project',
      level: 'info',
      title: `项目流水线克隆成功: 【${cloned.name}】`,
      message: `已由【${sourceProject.name}】成功克隆新项目，目标端口 ${cloned.serverPort.map((p) => `:${p}`).join(' ')}，部署主机: ${cloned.serverName}。`,
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
