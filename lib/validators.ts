/**
 * 项目名称命名规范校验器
 * 规范要求：只能包含小写英文字母，数字，"-" 及 "_"，且不能以数字开头和不能包含空格。
 */

export const PROJECT_NAME_REGEX = /^[a-z_-][a-z0-9_-]*$/

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateProjectName(name?: string | null): ValidationResult {
  if (!name || typeof name !== 'string' || name.length === 0) {
    return { valid: false, error: '项目名称不能为空' }
  }

  if (/\s/.test(name)) {
    return { valid: false, error: '项目名称不能包含空格' }
  }

  if (/^[0-9]/.test(name)) {
    return { valid: false, error: '项目名称不能以数字开头' }
  }

  if (!/^[a-z0-9_-]+$/.test(name)) {
    return { valid: false, error: '项目名称只能包含小写英文字母、数字、"-" 及 "_"' }
  }

  return { valid: true }
}
