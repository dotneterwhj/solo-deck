import { Project, HealthCheckResult } from './types'
import { readDb, updateProject } from './db'

/**
 * 执行针对单个项目的健康检查 / 心跳探针探测
 */
export async function checkProjectHealth(project: Project): Promise<HealthCheckResult> {
  const nowIso = new Date().toISOString()
  const rawUrl = project.healthCheckUrl?.trim()

  // 1. 如果未配置心跳检查 URL
  if (!rawUrl) {
    const result: HealthCheckResult = {
      status: 'unconfigured',
      message: '未配置心跳探针 URL',
      checkedAt: project.lastHealthCheck?.checkedAt || nowIso,
    }
    if (project.healthStatus !== 'unconfigured' || !project.lastHealthCheck) {
      updateProject(project.id, {
        healthStatus: 'unconfigured',
        lastHealthCheck: result,
      })
    }
    return result
  }

  // 2. 沙箱安全模拟模式 (Simulation)
  if (project.runnerMode === 'simulation') {
    if (project.status === 'stopped') {
      const result: HealthCheckResult = {
        status: 'unhealthy',
        statusCode: 503,
        responseTimeMs: 8,
        message: '服务已停止运行 (ECONNREFUSED)',
        url: rawUrl,
        checkedAt: nowIso,
      }
      updateProject(project.id, {
        healthStatus: 'unhealthy',
        lastHealthCheck: result,
      })
      return result
    }

    if (project.status === 'error') {
      const result: HealthCheckResult = {
        status: 'unhealthy',
        statusCode: 500,
        responseTimeMs: 14,
        message: '服务进程异常 (500 Internal Server Error)',
        url: rawUrl,
        checkedAt: nowIso,
      }
      updateProject(project.id, {
        healthStatus: 'unhealthy',
        lastHealthCheck: result,
      })
      return result
    }

    // 运行中模拟正常
    const result: HealthCheckResult = {
      status: 'healthy',
      statusCode: 200,
      responseTimeMs: Math.floor(Math.random() * 20) + 12,
      message: 'HTTP 200 OK (模拟响应)',
      url: rawUrl,
      checkedAt: nowIso,
    }
    updateProject(project.id, {
      healthStatus: 'healthy',
      lastHealthCheck: result,
    })
    return result
  }

  // 3. 真实系统 Shell / 网络模式 (Real Mode)
  const startTime = Date.now()
  try {
    const controller = new AbortController()
    const timeoutTimer = setTimeout(() => controller.abort(), 4000)

    const resp = await fetch(rawUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'CDPipeline-HealthProbe/1.0',
        Accept: '*/*',
      },
    })
    clearTimeout(timeoutTimer)
    const duration = Date.now() - startTime

    if (resp.status >= 200 && resp.status < 400) {
      const result: HealthCheckResult = {
        status: 'healthy',
        statusCode: resp.status,
        responseTimeMs: duration,
        message: `HTTP ${resp.status} ${resp.statusText || 'OK'}`,
        url: rawUrl,
        checkedAt: nowIso,
      }
      updateProject(project.id, {
        healthStatus: 'healthy',
        lastHealthCheck: result,
      })
      return result
    } else {
      const result: HealthCheckResult = {
        status: 'unhealthy',
        statusCode: resp.status,
        responseTimeMs: duration,
        message: `HTTP ${resp.status} ${resp.statusText || '探针异常状态'}`,
        url: rawUrl,
        checkedAt: nowIso,
      }
      updateProject(project.id, {
        healthStatus: 'unhealthy',
        lastHealthCheck: result,
      })
      return result
    }
  } catch (err: any) {
    const duration = Date.now() - startTime
    const isTimeout = err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout')
    const errMsg = isTimeout
      ? '探针探测超时 (>4000ms)'
      : err.message || '探针连接失败 (ECONNREFUSED)'

    const result: HealthCheckResult = {
      status: 'unhealthy',
      statusCode: isTimeout ? 504 : 0,
      responseTimeMs: duration,
      message: errMsg,
      url: rawUrl,
      checkedAt: nowIso,
    }
    updateProject(project.id, {
      healthStatus: 'unhealthy',
      lastHealthCheck: result,
    })
    return result
  }
}

/**
 * 批量执行所有项目的健康检查探针
 */
export async function checkAllProjectsHealth(): Promise<Record<string, HealthCheckResult>> {
  const db = readDb()
  const results: Record<string, HealthCheckResult> = {}

  // 并发检查所有项目
  await Promise.all(
    db.projects.map(async (proj) => {
      try {
        const res = await checkProjectHealth(proj)
        results[proj.id] = res
      } catch (e: any) {
        results[proj.id] = {
          status: 'unhealthy',
          message: e.message || '探针执行异常',
          checkedAt: new Date().toISOString(),
        }
      }
    })
  )

  return results
}

/**
 * 定时心跳探测调度器
 * 负责后台定时巡检所有已配置探针的项目，避免在部署刚结束时因应用未就绪产生误报
 */
export class HealthCheckScheduler {
  private timer: NodeJS.Timeout | null = null
  private isChecking: boolean = false
  private intervalSeconds: number = 30
  private enabled: boolean = true
  private lastRunAt?: string
  private initialized: boolean = false

  constructor() {
    if (typeof window === 'undefined') {
      setTimeout(() => {
        this.init()
      }, 2000)
    }
  }

  public init() {
    if (this.initialized) return
    this.initialized = true
    try {
      const { getSettings } = require('./db')
      const settings = getSettings()
      this.enabled = settings.enablePeriodicHealthCheck ?? true
      this.intervalSeconds = Math.max(5, settings.healthCheckIntervalSeconds || 30)
    } catch {
      this.enabled = true
      this.intervalSeconds = 30
    }

    if (this.enabled) {
      this.start()
    }
  }

  public start() {
    this.enabled = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.timer = setInterval(() => {
      this.runCheck()
    }, this.intervalSeconds * 1000)

    // 延迟 1 秒异步执行一次基准心跳检查
    setTimeout(() => {
      this.runCheck()
    }, 1000)
  }

  public stop() {
    this.enabled = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  public updateConfig(enabled: boolean, intervalSeconds: number) {
    this.initialized = true
    this.enabled = enabled
    this.intervalSeconds = Math.max(5, intervalSeconds)
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.enabled) {
      this.start()
    }
  }

  public async runCheck(): Promise<Record<string, HealthCheckResult> | null> {
    if (this.isChecking) return null
    this.isChecking = true
    try {
      const results = await checkAllProjectsHealth()
      this.lastRunAt = new Date().toISOString()
      return results
    } catch (err) {
      console.error('[HealthCheckScheduler] 定时心跳探测异常:', err)
      return null
    } finally {
      this.isChecking = false
    }
  }

  public getStatus() {
    return {
      enabled: this.enabled,
      intervalSeconds: this.intervalSeconds,
      isChecking: this.isChecking,
      lastRunAt: this.lastRunAt,
    }
  }
}

// Global singleton instance
const globalForHealth = global as unknown as { healthCheckScheduler?: HealthCheckScheduler }
export const healthCheckScheduler =
  globalForHealth.healthCheckScheduler || new HealthCheckScheduler()
globalForHealth.healthCheckScheduler = healthCheckScheduler


