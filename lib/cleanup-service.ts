import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getSettings, updateSettings, createNotification } from './db'
import { SystemSettings } from './types'

const execAsync = promisify(exec)

/**
 * 解析绝对路径并支持 ~ 用户目录展开
 */
export function resolvePath(inputPath?: string): string {
  if (!inputPath || !inputPath.trim()) {
    return path.join(process.cwd(), '.cicd_artifacts')
  }
  const trimmed = inputPath.trim()
  if (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(1))
  }
  if (!path.isAbsolute(trimmed)) {
    return path.resolve(/*turbopackIgnore: true*/ process.cwd(), trimmed)
  }
  return path.resolve(/*turbopackIgnore: true*/ trimmed)
}

export interface ArtifactDiskStats {
  totalBytes: number
  totalFiles: number
  projectCount: number
  formattedSize: string
  projects: Record<string, { files: number; bytes: number; formattedSize: string }>
}

export interface ArtifactCleanResult {
  deletedFiles: number
  reclaimedBytes: number
  reclaimedFormatted: string
  details: string[]
  success: boolean
  error?: string
}

export interface DockerPruneResult {
  success: boolean
  output: string
  reclaimedSpace: string
  deletedImagesCount: number
  error?: string
}

export interface TotalCleanupResult {
  artifacts?: ArtifactCleanResult
  docker?: DockerPruneResult
  cleanedAt: string
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 获取当前 .cicd_artifacts 产物目录的磁盘占用统计
 */
export async function getArtifactDiskStats(customPath?: string): Promise<ArtifactDiskStats> {
  const settings = await getSettings()
  const artifactDir = resolvePath(customPath || settings.artifactPath)
  const result: ArtifactDiskStats = {
    totalBytes: 0,
    totalFiles: 0,
    projectCount: 0,
    formattedSize: '0 B',
    projects: {},
  }

  if (!fs.existsSync(/*turbopackIgnore: true*/ artifactDir)) {
    return result
  }
  try {
    const entries = fs.readdirSync(/*turbopackIgnore: true*/ artifactDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projDir = path.join(/*turbopackIgnore: true*/ artifactDir, entry.name)
        let projFiles = 0
        let projBytes = 0

        try {
          const files = fs.readdirSync(projDir)
          for (const file of files) {
            const filePath = path.join(/*turbopackIgnore: true*/ projDir, file)
            const stat = fs.statSync(/*turbopackIgnore: true*/ filePath)
            if (stat.isFile()) {
              projFiles++
              projBytes += stat.size
            }
          }
        } catch (e) {
          console.error(`Error reading directory ${projDir}:`, e)
        }

        result.projects[entry.name] = {
          files: projFiles,
          bytes: projBytes,
          formattedSize: formatBytes(projBytes),
        }
        result.totalFiles += projFiles
        result.totalBytes += projBytes
        result.projectCount++
      } else if (entry.isFile()) {
        const filePath = path.join(/*turbopackIgnore: true*/ artifactDir, entry.name)
        const stat = fs.statSync(/*turbopackIgnore: true*/ filePath)
        result.totalFiles++
        result.totalBytes += stat.size
      }
    }
  } catch (err) {
    console.error('Error computing artifact disk stats:', err)
  }

  result.formattedSize = formatBytes(result.totalBytes)
  return result
}

/**
 * 执行 .cicd_artifacts 产物包生命周期清理
 */
export async function cleanArtifacts(options?: {
  artifactPath?: string
  retentionDays?: number
  maxKeepPerProject?: number
}): Promise<ArtifactCleanResult> {
  const settings = await getSettings()
  const artifactDir = resolvePath(options?.artifactPath || settings.artifactPath)
  const retentionDays = options?.retentionDays ?? settings.artifactRetentionDays ?? 7
  const maxKeep = options?.maxKeepPerProject ?? settings.artifactMaxKeepPerProject ?? 5

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let deletedFiles = 0
  let reclaimedBytes = 0
  const details: string[] = []

  if (!fs.existsSync(/*turbopackIgnore: true*/ artifactDir)) {
    return {
      deletedFiles: 0,
      reclaimedBytes: 0,
      reclaimedFormatted: '0 B',
      details: ['产物目录不存在，无需清理'],
      success: true,
    }
  }

  try {
    const projectEntries = fs.readdirSync(/*turbopackIgnore: true*/ artifactDir, { withFileTypes: true })

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue
      const projDir = path.join(/*turbopackIgnore: true*/ artifactDir, entry.name)

      const files = fs.readdirSync(projDir)
      const fileStats: { name: string; fullPath: string; mtimeMs: number; size: number }[] = []

      for (const file of files) {
        const fullPath = path.join(/*turbopackIgnore: true*/ projDir, file)
        try {
          const stat = fs.statSync(/*turbopackIgnore: true*/ fullPath)
          if (stat.isFile()) {
            fileStats.push({
              name: file,
              fullPath,
              mtimeMs: stat.mtimeMs,
              size: stat.size,
            })
          }
        } catch {
          // ignore stat errors
        }
      }

      // 按修改时间倒序排列（最新的在最前）
      fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs)

      // 保留策略：每个项目至少保留 1 份最新构建包，避免误删导致无法回滚
      const filesToDelete = new Set<string>()

      // 规则 1：超出单项目最大保留份数的旧包标记删除
      if (fileStats.length > maxKeep) {
        const extraFiles = fileStats.slice(maxKeep)
        for (const f of extraFiles) {
          filesToDelete.add(f.fullPath)
        }
      }

      // 规则 2：超出保留天数的过期包标记删除（跳过第 1 个最新版本）
      for (let i = 1; i < fileStats.length; i++) {
        const f = fileStats[i]
        if (f.mtimeMs < cutoffTime) {
          filesToDelete.add(f.fullPath)
        }
      }

      // 执行删除
      for (const f of fileStats) {
        if (filesToDelete.has(f.fullPath)) {
          try {
            fs.unlinkSync(f.fullPath)
            deletedFiles++
            reclaimedBytes += f.size
            details.push(`删除过期归档: [${entry.name}] ${f.name} (${formatBytes(f.size)})`)
          } catch (e: any) {
            details.push(`删除失败: ${f.name} (${e.message})`)
          }
        }
      }

      // 如果项目目录为空，安全清理空目录
      try {
        const remaining = fs.readdirSync(projDir)
        if (remaining.length === 0) {
          fs.rmdirSync(projDir)
        }
      } catch {
        // ignore
      }
    }

    return {
      deletedFiles,
      reclaimedBytes,
      reclaimedFormatted: formatBytes(reclaimedBytes),
      details,
      success: true,
    }
  } catch (err: any) {
    console.error('Error cleaning artifacts:', err)
    return {
      deletedFiles,
      reclaimedBytes,
      reclaimedFormatted: formatBytes(reclaimedBytes),
      details,
      success: false,
      error: err.message,
    }
  }
}

/**
 * 执行 Docker 镜像定期清理 (docker image prune)
 */
export async function cleanDockerImages(options?: {
  danglingOnly?: boolean
  retentionHours?: number
}): Promise<DockerPruneResult> {
  const settings = await getSettings()
  const danglingOnly = options?.danglingOnly ?? settings.dockerPruneDanglingOnly ?? true
  const retentionHours = options?.retentionHours ?? settings.dockerPruneRetentionHours ?? 72

  let cmd = 'docker image prune -f'
  if (!danglingOnly) {
    // 包含未被任何容器引用的非悬空过期历史镜像
    cmd = `docker image prune -a -f --filter "until=${retentionHours}h"`
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 })
    const output = (stdout || '') + (stderr ? '\n' + stderr : '')

    // 提取回收空间
    const match = output.match(/Total reclaimed space:\s*([\d\.]+\s*[KMGT]?B)/i)
    const reclaimedSpace = match ? match[1] : '0 B'

    // 计算被删除的镜像条数
    const deletedLines = output
      .split('\n')
      .filter((line) => line.trim().startsWith('deleted:'))
    const deletedImagesCount = deletedLines.length

    return {
      success: true,
      output: output.trim(),
      reclaimedSpace,
      deletedImagesCount,
    }
  } catch (err: any) {
    console.error('Docker prune execution error:', err)
    return {
      success: false,
      output: err.stdout || '',
      reclaimedSpace: '0 B',
      deletedImagesCount: 0,
      error: err.message || '执行 docker image prune 失败，请检查 Docker 服务是否正在运行',
    }
  }
}

/**
 * 自动化后台定时清理调度服务
 */
class CleanupScheduler {
  private timer: NodeJS.Timeout | null = null
  private initialized: boolean = false
  private isRunning: boolean = false

  constructor() {
    if (typeof window === 'undefined') {
      setTimeout(() => {
        this.init()
      }, 3000)
    }
  }

  public init() {
    if (this.initialized) return
    this.initialized = true
    this.startScheduler()
  }

  public startScheduler() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    // 每 1 小时检查一次是否满足清理周期条件
    this.timer = setInterval(() => {
      this.checkAndRunScheduledCleanup()
    }, 60 * 60 * 1000)

    // 启动延迟 10 秒后执行初次巡检
    setTimeout(() => {
      this.checkAndRunScheduledCleanup()
    }, 10000)
  }

  /**
   * 检查时间戳并按需执行周期清理
   */
  public async checkAndRunScheduledCleanup() {
    if (this.isRunning) return
    this.isRunning = true

    try {
      const settings = await getSettings()
      const now = Date.now()

      // 1. 产物清理判定
      if (settings.enableArtifactCleanup !== false) {
        const intervalHours = settings.artifactCleanupIntervalHours || 24
        const lastRun = settings.lastArtifactCleanupAt
          ? new Date(settings.lastArtifactCleanupAt).getTime()
          : 0

        if (now - lastRun >= intervalHours * 60 * 60 * 1000) {
          console.log('[CleanupScheduler] 触发 .cicd_artifacts 周期性自动清理...')
          const res = await cleanArtifacts()
          console.log(
            `[CleanupScheduler] 产物清理完成: 删除 ${res.deletedFiles} 个文件，释放空间 ${res.reclaimedFormatted}`
          )
          await updateSettings({ lastArtifactCleanupAt: new Date().toISOString() })
          if (res.deletedFiles > 0) {
            await createNotification({
              type: 'cleanup',
              level: 'info',
              title: '自动任务: 交付物归档清理完成',
              message: `定时巡检自动清理了 ${res.deletedFiles} 个过期产物归档，释放 ${res.reclaimedFormatted} 存储空间。`,
              metadata: { link: 'settings' },
            })
          }
        }
      }

      // 2. Docker 镜像清理判定
      if (settings.enableDockerImagePrune !== false) {
        const intervalHours = settings.dockerPruneIntervalHours || 24
        const lastRun = settings.lastDockerPruneAt
          ? new Date(settings.lastDockerPruneAt).getTime()
          : 0

        if (now - lastRun >= intervalHours * 60 * 60 * 1000) {
          console.log('[CleanupScheduler] 触发 Docker 镜像周期性自动清理 (docker image prune)...')
          const res = await cleanDockerImages()
          console.log(
            `[CleanupScheduler] Docker 清理完成: 释放空间 ${res.reclaimedSpace}，删除镜像 ${res.deletedImagesCount} 个`
          )
          await updateSettings({ lastDockerPruneAt: new Date().toISOString() })
          if (res.deletedImagesCount > 0) {
            await createNotification({
              type: 'cleanup',
              level: 'info',
              title: '自动任务: Docker 镜像清理完成',
              message: `定时巡检清理了 ${res.deletedImagesCount} 个废弃镜像，回收空间 ${res.reclaimedSpace}。`,
              metadata: { link: 'settings' },
            })
          }
        }
      }
    } catch (err) {
      console.error('[CleanupScheduler] 执行自动清理巡检失败:', err)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 手动立即触发清理
   */
  public async triggerManualCleanup(type: 'artifacts' | 'docker' | 'all'): Promise<TotalCleanupResult> {
    const result: TotalCleanupResult = {
      cleanedAt: new Date().toISOString(),
    }

    if (type === 'artifacts' || type === 'all') {
      result.artifacts = await cleanArtifacts()
      await updateSettings({ lastArtifactCleanupAt: result.cleanedAt })
      await createNotification({
        type: 'cleanup',
        level: result.artifacts.success ? 'info' : 'warning',
        title: '交付物归档清理完成',
        message: result.artifacts.success
          ? `已完成构建归档生命周期清理：清理 ${result.artifacts.deletedFiles} 个历史版本，释放 ${result.artifacts.reclaimedFormatted} 空间。`
          : `构建产物清理异常: ${result.artifacts.error || '未知错误'}`,
        metadata: { link: 'settings' },
      })
    }

    if (type === 'docker' || type === 'all') {
      result.docker = await cleanDockerImages()
      await updateSettings({ lastDockerPruneAt: result.cleanedAt })
      await createNotification({
        type: 'cleanup',
        level: result.docker.success ? 'info' : 'warning',
        title: 'Docker 镜像清理完成',
        message: result.docker.success
          ? `已执行 Docker 清理：释放空间 ${result.docker.reclaimedSpace}，清理了 ${result.docker.deletedImagesCount} 个废弃镜像。`
          : `Docker 镜像清理失败: ${result.docker.error || '检查守护进程'}`,
        metadata: { link: 'settings' },
      })
    }

    return result
  }

  public updateConfig(_settings: SystemSettings) {
    this.startScheduler()
  }
}

export const cleanupScheduler = new CleanupScheduler()
