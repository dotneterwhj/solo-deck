import fs from 'fs'
import path from 'path'
import { spawn, exec } from 'child_process'
import { Client } from 'ssh2'
import {
  Project,
  Deployment,
  DeployLogEntry,
  DeploymentStatus,
  TriggerType,
  ServerNode,
} from './types'
import {
  getProjectById,
  updateProject,
  createDeployment,
  updateDeployment,
  appendDeployLog,
  getDeploymentById,
  getServerById,
  getServerByIp,
  getSettings,
  createNotification,
} from './db'
import {
  getCarrier,
  CarrierContext,
  CarrierSimulateContext,
  IPipelineCarrier,
  generateDockerVersionTag,
  extractDockerContainerName,
  StreamEvent,
  StreamEventType,
  carrierRegistry,
  registerCarrier,
} from './carriers'
import { buildAuthenticatedGitUrl, maskGitUrl } from './git-utils'

export type { StreamEventType, StreamEvent }
export { generateDockerVersionTag, extractDockerContainerName, carrierRegistry, getCarrier, registerCarrier }
export type { IPipelineCarrier }

type LogListener = (event: StreamEvent) => void

/**
 * 流水线全局调度管理器 (PipelineManager)
 * 职责：
 * 1. 负责部署生命周期调度、状态机维护与事件推流 (SSE Stream)
 * 2. 调度 Git 检出、依赖安装及部署完成统计与通知
 * 3. 委派具体部署载体执行驱动 (IPipelineCarrier: docker / native / docker_compose) 完成专属构建、分发与进程托管
 */
class PipelineManager {
  private listeners: Map<string, Set<LogListener>> = new Map()
  private activeControllers: Map<string, AbortController> = new Map()

  public subscribe(deploymentId: string, listener: LogListener): () => void {
    if (!this.listeners.has(deploymentId)) {
      this.listeners.set(deploymentId, new Set())
    }
    this.listeners.get(deploymentId)!.add(listener)

    return () => {
      const set = this.listeners.get(deploymentId)
      if (set) {
        set.delete(listener)
        if (set.size === 0) {
          this.listeners.delete(deploymentId)
        }
      }
    }
  }

  private emit(deploymentId: string, event: StreamEvent) {
    const set = this.listeners.get(deploymentId)
    if (set) {
      set.forEach((listener) => {
        try {
          listener(event)
        } catch (e) {
          console.error('Error dispatching stream event', e)
        }
      })
    }
  }

  public async cancel(deploymentId: string): Promise<boolean> {
    const controller = this.activeControllers.get(deploymentId)
    if (controller) {
      controller.abort()
      this.activeControllers.delete(deploymentId)

      const dep = await getDeploymentById(deploymentId)
      if (dep && dep.status === 'running') {
        const cancelLog: DeployLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          text: `[!] 用户手动取消了部署任务`,
          type: 'error',
          timestamp: new Date().toLocaleTimeString(),
        }
        await appendDeployLog(deploymentId, cancelLog)
        this.emit(deploymentId, { type: 'log', deploymentId, payload: cancelLog })

        const durationSeconds = dep.startTime
          ? Math.round((Date.now() - new Date(dep.startTime).getTime()) / 1000)
          : undefined

        await updateDeployment(deploymentId, {
          status: 'cancelled',
          endTime: new Date().toISOString(),
          durationSeconds,
          currentStep: '已取消',
        })

        await createNotification({
          type: 'deployment',
          level: 'warning',
          title: `项目【${dep.projectName}】部署任务已取消`,
          message: `已手动终止分支 ${dep.branch} 的部署流水线。`,
          metadata: {
            projectId: dep.projectId,
            projectName: dep.projectName,
            deploymentId: dep.id,
            link: 'deployment',
          },
        })

        this.emit(deploymentId, {
          type: 'status',
          deploymentId,
          payload: { status: 'cancelled', currentStep: '已取消', durationSeconds, startTime: dep.startTime },
        })
        this.emit(deploymentId, {
          type: 'end',
          deploymentId,
          payload: { status: 'cancelled', durationSeconds },
        })
      }
      return true
    }
    return false
  }

  public async trigger(
    projectId: string,
    triggerType: TriggerType = 'manual',
    customCommit?: { hash?: string; message?: string; versionTag?: string }
  ): Promise<Deployment> {
    const project = await getProjectById(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    const isReal = project.runnerMode === 'real'
    const commitHash =
      customCommit?.hash || (isReal ? '获取中...' : Math.random().toString(16).substring(2, 9))
    const commitMessage =
      customCommit?.message ||
      (isReal
        ? (triggerType === 'rollback' ? `rollback: 回滚到版本 ${customCommit?.hash || ''}` : '等待代码拉取...')
        : (triggerType === 'manual'
          ? `manual: 触发构建部署分支 ${project.branch}`
          : triggerType === 'rollback'
            ? `rollback: 回滚到版本 ${commitHash}`
            : `webhook: 自动触发分支 ${project.branch}`))

    const deployment = await createDeployment({
      projectId: project.id,
      projectName: project.name,
      branch: project.branch,
      commitHash,
      commitMessage,
      versionTag: customCommit?.versionTag,
      triggerType,
      currentStep: '准备初始化...',
    })

    // 异步执行流水线任务
    this.executePipeline(project, deployment).catch((err) => {
      console.error('Pipeline execution error:', err)
    })

    return deployment
  }

  private async executePipeline(project: Project, deployment: Deployment): Promise<void> {
    const deploymentId = deployment.id
    const abortController = new AbortController()
    this.activeControllers.set(deploymentId, abortController)

    const startTime = Date.now()

    const log = (
      text: string,
      type: 'info' | 'success' | 'error' | 'warning' = 'info',
      step?: string
    ) => {
      const entry: DeployLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        text,
        type,
        step,
        timestamp: new Date().toLocaleTimeString(),
      }
      appendDeployLog(deploymentId, entry)
      this.emit(deploymentId, { type: 'log', deploymentId, payload: entry })
    }

    const setStatus = (status: DeploymentStatus, currentStep?: string) => {
      updateDeployment(deploymentId, { status, currentStep })
      this.emit(deploymentId, {
        type: 'status',
        deploymentId,
        payload: { status, currentStep, startTime: deployment.startTime },
      })
    }

    try {
      if (project.runnerMode === 'real') {
        await this.executeRealPipeline(
          project,
          deployment,
          abortController,
          log,
          setStatus,
          startTime
        )
      } else {
        await this.executeSimulatedPipeline(
          project,
          deployment,
          abortController,
          log,
          setStatus,
          startTime
        )
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        return
      }

      const durationSeconds = Math.round((Date.now() - startTime) / 1000)
      log(`[!] 流水线异常终止: ${err.message || '未知异常'}`, 'error')

      await updateDeployment(deploymentId, {
        status: 'failed',
        endTime: new Date().toISOString(),
        durationSeconds,
        currentStep: '部署异常',
      })
      await updateProject(project.id, {
        status: 'error',
      })

      await createNotification({
        type: 'deployment',
        level: 'error',
        title: `项目【${project.name}】部署失败`,
        message: `分支 ${project.branch} 流水线执行异常终止：${err.message || '未知错误'}`,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          deploymentId,
          link: 'deployment',
        },
      })

      this.emit(deploymentId, {
        type: 'status',
        deploymentId,
        payload: { status: 'failed', currentStep: '部署异常', durationSeconds, startTime: deployment.startTime },
      })
      this.emit(deploymentId, {
        type: 'end',
        deploymentId,
        payload: { status: 'failed', durationSeconds },
      })
    } finally {
      this.activeControllers.delete(deploymentId)
    }
  }

  /**
   * 真实 Shell 与远程 SSH 执行引擎
   */
  private async executeRealPipeline(
    project: Project,
    deployment: Deployment,
    abortController: AbortController,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void,
    setStatus: (status: DeploymentStatus, currentStep?: string) => void,
    startTime: number
  ): Promise<void> {
    const deploymentId = deployment.id
    setStatus('running', '初始化环境')
    await updateProject(project.id, { status: 'deploying' })

    const workspaceDir = path.join(process.cwd(), '.cicd_workspaces', project.id)
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true })
    }

    const portsDisplay =
      project.deployTargetMode === 'docker' && project.portMappings && project.portMappings.length > 0
        ? project.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')
        : project.serverPort && project.serverPort.length > 0
        ? project.serverPort.map((p) => `:${p}`).join(' ')
        : ':3000'
    log(`[00:00] 目标部署服务: ${project.serverName} (${project.serverIp}${portsDisplay.startsWith(':') ? ' ' + portsDisplay : ' ' + portsDisplay})`, 'info', 'INIT')

    // 查找目标服务器节点及其 SSH 凭据
    let server: ServerNode | undefined
    if (project.serverId) {
      server = await getServerById(project.serverId)
    }
    if (!server) {
      server = await getServerByIp(project.serverIp)
    }

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 1: Git 代码真实检出
    // -------------------------------------------------------------
    setStatus('running', '代码拉取')
    log(`[00:01] 正在执行真实 Git 拉取: ${project.repository} [分支: ${project.branch}]`, 'info', 'GIT_CLONE')

    const hasGit = fs.existsSync(path.join(workspaceDir, '.git'))
    let gitExitCode = 0

    // 构造携带鉴权 Token 的 Git URL (自适应 GitLab oauth2 与 Gitea/GitHub/Bitbucket 鉴权机制)
    const gitUrl = buildAuthenticatedGitUrl(project.repository, project.gitToken, project.gitUsername)

    if (deployment.triggerType === 'rollback' && deployment.commitHash && deployment.commitHash !== '获取中...') {
      log(`[00:01] 【一键回滚】定位检出历史版本 Commit: [${deployment.commitHash}]`, 'info', 'GIT_CLONE')
      if (!hasGit) {
        gitExitCode = await this.spawnShell(
          `git clone ${gitUrl} . && git checkout ${deployment.commitHash}`,
          workspaceDir,
          {},
          abortController.signal,
          log
        )
      } else {
        gitExitCode = await this.spawnShell(
          `git remote set-url origin ${gitUrl} && git fetch origin && git checkout ${deployment.commitHash}`,
          workspaceDir,
          {},
          abortController.signal,
          log
        )
      }
    } else if (!hasGit) {
      gitExitCode = await this.spawnShell(
        `git clone --depth=1 --branch ${project.branch} ${gitUrl} .`,
        workspaceDir,
        {},
        abortController.signal,
        log
      )
    } else {
      gitExitCode = await this.spawnShell(
        `git remote set-url origin ${gitUrl} && git fetch origin ${project.branch} && git checkout ${project.branch} && git pull origin ${project.branch}`,
        workspaceDir,
        {},
        abortController.signal,
        log
      )
    }

    if (abortController.signal.aborted) return

    if (gitExitCode !== 0) {
      log(`[!] Git 拉取命令返回非零退出码 (${gitExitCode})`, 'error', 'GIT_CLONE')
      if (project.repository.includes('github.com/team/')) {
        log(`[提示] 检测到示例仓库地址无法真实访问。如需演示真实 Shell，建议新建项目填入真实可访问的公共 Git 仓库地址。`, 'warning', 'GIT_CLONE')
      }
      throw new Error(`Git 代码拉取失败 (退出码: ${gitExitCode})`)
    }

    // 动态获取检出仓库的实际 Commit Hash 与 Commit Message
    const gitInfo = await this.getGitCommitInfo(workspaceDir)
    const effectiveCommitHash =
      gitInfo.hash || (deployment.commitHash && deployment.commitHash !== '获取中...' ? deployment.commitHash : '')

    if (gitInfo.hash) {
      deployment.commitHash = gitInfo.hash
      deployment.commitMessage = gitInfo.message
      await updateDeployment(deploymentId, {
        commitHash: gitInfo.hash,
        commitMessage: gitInfo.message,
      })
      await updateProject(project.id, {
        lastCommitHash: gitInfo.hash,
        lastCommitMessage: gitInfo.message,
      })
      this.emit(deploymentId, {
        type: 'status',
        deploymentId,
        payload: {
          commitHash: gitInfo.hash,
          commitMessage: gitInfo.message,
        },
      })
      log(
        `[00:03] ✓ 成功检出最新提交 [${gitInfo.hash}]: ${gitInfo.message}${
          gitInfo.author ? ` (提交者: ${gitInfo.author})` : ''
        }`,
        'success',
        'GIT_CLONE'
      )
    } else {
      log(`[00:03] ✓ 代码检出成功完成`, 'success', 'GIT_CLONE')
    }

    // -------------------------------------------------------------
    // 获取当前载体驱动 (IPipelineCarrier: Docker / Native / Docker Compose)
    // -------------------------------------------------------------
    const carrier = getCarrier(project.deployTargetMode)
    const settings = await getSettings()

    const carrierCtx: CarrierContext = {
      project,
      deployment,
      workspaceDir,
      server,
      signal: abortController.signal,
      log,
      setStatus,
      emit: (evt) => this.emit(deploymentId, evt),
      settings,
      versionTag: deployment.versionTag,
      effectiveCommitHash,
      spawnShell: (cmd, cwd, env, captureLog) =>
        this.spawnShell(cmd, cwd, env || {}, abortController.signal, captureLog || log),
    }

    await carrier.onAfterCheckout(carrierCtx)
    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 2: 通用依赖安装
    // -------------------------------------------------------------
    if (project.installCommand && project.installCommand.trim()) {
      setStatus('running', '依赖安装')
      log(`[00:04] 执行依赖安装命令: ${project.installCommand}`, 'info', 'DEPENDENCY')

      const installExit = await this.spawnShell(
        project.installCommand,
        workspaceDir,
        {},
        abortController.signal,
        log
      )

      if (abortController.signal.aborted) return
      if (installExit !== 0) {
        throw new Error(`依赖安装失败 (退出码: ${installExit})`)
      }
      log(`[00:06] ✓ 依赖安装顺利完成`, 'success', 'DEPENDENCY')
    }

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 3: 应用构建 (委派对应载体驱动完成)
    // -------------------------------------------------------------
    await carrier.executeBuild(carrierCtx)
    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 4: 服务部署与进程启动 (本机直接运行 vs 远程 SSH 连接)
    // -------------------------------------------------------------
    setStatus('running', '服务部署')

    const isLocalhost =
      project.serverIp === '127.0.0.1' ||
      project.serverIp === 'localhost' ||
      project.serverIp.trim() === ''

    if (isLocalhost) {
      await carrier.deployLocal(carrierCtx)
      log(`[00:12] ✓ 本地服务启动命令已派发`, 'success', 'DEPLOY')
    } else {
      // 远程主机部署：必须通过 SSH 连接
      log(`[00:11] 开始连接远程主机部署: ${project.serverIp}:${server?.port || 22}...`, 'info', 'DEPLOY')

      if (!server) {
        throw new Error(
          `未找到目标服务器【${project.serverIp}】的登记节点与 SSH 认证凭据。请先在【主机管理】中登记该服务器并配置 SSH 密码或私钥！`
        )
      }

      log(
        `[00:11] SSH 认证主体: 用户【${server.user}】，认证模式: 【${
          server.authType === 'privateKey' ? 'SSH私钥' : '密码认证'
        }】`,
        'info',
        'DEPLOY'
      )

      await this.connectAndDeployRemote(server, carrierCtx, carrier)
      log(`[00:15] ✓ 远程 SSH 产物分发与服务部署全流程顺利完成`, 'success', 'DEPLOY')
    }

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 5: 部署完成
    // -------------------------------------------------------------
    const durationSeconds = Math.round((Date.now() - startTime) / 1000)

    if (project.healthCheckUrl && project.healthCheckUrl.trim()) {
      log(
        `[00:15] ℹ 服务已启动完毕！心跳健康监测已交由后台定时巡检机制自动执行，跳过部署即时探针探测`,
        'info',
        'COMPLETE'
      )
    }

    log(`[00:15] ✓ 【真实系统流水线】执行顺利完成！总耗时: ${durationSeconds} 秒`, 'success', 'COMPLETE')

    const nowIso = new Date().toISOString()
    await updateDeployment(deploymentId, {
      status: 'success',
      endTime: nowIso,
      durationSeconds,
      currentStep: '部署完成',
    })
    await updateProject(project.id, {
      status: 'active',
      lastDeployed: nowIso,
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
      lastVersionTag: deployment.versionTag,
    })

    await createNotification({
      type: 'deployment',
      level: 'success',
      title: `项目【${project.name}】部署成功`,
      message: `分支 ${project.branch} (${deployment.commitHash?.slice(0, 7) || '最新'}) 真实交付顺利完成，耗时 ${durationSeconds} 秒。`,
      metadata: {
        projectId: project.id,
        projectName: project.name,
        deploymentId,
        link: 'deployment',
      },
    })

    this.emit(deploymentId, {
      type: 'status',
      deploymentId,
      payload: { status: 'success', currentStep: '部署完成', durationSeconds, startTime: deployment.startTime },
    })
    this.emit(deploymentId, {
      type: 'end',
      deploymentId,
      payload: { status: 'success', durationSeconds },
    })
  }

  /**
   * 建立远程 SSH 会话并委派载体执行远程交付
   */
  private connectAndDeployRemote(
    server: ServerNode,
    carrierCtx: CarrierContext,
    carrier: IPipelineCarrier
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const signal = carrierCtx.signal
      if (signal.aborted) {
        return reject(new Error('Operation aborted'))
      }

      const conn = new Client()
      let isDone = false

      const cleanup = () => {
        if (!isDone) {
          isDone = true
          try {
            conn.end()
          } catch {}
        }
      }

      signal.addEventListener('abort', () => {
        cleanup()
        reject(new Error('部署已手动中止'))
      })

      conn
        .on('ready', async () => {
          carrierCtx.log(`[00:11] ✓ SSH 安全隧道握手成功 (目标节点: ${server.name} [${server.ip}])`, 'success', 'SSH')
          carrierCtx.sshConn = conn

          try {
            await carrier.deployRemote(carrierCtx)
            cleanup()
            resolve()
          } catch (deployErr: any) {
            cleanup()
            reject(deployErr)
          }
        })
        .on('error', (err: any) => {
          cleanup()
          const msg = err?.message || ''
          if (msg.includes('authentication') || msg.includes('All configured authentication methods failed')) {
            reject(
              new Error(
                `远程 SSH 鉴权失败：用户名【${server.user}】或 ${server.authType === 'privateKey' ? '私钥' : '密码'}错误`
              )
            )
          } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
            reject(
              new Error(
                `远程目标主机【${server.ip}:${server.port}】网络不可达或拒绝连接，请确认网络路由与防火墙`
              )
            )
          } else {
            reject(err)
          }
        })

      const connConfig: any = {
        host: server.ip,
        port: server.port || 22,
        username: server.user || 'root',
        readyTimeout: 5000,
      }

      if (server.authType === 'privateKey') {
        connConfig.privateKey = server.privateKey
        if (server.passphrase) connConfig.passphrase = server.passphrase
      } else {
        connConfig.password = server.password || ''
      }

      conn.connect(connConfig)
    })
  }

  /**
   * 沙箱模拟执行引擎 (适用于开发测试与离线演示)
   */
  private async executeSimulatedPipeline(
    project: Project,
    deployment: Deployment,
    abortController: AbortController,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void,
    setStatus: (status: DeploymentStatus, currentStep?: string) => void,
    startTime: number
  ): Promise<void> {
    const deploymentId = deployment.id
    setStatus('running', '初始化环境')
    await updateProject(project.id, { status: 'deploying' })

    log(`[00:00] 启动【沙箱模拟模式】部署流水线...`, 'info', 'INIT')
    log(`[00:00] 部署ID: ${deploymentId} | 目标服务器: ${project.serverName} (${project.serverIp})`, 'info', 'INIT')
    log(`[00:00] Git 仓库: ${project.repository} [${project.branch}]`, 'info', 'INIT')

    if (abortController.signal.aborted) return

    // Step 1: Git Checkout
    setStatus('running', '代码拉取')
    log(`[00:01] 正在连接 Git 远程仓库拉取分支 [${project.branch}]...`, 'info', 'GIT_CLONE')
    await this.sleep(1200, abortController.signal)
    log(`[00:02] ✓ 成功检出最新提交 [${deployment.commitHash}]: ${deployment.commitMessage}`, 'success', 'GIT_CLONE')
    await updateProject(project.id, {
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
    })

    const carrier = getCarrier(project.deployTargetMode)
    const settings = await getSettings()

    const simCtx: CarrierSimulateContext = {
      project,
      deployment,
      signal: abortController.signal,
      log,
      setStatus,
      emit: (evt) => this.emit(deploymentId, evt),
      settings,
      versionTag: deployment.versionTag,
      sleep: (ms) => this.sleep(ms, abortController.signal),
    }

    await carrier.simulateAfterCheckout(simCtx)
    if (abortController.signal.aborted) return

    // Step 2: Install Dependencies / Preflight
    if (project.installCommand && project.installCommand.trim()) {
      setStatus('running', '依赖检查')
      log(`[00:03] 执行依赖预检/安装命令: ${project.installCommand}`, 'info', 'DEPENDENCY')
      await this.sleep(1800, abortController.signal)
      log(`[00:05] ✓ 依赖检查完成，lockfile 校验通过`, 'success', 'DEPENDENCY')
    }

    if (abortController.signal.aborted) return

    // Step 3: Build Application
    setStatus('running', '编译构建')
    await carrier.simulateBuild(simCtx)
    if (abortController.signal.aborted) return

    // Step 4: Transfer & Deploy
    await carrier.simulateDeploy(simCtx)
    if (abortController.signal.aborted) return

    // Step 5: Start / Reload Process
    setStatus('running', '服务启动')
    await carrier.simulateStart(simCtx)
    if (abortController.signal.aborted) return

    // Step 6: Complete
    const durationSeconds = Math.round((Date.now() - startTime) / 1000)
    if (project.healthCheckUrl && project.healthCheckUrl.trim()) {
      log(
        `[00:12] ℹ 服务已启动完毕，心跳健康检查已移交由后台定时巡检任务执行，跳过部署即时探测`,
        'info',
        'COMPLETE'
      )
    }
    log(`[00:14] ✓ 流水线执行成功！总耗时: ${durationSeconds} 秒`, 'success', 'COMPLETE')

    const nowIso = new Date().toISOString()
    await updateDeployment(deploymentId, {
      status: 'success',
      endTime: nowIso,
      durationSeconds,
      currentStep: '部署完成',
    })
    await updateProject(project.id, {
      status: 'active',
      lastDeployed: nowIso,
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
      lastVersionTag: deployment.versionTag,
    })

    await createNotification({
      type: 'deployment',
      level: 'success',
      title: `项目【${project.name}】部署成功 (模拟)`,
      message: `分支 ${project.branch} (${deployment.commitHash?.slice(0, 7) || '最新'}) 模拟构建部署完成，耗时 ${durationSeconds} 秒。`,
      metadata: {
        projectId: project.id,
        projectName: project.name,
        deploymentId,
        link: 'deployment',
      },
    })

    this.emit(deploymentId, {
      type: 'status',
      deploymentId,
      payload: { status: 'success', currentStep: '部署完成', durationSeconds, startTime: deployment.startTime },
    })
    this.emit(deploymentId, {
      type: 'end',
      deploymentId,
      payload: { status: 'success', durationSeconds },
    })
  }

  /**
   * 从检出的 Git 工作目录中获取实际 Commit Hash 与 Commit Message
   */
  private getGitCommitInfo(
    workspaceDir: string
  ): Promise<{ hash: string; message: string; author: string }> {
    return new Promise((resolve) => {
      exec(
        'git log -1 --format="%h%x09%s%x09%an"',
        { cwd: workspaceDir, timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve({ hash: '', message: '', author: '' })
          } else {
            const parts = stdout.trim().split('\t')
            resolve({
              hash: parts[0] || '',
              message: parts[1] || '',
              author: parts[2] || '',
            })
          }
        }
      )
    })
  }

  /**
   * 本地子进程执行与标准输出实时捕获
   */
  private spawnShell(
    command: string,
    cwd: string,
    customEnv: Record<string, string>,
    signal: AbortSignal,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(new Error('Operation aborted'))
      }

      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'cmd.exe' : '/bin/sh'
      const shellArgs = isWindows ? ['/c', command] : ['-c', command]

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, ...customEnv },
      })

      const onAbort = () => {
        child.kill()
        reject(new Error('命令已手动终止'))
      }
      signal.addEventListener('abort', onAbort, { once: true })

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString('utf-8').trim()
        if (text) {
          text.split('\n').forEach((line: string) => log(`> ${maskGitUrl(line)}`, 'info'))
        }
      })

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString('utf-8').trim()
        if (text) {
          const isRealError = text.toLowerCase().includes('error:') || text.toLowerCase().includes('fatal:')
          text.split('\n').forEach((line: string) => log(`> ${maskGitUrl(line)}`, isRealError ? 'error' : 'warning'))
        }
      })

      child.on('error', (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      })

      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort)
        resolve(code ?? 0)
      })
    })
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Operation aborted'))
      }

      const timer = setTimeout(() => {
        resolve()
      }, ms)

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new Error('Operation aborted'))
          },
          { once: true }
        )
      }
    })
  }

  public extractDockerContainerName(startCommand?: string): string | null {
    return extractDockerContainerName(startCommand)
  }
}

// Global singleton instance
const globalForPipeline = global as unknown as { pipelineManager?: PipelineManager }
export const pipelineManager = globalForPipeline.pipelineManager || new PipelineManager()
if (process.env.NODE_ENV !== 'production') globalForPipeline.pipelineManager = pipelineManager
