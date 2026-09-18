import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { Client } from 'ssh2'
import { BaseCarrier } from './base'
import { CarrierContext, CarrierSimulateContext } from './types'
import { wrapSshCommand } from '../shell-env'
import { updateDeployment, updateProject } from '../db'
import { DockerDistributorFactory } from '../docker-distributor'
import { toSafeSlug, updateDockerRunEnvVars, updateDockerRunPorts, getRuntime } from '../runtimes'
import { ServerNode, PortMapping, EnvVariable } from '../types'
import { IRuntimePlugin, DockerBuildArgDefinition } from '../runtimes/types'

/**
 * 生成与绑定 Docker 镜像版本标签（时间戳 + Git短Hash）
 */
export function generateDockerVersionTag(commitHash?: string, date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const YYYY = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const DD = pad(date.getDate())
  const HH = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  const timeStr = `${YYYY}${MM}${DD}${HH}${mm}${ss}`
  const validHash =
    commitHash && commitHash !== '获取中...' && commitHash !== '-'
      ? commitHash.replace(/[^a-zA-Z0-9]/g, '').substring(0, 7)
      : Math.random().toString(36).substring(2, 9)
  return `${timeStr}-${validHash}`
}

/**
 * 从构建命令中提取 Docker 镜像标签 (如 docker build -t app:latest . -> app:latest)
 */
export function extractDockerImageTag(buildCommand: string, fallbackName: string): string {
  const match = buildCommand.match(/(?:-t|--tag)\s+([^\s]+)/)
  if (match && match[1]) {
    return match[1].replace(/["']/g, '').trim()
  }
  return `${fallbackName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}:latest`
}

/**
 * 从构建命令中提取 Docker 镜像的基础名称（不带 tag，例如 order-service:latest -> order-service）
 */
export function extractDockerBaseImageName(buildCommand: string, fallbackName: string): string {
  const fullTag = extractDockerImageTag(buildCommand, fallbackName)
  const parts = fullTag.split(':')
  return parts[0] || fallbackName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
}

/**
 * 从启动命令中提取 Docker 容器名称 (例如 docker run -d --name app -p 80:80 app:latest -> app)
 */
export function extractDockerContainerName(startCommand?: string): string | null {
  if (!startCommand) return null
  // 仅在明确是 docker run 命令或包含 docker 指令时解析，避免与 pm2 等工具的 --name 冲突
  if (!startCommand.includes('docker ') && !startCommand.includes('docker\n')) {
    return null
  }
  const match = startCommand.match(/(?:^|\s)--name(?:=|\s+)(?:["']([^"'\s]+)["']|([^\s"']+))/)
  if (match) {
    return (match[1] || match[2] || '').trim() || null
  }
  return null
}

/**
 * Docker 容器交付载体驱动 (DockerCarrier)
 * 支持多阶段镜像构建、双重标签注入、构建参数(ARG)管理、本地/远程容器分发与生命周期调度
 */
export class DockerCarrier extends BaseCarrier {
  readonly mode = 'docker'
  readonly name = 'Docker 容器交付'

  getInstallCommand(_runtime: IRuntimePlugin, _projectName?: string): string {
    return 'docker version'
  }

  getBuildCommand(_runtime: IRuntimePlugin, projectName?: string): string {
    const slug = toSafeSlug(projectName)
    return `docker build -t ${slug}:latest .`
  }

  getStartCommand(
    runtime: IRuntimePlugin,
    projectName?: string,
    ports?: PortMapping[] | number[],
    envVars?: EnvVariable[]
  ): string {
    const slug = toSafeSlug(projectName)
    const mappings = this.resolvePortMappings(ports, runtime?.defaultPort || 3000)
    const portFlags = mappings.map((m) => `-p ${m.host}:${m.container}`).join(' ')
    const baseCmd = `docker run -d --restart unless-stopped ${portFlags} --name ${slug} ${slug}:latest`
    return updateDockerRunEnvVars(baseCmd, envVars)
  }

  updateStartCommandOnPortChange(
    currentCmd: string,
    newPorts: number[] | PortMapping[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    envVars?: EnvVariable[]
  ): string {
    if (currentCmd && currentCmd.includes('docker run')) {
      return updateDockerRunPorts(currentCmd, newPorts)
    }
    if (isCustomized) {
      return currentCmd
    }
    return this.getStartCommand(runtime, slug, newPorts, envVars)
  }

  updateStartCommandOnEnvChange(
    currentCmd: string,
    updatedEnvVars: EnvVariable[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    ports?: number[] | PortMapping[]
  ): string {
    if (currentCmd && currentCmd.includes('docker run')) {
      return updateDockerRunEnvVars(currentCmd, updatedEnvVars)
    }
    if (isCustomized) {
      return currentCmd
    }
    return this.getStartCommand(runtime, slug, ports, updatedEnvVars)
  }

  getRequiredTools(_runtime?: IRuntimePlugin): string[] {
    return ['docker']
  }

  private resolvePortMappings(
    port?: number | number[] | PortMapping[],
    defaultPort = 3000
  ): PortMapping[] {
    if (Array.isArray(port) && port.length > 0) {
      const first = port[0]
      if (typeof first === 'object' && first !== null && 'host' in first && 'container' in first) {
        return (port as PortMapping[])
          .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
          .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
      }
      return (port as number[])
        .map(Number)
        .filter((p) => !isNaN(p) && p > 0)
        .map((p) => ({ host: p, container: p }))
    }
    if (typeof port === 'number' && !isNaN(port) && port > 0) {
      return [{ host: port, container: port }]
    }
    return [{ host: defaultPort, container: defaultPort }]
  }

  /**
   * 代码检出后准备：分配不可变版本标签
   */
  async onAfterCheckout(ctx: CarrierContext): Promise<void> {
    const { project, deployment, effectiveCommitHash, log, emit } = ctx
    const deploymentId = deployment.id

    const versionTag =
      deployment.triggerType === 'rollback' && deployment.versionTag
        ? deployment.versionTag
        : generateDockerVersionTag(effectiveCommitHash || deploymentId)

    deployment.versionTag = versionTag
    ctx.versionTag = versionTag

    updateDeployment(deploymentId, { versionTag })
    updateProject(project.id, { lastVersionTag: versionTag })

    emit({
      type: 'status',
      deploymentId,
      payload: { versionTag },
    })

    if (deployment.triggerType === 'rollback') {
      log(
        `[00:03] 【Docker 一键回滚】锁定目标版本标签: [${versionTag}] (历史提交: ${effectiveCommitHash || 'auto'})`,
        'success',
        'GIT_CLONE'
      )
    } else {
      log(
        `[00:03] 【Docker 容器版本管理】自动分配版本标签: [${versionTag}] (基于时间戳 + Git Hash: ${effectiveCommitHash || 'auto'})`,
        'success',
        'GIT_CLONE'
      )
    }
  }

  /**
   * 应用构建阶段：检查 Dockerfile、注入双标签、校验并注入 --build-arg、执行构建
   */
  async executeBuild(ctx: CarrierContext): Promise<void> {
    const { project, deployment, workspaceDir, log, setStatus, spawnShell } = ctx
    if (!project.buildCommand || !project.buildCommand.trim()) {
      return
    }

    setStatus('running', '应用构建')
    let effectiveBuildCmd = project.buildCommand

    if (effectiveBuildCmd.toLowerCase().includes('docker build')) {
      // 预检工作区代码仓库中是否存在 Dockerfile
      const fileMatch = effectiveBuildCmd.match(/(?:-f|--file)\s+([^\s]+)/)
      const targetDockerfileName = fileMatch ? fileMatch[1] : 'Dockerfile'
      const targetDockerfilePath = path.isAbsolute(targetDockerfileName)
        ? targetDockerfileName
        : path.join(workspaceDir, targetDockerfileName)
      const altDockerfilePath = path.join(workspaceDir, 'dockerfile')

      const hasDockerfile =
        fs.existsSync(targetDockerfilePath) ||
        (!fileMatch && fs.existsSync(altDockerfilePath))

      if (!hasDockerfile) {
        log(`[00:06] [!] ❌ 错误：在代码仓库根目录未找到 Dockerfile 文件！`, 'error', 'BUILD')
        log(`[00:06] [!] 📁 检查路径: ${targetDockerfilePath}`, 'error', 'BUILD')
        log(`[00:06] [!] 💡 Docker 容器化部署指引：`, 'warning', 'BUILD')
        log(`[00:06] [!]    1. 使用 Docker 部署必须在代码仓库根目录下创建名为 'Dockerfile' 的文件`, 'warning', 'BUILD')
        log(`[00:06] [!]    2. 根据项目技术栈编写标准容器镜像构建配置 (可在 Solo Deck 平台查看预设模板)`, 'warning', 'BUILD')
        log(`[00:06] [!]    3. 提交并推送至 Git 远程分支：`, 'warning', 'BUILD')
        log(`[00:06] [!]       git add Dockerfile && git commit -m "feat: add Dockerfile" && git push`, 'warning', 'BUILD')
        log(`[00:06] [!]    4. 推送完成后重新点击【立即部署】即可完成自动构建与发布`, 'warning', 'BUILD')
        throw new Error(`应用构建失败: 代码仓库根目录下未找到 Dockerfile 文件。请参考模板将 Dockerfile 放入项目根目录并推送代码后重试。`)
      } else {
        log(`[00:06] ✓ 成功定位项目根目录下 Dockerfile 配置文件 (${path.basename(targetDockerfilePath)})`, 'success', 'BUILD')
      }

      if (deployment.versionTag) {
        const baseName = extractDockerBaseImageName(effectiveBuildCmd, project.name)
        const versionedTag = `${baseName}:${deployment.versionTag}`
        const latestTag = `${baseName}:latest`

        if (effectiveBuildCmd.match(/(?:-t|--tag)\s+[^\s]+/)) {
          effectiveBuildCmd = effectiveBuildCmd.replace(
            /(?:-t|--tag)\s+[^\s]+/,
            `-t ${versionedTag} -t ${latestTag}`
          )
        } else {
          effectiveBuildCmd = effectiveBuildCmd.replace(
            /docker\s+build/i,
            `docker build -t ${versionedTag} -t ${latestTag}`
          )
        }
        log(`[00:07] 【Docker 版本化管理 (方案B)】自动注入双重标签:`, 'info', 'BUILD')
        log(`[00:07] ➔ 永久不可变版本: ${versionedTag}`, 'info', 'BUILD')
        log(`[00:07] ➔ 运行时最新别名: ${latestTag}`, 'info', 'BUILD')
      }

      // 校验运行时必填的 Docker 构建参数 (如 .NET 的 PROJECT 路径)
      const runtimePlugin = getRuntime(project.runtime)
      if (runtimePlugin?.dockerBuildArgs) {
        const missingRequired = runtimePlugin.dockerBuildArgs.filter((def: DockerBuildArgDefinition) => {
          if (!def.required) return false
          const configuredVal = project.dockerBuildArgs?.find((a) => a.key === def.key)?.value
          const inCmd = new RegExp(`--build-arg\\s+${def.key}=`).test(effectiveBuildCmd)
          return (!configuredVal || !configuredVal.trim()) && !inCmd
        })

        if (missingRequired.length > 0) {
          const missingNames = missingRequired.map((m: DockerBuildArgDefinition) => m.key).join(', ')
          log(`[00:06] [!] ❌ 错误：缺少必要的 Docker 构建参数 (ARG): ${missingNames}`, 'error', 'BUILD')
          missingRequired.forEach((m: DockerBuildArgDefinition) => {
            log(`[00:06] [!] 💡 参数 [${m.key}]: ${m.description}${m.placeholder ? ` (示例: ${m.placeholder})` : ''}`, 'warning', 'BUILD')
          })
          log(`[00:06] [!] 请前往【项目详情】➔【流水线编排】中填写 Docker 构建参数后重试。`, 'warning', 'BUILD')
          throw new Error(`应用构建失败: 缺少必填 Docker 构建参数 [${missingNames}]，请在项目配置中指定。`)
        }
      }

      // 注入 Docker 构建参数 (--build-arg)，对应 Dockerfile 中的 ARG 指令
      if (project.dockerBuildArgs && project.dockerBuildArgs.length > 0) {
        const validArgs = project.dockerBuildArgs.filter(arg => arg.key && arg.value)
        if (validArgs.length > 0) {
          const newArgsToInject: string[] = []
          for (const arg of validArgs) {
            const argRegex = new RegExp(`--build-arg\\s+${arg.key}=(?:"[^"]*"|'[^']*'|[^\\s]+)`)
            if (argRegex.test(effectiveBuildCmd)) {
              effectiveBuildCmd = effectiveBuildCmd.replace(argRegex, `--build-arg ${arg.key}="${arg.value}"`)
            } else {
              newArgsToInject.push(`--build-arg ${arg.key}="${arg.value}"`)
            }
          }

          if (newArgsToInject.length > 0) {
            effectiveBuildCmd = effectiveBuildCmd.replace(
              /docker\s+build/i,
              `docker build ${newArgsToInject.join(' ')}`
            )
          }

          log(`[00:07] 【Docker 构建参数】自动注入 ${validArgs.length} 个 ARG 参数:`, 'info', 'BUILD')
          validArgs.forEach(arg => {
            log(`[00:07] ➔ ${arg.key}=${arg.value}`, 'info', 'BUILD')
          })
        }
      }
    }

    log(`[00:07] 执行应用构建命令: ${effectiveBuildCmd}`, 'info', 'BUILD')

    const envMap: Record<string, string> = {}
    if (project.envVars && project.envVars.length > 0) {
      project.envVars.forEach((ev) => {
        envMap[ev.key] = ev.value
      })
      log(`[00:07] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
    }

    const buildExit = await spawnShell(effectiveBuildCmd, workspaceDir, envMap)
    if (ctx.signal.aborted) return
    if (buildExit !== 0) {
      throw new Error(`应用构建失败 (退出码: ${buildExit})`)
    }
    log(`[00:10] ✓ 应用构建成功完成`, 'success', 'BUILD')
  }

  /**
   * 本地容器启动调度：支持 -e 注入、本地同名容器优雅清理与冲突重试
   */
  async deployLocal(ctx: CarrierContext): Promise<void> {
    const { project, workspaceDir, log, signal, spawnShell } = ctx
    if (!project.startCommand || !project.startCommand.trim()) {
      return
    }

    const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand, project.envVars)
    log(`[00:11] 目标为本机节点 (127.0.0.1)，执行本地 Docker 容器启动 (已注入 -e 环境变量): ${effectiveStartCmd}`, 'info', 'DEPLOY')
    const containerName = extractDockerContainerName(effectiveStartCmd)
    if (containerName) {
      log(`[00:11] 正在检查本机同名 Docker 容器 [${containerName}]...`, 'info', 'DEPLOY')
      await this.cleanupLocalDockerContainer(containerName, log)
    }

    let stderrBuffer = ''
    const captureLog = (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => {
      log(text, type, step)
      if (type === 'error' || type === 'warning') {
        stderrBuffer += text + '\n'
      }
    }

    let startExit = await spawnShell(
      effectiveStartCmd,
      workspaceDir,
      {},
      captureLog
    )

    // 容错恢复：如果仍发生 Docker 容器名称冲突，自动清理冲突容器并重试一次
    if (startExit !== 0 && !signal.aborted) {
      const conflictMatch = stderrBuffer.match(
        /Conflict\.\s+The container name\s+["']?\/?([^"'\s]+)["']?\s+is already in use/i
      )
      if (conflictMatch) {
        const conflictName = conflictMatch[1] || containerName
        if (conflictName) {
          log(
            `[!] 检测到本机 Docker 容器名称冲突 [${conflictName}]，执行自动清理并重试启动...`,
            'warning',
            'DEPLOY'
          )
          await this.cleanupLocalDockerContainer(conflictName, log)
          startExit = await spawnShell(
            effectiveStartCmd,
            workspaceDir,
            {},
            log
          )
        }
      }
    }

    if (startExit !== 0) {
      throw new Error(`服务启动命令返回错误码: ${startExit}`)
    }
  }

  /**
   * 远程主机容器部署：派发镜像分发策略、清理旧容器、拉起新版本
   */
  async deployRemote(ctx: CarrierContext): Promise<void> {
    const { project, deployment, server, sshConn, workspaceDir, log, setStatus, signal, settings, versionTag } = ctx
    if (!server || !sshConn) {
      throw new Error(`未提供有效的远程主机或 SSH 客户端连接`)
    }

    // Docker 镜像分发抽象层 (策略工厂自动派发 Save/Load 或 Registry)
    const imageTag = extractDockerImageTag(project.buildCommand, project.name)
    const distributor = DockerDistributorFactory.getDistributor(project, settings)

    log(
      `[00:11] 识别为【Docker 容器化镜像交付】，版本标签: [${versionTag || 'latest'}]，策略引擎派发: 【${distributor.mode === 'registry'
        ? '企业级镜像仓库 (docker push/pull)'
        : 'SFTP 离线直连 (docker save/load)'
      }】`,
      'info',
      'DOCKER_STRATEGY'
    )

    await distributor.distribute({
      isSimulation: false,
      project,
      deploymentId: deployment.id,
      imageTag,
      versionTag,
      server,
      sshConn,
      signal,
      log,
      setStatus,
      settings,
      workspaceDir,
    })

    if (signal.aborted) {
      throw new Error('部署已手动中止')
    }

    // 容器启动 / 重载
    if (project.startCommand && project.startCommand.trim()) {
      setStatus('running', '容器启动')
      const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand, project.envVars)
      const containerName = extractDockerContainerName(effectiveStartCmd)
      if (containerName) {
        log(`[00:15] 正在检查目标主机同名 Docker 容器 [${containerName}]...`, 'info', 'STARTUP')
        await this.cleanupRemoteDockerContainer(sshConn, containerName, log)
      }

      if (project.envVars && project.envVars.length > 0) {
        log(`[00:15] Docker 容器模式: 环境变量已加入 -e 参数: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
      }
      log(`[00:15] 正在目标主机远程执行容器启动命令: ${effectiveStartCmd}`, 'info', 'STARTUP')

      await this.executeRemoteCommandWithRetry(
        sshConn,
        effectiveStartCmd,
        containerName,
        log,
        'STARTUP'
      )

      log(`[00:16] ✓ 远程容器启动命令执行完毕`, 'success', 'STARTUP')
    } else {
      log(`[00:15] 未配置容器启动命令，镜像分发载入即为完成`, 'info', 'STARTUP')
    }
  }

  /**
   * 沙箱模拟执行：检出后绑定不可变标签
   */
  async simulateAfterCheckout(ctx: CarrierSimulateContext): Promise<void> {
    const { project, deployment, log, emit } = ctx
    const deploymentId = deployment.id
    const versionTag =
      deployment.triggerType === 'rollback' && deployment.versionTag
        ? deployment.versionTag
        : generateDockerVersionTag(deployment.commitHash || deploymentId)

    deployment.versionTag = versionTag
    ctx.versionTag = versionTag

    updateDeployment(deploymentId, { versionTag })
    updateProject(project.id, { lastVersionTag: versionTag })

    emit({
      type: 'status',
      deploymentId,
      payload: { versionTag },
    })

    if (deployment.triggerType === 'rollback') {
      log(
        `[00:02] 【Docker 一键回滚】锁定目标版本标签: [${versionTag}] (历史提交: ${deployment.commitHash || 'auto'})`,
        'success',
        'GIT_CLONE'
      )
    } else {
      log(
        `[00:02] 【Docker 容器版本管理】自动分配版本标签: [${versionTag}] (基于时间戳 + Git Hash: ${deployment.commitHash || 'auto'})`,
        'success',
        'GIT_CLONE'
      )
    }
  }

  /**
   * 沙箱模拟执行：构建过程模拟
   */
  async simulateBuild(ctx: CarrierSimulateContext): Promise<void> {
    const { project, deployment, log, sleep } = ctx
    log(`[00:05] 开始执行容器化镜像构建: ${project.buildCommand || 'docker build -t app:latest .'}`, 'info', 'BUILD')
    if (project.envVars && project.envVars.length > 0) {
      log(`[00:06] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
    }
    if (project.dockerBuildArgs && project.dockerBuildArgs.length > 0) {
      const validArgs = project.dockerBuildArgs.filter(arg => arg.key && arg.value)
      if (validArgs.length > 0) {
        log(`[00:06] 【Docker 构建参数】注入 ${validArgs.length} 个 ARG: ${validArgs.map(a => `${a.key}=${a.value}`).join(', ')}`, 'info', 'BUILD')
      }
    }
    log(`[00:06] ✓ 校验项目根目录规范: 已识别根目录下标准 Dockerfile 容器化镜像构建文件`, 'success', 'BUILD')
    if (deployment.versionTag) {
      const baseName = extractDockerBaseImageName(project.buildCommand || 'docker build -t app:latest .', project.name)
      log(`[00:06] 【Docker 版本化构建】生成不可变镜像: [${baseName}:${deployment.versionTag}] 及运行别名: [${baseName}:latest]`, 'info', 'BUILD')
    }
    await sleep(2200)
    log(`[00:07] ✓ Docker 容器镜像构建就绪 (镜像大小约 128MB)`, 'success', 'BUILD')
  }

  /**
   * 沙箱模拟执行：镜像分发模拟
   */
  async simulateDeploy(ctx: CarrierSimulateContext): Promise<void> {
    const { project, deployment, settings, log, setStatus } = ctx
    const tag = extractDockerImageTag(project.buildCommand || 'docker build -t app:latest .', project.name)
    const distributor = DockerDistributorFactory.getDistributor(project, settings)
    const fakeServer: ServerNode = {
      id: project.serverId || 'srv-sim',
      name: project.serverName,
      ip: project.serverIp,
      port: 22,
      user: 'root',
      authType: 'password',
      status: 'online',
    }
    await distributor.distribute({
      isSimulation: true,
      project,
      deploymentId: deployment.id,
      imageTag: tag,
      versionTag: deployment.versionTag,
      server: fakeServer,
      signal: ctx.signal,
      log,
      setStatus,
      settings,
    })
  }

  /**
   * 沙箱模拟执行：容器拉起模拟
   */
  async simulateStart(ctx: CarrierSimulateContext): Promise<void> {
    const { project, log, sleep } = ctx
    const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand || 'docker run ...', project.envVars)
    const simContainerName = extractDockerContainerName(effectiveStartCmd)
    if (simContainerName) {
      log(`[00:10] 检测到 Docker 容器命名 [${simContainerName}]，正在平滑停止并清理已存在同名旧容器...`, 'info', 'STARTUP')
      await sleep(800)
      log(`[00:10] ✓ 已安全清理旧容器 [${simContainerName}]，准备启动新版本容器`, 'success', 'STARTUP')
    }
    if (project.envVars && project.envVars.length > 0) {
      log(`[00:10] Docker 容器模式: 环境变量已加入 -e 参数: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
    }
    log(`[00:10] SSH 远程执行启动指令: ${effectiveStartCmd}`, 'info', 'STARTUP')
    await sleep(1400)
    const portsDisplay = this.formatPortsDisplay(project)
    log(`[00:11] ✓ 服务进程重载成功，PID 已分配，监听端口 ${portsDisplay}`, 'success', 'STARTUP')
  }

  /**
   * 清理本机已存在的同名 Docker 容器
   */
  public cleanupLocalDockerContainer(
    containerName: string,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void
  ): Promise<void> {
    const isWindows = process.platform === 'win32'
    const checkAndCleanCmd = isWindows
      ? `docker inspect --type container "${containerName}" >nul 2>&1 && (docker stop -t 10 "${containerName}" >nul 2>&1 & docker rm -f "${containerName}" >nul 2>&1 & echo EXISTS_AND_REMOVED) || echo NOT_FOUND`
      : `if docker inspect --type container "${containerName}" >/dev/null 2>&1; then docker stop -t 10 "${containerName}" >/dev/null 2>&1 || true; docker rm -f "${containerName}" >/dev/null 2>&1 || true; echo "EXISTS_AND_REMOVED"; else echo "NOT_FOUND"; fi`

    return new Promise((resolve) => {
      exec(checkAndCleanCmd, (err, stdout) => {
        if (!err && stdout.includes('EXISTS_AND_REMOVED')) {
          log(`[00:11] 检测到本机已存在同名 Docker 容器 [${containerName}]，已平滑停止并安全移除旧容器`, 'success', 'DEPLOY')
        }
        resolve()
      })
    })
  }

  /**
   * 远程清理目标服务器上已存在的同名 Docker 容器
   */
  public cleanupRemoteDockerContainer(
    conn: Client,
    containerName: string,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void
  ): Promise<void> {
    const cleanCmd = `if docker inspect --type container "${containerName}" >/dev/null 2>&1; then docker stop -t 10 "${containerName}" >/dev/null 2>&1 || true; docker rm -f "${containerName}" >/dev/null 2>&1 || true; echo "EXISTS_AND_REMOVED"; else echo "NOT_FOUND"; fi`

    return new Promise<void>((resolve) => {
      conn.exec(wrapSshCommand(cleanCmd), (err, stream) => {
        if (err) {
          log(`[remote-clean] 检查旧容器状态时发生异常: ${err.message}`, 'warning', 'STARTUP')
          return resolve()
        }

        let output = ''
        stream.on('data', (d: Buffer) => {
          output += d.toString('utf-8')
        })
        stream.stderr.on('data', () => { })
        stream.on('close', () => {
          if (output.includes('EXISTS_AND_REMOVED')) {
            log(
              `[00:15] 检测到目标主机已存在同名旧容器 [${containerName}]，已平滑停止并安全移除`,
              'success',
              'STARTUP'
            )
          }
          resolve()
        })
      })
    })
  }

  /**
   * 检查目标主机上指定容器是否已启动存在
   */
  public checkContainerExistsRemote(
    conn: Client,
    containerName: string
  ): Promise<boolean> {
    const inspectCmd = `docker inspect --type container "${containerName}" >/dev/null 2>&1 && echo "RUNNING" || echo "NOT_FOUND"`
    return new Promise((resolve) => {
      conn.exec(wrapSshCommand(inspectCmd), (err, stream) => {
        if (err) return resolve(false)
        let out = ''
        stream.on('data', (d: Buffer) => {
          out += d.toString('utf-8')
        })
        stream.stderr.on('data', () => { })
        stream.on('close', () => {
          resolve(out.includes('RUNNING'))
        })
      })
    })
  }

  /**
   * 远程执行启动命令，并在遭遇容器名称冲突时自动清理旧容器重试一次
   */
  public executeRemoteCommandWithRetry(
    conn: Client,
    cmd: string,
    expectedContainerName: string | null,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void,
    step: string,
    hasRetried = false
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      conn.exec(wrapSshCommand(cmd), (err, stream) => {
        if (err) return reject(err)

        let stderrOutput = ''
        let capturedExitCode: number | null | undefined = undefined

        stream
          .on('exit', (code: any) => {
            if (typeof code === 'number') {
              capturedExitCode = code
            }
          })
          .on('data', (data: Buffer) => {
            const text = data.toString('utf-8').trim()
            if (text) {
              text.split('\n').forEach((line) => log(`[remote] ${line}`, 'info', step))
            }
          })
          .stderr.on('data', (data: Buffer) => {
            const text = data.toString('utf-8').trim()
            if (text) {
              stderrOutput += text + '\n'
              text.split('\n').forEach((line) => log(`[remote-err] ${line}`, 'warning', step))
            }
          })
          .on('close', async (closeCode: any) => {
            const effectiveCode =
              typeof closeCode === 'number'
                ? closeCode
                : typeof capturedExitCode === 'number'
                  ? capturedExitCode
                  : undefined

            // 1. 明确返回退出码 0，直接判定成功
            if (effectiveCode === 0) {
              return resolve()
            }

            // 2. 检查是否出现 Docker 容器名称冲突错误
            const conflictMatch = stderrOutput.match(
              /Conflict\.\s+The container name\s+["']?\/?([^"'\s]+)["']?\s+is already in use/i
            )

            if (conflictMatch && !hasRetried) {
              const conflictName = conflictMatch[1] || expectedContainerName
              if (conflictName) {
                log(
                  `[!] 目标主机返回 Docker 容器名称冲突 [${conflictName}]，正在自动清理旧容器并重试启动...`,
                  'warning',
                  step
                )
                try {
                  await this.cleanupRemoteDockerContainer(conn, conflictName, log)
                  await this.executeRemoteCommandWithRetry(
                    conn,
                    cmd,
                    conflictName,
                    log,
                    step,
                    true // 仅重试一次
                  )
                  return resolve()
                } catch (retryErr: any) {
                  return reject(retryErr)
                }
              }
            }

            // 3. 处理退出码未定义 (undefined / null) 的情况：
            // 在 SSH 远程执行 daemon 后台进程 (如 docker run -d) 时，SSH 服务端可能直接关闭通道而不附带 exit-status 报文
            if (effectiveCode === undefined) {
              const hasCriticalError =
                stderrOutput.trim().length > 0 &&
                /(?:error|conflict|failed|fatal|cannot|denied)/i.test(stderrOutput)

              if (!hasCriticalError) {
                // 如果是 Docker 启动命令且已知容器名，进一步验证容器是否在运行
                if (expectedContainerName) {
                  try {
                    const isRunning = await this.checkContainerExistsRemote(conn, expectedContainerName)
                    if (isRunning) {
                      log(`[00:16] 验证目标主机容器 [${expectedContainerName}] 已正常启动运行`, 'success', step)
                      return resolve()
                    }
                  } catch { }
                }
                // 无严重错误输出且通道正常关闭，判定启动成功
                return resolve()
              }
            }

            // 4. 其他错误场景
            const errMsg = stderrOutput.trim()
              ? `远程启动命令返回退出码 ${effectiveCode ?? '未知'}: ${stderrOutput.trim()}`
              : `远程启动命令返回退出码: ${effectiveCode ?? '未知'}`
            reject(new Error(errMsg))
          })
      })
    })
  }
}
