import type { Client } from 'ssh2'
import {
  Project,
  Deployment,
  DeployLogEntry,
  DeploymentStatus,
  ServerNode,
  SystemSettings,
  DeployTargetMode,
  PortMapping,
  EnvVariable,
} from '../types'

export type CarrierMode = DeployTargetMode | 'docker_compose' | string

export type StreamEventType = 'log' | 'status' | 'end'

export interface StreamEvent {
  type: StreamEventType
  deploymentId: string
  payload: any
}

export type LogFunction = (
  text: string,
  type?: DeployLogEntry['type'],
  step?: string
) => void

export type SetStatusFunction = (
  status: DeploymentStatus,
  currentStep?: string
) => void

export type EmitFunction = (event: StreamEvent) => void

export type ShellExecutor = (
  command: string,
  cwd: string,
  customEnv?: Record<string, string>,
  captureLog?: LogFunction
) => Promise<number>

/**
 * 真实部署环境下的载体执行上下文
 */
export interface CarrierContext {
  project: Project
  deployment: Deployment
  workspaceDir: string
  server?: ServerNode
  sshConn?: Client | null
  signal: AbortSignal
  log: LogFunction
  setStatus: SetStatusFunction
  emit: EmitFunction
  settings: SystemSettings
  versionTag?: string
  spawnShell: ShellExecutor
  effectiveCommitHash: string
}

/**
 * 沙箱模拟执行环境下的载体上下文
 */
export interface CarrierSimulateContext {
  project: Project
  deployment: Deployment
  server?: ServerNode
  signal: AbortSignal
  log: LogFunction
  setStatus: SetStatusFunction
  emit: EmitFunction
  settings: SystemSettings
  versionTag?: string
  sleep: (ms: number) => Promise<void>
}

import { IRuntimePlugin } from '../runtimes/types'

/**
 * Pipeline 部署载体执行器抽象接口 (IPipelineCarrier)
 * 支持扩展 Docker、Native、Docker Compose 等多种部署交付载体
 */
export interface IPipelineCarrier {
  /** 载体模式唯一标识，如 'docker', 'native', 'docker_compose' */
  readonly mode: CarrierMode

  /** 载体展示名称 */
  readonly name: string

  /**
   * 生成该载体下的依赖安装命令 (如 Docker 模式下无需安装或 docker version，Native 模式下委托给语言插件)
   */
  getInstallCommand(runtime: IRuntimePlugin, projectName?: string): string

  /**
   * 生成该载体下的应用构建命令 (如 Docker 模式下 docker build，Native 模式下委托给语言插件)
   */
  getBuildCommand(runtime: IRuntimePlugin, projectName?: string): string

  /**
   * 生成该载体下的服务启动命令 (如 Docker 模式下 docker run，Native 模式下委托给语言插件守护进程)
   */
  getStartCommand(
    runtime: IRuntimePlugin,
    projectName?: string,
    ports?: PortMapping[] | number[] | number,
    envVars?: EnvVariable[]
  ): string

  /**
   * 端口变动时安全更新 startCommand (就地增量替换或保留自定义命令)
   */
  updateStartCommandOnPortChange(
    currentCmd: string,
    newPorts: number[] | PortMapping[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    envVars?: EnvVariable[],
    oldPorts?: number[]
  ): string

  /**
   * 环境变量变动时安全更新 startCommand (就地增量替换或保留自定义命令)
   */
  updateStartCommandOnEnvChange(
    currentCmd: string,
    updatedEnvVars: EnvVariable[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    ports?: number[] | PortMapping[]
  ): string

  /**
   * 获取目标主机前置检测所需的依赖工具列表
   */
  getRequiredTools(runtime?: IRuntimePlugin): string[]

  /**
   * 阶段 1: 代码拉取检出完成后针对该载体的准备工作 (例如生成并绑定版本标签等)
   */
  onAfterCheckout(ctx: CarrierContext): Promise<void>

  /**
   * 阶段 3: 执行应用构建 (如校验 Dockerfile、注入 build-arg 或执行原生编译命令)
   */
  executeBuild(ctx: CarrierContext): Promise<void>

  /**
   * 阶段 4: 本地部署 (目标服务器为 127.0.0.1 / localhost)
   */
  deployLocal(ctx: CarrierContext): Promise<void>

  /**
   * 阶段 4: 远程主机服务部署 (通过 SSH 连接与远程执行)
   */
  deployRemote(ctx: CarrierContext): Promise<void>

  /**
   * 沙箱模拟模式: 检出后初始化钩子
   */
  simulateAfterCheckout(ctx: CarrierSimulateContext): Promise<void>

  /**
   * 沙箱模拟模式: 模拟编译构建
   */
  simulateBuild(ctx: CarrierSimulateContext): Promise<void>

  /**
   * 沙箱模拟模式: 模拟分发与部署
   */
  simulateDeploy(ctx: CarrierSimulateContext): Promise<void>

  /**
   * 沙箱模拟模式: 模拟启动服务进程/容器
   */
  simulateStart(ctx: CarrierSimulateContext): Promise<void>
}
