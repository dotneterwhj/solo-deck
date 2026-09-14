import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { pipeline } from 'stream'
import { spawn } from 'child_process'
import { Client } from 'ssh2'
import {
  Project,
  ServerNode,
  DeploymentStatus,
  DeployLogEntry,
  SystemSettings,
  DockerDeliveryMode,
  DockerRegistryConfig,
} from './types'
import { wrapSshCommand } from './shell-env'

export interface DockerDistributeContext {
  isSimulation: boolean
  project: Project
  deploymentId: string
  imageTag: string
  versionTag?: string
  server: ServerNode
  sshConn?: Client | null
  signal: AbortSignal
  log: (text: string, type?: DeployLogEntry['type'], step?: string) => void
  setStatus: (status: DeploymentStatus, step: string) => void
  settings?: SystemSettings
  workspaceDir?: string
}

export interface DockerDistributeResult {
  finalImageTag: string
  modeUsed: 'save_load' | 'registry'
  details?: Record<string, any>
}

export interface IDockerDistributor {
  readonly mode: 'save_load' | 'registry'
  distribute(ctx: DockerDistributeContext): Promise<DockerDistributeResult>
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Operation aborted'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Operation aborted'))
      },
      { once: true }
    )
  })
}

// -------------------------------------------------------------
// 本地与远程底层执行辅助函数
// -------------------------------------------------------------
function runLocalCommand(
  cmd: string,
  log: (text: string, type?: DeployLogEntry['type'], step?: string) => void,
  signal: AbortSignal,
  step: string,
  stdinInput?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32'
    const proc = spawn(
      isWindows ? 'cmd.exe' : 'sh',
      [isWindows ? '/c' : '-c', cmd],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )

    if (stdinInput) {
      proc.stdin.write(stdinInput + '\n')
      proc.stdin.end()
    }

    proc.stdout.on('data', (d: Buffer) => {
      const text = d.toString('utf-8').trim()
      if (text) {
        text.split('\n').forEach((l) => log(`[local] ${l}`, 'info', step))
      }
    })

    let stderrOutput = ''
    proc.stderr.on('data', (d: Buffer) => {
      const text = d.toString('utf-8').trim()
      if (text) {
        stderrOutput += text + '\n'
        text.split('\n').forEach((l) => log(`[local-err] ${l}`, 'warning', step))
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`本地执行命令失败 (退出码 ${code}): ${stderrOutput || '未知错误'}`))
      }
    })

    signal.addEventListener(
      'abort',
      () => {
        try {
          proc.kill()
        } catch {}
        reject(new Error('部署已手动中止'))
      },
      { once: true }
    )
  })
}

function runLocalCommandSilently(cmd: string): Promise<void> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const proc = spawn(isWindows ? 'cmd.exe' : 'sh', [isWindows ? '/c' : '-c', cmd], {
      stdio: 'ignore',
    })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

function runRemoteCommand(
  sshConn: Client,
  cmd: string,
  log: (text: string, type?: DeployLogEntry['type'], step?: string) => void,
  step: string,
  user: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    sshConn.exec(wrapSshCommand(cmd), (err, stream) => {
      if (err) return reject(err)
      let remoteErr = ''
      let capturedExitCode: number | null | undefined = undefined
      stream.on('exit', (c: any) => {
        if (typeof c === 'number') capturedExitCode = c
      })
      stream.on('data', (d: Buffer) => {
        const text = d.toString('utf-8').trim()
        if (text) {
          text.split('\n').forEach((line) => log(`[remote] ${line}`, 'info', step))
        }
      })
      stream.stderr.on('data', (d: Buffer) => {
        remoteErr += d.toString()
      })
      stream.on('close', (code: number) => {
        const finalCode = typeof code === 'number' ? code : (typeof capturedExitCode === 'number' ? capturedExitCode : undefined)
        if (finalCode === 0 || (finalCode === undefined && !remoteErr.trim())) {
          resolve()
        } else {
          if (remoteErr.includes('permission denied') || remoteErr.includes('docker daemon')) {
            reject(
              new Error(
                `目标主机 Docker 操作权限不足: ${remoteErr.trim()}。\n提示：当前登录账户【${user}】无权访问 Docker 守护进程，请在服务器执行: sudo usermod -aG docker ${user}`
              )
            )
          } else {
            reject(new Error(`远程执行命令失败 (退出码 ${finalCode ?? '未知'}): ${remoteErr.trim() || '未知异常'}`))
          }
        }
      })
    })
  })
}

// -------------------------------------------------------------
// 策略一：Docker Save / Load (直连/离线传输模式)
// -------------------------------------------------------------
export class DockerSaveLoadDistributor implements IDockerDistributor {
  readonly mode = 'save_load' as const

  async distribute(ctx: DockerDistributeContext): Promise<DockerDistributeResult> {
    const { isSimulation, project, deploymentId, imageTag, versionTag, server, sshConn, signal, log, setStatus } = ctx

    const rawName = imageTag.includes(':') ? imageTag.split(':')[0] : imageTag
    const versionedTag = versionTag && versionTag !== 'latest' ? `${rawName}:${versionTag}` : null
    const latestTag = `${rawName}:latest`

    if (isSimulation) {
      setStatus('running', '镜像导出')
      if (versionedTag) {
        log(
          `[00:08] 【Docker模式 (Save/Load)】正在通过 [docker save] 导出本地双标签镜像: [${versionedTag}] 与 [${latestTag}]...`,
          'info',
          'DOCKER_SAVE'
        )
      } else {
        log(
          `[00:08] 【Docker模式 (Save/Load)】正在通过 [docker save] 导出本地构建镜像: ${imageTag}...`,
          'info',
          'DOCKER_SAVE'
        )
      }
      await sleep(1200, signal)

      setStatus('running', '镜像分发')
      log(
        `[00:09] 正在通过 SFTP 安全隧道分发 Docker 镜像至目标主机 ${server.ip}...`,
        'info',
        'DOCKER_TRANSFER'
      )
      await sleep(1400, signal)

      setStatus('running', '镜像导入')
      if (versionedTag) {
        log(`[00:10] ✓ 目标主机执行 [docker load] 导入镜像就绪 (已永久归档版本: ${versionTag}，就绪运行: latest)`, 'success', 'DOCKER_LOAD')
      } else {
        log(`[00:10] ✓ 目标主机执行 [docker load] 导入镜像就绪`, 'success', 'DOCKER_LOAD')
      }
      return { finalImageTag: versionedTag || imageTag, modeUsed: 'save_load' }
    }

    // 真实真实执行模式
    if (!sshConn) {
      throw new Error('目标主机 SSH 连接尚未就绪，无法执行分发')
    }

    const artifactDir = path.join(process.cwd(), '.cicd_artifacts', project.id)
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true })
    }

    const archiveName = `${deploymentId}_docker.tar.gz`
    const localArchivePath = path.join(artifactDir, archiveName)

    setStatus('running', '镜像导出')
    const tagsToSave = versionedTag ? [versionedTag, latestTag] : [imageTag]
    log(
      `[00:11] 【Docker模式 (Save/Load)】正在通过 [docker save] 导出本地镜像并压缩: ${tagsToSave.join(' ')}...`,
      'info',
      'DOCKER_SAVE'
    )

    // 确保本地标签对齐
    if (versionedTag) {
      await runLocalCommandSilently(`docker tag ${imageTag} ${versionedTag}`)
      await runLocalCommandSilently(`docker tag ${versionedTag} ${latestTag}`)
    }

    await this.exportDockerImageLocally(tagsToSave, localArchivePath, log, signal)

    const stat = fs.statSync(localArchivePath)
    const sizeStr =
      stat.size > 1024 * 1024
        ? `${(stat.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(stat.size / 1024).toFixed(1)} KB`
    log(`[00:12] ✓ Docker 镜像打包导出完成: ${archiveName} (${sizeStr})`, 'success', 'DOCKER_SAVE')

    if (signal.aborted) throw new Error('部署已手动中止')

    // SFTP 上传 Docker 镜像包
    setStatus('running', '镜像分发')
    log(`[00:12] 正在建立 SFTP 会话，准备分发 Docker 镜像包至 ${server.ip}...`, 'info', 'DOCKER_TRANSFER')

    const sftp = await new Promise<any>((resolveSftp, rejectSftp) => {
      sshConn.sftp((err, sftpSession) => {
        if (err) return rejectSftp(new Error(`SFTP 会话建立失败: ${err.message}`))
        resolveSftp(sftpSession)
      })
    })

    const remoteTempArchive = `/tmp/cicd_image_${deploymentId}.tar.gz`
    log(`[00:13] 正在通过 SFTP 上传镜像包至目标主机临时目录...`, 'info', 'DOCKER_TRANSFER')

    await new Promise<void>((resolvePut, rejectPut) => {
      sftp.fastPut(localArchivePath, remoteTempArchive, (putErr: any) => {
        if (putErr) return rejectPut(new Error(`SFTP 镜像上传中断: ${putErr.message}`))
        resolvePut()
      })
    })
    log(`[00:14] ✓ SFTP 镜像上传完成 (${sizeStr})，正在目标主机载入镜像...`, 'success', 'DOCKER_TRANSFER')

    if (signal.aborted) throw new Error('部署已手动中止')

    // 远程主机执行 docker load
    setStatus('running', '镜像导入')
    log(`[00:14] 正在目标主机执行 [docker load] 导入镜像 (${tagsToSave.join(', ')})...`, 'info', 'DOCKER_LOAD')

    const loadCmd = `if gzip -t "${remoteTempArchive}" 2>/dev/null; then gzip -dc "${remoteTempArchive}" | docker load; else docker load -i "${remoteTempArchive}"; fi && rm -f "${remoteTempArchive}"`

    await new Promise<void>((resolveLoad, rejectLoad) => {
      sshConn.exec(wrapSshCommand(loadCmd), (err, stream) => {
        if (err) return rejectLoad(err)
        let remoteErr = ''
        let capturedExitCode: number | null | undefined = undefined
        stream.on('exit', (c: any) => {
          if (typeof c === 'number') capturedExitCode = c
        })
        stream.on('data', (d: Buffer) => {
          const text = d.toString('utf-8').trim()
          if (text) {
            text.split('\n').forEach((line) => log(`[remote] ${line}`, 'info', 'DOCKER_LOAD'))
          }
        })
        stream.stderr.on('data', (d: Buffer) => {
          remoteErr += d.toString()
        })
        stream.on('close', (code: number) => {
          const finalCode = typeof code === 'number' ? code : (typeof capturedExitCode === 'number' ? capturedExitCode : undefined)
          if (finalCode === 0 || (finalCode === undefined && !remoteErr.trim())) {
            resolveLoad()
          } else {
            if (remoteErr.includes('permission denied') || remoteErr.includes('docker daemon')) {
              rejectLoad(
                new Error(
                  `目标主机 Docker 操作权限不足: ${remoteErr.trim()}。\n提示：当前登录账户【${server.user}】无权访问 Docker 守护进程，请在服务器执行: sudo usermod -aG docker ${server.user}`
                )
              )
            } else {
              rejectLoad(new Error(`远程 docker load 失败 (退出码 ${finalCode ?? '未知'}): ${remoteErr.trim() || '未知异常'}`))
            }
          }
        })
      })
    })

    // 显式确保目标主机上 latest 短别名正确指向 versionedTag
    if (versionedTag) {
      log(`[00:15] 确认目标主机运行时最新标签别名: [docker tag ${versionedTag} ${latestTag}]`, 'info', 'DOCKER_LOAD')
      await runRemoteCommand(sshConn, `docker tag ${versionedTag} ${latestTag}`, log, 'DOCKER_LOAD', server.user)
    }

    log(`[00:15] ✓ 目标主机成功通过 docker load 导入镜像: [${versionedTag || imageTag}] 及 [${latestTag}]`, 'success', 'DOCKER_LOAD')

    return { finalImageTag: versionedTag || imageTag, modeUsed: 'save_load' }
  }

  private exportDockerImageLocally(
    imageTags: string | string[],
    archivePath: string,
    log: (text: string, type?: DeployLogEntry['type'], step?: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32'
      const tagsArg = Array.isArray(imageTags) ? imageTags.join(' ') : imageTags
      const proc = spawn(
        isWindows ? 'cmd.exe' : 'sh',
        [isWindows ? '/c' : '-c', `docker save ${tagsArg}`],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )

      const gzip = zlib.createGzip({ level: 6 })
      const outStream = fs.createWriteStream(archivePath)

      pipeline(proc.stdout, gzip, outStream, (err) => {
        if (err) return reject(new Error(`打包镜像压缩管道失败: ${err.message}`))
      })

      let stderrOutput = ''
      proc.stderr.on('data', (d) => {
        stderrOutput += d.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`docker save 失败 (退出码 ${code}): ${stderrOutput || '未知错误'}`))
        }
      })

      signal.addEventListener(
        'abort',
        () => {
          try {
            proc.kill()
          } catch {}
          reject(new Error('部署已手动中止'))
        },
        { once: true }
      )
    })
  }
}

// -------------------------------------------------------------
// 策略二：Docker Push / Pull (企业集中式镜像仓库模式)
// -------------------------------------------------------------
export class DockerRegistryDistributor implements IDockerDistributor {
  readonly mode = 'registry' as const

  async distribute(ctx: DockerDistributeContext): Promise<DockerDistributeResult> {
    const { isSimulation, project, deploymentId, imageTag, versionTag, server, sshConn, signal, log, setStatus, settings } = ctx

    // 1. 合并计算有效的 Docker 镜像仓库配置
    const regConfig = this.resolveRegistryConfig(project, settings)
    if (!regConfig.registryUrl) {
      throw new Error(
        '【Docker 镜像仓库模式】缺少 Registry 服务地址，请在系统设置中配置默认镜像仓库，或在项目设置中指定！'
      )
    }

    const cleanRegistryUrl = regConfig.registryUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    const namespace = regConfig.namespace ? regConfig.namespace.trim().replace(/^\/+|\/+$/g, '') : ''

    const [rawName, rawVersion] = imageTag.includes(':') ? imageTag.split(':') : [imageTag, 'latest']
    const cleanVersion = versionTag || rawVersion || 'latest'

    // 双重远程全量标签：包含不可变版本标签与 latest 标签
    const fullVersionTag = namespace
      ? `${cleanRegistryUrl}/${namespace}/${rawName}:${cleanVersion}`
      : `${cleanRegistryUrl}/${rawName}:${cleanVersion}`
    const fullLatestTag = namespace
      ? `${cleanRegistryUrl}/${namespace}/${rawName}:latest`
      : `${cleanRegistryUrl}/${rawName}:latest`

    const localSourceVersionTag = `${rawName}:${cleanVersion}`
    const localLatestTag = `${rawName}:latest`

    if (isSimulation) {
      setStatus('running', '镜像标记')
      log(
        `[00:08] 【Docker模式 (Registry)】解析版本化全量标签: [${fullVersionTag}] 与 [${fullLatestTag}]`,
        'info',
        'DOCKER_TAG'
      )
      await sleep(700, signal)

      if (regConfig.username && regConfig.password) {
        log(
          `[00:09] 正在登录本地宿主机 Docker 仓库: ${cleanRegistryUrl} (用户: ${regConfig.username})...`,
          'info',
          'DOCKER_LOGIN'
        )
        await sleep(600, signal)
      }

      setStatus('running', '仓库推送')
      log(
        `[00:10] 本地标记双标签: [docker tag ${localSourceVersionTag} ${fullVersionTag}] 及 [... ${fullLatestTag}]`,
        'info',
        'DOCKER_TAG'
      )
      await sleep(600, signal)

      log(
        `[00:11] 正在向远程中央仓库推送版本镜像: [docker push ${fullVersionTag}]...`,
        'info',
        'DOCKER_PUSH'
      )
      await sleep(1500, signal)
      log(
        `[00:12] 同步向中央仓库推送 latest 镜像: [docker push ${fullLatestTag}]...`,
        'info',
        'DOCKER_PUSH'
      )
      await sleep(800, signal)
      log(`[00:12] ✓ 镜像双标签成功推送至中央仓库: ${fullVersionTag}`, 'success', 'DOCKER_PUSH')

      setStatus('running', '镜像拉取')
      if (regConfig.username && regConfig.password) {
        log(
          `[00:13] 目标主机登录镜像仓库 ${cleanRegistryUrl}...`,
          'info',
          'DOCKER_LOGIN'
        )
        await sleep(600, signal)
      }

      log(
        `[00:14] 目标主机远程高速拉取版本镜像: [docker pull ${fullVersionTag}]...`,
        'info',
        'DOCKER_PULL'
      )
      await sleep(1500, signal)
      log(`[00:15] ✓ 目标主机成功拉取镜像: ${fullVersionTag}`, 'success', 'DOCKER_PULL')

      log(
        `[00:15] 建立本地短标签映射: [docker tag ${fullVersionTag} ${localSourceVersionTag}] 与 [${localLatestTag}] (保证容器启动脚本平滑兼容)`,
        'info',
        'DOCKER_TAG'
      )
      return { finalImageTag: fullVersionTag, modeUsed: 'registry' }
    }

    // 真实执行模式
    if (!sshConn) {
      throw new Error('目标主机 SSH 连接尚未就绪，无法执行分发')
    }

    setStatus('running', '仓库推送')
    log(`[00:11] 【Docker模式 (Registry)】准备将镜像推送至中央镜像仓库: ${fullVersionTag}`, 'info', 'DOCKER_TAG')

    // 本地登录 (如果配置了认证账号)
    if (regConfig.username && regConfig.password) {
      log(`[00:11] 本地登录 Docker Registry: ${cleanRegistryUrl} (用户: ${regConfig.username})...`, 'info', 'DOCKER_LOGIN')
      await runLocalCommand(
        `docker login ${cleanRegistryUrl} -u "${regConfig.username}" --password-stdin`,
        log,
        signal,
        'DOCKER_LOGIN',
        regConfig.password
      )
    }

    // 确保本地源标签对齐
    await runLocalCommandSilently(`docker tag ${imageTag} ${localSourceVersionTag}`)
    await runLocalCommandSilently(`docker tag ${localSourceVersionTag} ${localLatestTag}`)

    // 本地打标签：同时生成版本标签与 latest 标签
    log(`[00:12] 本地打标签: docker tag ${localSourceVersionTag} ${fullVersionTag}`, 'info', 'DOCKER_TAG')
    await runLocalCommand(`docker tag ${localSourceVersionTag} ${fullVersionTag}`, log, signal, 'DOCKER_TAG')
    log(`[00:12] 本地打标签: docker tag ${localSourceVersionTag} ${fullLatestTag}`, 'info', 'DOCKER_TAG')
    await runLocalCommand(`docker tag ${localSourceVersionTag} ${fullLatestTag}`, log, signal, 'DOCKER_TAG')

    // 本地 push：推送不可变版本镜像与 latest 镜像
    log(`[00:13] 正在向中央仓库推送版本镜像: docker push ${fullVersionTag}...`, 'info', 'DOCKER_PUSH')
    await runLocalCommand(`docker push ${fullVersionTag}`, log, signal, 'DOCKER_PUSH')
    log(`[00:14] 正在向中央仓库推送 latest 镜像: docker push ${fullLatestTag}...`, 'info', 'DOCKER_PUSH')
    await runLocalCommand(`docker push ${fullLatestTag}`, log, signal, 'DOCKER_PUSH')
    log(`[00:14] ✓ 镜像成功推送到中央仓库 (含版本与 latest 标签)`, 'success', 'DOCKER_PUSH')

    if (signal.aborted) throw new Error('部署已手动中止')

    // 远程服务器拉取镜像
    setStatus('running', '镜像拉取')

    // 远程登录 (如果私有仓库需要认证)
    if (regConfig.username && regConfig.password) {
      log(`[00:14] 目标主机登录 Docker Registry: ${cleanRegistryUrl}...`, 'info', 'DOCKER_LOGIN')
      const remoteLoginCmd = `echo "${regConfig.password}" | docker login ${cleanRegistryUrl} -u "${regConfig.username}" --password-stdin`
      await runRemoteCommand(sshConn, remoteLoginCmd, log, 'DOCKER_LOGIN', server.user)
    }

    log(`[00:15] 目标主机远程拉取版本镜像: docker pull ${fullVersionTag}...`, 'info', 'DOCKER_PULL')
    await runRemoteCommand(sshConn, `docker pull ${fullVersionTag}`, log, 'DOCKER_PULL', server.user)
    log(`[00:16] ✓ 目标主机成功拉取版本镜像: ${fullVersionTag}`, 'success', 'DOCKER_PULL')

    if (signal.aborted) throw new Error('部署已手动中止')

    // 在目标主机上建立短名别名 tag：
    // 1. 版本短标签: rawName:cleanVersion
    log(`[00:16] 建立本地版本归档短别名: docker tag ${fullVersionTag} ${localSourceVersionTag}`, 'info', 'DOCKER_TAG')
    await runRemoteCommand(sshConn, `docker tag ${fullVersionTag} ${localSourceVersionTag}`, log, 'DOCKER_TAG', server.user)

    // 2. latest 短标签: rawName:latest (保证用户 startCommand 默认使用 latest 也平滑无缝)
    log(`[00:16] 建立本地运行最新别名: docker tag ${fullVersionTag} ${localLatestTag}`, 'info', 'DOCKER_TAG')
    await runRemoteCommand(sshConn, `docker tag ${fullVersionTag} ${localLatestTag}`, log, 'DOCKER_TAG', server.user)

    return { finalImageTag: fullVersionTag, modeUsed: 'registry' }
  }

  private resolveRegistryConfig(
    project: Project,
    settings?: SystemSettings
  ): DockerRegistryConfig {
    const globalReg = settings?.dockerRegistry
    const projReg = project.dockerRegistry

    return {
      enabled: projReg?.enabled ?? globalReg?.enabled ?? false,
      registryUrl: projReg?.registryUrl || globalReg?.registryUrl || '',
      namespace: projReg?.namespace ?? globalReg?.namespace ?? '',
      username: projReg?.username || globalReg?.username || '',
      password: projReg?.password || globalReg?.password || '',
      defaultMode: projReg?.defaultMode || globalReg?.defaultMode || 'save_load',
    }
  }
}

// -------------------------------------------------------------
// 策略工厂 (Factory)
// -------------------------------------------------------------
export class DockerDistributorFactory {
  static resolveMode(
    project: Project,
    settings?: SystemSettings
  ): 'save_load' | 'registry' {
    const projectMode = project.dockerDeliveryMode || 'auto'

    if (projectMode === 'registry') return 'registry'
    if (projectMode === 'save_load') return 'save_load'

    // 'auto' 模式：优先判断是否有 Registry 地址配置
    const hasProjectRegistry = !!project.dockerRegistry?.registryUrl
    const hasGlobalRegistry =
      !!settings?.dockerRegistry?.enabled && !!settings?.dockerRegistry?.registryUrl

    if (hasProjectRegistry) return 'registry'
    if (hasGlobalRegistry && settings?.dockerRegistry?.defaultMode === 'registry') {
      return 'registry'
    }

    return 'save_load'
  }

  static getDistributor(
    project: Project,
    settings?: SystemSettings
  ): IDockerDistributor {
    const mode = this.resolveMode(project, settings)
    if (mode === 'registry') {
      return new DockerRegistryDistributor()
    }
    return new DockerSaveLoadDistributor()
  }
}
