import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { BaseCarrier } from './base'
import { CarrierContext, CarrierSimulateContext } from './types'
import { wrapSshCommand } from '../shell-env'
import { getRuntime } from '../runtimes'
import { resolvePath } from '../cleanup-service'

/**
 * 将工作空间构建产物打包为 tar.gz 归档文件（自动排除 .git 源码元数据）
 */
export function packageTarArtifact(workspaceDir: string, archivePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parentDir = path.dirname(archivePath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }
    // 使用系统内置 tar (Windows 10+ 与 Linux 均原生内置)
    const tarProcess = spawn('tar', ['-czf', archivePath, '--exclude=.git', '.'], {
      cwd: workspaceDir,
    })

    tarProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`产物打包失败，tar 进程退出码: ${code}`))
      }
    })
    tarProcess.on('error', (err) => {
      reject(new Error(`产物打包执行异常: ${err.message}`))
    })
  })
}

/**
 * 原生宿主机进程交付载体驱动 (NativeCarrier)
 * 支持原生编译、tar.gz 归档压缩、SFTP 直传、远程目录同步解压与系统守护进程(PM2/Gunicorn/Systemd等)生命周期调度
 */
export class NativeCarrier extends BaseCarrier {
  readonly mode = 'native'
  readonly name = '原生宿主机进程'

  /**
   * 代码检出后准备：输出原生环境与进程管理说明
   */
  async onAfterCheckout(ctx: CarrierContext): Promise<void> {
    const { project, log } = ctx
    const runtimePlugin = getRuntime(project.runtime)
    log(`[00:03] 【目标载体】原生宿主机进程部署模式 (Native)`, 'info', 'GIT_CLONE')
    const procManager = runtimePlugin?.nativeProcessManager || '原生系统进程'
    log(`[00:03] 语言运行时: ${project.runtime || runtimePlugin?.name || '通用原生'} | 启动管理: ${procManager}`, 'info', 'GIT_CLONE')
  }

  /**
   * 执行原生应用编译构建
   */
  async executeBuild(ctx: CarrierContext): Promise<void> {
    const { project, workspaceDir, log, setStatus, spawnShell } = ctx
    if (!project.buildCommand || !project.buildCommand.trim()) {
      return
    }

    setStatus('running', '应用构建')
    log(`[00:06] 原生宿主机构建: 执行应用构建命令`, 'info', 'BUILD')
    log(`[00:07] 执行应用构建命令: ${project.buildCommand}`, 'info', 'BUILD')

    const envMap: Record<string, string> = {}
    if (project.envVars && project.envVars.length > 0) {
      project.envVars.forEach((ev) => {
        envMap[ev.key] = ev.value
      })
      log(`[00:07] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
    }

    const buildExit = await spawnShell(
      project.buildCommand,
      workspaceDir,
      envMap
    )

    if (ctx.signal.aborted) return
    if (buildExit !== 0) {
      throw new Error(`应用构建失败 (退出码: ${buildExit})`)
    }
    log(`[00:10] ✓ 应用构建成功完成`, 'success', 'BUILD')
  }

  /**
   * 本地宿主机进程启动调度
   */
  async deployLocal(ctx: CarrierContext): Promise<void> {
    const { project, workspaceDir, log, spawnShell } = ctx
    if (!project.startCommand || !project.startCommand.trim()) {
      return
    }

    const defaultPort = (project.serverPort && project.serverPort[0]) || 3000
    const envMap: Record<string, string> = {
      ...process.env,
      PORT: String(defaultPort),
    }

    if (project.envVars && project.envVars.length > 0) {
      project.envVars.forEach((ev) => {
        envMap[ev.key] = ev.value
      })
      try {
        const targetDir = resolvePath(project.deployPath || workspaceDir)
        if (fs.existsSync(/*turbopackIgnore: true*/ targetDir)) {
          const envLines = [
            `PORT=${defaultPort}`,
            ...(project.envVars || []).map((e) => `${e.key}=${e.value}`),
          ]
          fs.writeFileSync(path.join(targetDir, '.env'), envLines.join('\n'), 'utf-8')
        }
      } catch {}
    }

    log(`[00:11] 目标为本机节点 (127.0.0.1)，按系统配置环境变量并派发启动进程: ${project.startCommand}`, 'info', 'DEPLOY')
    const startExit = await spawnShell(
      project.startCommand,
      workspaceDir,
      envMap
    )

    if (startExit !== 0) {
      throw new Error(`原生服务启动命令返回错误码: ${startExit}`)
    }
  }

  /**
   * 远程主机原生交付：tar.gz 归档、SFTP 上传、解压覆盖、注入 .env 与拉起进程
   */
  async deployRemote(ctx: CarrierContext): Promise<void> {
    const { project, deployment, server, sshConn, workspaceDir, log, setStatus, signal } = ctx
    if (!server || !sshConn) {
      throw new Error(`未提供有效的远程主机或 SSH 客户端连接`)
    }

    const artifactDir = path.join(process.cwd(), '.cicd_artifacts', project.id)
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true })
    }

    const archiveName = `${deployment.id}_app.tar.gz`
    const localArchivePath = path.join(artifactDir, archiveName)

    setStatus('running', '产物打包')
    log(`[00:11] 识别为【原生宿主机部署模式 (Native)】，正在通过 [tar] 打包应用产物 (排除 .git)...`, 'info', 'TAR_PACKAGE')
    await packageTarArtifact(workspaceDir, localArchivePath)

    const stat = fs.statSync(localArchivePath)
    const sizeStr =
      stat.size > 1024 * 1024
        ? `${(stat.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(stat.size / 1024).toFixed(1)} KB`
    log(`[00:12] ✓ 原生产物打包完成: ${archiveName} (${sizeStr})`, 'success', 'TAR_PACKAGE')

    if (signal.aborted) {
      throw new Error('部署已手动中止')
    }

    // SFTP 远程分发
    setStatus('running', '产物分发')
    log(`[00:12] 正在建立 SFTP 文件传输会话，准备分发产物至 ${server.ip}...`, 'info', 'TAR_TRANSFER')

    const sftp = await new Promise<any>((resolveSftp, rejectSftp) => {
      sshConn.sftp((err, sftpSession) => {
        if (err) return rejectSftp(new Error(`SFTP 会话建立失败: ${err.message}`))
        resolveSftp(sftpSession)
      })
    })

    const remoteTempArchive = `/tmp/cicd_deploy_${deployment.id}.tar.gz`
    log(`[00:13] 正在通过 SFTP 安全通道上传产物至目标主机临时目录: ${remoteTempArchive}...`, 'info', 'TAR_TRANSFER')

    await new Promise<void>((resolvePut, rejectPut) => {
      sftp.fastPut(localArchivePath, remoteTempArchive, (putErr: any) => {
        if (putErr) return rejectPut(new Error(`SFTP 产物传输中断: ${putErr.message}`))
        resolvePut()
      })
    })
    log(`[00:13] ✓ SFTP 产物上传完成，正在远程解压同步至部署目录: ${project.deployPath}...`, 'success', 'TAR_TRANSFER')

    if (signal.aborted) {
      throw new Error('部署已手动中止')
    }

    // 目标服务器解压与目录同步
    setStatus('running', '解压部署')
    const unpackCmd = `mkdir -p "${project.deployPath}" && tar -xzf "${remoteTempArchive}" -C "${project.deployPath}" && rm -f "${remoteTempArchive}"`

    await new Promise<void>((resolveUnpack, rejectUnpack) => {
      sshConn.exec(wrapSshCommand(unpackCmd), (err, stream) => {
        if (err) return rejectUnpack(err)
        let remoteErr = ''
        stream.stderr.on('data', (d: Buffer) => {
          remoteErr += d.toString()
        })
        stream.resume()
        stream.on('close', (code: number) => {
          if (code === 0) {
            resolveUnpack()
          } else {
            if (remoteErr.includes('Permission denied')) {
              rejectUnpack(
                new Error(
                  `目标服务器部署路径创建或解压失败 (权限不足): ${remoteErr.trim()}。\n提示：当前 SSH 登录用户【${server.user}】对该目录无写权限，建议将部署路径设置为用户家目录下（例如 ~/apps/${project.name}），或提前在服务器执行 sudo chown 为其授权。`
                )
              )
            } else {
              rejectUnpack(new Error(`远程产物解压部署返回退出码 ${code}: ${remoteErr.trim() || '未知异常'}`))
            }
          }
        })
      })
    })

    log(`[00:14] ✓ 原生产物已成功在远程主机就绪，目标部署目录同步完成`, 'success', 'TAR_UNPACK')

    if (signal.aborted) {
      throw new Error('部署已手动中止')
    }

    // 原生服务进程启动 / 重载
    if (project.startCommand && project.startCommand.trim()) {
      setStatus('running', '服务启动')
      const defaultPort = (project.serverPort && project.serverPort[0]) || 3000
      let envPrefix = `export PORT=${defaultPort}`
      if (project.envVars && project.envVars.length > 0) {
        const envExports = project.envVars
          .map((e) => `export ${e.key}="${(e.value || '').replace(/"/g, '\\"')}"`)
          .join(' && ')
        envPrefix += ` && ${envExports}`

        // 将系统环境变量写入目标部署目录下的 .env 配置文件
        if (project.deployPath) {
          const envFileLines = [
            `PORT=${defaultPort}`,
            ...project.envVars.map((e) => `${e.key}=${e.value}`),
          ]
          const writeEnvCmd = `cat << 'ENV_EOF' > "${project.deployPath}/.env"\n${envFileLines.join('\n')}\nENV_EOF`
          await new Promise<void>((resolveEnv) => {
            sshConn.exec(wrapSshCommand(writeEnvCmd), () => resolveEnv())
          })
        }
      }
      const remoteStartCmd = `cd "${project.deployPath}" && ${envPrefix} && ${project.startCommand}`
      log(`[00:15] 原生模式已按系统配置环境变量 (注入 export 与写入 .env 配置文件)`, 'info', 'STARTUP')
      log(`[00:15] 远程主机目标目录执行原生启动指令: ${project.startCommand}`, 'info', 'STARTUP')

      await new Promise<void>((resolveStart, rejectStart) => {
        sshConn.exec(wrapSshCommand(remoteStartCmd), (err, stream) => {
          if (err) return rejectStart(err)

          stream
            .on('close', (code: number) => {
              if (code === 0) {
                resolveStart()
              } else {
                rejectStart(new Error(`远程原生服务启动命令返回退出码: ${code}`))
              }
            })
            .on('data', (data: Buffer) => {
              const text = data.toString('utf-8').trim()
              if (text) {
                text.split('\n').forEach((line) => log(`[remote] ${line}`, 'info', 'STARTUP'))
              }
            })
            .stderr.on('data', (data: Buffer) => {
              const text = data.toString('utf-8').trim()
              if (text) {
                text.split('\n').forEach((line) => log(`[remote-err] ${line}`, 'warning', 'STARTUP'))
              }
            })
        })
      })

      log(`[00:16] ✓ 原生服务启动命令执行完毕`, 'success', 'STARTUP')
    } else {
      log(`[00:14] 未配置启动命令，原生产物远程解压即为部署完成`, 'info', 'STARTUP')
    }

    // 清理本地临时打包归档
    try {
      if (fs.existsSync(localArchivePath)) {
        fs.unlinkSync(localArchivePath)
      }
    } catch {}
  }

  /**
   * 沙箱模拟执行：检出后输出原生提示
   */
  async simulateAfterCheckout(ctx: CarrierSimulateContext): Promise<void> {
    const { project, log } = ctx
    const plugin = getRuntime(project.runtime)
    log(
      `[00:02] 【原生部署模式 (Native)】目标载体: 宿主机系统进程 (技术栈: ${project.runtime || plugin?.name || '通用原生'} | 托管方式: ${plugin?.nativeProcessManager || '原生进程'})`,
      'info',
      'GIT_CLONE'
    )
  }

  /**
   * 沙箱模拟执行：模拟原生编译
   */
  async simulateBuild(ctx: CarrierSimulateContext): Promise<void> {
    const { project, log, sleep } = ctx
    log(`[00:05] 开始执行原生应用编译构建: ${project.buildCommand || 'npm run build'}`, 'info', 'BUILD')
    if (project.envVars && project.envVars.length > 0) {
      log(`[00:06] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
    }
    await sleep(2000)
    log(`[00:07] ✓ 原生应用编译产物构建就绪 (产物大小约 4.8MB)`, 'success', 'BUILD')
  }

  /**
   * 沙箱模拟执行：模拟 tar 打包、SFTP 上传、解压
   */
  async simulateDeploy(ctx: CarrierSimulateContext): Promise<void> {
    const { project, log, setStatus, sleep } = ctx
    setStatus('running', '产物打包')
    log(`[00:08] 【原生模式】执行 [tar] 打包应用构建交付产物 (排除 .git)...`, 'info', 'TAR_PACKAGE')
    await sleep(1200)
    setStatus('running', '产物分发')
    log(`[00:09] 正在通过 SFTP 同步构建产物至目标主机 ${project.serverIp}:${project.deployPath}...`, 'info', 'TAR_TRANSFER')
    await sleep(1400)
    setStatus('running', '解压部署')
    log(`[00:10] ✓ 目标主机已解压产物至部署目录: ${project.deployPath}`, 'success', 'TAR_UNPACK')
  }

  /**
   * 沙箱模拟执行：模拟原生服务进程拉起
   */
  async simulateStart(ctx: CarrierSimulateContext): Promise<void> {
    const { project, log, sleep } = ctx
    const plugin = getRuntime(project.runtime)
    const procManager = plugin?.nativeProcessManager || '原生系统进程'
    if (project.envVars && project.envVars.length > 0) {
      log(`[00:10] 原生模式: 已按系统配置环境变量 (export 与 .env): ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
    }
    log(`[00:10] SSH 远程执行原生启动指令: ${project.startCommand || 'npm start'}`, 'info', 'STARTUP')
    await sleep(1400)
    const portsDisplay = this.formatPortsDisplay(project)
    log(`[00:11] ✓ 原生服务进程重载成功 (${procManager}已托管)，监听端口 ${portsDisplay}`, 'success', 'STARTUP')
  }
}
