import { NextRequest, NextResponse } from 'next/server'
import { getProjects, createProject } from '@/lib/db'

export async function GET() {
  try {
    const projects = getProjects()
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

    const newProject = createProject({
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
      port: Number(body.port) || 3000,
      deployPath: body.deployPath || '/opt/app',
      installCommand: body.installCommand || 'npm install',
      buildCommand: body.buildCommand || 'npm run build',
      startCommand: body.startCommand || 'npm start',
      healthCheckUrl: body.healthCheckUrl || '',
      envVars: body.envVars || [],
      runnerMode: body.runnerMode || 'simulation',
      artifactType: body.artifactType || 'auto',
      dockerDeliveryMode: body.dockerDeliveryMode || 'auto',
      dockerRegistry: body.dockerRegistry || undefined,
      lastDeployed: '未部署',
    })

    return NextResponse.json(newProject, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
