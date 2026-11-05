import { NextRequest, NextResponse } from 'next/server'
import { getProjects, createProject } from '@/lib/db'
import { validateProjectName } from '@/lib/validators'

export async function GET() {
  try {
    const projects = await getProjects()
    return NextResponse.json(projects)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name || !body.repository) {
      return NextResponse.json(
        { error: '项目名称和仓库地址为必填项' },
        { status: 400 }
      )
    }

    const nameValidation = validateProjectName(body.name)
    if (!nameValidation.valid) {
      return NextResponse.json(
        { error: nameValidation.error },
        { status: 400 }
      )
    }

    let serverPort: number[] = []
    if (Array.isArray(body.serverPort)) {
      serverPort = body.serverPort.map(Number).filter((p: number) => !isNaN(p) && p > 0)
    } else if (typeof body.serverPort === 'string' && body.serverPort.trim()) {
      serverPort = body.serverPort.split(/[,，\s]+/).map(Number).filter((p: number) => !isNaN(p) && p > 0)
    } else if (typeof body.serverPort === 'number') {
      serverPort = [body.serverPort]
    } else if (body.port) {
      serverPort = [Number(body.port)]
    }
    let containerPort: number[] | undefined = undefined
    if (Array.isArray(body.containerPort)) {
      containerPort = body.containerPort.map(Number).filter((p: number) => !isNaN(p) && p > 0)
    }

    let portMappings: any[] | undefined = undefined
    if (Array.isArray(body.portMappings)) {
      portMappings = body.portMappings
        .map((m: any) => ({ host: Number(m.host), container: Number(m.container) }))
        .filter((m: any) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
    }

    const newProject = await createProject({
      name: body.name,
      description: body.description || '',
      repository: body.repository,
      branch: body.branch || 'main',
      gitUsername: body.gitUsername || '',
      gitToken: body.gitToken || '',
      runtime: body.runtime || 'Node.js',
      deployTargetMode: body.deployTargetMode || 'docker',
      status: 'stopped',
      serverId: body.serverId || '',
      serverIp: body.serverIp || '127.0.0.1',
      serverName: body.serverName || '默认服务器',
      serverPort,
      containerPort,
      portMappings,
      deployPath: body.deployPath || '/opt/app',
      installCommand: body.installCommand || 'npm install',
      buildCommand: body.buildCommand || 'npm run build',
      startCommand: body.startCommand || 'npm start',
      healthCheckUrl: body.healthCheckUrl || '',
      envVars: body.envVars || [],
      runnerMode: body.runnerMode || 'simulation',
      artifactType: body.artifactType || 'auto',
      dockerDeliveryMode: body.dockerDeliveryMode || 'auto',
      dockerBuildArgs: body.dockerBuildArgs || [],
      dockerRegistry: body.dockerRegistry || undefined,
      lastDeployed: '未部署',
    })

    return NextResponse.json(newProject, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
