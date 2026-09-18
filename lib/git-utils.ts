/**
 * Git 仓库鉴权与 URL 工具函数
 *
 * 专门针对主流 Git 代码托管平台（GitLab、Gitea、GitHub、Bitbucket 等）
 * 在 HTTP Basic Auth 鉴权规范与 Access Token 机制上的差异进行自适应拼装与脱敏。
 */

export type GitProvider = 'gitlab' | 'gitea' | 'github' | 'bitbucket' | 'generic'

/**
 * 根据仓库地址识别 Git 托管平台
 */
export function detectGitProvider(repository: string): GitProvider {
  if (!repository) return 'generic'
  const lower = repository.toLowerCase()

  try {
    const parsed = new URL(repository)
    const host = parsed.hostname.toLowerCase()
    if (host.includes('gitlab')) return 'gitlab'
    if (host.includes('gitea')) return 'gitea'
    if (host.includes('github')) return 'github'
    if (host.includes('bitbucket')) return 'bitbucket'
  } catch {
    // 降级非标准 URL 字符串正则匹配
    if (lower.includes('gitlab')) return 'gitlab'
    if (lower.includes('gitea')) return 'gitea'
    if (lower.includes('github')) return 'github'
    if (lower.includes('bitbucket')) return 'bitbucket'
  }

  return 'generic'
}

/**
 * 构建携带鉴权凭据的 Git HTTPS URL
 *
 * 机制说明：
 * 1. GitLab (PAT/项目令牌)：HTTP Basic Auth 严格校验用户名，只传 token@ 会导致 401 失败。
 *    若用户未显式填写账号，自动缺省将账号适配为 `oauth2`，拼装成 `https://oauth2:<token>@gitlab.com/...`。
 * 2. Gitea：服务端宽容模式支持直接将 Token 作为用户鉴权，拼装成 `https://<token>@gitea.com/...`；
 *    若显式提供了账号，亦支持 `https://<user>:<token>@gitea.com/...`。
 * 3. GitHub：支持 `https://<token>@github.com/...` 或 `https://<user>:<token>@github.com/...`。
 * 4. Bitbucket：建议提供具体用户名，若有提供则拼接 `https://<user>:<token>@bitbucket.org/...`。
 */
export function buildAuthenticatedGitUrl(
  repository: string,
  gitToken?: string,
  gitUsername?: string
): string {
  if (!repository) return ''
  if (!gitToken || !repository.startsWith('https://')) {
    return repository
  }

  const trimmedToken = gitToken.trim()
  if (!trimmedToken) return repository

  const provider = detectGitProvider(repository)
  let username = gitUsername?.trim() || ''

  // 针对不同平台进行智能适配
  if (!username) {
    if (provider === 'gitlab') {
      // GitLab 必须指定 username，Token 对应规范账号为 'oauth2'
      username = 'oauth2'
    }
  }

  try {
    const parsed = new URL(repository)
    if (username) {
      parsed.username = username
      parsed.password = trimmedToken
    } else {
      parsed.username = trimmedToken
      parsed.password = ''
    }
    return parsed.toString()
  } catch {
    // 容错降级回退方案
    const auth = username
      ? `${encodeURIComponent(username)}:${encodeURIComponent(trimmedToken)}@`
      : `${encodeURIComponent(trimmedToken)}@`
    return repository.replace(/^https:\/\/(?:[^@]+@)?/, `https://${auth}`)
  }
}

/**
 * 对包含账号凭证的 Git URL 进行安全脱敏
 * 例如：https://oauth2:glpat-xxxx@gitlab.com/... -> https://***@gitlab.com/...
 */
export function maskGitUrl(text: string): string {
  if (!text) return text
  return text.replace(/https:\/\/[^/@\s]+(?::[^/@\s]*)?@/g, 'https://***@')
}

/**
 * 获取对应平台的 Git 鉴权提示文本（供前端表单展示）
 */
export function getGitAuthHint(repository: string): string {
  const provider = detectGitProvider(repository)

  switch (provider) {
    case 'gitlab':
      return '检测到 GitLab 仓库：使用访问令牌 (PAT) 时，认证账号留空将自动适配为 oauth2（推荐）；也可按需手动指定。'
    case 'gitea':
      return '检测到 Gitea 仓库：支持仅填写 Access Token，认证账号可直接留空。'
    case 'github':
      return '检测到 GitHub 仓库：支持仅填写 Personal Access Token (PAT)，认证账号可直接留空。'
    case 'bitbucket':
      return '检测到 Bitbucket 仓库：建议填写认证账号 (Bitbucket 用户名) 与 App Password。'
    default:
      return '提示：GitLab 访问令牌自动适配 oauth2 账号；Gitea 与 GitHub 支持仅填 Token 无需账号。'
  }
}
