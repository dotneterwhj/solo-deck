'use client'

import { useState, useEffect } from 'react'
import {
  Server,
  Plus,
  Radio,
  Check,
  AlertCircle,
  Trash2,
  Edit2,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Activity,
  X,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Cpu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ServerNode, ServerAuthType } from '@/lib/types'
import { ServerEnvModal } from './server-env-modal'
import { formatRelativeTime } from '@/lib/time-utils'

export function ServerManagement() {
  const [servers, setServers] = useState<ServerNode[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedServerForEnv, setSelectedServerForEnv] = useState<ServerNode | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({})

  // New server form
  const [newServer, setNewServer] = useState({
    name: '',
    ip: '',
    port: '22',
    user: 'root',
    authType: 'password' as ServerAuthType,
    password: '',
    privateKey: '',
    passphrase: '',
    tags: '生产, Linux',
    description: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadServers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/servers')
      if (res.ok) {
        const data = await res.json()
        setServers(data)
      }
    } catch (err) {
      console.error('Failed to load servers', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServers()
  }, [])

  const handleTestConnectivity = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch(`/api/servers/${id}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: data.success, msg: data.message },
      }))
      // Refresh server list to update latency and status
      loadServers()
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, msg: `请求异常: ${err.message}` },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const handleDeleteServer = async (id: string) => {
    if (!confirm('确定要删除该服务器节点吗？')) return
    try {
      const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setServers((prev) => prev.filter((s) => s.id !== id))
      }
    } catch (err) {
      console.error('Delete server error', err)
    }
  }

  const handleCreateServer = async () => {
    if (!newServer.name || !newServer.ip) return
    setCreating(true)
    try {
      const tagsArray = newServer.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServer.name,
          ip: newServer.ip,
          port: Number(newServer.port) || 22,
          user: newServer.user,
          authType: newServer.authType,
          password: newServer.password,
          privateKey: newServer.privateKey,
          passphrase: newServer.passphrase,
          tags: tagsArray,
          description: newServer.description,
        }),
      })

      if (res.ok) {
        setShowAddModal(false)
        setNewServer({
          name: '',
          ip: '',
          port: '22',
          user: 'root',
          authType: 'password',
          password: '',
          privateKey: '',
          passphrase: '',
          tags: '生产, Linux',
          description: '',
        })
        loadServers()
      }
    } catch (err) {
      console.error('Create server error', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">主机与集群节点管理</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            配置用于远程构建、同步发布产物以及运行服务的目标主机（支持 SSH 密码与私钥凭据）
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadServers}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新状态
          </Button>

          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="size-4" />
            添加服务器节点
          </Button>
        </div>
      </div>

      {/* Server cards */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          正在加载服务器节点...
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground text-sm">暂无注册的服务器节点</p>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="mt-3 text-xs"
          >
            立即添加首台主机
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((server) => {
            const isOnline = server.status === 'online'
            const isTesting = testingId === server.id
            const isKeyAuth = server.authType === 'privateKey'

            return (
              <div
                key={server.id}
                className="rounded-xl border border-border bg-card p-5 space-y-4 hover:border-primary/40 transition-all shadow-xs"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`size-10 rounded-xl flex items-center justify-center ${isOnline
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-red-500/10 text-red-500'
                        }`}
                    >
                      <Server className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-base">
                          {server.name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${isOnline
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-red-500/10 text-red-500'
                            }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'
                              }`}
                          />
                          {isOnline ? '连接正常' : '不可达/未鉴权'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {server.user}@{server.ip}:{server.port}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteServer(server.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-muted transition-colors"
                    title="删除服务器"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Server specs & auth info */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">SSH 认证方式</span>
                    <span className="font-medium text-foreground flex items-center gap-1 mt-0.5">
                      {isKeyAuth ? (
                        <>
                          <KeyRound className="size-3 text-primary" /> 私钥认证
                        </>
                      ) : (
                        <>
                          <Lock className="size-3 text-primary" /> 密码认证
                        </>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">网络延迟</span>
                    <span className="font-mono font-medium text-foreground block mt-0.5">
                      {isOnline ? `${server.latencyMs || 12} ms` : '超时'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">上次探针</span>
                    <span className="font-medium text-foreground truncate block mt-0.5">
                      {formatRelativeTime(server.lastChecked) || '刚刚'}
                    </span>
                  </div>
                </div>

                {/* Tags & Description */}
                {server.description && (
                  <p className="text-xs text-muted-foreground">{server.description}</p>
                )}

                {server.tags && server.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {server.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Test feedback */}
                {testResults[server.id] && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono flex items-start gap-2 ${testResults[server.id].ok
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                  >
                    {testResults[server.id].ok ? (
                      <Check className="size-4 shrink-0 mt-0.5 text-green-500" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-500" />
                    )}
                    <span>{testResults[server.id].msg}</span>
                  </div>
                )}

                {/* Footer action */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    ID: {server.id}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedServerForEnv(server)}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Cpu className="size-3.5" />
                      运行环境检测与安装
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestConnectivity(server.id)}
                      disabled={isTesting}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Activity className={`size-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                      {isTesting ? 'SSH 握手测试中...' : '测试 SSH 连通性'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Server Modal with SSH Credentials */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
              <div>
                <h3 className="text-base font-bold text-foreground">添加服务器节点</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  配置主机网络地址与 SSH 登录凭据以支持远程构建部署
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  服务器名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="例如：核心生产集群 2 号机"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    IP 地址 / 域名 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="192.168.1.120 或 host.example.com"
                    value={newServer.ip}
                    onChange={(e) => setNewServer({ ...newServer, ip: e.target.value })}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">SSH 端口</label>
                  <Input
                    placeholder="22"
                    value={newServer.port}
                    onChange={(e) => setNewServer({ ...newServer, port: e.target.value })}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  SSH 登录用户名 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="root 或 ubuntu / deploy"
                  value={newServer.user}
                  onChange={(e) => setNewServer({ ...newServer, user: e.target.value })}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              {/* SSH Authentication selection */}
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-xs font-semibold text-muted-foreground block">
                  SSH 身份认证凭据 <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewServer({ ...newServer, authType: 'password' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${newServer.authType === 'password'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                      <Lock className="size-3.5 text-primary" />
                      密码认证 (Password)
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      输入目标服务器对应用户的登录密码
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewServer({ ...newServer, authType: 'privateKey' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${newServer.authType === 'privateKey'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                      <KeyRound className="size-3.5 text-primary" />
                      私钥认证 (Private Key)
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      直接粘贴 OpenSSH RSA / ED25519 私钥
                    </p>
                  </button>
                </div>

                {newServer.authType === 'password' ? (
                  <div className="pt-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      SSH 密码
                    </label>
                    <div className="relative mt-1">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="请输入 SSH 连接密码"
                        value={newServer.password}
                        onChange={(e) =>
                          setNewServer({ ...newServer, password: e.target.value })
                        }
                        className="font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        SSH 私钥文本 (id_rsa / id_ed25519)
                      </label>
                      <textarea
                        rows={4}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        value={newServer.privateKey}
                        onChange={(e) =>
                          setNewServer({ ...newServer, privateKey: e.target.value })
                        }
                        className="w-full mt-1 p-2.5 rounded-md border border-input bg-card font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        私钥口令 (Passphrase，无密码可留空)
                      </label>
                      <Input
                        type="password"
                        placeholder="私钥解密口令"
                        value={newServer.passphrase}
                        onChange={(e) =>
                          setNewServer({ ...newServer, passphrase: e.target.value })
                        }
                        className="mt-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border">
                <label className="text-xs font-semibold text-muted-foreground">
                  分类标签 (英文或中文逗号隔开)
                </label>
                <Input
                  placeholder="生产, 核心网关, Docker"
                  value={newServer.tags}
                  onChange={(e) => setNewServer({ ...newServer, tags: e.target.value })}
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">备注说明</label>
                <Input
                  placeholder="说明该服务器部署的业务组件"
                  value={newServer.description}
                  onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-border bg-muted/20">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleCreateServer}
                disabled={creating || !newServer.name || !newServer.ip}
              >
                {creating ? '添加中...' : '确认添加'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Server Environment Inspector & One-Click Installer Modal */}
      {selectedServerForEnv && (
        <ServerEnvModal
          server={selectedServerForEnv}
          onClose={() => setSelectedServerForEnv(null)}
          onServerUpdated={loadServers}
        />
      )}
    </div>
  )
}
