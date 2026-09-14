/**
 * 时间与相对时间格式化工具
 */

/**
 * 格式化相对时间（如：刚刚、5 分钟前、2 小时前、3 天前）
 * 会依据传入的 now（默认为当前时间）进行实时计算
 */
export function formatRelativeTime(
  dateInput?: string | number | Date | null,
  now: Date = new Date()
): string {
  if (!dateInput) return '未部署'
  if (dateInput === '未部署') return '未部署'

  const date = new Date(dateInput)
  if (isNaN(date.getTime())) {
    // 兼容历史相对时间字符串（如 "2 小时前"）
    return String(dateInput)
  }

  const diffMs = now.getTime() - date.getTime()
  // 容差 60 秒内的未来时间（客户端与服务器时钟轻微偏差）以及小于 1 分钟
  if (diffMs < 60 * 1000) {
    return '刚刚'
  }

  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 60) {
    return `${diffMin} 分钟前`
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }
  if (diffDays < 30) {
    return `${diffDays} 天前`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} 个月前`
  }
  const years = Math.floor(diffDays / 365)
  return `${years} 年前`
}

/**
 * 格式化完整精确时间（如：2026-09-14 13:41:27）
 */
export function formatExactTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return ''

  const pad = (n: number) => n.toString().padStart(2, '0')
  const YYYY = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const DD = pad(date.getDate())
  const HH = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())

  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`
}

/**
 * 格式化短时间（如：09-14 13:41）
 */
export function formatShortTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return ''

  const pad = (n: number) => n.toString().padStart(2, '0')
  const MM = pad(date.getMonth() + 1)
  const DD = pad(date.getDate())
  const HH = pad(date.getHours())
  const mm = pad(date.getMinutes())

  return `${MM}-${DD} ${HH}:${mm}`
}
