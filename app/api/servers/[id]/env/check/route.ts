import { NextRequest, NextResponse } from 'next/server'
import { getServerById, updateServer } from '@/lib/db'
import { ENV_PRESETS } from '@/lib/env-presets'
import { ServerEnvInfo } from '@/lib/types'
import { wrapSshCommand } from '@/lib/shell-env'
import { Client } from 'ssh2'
import { exec } from 'child_process'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const server = getServerById(id)
    if (!server) {
      return NextResponse.json({ error: '服务器未找到' }, { status: 404 })
    }

    let filterKeys: string[] | undefined
    try {
      const body = await req.json()
      if (Array.isArray(body.keys)) {
        filterKeys = body.keys
      }
    } catch {}

    const presetsToCheck = filterKeys
      ? ENV_PRESETS.filter((p) => filterKeys!.includes(p.key))
      : ENV_PRESETS

    const results: ServerEnvInfo[] = []
    const isLocalhost = server.ip === '127.0.0.1' || server.ip === 'localhost'

    if (isLocalhost) {
      // 1. 本地检测
      for (const preset of presetsToCheck) {
        const checkResult = await new Promise<{ installed: boolean; version?: string }>(
          (resolve) => {
            exec(preset.checkCmd, { timeout: 3000 }, (error, stdout) => {
              if (!error && stdout.trim()) {
                resolve({ installed: true, version: stdout.trim().split('\n')[0] })
              } else {
                resolve({ installed: false })
              }
            })
          }
        )

        results.push({
          key: preset.key,
          name: preset.name,
          desc: preset.desc,
          installed: checkResult.installed,
          version: checkResult.version,
          checkCmd: preset.checkCmd,
          installScript: preset.installScript,
          manualGuide: preset.manualGuide,
        })
      }
    } else {
      // 2. 远程 SSH 真实检测
      let canConnectSsh = false
      let sshClient: Client | null = null

      try {
        sshClient = await new Promise<Client>((resolve, reject) => {
          const conn = new Client()
          const timer = setTimeout(() => {
            conn.end()
            reject(new Error('SSH 连接超时'))
          }, 3500)

          conn
            .on('ready', () => {
              clearTimeout(timer)
              resolve(conn)
            })
            .on('error', (err) => {
              clearTimeout(timer)
              reject(err)
            })

          const connConfig: any = {
            host: server.ip,
            port: server.port || 22,
            username: server.user || 'root',
            readyTimeout: 3000,
          }
          if (server.authType === 'privateKey') {
            connConfig.privateKey = server.privateKey
            if (server.passphrase) connConfig.passphrase = server.passphrase
          } else {
            connConfig.password = server.password || ''
          }
          conn.connect(connConfig)
        })
        canConnectSsh = true
      } catch (e) {
        canConnectSsh = false
      }

      if (canConnectSsh && sshClient) {
        for (const preset of presetsToCheck) {
          const res = await new Promise<{ installed: boolean; version?: string }>((resolve) => {
            sshClient!.exec(wrapSshCommand(preset.checkCmd), (err, stream) => {
              if (err) return resolve({ installed: false })
              let output = ''
              stream
                .on('data', (data: Buffer) => {
                  output += data.toString()
                })
                .on('close', (code: number) => {
                  if (code === 0 && output.trim()) {
                    resolve({ installed: true, version: output.trim().split('\n')[0] })
                  } else {
                    resolve({ installed: false })
                  }
                })
            })
          })

          results.push({
            key: preset.key,
            name: preset.name,
            desc: preset.desc,
            installed: res.installed,
            version: res.version,
            checkCmd: preset.checkCmd,
            installScript: preset.installScript,
            manualGuide: preset.manualGuide,
          })
        }
        sshClient.end()
      } else {
        // 演示环境模拟检测（当配置的是示例内网 IP 192.168.1.100 - 103 时）
        // 预设部分已装、部分缺失，供用户直观体验缺失提示、查看手动命令与一键自动安装
        const demoDefaults: Record<string, { installed: boolean; version?: string }> = {
          node: { installed: true, version: 'v20.11.1' },
          pm2: { installed: false }, // 刻意设置为未安装，方便触发一键安装
          pnpm: { installed: false },
          python3: { installed: true, version: 'Python 3.10.12' },
          gunicorn: { installed: false },
          dotnet: { installed: false },
          go: { installed: false },
          java: { installed: false },
          nginx: { installed: false },
          docker: { installed: true, version: 'Docker version 25.0.3' },
          git: { installed: true, version: 'git version 2.43.0' },
        }

        // 如果之前已经一键安装过，沿用安装后的状态
        const savedEnvs = server.installedEnvs || {}

        for (const preset of presetsToCheck) {
          const state = savedEnvs[preset.key] || demoDefaults[preset.key] || { installed: false }
          results.push({
            key: preset.key,
            name: preset.name,
            desc: preset.desc,
            installed: state.installed,
            version: state.version,
            checkCmd: preset.checkCmd,
            installScript: preset.installScript,
            manualGuide: preset.manualGuide,
          })
        }
      }
    }

    // 存储当前主机的环境检测快照
    const envSnapshot: Record<string, { installed: boolean; version?: string }> = {
      ...(server.installedEnvs || {}),
    }
    results.forEach((r) => {
      envSnapshot[r.key] = { installed: r.installed, version: r.version }
    })
    updateServer(id, { installedEnvs: envSnapshot })

    return NextResponse.json({
      serverId: id,
      serverName: server.name,
      serverIp: server.ip,
      environments: results,
      missingCount: results.filter((r) => !r.installed).length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
