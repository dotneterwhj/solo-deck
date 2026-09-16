import { DockerfileTemplate, IRuntimePlugin, RuntimeEnvVarPreset, DeployTargetMode, DockerBuildArgDefinition, PortMapping } from './types'

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
 * 将环境变量格式化为 Docker -e 参数字符串
 */
export function formatDockerEnvArgs(envVars?: { key: string; value: string }[]): string {
  if (!envVars || envVars.length === 0) return ''
  return envVars
    .filter((e) => e.key && e.key.trim())
    .map((e) => `-e ${e.key.trim()}="${(e.value ?? '').replace(/"/g, '\\"')}"`)
    .join(' ')
}

/**
 * 将环境变量加入到 docker run 命令中（清洗已有 -e / --env 参数并注入最新参数）
 */
export function updateDockerRunEnvVars(startCommand: string, envVars?: { key: string; value: string }[]): string {
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

  // 如果没有 --name，插入在 -p 端口映射之后或 docker run 之后
  const portMatch = cleaned.match(/docker run.*?(-p\s+["']?[^"'\s]+["']?)/)
  if (portMatch && portMatch[1]) {
    return cleaned.replace(portMatch[1], `${portMatch[1]} ${envFlags}`)
  }

  // 默认插入在 docker run 后面
  return cleaned.replace(/^docker run/, `docker run ${envFlags}`)
}

/**
 * 更新 docker run 命令中的端口映射参数 (-p / --publish)，支持自定义容器端口映射
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
        container: (containerPorts && containerPorts[idx]) ? containerPorts[idx] : p,
      }))
    }
  }
  if (mappings.length === 0) {
    return startCommand
  }

  const portFlags = mappings.map((m) => `-p ${m.host}:${m.container}`).join(' ')

  // 匹配所有已有的 -p / --publish 参数
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

  // 若原有命令没有 -p 参数，优先插入在 --name 前面
  if (startCommand.includes(' --name ')) {
    return startCommand.replace(' --name ', ` ${portFlags} --name `)
  }

  // 默认插入在 docker run 之后
  return startCommand.replace(/^docker run(?:\s+-d)?/, (match) => `${match} ${portFlags}`)
}

/**
 * 从运行命令中提取所有宿主机端口列表 (支持多端口提取)
 */
export function extractPortsFromCommand(cmd: string): number[] {
  if (!cmd) return []
  const ports: number[] = []
  const dockerMatches = cmd.matchAll(/(?:-p|--publish)(?:=|\s+)["']?(?:(\d+):)?(\d+)(?:\/(?:tcp|udp))?["']?/g)
  for (const m of dockerMatches) {
    const hostPort = Number(m[1] || m[2])
    if (hostPort && !ports.includes(hostPort)) {
      ports.push(hostPort)
    }
  }
  if (ports.length > 0) return ports

  const bindMatch = cmd.match(/-b\s+["']?(?:[0-9.]+)?:(\d+)["']?/)
  if (bindMatch && Number(bindMatch[1])) {
    return [Number(bindMatch[1])]
  }
  const portFlagMatch = cmd.match(/(?:--port[=\s]+|-p\s+)(\d+)/)
  if (portFlagMatch && Number(portFlagMatch[1])) {
    return [Number(portFlagMatch[1])]
  }
  return []
}

/**
 * 从 Docker 启动指令中提取所有端口映射对列表 (host -> container)
 */
export function extractPortMappingsFromCommand(cmd: string): PortMapping[] {
  if (!cmd) return []
  const mappings: PortMapping[] = []
  const dockerMatches = cmd.matchAll(/(?:-p|--publish)(?:=|\s+)["']?(?:(\d+):)?(\d+)(?:\/(?:tcp|udp))?["']?/g)
  for (const m of dockerMatches) {
    const hostPort = Number(m[1] || m[2])
    const containerPort = Number(m[2] || m[1])
    if (hostPort && containerPort && !mappings.some((map) => map.host === hostPort && map.container === containerPort)) {
      mappings.push({ host: hostPort, container: containerPort })
    }
  }
  return mappings
}

export abstract class BaseRuntimePlugin implements IRuntimePlugin {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly category: string
  abstract readonly description: string
  abstract readonly defaultPort: number
  abstract readonly baseImage: string

  // 原生部署指令与环境要求 (面向目标机原生执行应用进程)
  abstract readonly defaultNativeInstallCmd: string
  abstract readonly defaultNativeBuildCmd: string
  abstract readonly defaultNativeStartCmd: string
  abstract readonly requiredNativeTools: string[]
  readonly nativeProcessManager: string = '原生系统进程'
  readonly nativeRequirementDesc: string = '目标服务器需具备对应语言运行环境与依赖工具。'

  // Docker 容器化交付规范
  abstract readonly dockerfileTemplate: string
  abstract readonly dockerignoreTemplate: string
  readonly requiredDockerTools: string[] = ['docker']
  readonly dockerBuildArgs?: DockerBuildArgDefinition[] = undefined

  readonly sampleEnvVars?: RuntimeEnvVarPreset[]
  readonly keyFeatures?: string[] = []
  readonly placementPath: string = '项目代码根目录 / Dockerfile'

  getInstallCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeInstallCmd
    }
    return `docker version`
  }

  getBuildCommand(projectName?: string, options?: { mode?: DeployTargetMode; versionTag?: string }): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeBuildCmd
    }
    const slug = toSafeSlug(projectName)
    return `docker build -t ${slug}:latest .`
  }

  /**
   * 解析并规范化端口映射对列表 (host -> container)
   */
  resolvePortMappings(
    port?: number | number[] | PortMapping[],
    options?: {
      containerPort?: number | number[]
      portMappings?: PortMapping[]
    }
  ): PortMapping[] {
    if (options?.portMappings && Array.isArray(options.portMappings) && options.portMappings.length > 0) {
      const valid = options.portMappings
        .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
        .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
      if (valid.length > 0) return valid
    }

    if (Array.isArray(port) && port.length > 0 && typeof port[0] === 'object' && port[0] !== null && 'host' in port[0]) {
      const valid = (port as PortMapping[])
        .map((m) => ({ host: Number(m.host), container: Number(m.container) }))
        .filter((m) => !isNaN(m.host) && !isNaN(m.container) && m.host > 0 && m.container > 0)
      if (valid.length > 0) return valid
    }

    const hostPorts: number[] = Array.isArray(port)
      ? (port.map(Number).filter((p) => !isNaN(p) && p > 0))
      : (typeof port === 'number' && !isNaN(port) && port > 0 ? [port] : [this.defaultPort])
    const finalHosts = hostPorts.length > 0 ? hostPorts : [this.defaultPort]

    const containerPorts: number[] = Array.isArray(options?.containerPort)
      ? options.containerPort.map(Number).filter((p) => !isNaN(p) && p > 0)
      : (typeof options?.containerPort === 'number' && !isNaN(options.containerPort) && options.containerPort > 0 ? [options.containerPort] : [])

    return finalHosts.map((h, idx) => ({
      host: h,
      container: containerPorts[idx] ?? (containerPorts.length === 1 && finalHosts.length > 1 ? containerPorts[0] : h),
    }))
  }

  /**
   * 提取原生模式下的主监听端口
   */
  extractNativePort(port?: number | number[] | PortMapping[]): number {
    if (Array.isArray(port) && port.length > 0) {
      const first = port[0]
      if (typeof first === 'object' && first !== null && 'host' in first) {
        return Number(first.host) || this.defaultPort
      }
      return Number(first) || this.defaultPort
    }
    if (!Array.isArray(port) && typeof port === 'object' && port !== null && 'host' in port) {
      return Number((port as PortMapping).host) || this.defaultPort
    }
    if (typeof port === 'number' && !isNaN(port) && port > 0) {
      return port
    }
    return this.defaultPort
  }

  getStartCommand(
    projectName?: string,
    port?: number | number[] | PortMapping[],
    options?: {
      mode?: DeployTargetMode
      versionTag?: string
      envVars?: { key: string; value: string }[]
      containerPort?: number | number[]
      portMappings?: PortMapping[]
    }
  ): string {
    const mode = options?.mode || 'docker'
    if (mode === 'native') {
      return this.defaultNativeStartCmd
    }
    const slug = toSafeSlug(projectName)
    const mappings = this.resolvePortMappings(port, options)
    const portFlags = mappings.map((m) => `-p ${m.host}:${m.container}`).join(' ')
    const baseCmd = `docker run -d ${portFlags} --name ${slug} ${slug}:latest`
    return updateDockerRunEnvVars(baseCmd, options?.envVars)
  }

  getRequiredTools(mode: DeployTargetMode = 'docker'): string[] {
    if (mode === 'docker') {
      return this.requiredDockerTools
    }
    return this.requiredNativeTools
  }

  toDockerfileTemplate(): DockerfileTemplate {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      defaultPort: String(this.defaultPort),
      baseImage: this.baseImage,
      placementPath: this.placementPath,
      sampleBuildCmd: this.getBuildCommand('app', { mode: 'docker' }),
      sampleStartCmd: this.getStartCommand('app', this.defaultPort, { mode: 'docker' }),
      keyFeatures: this.keyFeatures || [],
      dockerfile: this.dockerfileTemplate,
      dockerignore: this.dockerignoreTemplate,
      dockerBuildArgs: this.dockerBuildArgs,
    }
  }
}
