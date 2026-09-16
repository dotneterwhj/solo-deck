import fs from 'fs'
import path from 'path'
import { spawn, exec, ChildProcess } from 'child_process'
import { Client } from 'ssh2'
import { wrapSshCommand } from './shell-env'
import {
  Project,
  Deployment,
  DeployLogEntry,
  DeploymentStatus,
  TriggerType,
  ServerNode,
  HealthCheckResult,
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
import { DockerDistributorFactory } from './docker-distributor'
import { getRuntime, updateDockerRunEnvVars } from './runtimes'
import { resolvePath } from './cleanup-service'

export type StreamEventType = 'log' | 'status' | 'end'

export interface StreamEvent {
  type: StreamEventType
  deploymentId: string
  payload: any
}

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

type LogListener = (event: StreamEvent) => void

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

  public cancel(deploymentId: string): boolean {
    const controller = this.activeControllers.get(deploymentId)
    if (controller) {
      controller.abort()
      this.activeControllers.delete(deploymentId)

      const dep = getDeploymentById(deploymentId)
      if (dep && dep.status === 'running') {
        const cancelLog: DeployLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          text: `[!] 用户手动取消了部署任务`,
          type: 'error',
          timestamp: new Date().toLocaleTimeString(),
        }
        appendDeployLog(deploymentId, cancelLog)
        this.emit(deploymentId, { type: 'log', deploymentId, payload: cancelLog })

        const durationSeconds = dep.startTime
          ? Math.round((Date.now() - new Date(dep.startTime).getTime()) / 1000)
          : undefined

        updateDeployment(deploymentId, {
          status: 'cancelled',
          endTime: new Date().toISOString(),
          durationSeconds,
          currentStep: '已取消',
        })

        createNotification({
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
    const project = getProjectById(projectId)
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

    const deployment = createDeployment({
      projectId: project.id,
      projectName: project.name,
      branch: project.branch,
      commitHash,
      commitMessage,
      versionTag: customCommit?.versionTag,
      triggerType,
      currentStep: '准备初始化...',
    })

    // Start asynchronous pipeline execution
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

      updateDeployment(deploymentId, {
        status: 'failed',
        endTime: new Date().toISOString(),
        durationSeconds,
        currentStep: '部署异常',
      })
      updateProject(project.id, {
        status: 'error',
      })

      createNotification({
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
    updateProject(project.id, { status: 'deploying' })

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
      server = getServerById(project.serverId)
    }
    if (!server) {
      server = getServerByIp(project.serverIp)
    }

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 1: Git 代码真实检出
    // -------------------------------------------------------------
    setStatus('running', '代码拉取')
    log(`[00:01] 正在执行真实 Git 拉取: ${project.repository} [分支: ${project.branch}]`, 'info', 'GIT_CLONE')

    const hasGit = fs.existsSync(path.join(workspaceDir, '.git'))
    let gitExitCode = 0

    // 构造携带鉴权 Token 的 Git URL
    let gitUrl = project.repository
    if (project.gitToken && gitUrl.startsWith('https://')) {
      const auth = project.gitUsername
        ? `${encodeURIComponent(project.gitUsername)}:${encodeURIComponent(project.gitToken)}@`
        : `${encodeURIComponent(project.gitToken)}@`
      gitUrl = gitUrl.replace('https://', `https://${auth}`)
    }

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
          `git fetch origin && git checkout ${deployment.commitHash}`,
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
        `git fetch origin ${project.branch} && git checkout ${project.branch} && git pull origin ${project.branch}`,
        workspaceDir,
        {},
        abortController.signal,
        log
      )
    }

    if (abortController.signal.aborted) return

    if (gitExitCode !== 0) {
      log(`[!] Git 拉取命令返回非零退出码 (${gitExitCode})`, 'error', 'GIT_CLONE')
      // 如果是非法/测试用的模拟地址，给出诊断信息
      if (project.repository.includes('github.com/team/')) {
        log(`[提示] 检测到示例仓库地址无法真实访问。如需演示真实 Shell，建议新建项目填入真实可访问的公共 Git 仓库地址。`, 'warning', 'GIT_CLONE')
      }
      throw new Error(`Git 代码拉取失败 (退出码: ${gitExitCode})`)
    }

    // -------------------------------------------------------------
    // 从本地检出的 Git 仓库中动态获取真实的 commitHash 与 commitMessage
    // -------------------------------------------------------------
    const gitInfo = await this.getGitCommitInfo(workspaceDir)
    const effectiveCommitHash =
      gitInfo.hash || (deployment.commitHash && deployment.commitHash !== '获取中...' ? deployment.commitHash : '')

    if (gitInfo.hash) {
      deployment.commitHash = gitInfo.hash
      deployment.commitMessage = gitInfo.message
      updateDeployment(deploymentId, {
        commitHash: gitInfo.hash,
        commitMessage: gitInfo.message,
      })
      updateProject(project.id, {
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
    // 部署模式判定：Docker 容器化交付 vs 原生目标机进程部署
    // -------------------------------------------------------------
    const targetMode = project.deployTargetMode || 'docker'
    const runtimePlugin = getRuntime(project.runtime)
    if (targetMode === 'native') {
      log(`[00:03] 【目标载体】原生宿主机进程部署模式 (Native)`, 'info', 'GIT_CLONE')
      const procManager = runtimePlugin?.nativeProcessManager || '原生系统进程'
      log(`[00:03] 语言运行时: ${project.runtime || runtimePlugin?.name || '通用原生'} | 启动管理: ${procManager}`, 'info', 'GIT_CLONE')
    } else {
      // -------------------------------------------------------------
      // 生成与绑定 Docker 镜像版本标签（时间戳 + Git短Hash）
      // -------------------------------------------------------------
      const versionTag =
        deployment.triggerType === 'rollback' && deployment.versionTag
          ? deployment.versionTag
          : generateDockerVersionTag(effectiveCommitHash || deploymentId)
      deployment.versionTag = versionTag
      updateDeployment(deploymentId, { versionTag })
      updateProject(project.id, { lastVersionTag: versionTag })
      this.emit(deploymentId, {
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

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 2: 依赖安装
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
    // 阶段 3: 应用构建
    // -------------------------------------------------------------
    if (project.buildCommand && project.buildCommand.trim()) {
      setStatus('running', '应用构建')

      let effectiveBuildCmd = project.buildCommand
      if (targetMode === 'docker' && effectiveBuildCmd.toLowerCase().includes('docker build')) {
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
          log(`[00:06] [!]    1. 使用 Docker 部署必须在代码仓库根目录下创建名为 'Dockerfile' (无后缀) 的文件`, 'warning', 'BUILD')
          log(`[00:06] [!]    2. 根据项目技术栈编写标准容器镜像构建配置 (可在 CDPipeline 平台查看预设模板)`, 'warning', 'BUILD')
          log(`[00:06] [!]    3. 提交并推送至 Git 远程分支：`, 'warning', 'BUILD')
          log(`[00:06] [!]       git add Dockerfile && git commit -m "feat: add Dockerfile" && git push`, 'warning', 'BUILD')
          log(`[00:06] [!]    4. 推送完成后重新点击【立即部署】即可完成自动构建与发布`, 'warning', 'BUILD')
          throw new Error(`应用构建失败: 代码仓库根目录下未找到 Dockerfile 文件。请参考模板将 Dockerfile 放入项目根目录并推送代码后重试。`)
        } else {
          log(`[00:06] ✓ 成功定位项目根目录下 Dockerfile 配置文件 (${path.basename(targetDockerfilePath)})`, 'success', 'BUILD')
        }

        if (deployment.versionTag) {
          const baseName = this.extractDockerBaseImageName(effectiveBuildCmd, project.name)
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
          const missingRequired = runtimePlugin.dockerBuildArgs.filter((def) => {
            if (!def.required) return false
            const configuredVal = project.dockerBuildArgs?.find((a) => a.key === def.key)?.value
            const inCmd = new RegExp(`--build-arg\\s+${def.key}=`).test(effectiveBuildCmd)
            return (!configuredVal || !configuredVal.trim()) && !inCmd
          })

          if (missingRequired.length > 0) {
            const missingNames = missingRequired.map((m) => m.key).join(', ')
            log(`[00:06] [!] ❌ 错误：缺少必要的 Docker 构建参数 (ARG): ${missingNames}`, 'error', 'BUILD')
            missingRequired.forEach((m) => {
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
                // 已存在同名 build-arg，原地替换为最新配置值
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
      } else if (targetMode === 'native') {
        log(`[00:06] 原生宿主机构建: 执行应用构建命令`, 'info', 'BUILD')
      }

      log(`[00:07] 执行应用构建命令: ${effectiveBuildCmd}`, 'info', 'BUILD')

      const envMap: Record<string, string> = {}
      if (project.envVars && project.envVars.length > 0) {
        project.envVars.forEach((ev) => {
          envMap[ev.key] = ev.value
        })
        log(`[00:07] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
      }

      const buildExit = await this.spawnShell(
        effectiveBuildCmd,
        workspaceDir,
        envMap,
        abortController.signal,
        log
      )

      if (abortController.signal.aborted) return
      if (buildExit !== 0) {
        throw new Error(`应用构建失败 (退出码: ${buildExit})`)
      }
      log(`[00:10] ✓ 应用构建成功完成`, 'success', 'BUILD')
    }

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
      if (project.startCommand && project.startCommand.trim()) {
        if (targetMode === 'docker') {
          const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand, project.envVars)
          log(`[00:11] 目标为本机节点 (127.0.0.1)，执行本地 Docker 容器启动 (已注入 -e 环境变量): ${effectiveStartCmd}`, 'info', 'DEPLOY')
          const containerName = this.extractDockerContainerName(effectiveStartCmd)
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

          let startExit = await this.spawnShell(
            effectiveStartCmd,
            workspaceDir,
            {},
            abortController.signal,
            captureLog
          )

          // 容错恢复：如果仍发生 Docker 容器名称冲突，自动清理冲突容器并重试一次
          if (startExit !== 0 && !abortController.signal.aborted) {
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
                startExit = await this.spawnShell(
                  effectiveStartCmd,
                  workspaceDir,
                  {},
                  abortController.signal,
                  log
                )
              }
            }
          }

          if (startExit !== 0) {
            throw new Error(`服务启动命令返回错误码: ${startExit}`)
          }
        } else {
          // 原生本地进程启动：按系统配置环境变量
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
          const startExit = await this.spawnShell(
            project.startCommand,
            workspaceDir,
            envMap,
            abortController.signal,
            log
          )
          if (startExit !== 0) {
            throw new Error(`原生服务启动命令返回错误码: ${startExit}`)
          }
        }
      }
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

      await this.executeRemoteDeployment(
        server,
        project,
        workspaceDir,
        deploymentId,
        abortController.signal,
        log,
        setStatus,
        deployment.versionTag
      )
      log(`[00:15] ✓ 远程 SSH 产物分发与服务部署全流程顺利完成`, 'success', 'DEPLOY')
    }

    if (abortController.signal.aborted) return

    // -------------------------------------------------------------
    // 阶段 5: 部署完成 (无需即时发起心跳探测，交由后台定时巡检机制)
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
    updateDeployment(deploymentId, {
      status: 'success',
      endTime: nowIso,
      durationSeconds,
      currentStep: '部署完成',
    })
    updateProject(project.id, {
      status: 'active',
      lastDeployed: nowIso,
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
      lastVersionTag: deployment.versionTag,
    })

    createNotification({
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
   * 从构建命令中提取 Docker 镜像标签 (如 docker build -t app:latest . -> app:latest)
   */
  private extractDockerImageTag(buildCommand: string, fallbackName: string): string {
    const match = buildCommand.match(/(?:-t|--tag)\s+([^\s]+)/)
    if (match && match[1]) {
      return match[1].replace(/["']/g, '').trim()
    }
    return `${fallbackName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}:latest`
  }

  /**
   * 从构建命令中提取 Docker 镜像的基础名称（不带 tag，例如 order-service:latest -> order-service）
   */
  private extractDockerBaseImageName(buildCommand: string, fallbackName: string): string {
    const fullTag = this.extractDockerImageTag(buildCommand, fallbackName)
    const parts = fullTag.split(':')
    return parts[0] || fallbackName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
  }

  /**
   * 从启动命令中提取 Docker 容器名称 (例如 docker run -d --name app -p 80:80 app:latest -> app)
   */
  public extractDockerContainerName(startCommand?: string): string | null {
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
   * 清理本机已存在的同名 Docker 容器
   */
  private cleanupLocalDockerContainer(
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
   * 将工作空间构建产物打包为 tar.gz 归档文件（自动排除 .git 源码元数据）
   */
  private packageTarArtifact(workspaceDir: string, archivePath: string): Promise<void> {
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
   * 远程清理目标服务器上已存在的同名 Docker 容器
   */
  private cleanupRemoteDockerContainer(
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
        stream.stderr.on('data', () => {})
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
  private checkContainerExistsRemote(
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
        stream.stderr.on('data', () => {})
        stream.on('close', () => {
          resolve(out.includes('RUNNING'))
        })
      })
    })
  }

  /**
   * 远程执行启动命令，并在遭遇容器名称冲突时自动清理旧容器重试一次
   */
  private executeRemoteCommandWithRetry(
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
                  } catch {}
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

  /**
   * 远程主机真实部署流水线（统一基于 Docker 容器化分发与部署机制）
   */
  private executeRemoteDeployment(
    server: ServerNode,
    project: Project,
    workspaceDir: string,
    deploymentId: string,
    signal: AbortSignal,
    log: (text: string, type?: 'info' | 'success' | 'error' | 'warning', step?: string) => void,
    setStatus: (status: DeploymentStatus, currentStep?: string) => void,
    versionTag?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
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
          log(`[00:11] ✓ SSH 安全隧道握手成功 (目标节点: ${server.name} [${server.ip}])`, 'success', 'SSH')

          try {
            if (project.deployTargetMode === 'native') {
              // =============================================================
              // 原生目标机部署机制 (tar -czf -> SFTP -> tar -xzf -> 原生启动)
              // =============================================================
              const artifactDir = path.join(process.cwd(), '.cicd_artifacts', project.id)
              if (!fs.existsSync(artifactDir)) {
                fs.mkdirSync(artifactDir, { recursive: true })
              }

              const archiveName = `${deploymentId}_app.tar.gz`
              const localArchivePath = path.join(artifactDir, archiveName)

              setStatus('running', '产物打包')
              log(`[00:11] 识别为【原生宿主机部署模式 (Native)】，正在通过 [tar] 打包应用产物 (排除 .git)...`, 'info', 'TAR_PACKAGE')
              await this.packageTarArtifact(workspaceDir, localArchivePath)

              const stat = fs.statSync(localArchivePath)
              const sizeStr =
                stat.size > 1024 * 1024
                  ? `${(stat.size / (1024 * 1024)).toFixed(2)} MB`
                  : `${(stat.size / 1024).toFixed(1)} KB`
              log(`[00:12] ✓ 原生产物打包完成: ${archiveName} (${sizeStr})`, 'success', 'TAR_PACKAGE')

              if (signal.aborted) {
                cleanup()
                return reject(new Error('部署已手动中止'))
              }

              // SFTP 远程分发
              setStatus('running', '产物分发')
              log(`[00:12] 正在建立 SFTP 文件传输会话，准备分发产物至 ${server.ip}...`, 'info', 'TAR_TRANSFER')

              const sftp = await new Promise<any>((resolveSftp, rejectSftp) => {
                conn.sftp((err, sftpSession) => {
                  if (err) return rejectSftp(new Error(`SFTP 会话建立失败: ${err.message}`))
                  resolveSftp(sftpSession)
                })
              })

              const remoteTempArchive = `/tmp/cicd_deploy_${deploymentId}.tar.gz`
              log(`[00:13] 正在通过 SFTP 安全通道上传产物至目标主机临时目录: ${remoteTempArchive}...`, 'info', 'TAR_TRANSFER')

              await new Promise<void>((resolvePut, rejectPut) => {
                sftp.fastPut(localArchivePath, remoteTempArchive, (putErr: any) => {
                  if (putErr) return rejectPut(new Error(`SFTP 产物传输中断: ${putErr.message}`))
                  resolvePut()
                })
              })
              log(`[00:13] ✓ SFTP 产物上传完成，正在远程解压同步至部署目录: ${project.deployPath}...`, 'success', 'TAR_TRANSFER')

              if (signal.aborted) {
                cleanup()
                return reject(new Error('部署已手动中止'))
              }

              // 目标服务器解压与目录同步
              setStatus('running', '解压部署')
              const unpackCmd = `mkdir -p "${project.deployPath}" && tar -xzf "${remoteTempArchive}" -C "${project.deployPath}" && rm -f "${remoteTempArchive}"`

              await new Promise<void>((resolveUnpack, rejectUnpack) => {
                conn.exec(wrapSshCommand(unpackCmd), (err, stream) => {
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
                cleanup()
                return reject(new Error('部署已手动中止'))
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
                      conn.exec(wrapSshCommand(writeEnvCmd), () => resolveEnv())
                    })
                  }
                }
                const remoteStartCmd = `cd "${project.deployPath}" && ${envPrefix} && ${project.startCommand}`
                log(`[00:15] 原生模式已按系统配置环境变量 (注入 export 与写入 .env 配置文件)`, 'info', 'STARTUP')
                log(`[00:15] 远程主机目标目录执行原生启动指令: ${project.startCommand}`, 'info', 'STARTUP')

                await new Promise<void>((resolveStart, rejectStart) => {
                  conn.exec(wrapSshCommand(remoteStartCmd), (err, stream) => {
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

              cleanup()
              resolve()
            } else {
              // =============================================================
              // Docker 镜像分发抽象层 (策略工厂自动派发 Save/Load 或 Registry)
              // =============================================================
              const imageTag = this.extractDockerImageTag(project.buildCommand, project.name)
              const settings = getSettings()
              const distributor = DockerDistributorFactory.getDistributor(project, settings)

              log(
                `[00:11] 识别为【Docker 容器化镜像交付】，版本标签: [${versionTag || 'latest'}]，策略引擎派发: 【${
                  distributor.mode === 'registry'
                    ? '企业级镜像仓库 (docker push/pull)'
                    : 'SFTP 离线直连 (docker save/load)'
                }】`,
                'info',
                'DOCKER_STRATEGY'
              )

              await distributor.distribute({
                isSimulation: false,
                project,
                deploymentId,
                imageTag,
                versionTag,
                server,
                sshConn: conn,
                signal,
                log,
                setStatus,
                settings,
                workspaceDir,
              })

              if (signal.aborted) {
                cleanup()
                return reject(new Error('部署已手动中止'))
              }

              // 容器启动 / 重载
              if (project.startCommand && project.startCommand.trim()) {
                setStatus('running', '容器启动')
                const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand, project.envVars)
                const containerName = this.extractDockerContainerName(effectiveStartCmd)
                if (containerName) {
                  log(`[00:15] 正在检查目标主机同名 Docker 容器 [${containerName}]...`, 'info', 'STARTUP')
                  await this.cleanupRemoteDockerContainer(conn, containerName, log)
                }

                if (project.envVars && project.envVars.length > 0) {
                  log(`[00:15] Docker 容器模式: 环境变量已加入 -e 参数: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
                }
                log(`[00:15] 正在目标主机远程执行容器启动命令: ${effectiveStartCmd}`, 'info', 'STARTUP')

                await this.executeRemoteCommandWithRetry(
                  conn,
                  effectiveStartCmd,
                  containerName,
                  log,
                  'STARTUP'
                )

                log(`[00:16] ✓ 远程容器启动命令执行完毕`, 'success', 'STARTUP')
              } else {
                log(`[00:15] 未配置容器启动命令，镜像分发载入即为完成`, 'info', 'STARTUP')
              }

              cleanup()
              resolve()
            }
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
          text.split('\n').forEach((line: string) => log(`> ${line}`, 'info'))
        }
      })

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString('utf-8').trim()
        if (text) {
          // git clone progress or warnings often come through stderr
          const isRealError = text.toLowerCase().includes('error:') || text.toLowerCase().includes('fatal:')
          text.split('\n').forEach((line: string) => log(`> ${line}`, isRealError ? 'error' : 'warning'))
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
    updateProject(project.id, { status: 'deploying' })

    log(`[00:00] 启动【沙箱模拟模式】部署流水线...`, 'info', 'INIT')
    log(`[00:00] 部署ID: ${deploymentId} | 目标服务器: ${project.serverName} (${project.serverIp})`, 'info', 'INIT')
    log(`[00:00] Git 仓库: ${project.repository} [${project.branch}]`, 'info', 'INIT')

    if (abortController.signal.aborted) return

    // Step 1: Git Checkout
    setStatus('running', '代码拉取')
    log(`[00:01] 正在连接 Git 远程仓库拉取分支 [${project.branch}]...`, 'info', 'GIT_CLONE')
    await this.sleep(1200, abortController.signal)
    log(`[00:02] ✓ 成功检出最新提交 [${deployment.commitHash}]: ${deployment.commitMessage}`, 'success', 'GIT_CLONE')
    updateProject(project.id, {
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
    })

    const isNativeSim = project.deployTargetMode === 'native'

    if (isNativeSim) {
      const plugin = getRuntime(project.runtime)
      log(
        `[00:02] 【原生部署模式 (Native)】目标载体: 宿主机系统进程 (技术栈: ${project.runtime || plugin?.name || '通用原生'} | 托管方式: ${plugin?.nativeProcessManager || '原生进程'})`,
        'info',
        'GIT_CLONE'
      )
    } else {
      const versionTag =
        deployment.triggerType === 'rollback' && deployment.versionTag
          ? deployment.versionTag
          : generateDockerVersionTag(deployment.commitHash || deploymentId)
      deployment.versionTag = versionTag
      updateDeployment(deploymentId, { versionTag })
      updateProject(project.id, { lastVersionTag: versionTag })
      this.emit(deploymentId, {
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
    if (isNativeSim) {
      log(`[00:05] 开始执行原生应用编译构建: ${project.buildCommand || 'npm run build'}`, 'info', 'BUILD')
      if (project.envVars && project.envVars.length > 0) {
        log(`[00:06] 注入环境变量: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'BUILD')
      }
      await this.sleep(2000, abortController.signal)
      log(`[00:07] ✓ 原生应用编译产物构建就绪 (产物大小约 4.8MB)`, 'success', 'BUILD')
    } else {
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
        const baseName = this.extractDockerBaseImageName(project.buildCommand || 'docker build -t app:latest .', project.name)
        log(`[00:06] 【Docker 版本化构建】生成不可变镜像: [${baseName}:${deployment.versionTag}] 及运行别名: [${baseName}:latest]`, 'info', 'BUILD')
      }
      await this.sleep(2200, abortController.signal)
      log(`[00:07] ✓ Docker 容器镜像构建就绪 (镜像大小约 128MB)`, 'success', 'BUILD')
    }

    if (abortController.signal.aborted) return

    // Step 4: Transfer & Deploy
    if (isNativeSim) {
      setStatus('running', '产物打包')
      log(`[00:08] 【原生模式】执行 [tar] 打包应用构建交付产物 (排除 .git)...`, 'info', 'TAR_PACKAGE')
      await this.sleep(1200, abortController.signal)
      setStatus('running', '产物分发')
      log(`[00:09] 正在通过 SFTP 同步构建产物至目标主机 ${project.serverIp}:${project.deployPath}...`, 'info', 'TAR_TRANSFER')
      await this.sleep(1400, abortController.signal)
      setStatus('running', '解压部署')
      log(`[00:10] ✓ 目标主机已解压产物至部署目录: ${project.deployPath}`, 'success', 'TAR_UNPACK')
    } else {
      const tag = this.extractDockerImageTag(project.buildCommand || 'docker build -t app:latest .', project.name)
      const settings = getSettings()
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
        deploymentId,
        imageTag: tag,
        versionTag: deployment.versionTag,
        server: fakeServer,
        signal: abortController.signal,
        log,
        setStatus,
        settings,
      })
    }

    if (abortController.signal.aborted) return

    // Step 5: Start / Reload Process
    setStatus('running', '服务启动')
    if (isNativeSim) {
      const plugin = getRuntime(project.runtime)
      const procManager = plugin?.nativeProcessManager || '原生系统进程'
      if (project.envVars && project.envVars.length > 0) {
        log(`[00:10] 原生模式: 已按系统配置环境变量 (export 与 .env): ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
      }
      log(`[00:10] SSH 远程执行原生启动指令: ${project.startCommand || 'npm start'}`, 'info', 'STARTUP')
      await this.sleep(1400, abortController.signal)
      const portsDisplay =
        project.serverPort && project.serverPort.length > 0
          ? project.serverPort.map((p) => `:${p}`).join(' ')
          : ':3000'
      log(`[00:11] ✓ 原生服务进程重载成功 (${procManager}已托管)，监听端口 ${portsDisplay}`, 'success', 'STARTUP')
    } else {
      const effectiveStartCmd = updateDockerRunEnvVars(project.startCommand || 'docker run ...', project.envVars)
      const simContainerName = this.extractDockerContainerName(effectiveStartCmd)
      if (simContainerName) {
        log(`[00:10] 检测到 Docker 容器命名 [${simContainerName}]，正在平滑停止并清理已存在同名旧容器...`, 'info', 'STARTUP')
        await this.sleep(800, abortController.signal)
        log(`[00:10] ✓ 已安全清理旧容器 [${simContainerName}]，准备启动新版本容器`, 'success', 'STARTUP')
      }
      if (project.envVars && project.envVars.length > 0) {
        log(`[00:10] Docker 容器模式: 环境变量已加入 -e 参数: ${project.envVars.map((e) => `${e.key}=${e.isSecret ? '******' : e.value}`).join(', ')}`, 'info', 'STARTUP')
      }
      log(`[00:10] SSH 远程执行启动指令: ${effectiveStartCmd}`, 'info', 'STARTUP')
      await this.sleep(1400, abortController.signal)
      const portsDisplay =
        project.portMappings && project.portMappings.length > 0
          ? project.portMappings.map((m) => `:${m.host}➔:${m.container}`).join(' ')
          : project.serverPort && project.serverPort.length > 0
          ? project.serverPort.map((p) => `:${p}`).join(' ')
          : ':3000'
      log(`[00:11] ✓ 服务进程重载成功，PID 已分配，监听端口 ${portsDisplay}`, 'success', 'STARTUP')
    }

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
    updateDeployment(deploymentId, {
      status: 'success',
      endTime: nowIso,
      durationSeconds,
      currentStep: '部署完成',
    })
    updateProject(project.id, {
      status: 'active',
      lastDeployed: nowIso,
      lastCommitHash: deployment.commitHash,
      lastCommitMessage: deployment.commitMessage,
      lastVersionTag: deployment.versionTag,
    })

    createNotification({
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
}

// Global singleton instance
const globalForPipeline = global as unknown as { pipelineManager?: PipelineManager }
export const pipelineManager = globalForPipeline.pipelineManager || new PipelineManager()
if (process.env.NODE_ENV !== 'production') globalForPipeline.pipelineManager = pipelineManager

export function extractDockerContainerName(startCommand?: string): string | null {
  return pipelineManager.extractDockerContainerName(startCommand)
}
