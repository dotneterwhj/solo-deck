import { NextRequest, NextResponse } from 'next/server'
import { getServers, createServer, maskServerCredentials, createNotification } from '@/lib/db'

export async function GET() {
  try {
    const servers = getServers().map(maskServerCredentials)
    return NextResponse.json(servers)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name || !body.ip) {
      return NextResponse.json(
        { error: '服务器名称和 IP 地址为必填项' },
        { status: 400 }
      )
    }

    const newServer = createServer({
      name: body.name,
      ip: body.ip,
      port: Number(body.port) || 22,
      user: body.user || 'root',
      authType: body.authType || 'password',
      password: body.password || '',
      privateKey: body.privateKey || '',
      passphrase: body.passphrase || '',
      status: 'online',
      lastChecked: '刚刚',
      latencyMs: Math.floor(Math.random() * 20) + 10,
      tags: body.tags || ['通用'],
      description: body.description || '',
    })

    createNotification({
      type: 'server',
      level: 'info',
      title: `新增主机节点: 【${newServer.name}】`,
      message: `已成功添加主机 ${newServer.ip}:${newServer.port} (${newServer.authType === 'privateKey' ? 'SSH私钥认证' : '密码认证'})`,
      metadata: {
        serverId: newServer.id,
        serverName: newServer.name,
        link: 'servers',
      },
    })

    return NextResponse.json(maskServerCredentials(newServer), { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
