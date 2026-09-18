import { PortMapping, EnvVariable } from '../types'
import { IRuntimePlugin, DockerBuildArgDefinition } from '../runtimes/types'

/**
 * 将字符串转为安全命名 slug (如 My App -> my-app)
 */
export function toSafeSlug(name?: string): string {
  if (!name) return 'app'
  const trimmed = name.trim().toLowerCase()
  const slug = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || 'app'
}

/**
 * 格式化环境变量为 Docker -e 参数
 */
export function formatDockerEnvArgs(envVars?: { key: string; value: string }[]): string {
  if (!envVars || envVars.length === 0) return ''
  return envVars
    .filter((e) => e.key && e.key.trim())
    .map((e) => `-e ${e.key.trim()}="${(e.value ?? '').replace(/"/g, '\\"')}"`)
    .join(' ')
}

/**
 * 更新 docker run 命令中的 -e / --env 环境变量参数
 */
export function updateDockerRunEnvVars(
  startCommand: string,
  envVars?: { key: string; value: string }[]
): string {
  if (!startCommand || !startCommand.includes('docker run')) {
    return startCommand
  }

  const validEnvVars = (envVars || []).filter((e) => e.key && e.key.trim())
  const envFlags = formatDockerEnvArgs(validEnvVars)

  // 移除既有的 -e 和 --env 参数，避免重复
  const envRegex = /(?:^|\s)(?:-e|--env)(?:=|\s+)(?:[a-zA-Z0-9_.-]+=(?:"(?:\\"|[^"])*"|'[^']*'|[^\s]*)|"(?:\\"|[^"])*"|'[^']*'|[^\s]+)/g
  let cleaned = startCommand
  let prev = ''
  while (prev !== cleaned) {
    prev = cleaned
    cleaned = cleaned.replace(envRegex, '').trim().replace(/\s+/g, ' ')
  }

  if (!envFlags) {
    return cleaned
  }

  // 优先插入在 --name 之前
  if (cleaned.includes(' --name ')) {
    return cleaned.replace(' --name ', ` ${envFlags} --name `)
  }

  // 如果没有 --name，插入在 -p 端口映射之后
  const portMatch = cleaned.match(/docker run.*?(-p\s+["']?[^"'\s]+["']?)/)
  if (portMatch && portMatch[1]) {
    return cleaned.replace(portMatch[1], `${portMatch[1]} ${envFlags}`)
  }

  // 默认插入在 docker run 后面
  return cleaned.replace(/^docker run/, `docker run ${envFlags}`)
}

/**
 * 更新 docker run 命令中的端口映射参数 (-p / --publish)
 */
export function updateDockerRunPorts(
  startCommand: string,
  ports: number[] | PortMapping[],
  containerPorts?: number[]
): string {
  if (!startCommand || !startCommand.includes('docker run')) {
    return startCommand
  }
  let mappings: PortMapping[] = []
  if (Array.isArray(ports) && ports.length > 0) {
    if (typeof ports[0] === 'object' && ports[0] !== null && 'host' in (ports[0] as any)) {
      mappings = (ports as PortMapping[])
        .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
        .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
    } else {
      const numPorts = (ports as number[]).map(Number).filter((p) => !isNaN(p) && p > 0)
      mappings = numPorts.map((p, idx) => ({
        host: p,
        container: containerPorts && containerPorts[idx] ? containerPorts[idx] : p,
      }))
    }
  }
  if (mappings.length === 0) {
    return startCommand
  }

  const portFlags = mappings.map((m) => `-p ${m.host}:${m.container}`).join(' ')

  const portRegex = /(?:-p|--publish)(?:=|\s+)["']?(?:(?:\d+:)?\d+(?:\/(?:tcp|udp))?)["']?/g

  if (startCommand.match(portRegex)) {
    let replacedFirst = false
    const replaced = startCommand.replace(portRegex, () => {
      if (!replacedFirst) {
        replacedFirst = true
        return portFlags
      }
      return ''
    })
    return replaced.replace(/\s+/g, ' ').trim()
  }

  if (startCommand.includes(' --name ')) {
    return startCommand.replace(' --name ', ` ${portFlags} --name `)
  }

  return startCommand.replace(/^docker run(?:\s+-d)?/, (match) => `${match} ${portFlags}`)
}

/**
 * 解析并规范化端口映射列表 (host -> container)
 */
export function resolvePortMappings(
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
 * 载体命令生成与参数安全更新策略接口 (ICarrierCommandStrategy)
 * 彻底解耦运行环境 (Runtime) 与交付模式 (Carrier)
 */
export interface ICarrierCommandStrategy {
  /** 载体模式唯一标识，如 'docker', 'native', 'docker_compose' */
  readonly mode: string

  /** 载体展示名称 */
  readonly name: string

  /** 生成依赖安装命令 */
  getInstallCommand(runtime: IRuntimePlugin, projectName?: string): string

  /** 生成应用编译/构建命令 */
  getBuildCommand(runtime: IRuntimePlugin, projectName?: string): string

  /** 生成服务启动命令 */
  getStartCommand(
    runtime: IRuntimePlugin,
    projectName?: string,
    ports?: PortMapping[] | number[] | number,
    envVars?: EnvVariable[]
  ): string

  /** 端口变动时安全更新 startCommand (就地增量替换或保留自定义命令) */
  updateStartCommandOnPortChange(
    currentCmd: string,
    newPorts: number[] | PortMapping[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    envVars?: EnvVariable[],
    oldPorts?: number[]
  ): string

  /** 环境变量变动时安全更新 startCommand (就地增量替换或保留自定义命令) */
  updateStartCommandOnEnvChange(
    currentCmd: string,
    updatedEnvVars: EnvVariable[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    ports?: number[] | PortMapping[]
  ): string

  /** 获取目标主机前置检测所需的依赖工具列表 */
  getRequiredTools(runtime?: IRuntimePlugin): string[]
}

/**
 * Docker 容器载体命令策略
 */
export class DockerCommandStrategy implements ICarrierCommandStrategy {
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
    ports?: PortMapping[] | number[] | number,
    envVars?: EnvVariable[]
  ): string {
    const slug = toSafeSlug(projectName)
    const mappings = resolvePortMappings(ports, runtime?.defaultPort || 3000)
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
}

/**
 * 原生宿主机进程载体命令策略
 */
export class NativeCommandStrategy implements ICarrierCommandStrategy {
  readonly mode = 'native'
  readonly name = '原生宿主机进程'

  getInstallCommand(runtime: IRuntimePlugin, _projectName?: string): string {
    return runtime?.defaultNativeInstallCmd || 'npm install'
  }

  getBuildCommand(runtime: IRuntimePlugin, _projectName?: string): string {
    return runtime?.defaultNativeBuildCmd || 'npm run build'
  }

  getStartCommand(
    runtime: IRuntimePlugin,
    projectName?: string,
    ports?: PortMapping[] | number[] | number,
    _envVars?: EnvVariable[]
  ): string {
    if (runtime && typeof runtime.getNativeStartCommand === 'function') {
      return runtime.getNativeStartCommand(projectName, ports)
    }
    return runtime?.defaultNativeStartCmd || 'npm start'
  }

  updateStartCommandOnPortChange(
    currentCmd: string,
    newPorts: number[] | PortMapping[],
    isCustomized: boolean,
    runtime: IRuntimePlugin,
    slug: string,
    envVars?: EnvVariable[],
    oldPorts?: number[]
  ): string {
    if (isCustomized) {
      const primaryNewPort =
        Array.isArray(newPorts) && newPorts.length > 0
          ? typeof newPorts[0] === 'object' && newPorts[0] !== null && 'host' in (newPorts[0] as any)
            ? (newPorts[0] as PortMapping).host
            : Number(newPorts[0])
          : null

      const primaryOldPort = oldPorts && oldPorts[0] ? oldPorts[0] : null

      if (primaryNewPort && primaryOldPort && primaryOldPort !== primaryNewPort) {
        const portRegex = new RegExp(`(?<=[:=\\s])${primaryOldPort}(?=[\\s"']|$)`, 'g')
        if (portRegex.test(currentCmd)) {
          return currentCmd.replace(portRegex, String(primaryNewPort))
        }
      }
      return currentCmd
    }
    return this.getStartCommand(runtime, slug, newPorts, envVars)
  }

  updateStartCommandOnEnvChange(
    currentCmd: string,
    _updatedEnvVars: EnvVariable[],
    _isCustomized: boolean,
    _runtime: IRuntimePlugin,
    _slug: string,
    _ports?: number[] | PortMapping[]
  ): string {
    // 原生宿主机模式：环境变量统一通过 .env 文件或 SSH 环境变量注入，绝不修改启动命令
    return currentCmd
  }

  getRequiredTools(runtime?: IRuntimePlugin): string[] {
    return runtime?.requiredNativeTools || []
  }
}

/**
 * 载体命令策略注册表 (全局单例)
 */
class CarrierCommandRegistry {
  private static instance: CarrierCommandRegistry
  private strategies: Map<string, ICarrierCommandStrategy> = new Map()

  private constructor() {
    this.register(new DockerCommandStrategy())
    this.register(new NativeCommandStrategy())
  }

  public static getInstance(): CarrierCommandRegistry {
    if (!CarrierCommandRegistry.instance) {
      CarrierCommandRegistry.instance = new CarrierCommandRegistry()
    }
    return CarrierCommandRegistry.instance
  }

  public register(strategy: ICarrierCommandStrategy): void {
    this.strategies.set(strategy.mode.toLowerCase(), strategy)
  }

  public get(mode?: string): ICarrierCommandStrategy {
    const key = (mode || 'docker').toLowerCase()
    const s = this.strategies.get(key)
    if (s) return s
    const fallback = this.strategies.get('docker')
    if (fallback) return fallback
    throw new Error(`未找到载体模式 [${mode}] 对应的命令策略`)
  }

  public getAll(): ICarrierCommandStrategy[] {
    return Array.from(this.strategies.values())
  }
}

export const carrierCommandRegistry = CarrierCommandRegistry.getInstance()

export function getCarrierCommandStrategy(mode?: string): ICarrierCommandStrategy {
  return carrierCommandRegistry.get(mode)
}

export function registerCarrierCommandStrategy(strategy: ICarrierCommandStrategy): void {
  carrierCommandRegistry.register(strategy)
}
