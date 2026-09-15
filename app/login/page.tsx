'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Workflow, User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [platformTitle, setPlatformTitle] = useState('Solo Deck运维平台')

  // 初始化检查是否已登录或免密模式
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.platformTitle) {
          setPlatformTitle(data.platformTitle)
        }
        // 如果已登录或未启用登录认证，直接跳转主控制台
        if (!data.enabled || data.authenticated) {
          router.replace('/')
          return
        }
      })
      .catch((err) => {
        console.error('Check auth error:', err)
      })
      .finally(() => {
        setCheckingAuth(false)
      })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!username.trim()) {
      setErrorMsg('请输入管理员账号')
      return
    }
    if (!password) {
      setErrorMsg('请输入密码')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          rememberMe,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        // 登录成功，跳转至工作台
        router.replace('/')
      } else {
        setErrorMsg(data.error || '账号或密码错误，请核对后重试')
      }
    } catch (err: any) {
      setErrorMsg('登录请求失败，请检查网络或后端服务: ' + (err?.message || '未知异常'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0d1117] text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center animate-pulse">
            <Workflow className="size-6" />
          </div>
          <span className="text-xs text-muted-foreground animate-pulse font-mono">
            正在验证系统身份状态...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0a0d14] via-[#0d1117] to-[#161b22] p-4 text-foreground relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-32 size-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 size-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Main Card */}
        <div className="rounded-2xl border border-border/70 bg-card/85 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto size-12 rounded-2xl bg-primary/20 border border-primary/30 text-primary flex items-center justify-center shadow-lg shadow-primary/10 mb-3">
              <Workflow className="size-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {platformTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              轻量自研自动化发布 · 请输入管理员凭据进入工作台
            </p>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground block">
                管理员账号
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <User className="size-4" />
                </div>
                <Input
                  type="text"
                  placeholder="请输入账号"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 text-sm font-medium bg-background/50 border-input"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground block">
                登录密码
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Lock className="size-4" />
                </div>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 text-sm font-medium bg-background/50 border-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-3.5 rounded border-border text-primary focus:ring-primary/30 accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">保持登录状态</span>
              </label>
              <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1 font-mono">
                <ShieldCheck className="size-3.5 text-primary" />
                安全受控环境
              </span>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 text-sm font-semibold h-10 mt-2 shadow-sm"
            >
              {loading ? (
                <>
                  <span className="size-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  正在校验身份...
                </>
              ) : (
                <>
                  登录系统
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-muted-foreground/60 mt-4">
          Solo Deck CI/CD Pipeline Automation Engine · Built with Next.js 16 & React 19
        </p>
      </div>
    </div>
  )
}
