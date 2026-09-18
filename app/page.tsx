'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Workflow } from 'lucide-react'
import { Dashboard } from '@/components/layout/dashboard'
import { ViewType } from '@/components/layout/sidebar'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { ProjectList } from '@/components/projects/project-list'
import { ProjectDetailModal } from '@/components/projects/project-detail-modal'
import { CloneProjectModal } from '@/components/projects/clone-project-modal'
import { NewProjectWizard } from '@/components/projects/new-project-wizard'
import { DeployModal } from '@/components/deployments/deploy-modal'
import { ConfirmDeployDialog } from '@/components/deployments/confirm-deploy-dialog'
import { PreflightEnvDialog } from '@/components/deployments/preflight-env-dialog'
import { ServerManagement } from '@/components/servers/server-management'
import { SystemSettings } from '@/components/settings/system-settings'
import { HelpModal } from '@/components/guides/help-modal'
import { Project, ServerNode, ServerEnvInfo } from '@/lib/types'
import { getRequiredEnvKeys } from '@/lib/env-presets'

export default function Page() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<string>('admin')

  const [view, setView] = useState<ViewType>('dashboard')
  const [projects, setProjects] = useState<Project[]>([])
  const [servers, setServers] = useState<ServerNode[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // Modals state
  const [showNewProjectWizard, setShowNewProjectWizard] = useState(false)
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null)
  const [activeDetailProject, setActiveDetailProject] = useState<Project | null>(null)
  const [cloneSourceProject, setCloneSourceProject] = useState<Project | null>(null)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [confirmDeployProject, setConfirmDeployProject] = useState<Project | null>(null)

  // Pre-flight environment check state
  const [preflightProject, setPreflightProject] = useState<Project | null>(null)
  const [preflightServer, setPreflightServer] = useState<ServerNode | null>(null)
  const [preflightMissingEnvs, setPreflightMissingEnvs] = useState<ServerEnvInfo[]>([])
  const [isPreflightChecking, setIsPreflightChecking] = useState(false)

  const loadData = async () => {
    try {
      const [resProj, resSrv] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/servers'),
      ])
      if (resProj.ok) {
        const data = await resProj.json()
        setProjects(data)
      }
      if (resSrv.ok) {
        const srvData = await resSrv.json()
        setServers(srvData)
      }
    } catch (err) {
      console.error('Failed to load projects/servers', err)
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const resAuth = await fetch('/api/auth/me')
        if (resAuth.ok) {
          const authData = await resAuth.json()
          if (authData.enabled && !authData.authenticated) {
            router.replace('/login')
            return
          }
          if (authData.user?.username) {
            setCurrentUser(authData.user.username)
          }
        }
      } catch (err) {
        console.error('Auth verification failed', err)
      } finally {
        setAuthChecking(false)
      }
      loadData()
    }

    checkAuthAndLoad()
  }, [router])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.replace('/login')
    }
  }

  // Directly start the deployment API
  const startDeployDirectly = async (projectId: string) => {
    try {
      const res = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, triggerType: 'manual' }),
      })
      if (res.ok) {
        const dep = await res.json()
        setActiveDeployId(dep.id)
        loadData()
      } else {
        alert('触发部署失败，请检查网络或配置')
      }
    } catch (err) {
      console.error('Deploy trigger error', err)
    }
  }

  // Pre-flight environment check before deployment
  const handleDeploy = async (projectId: string, skipCheck: boolean = false) => {
    if (skipCheck) {
      startDeployDirectly(projectId)
      return
    }

    const targetProject = projects.find((p) => p.id === projectId)
    if (!targetProject) {
      startDeployDirectly(projectId)
      return
    }

    // Find target server
    let targetServer = servers.find(
      (s) => s.id === targetProject.serverId || s.ip === targetProject.serverIp
    )

    // If server not found or localhost, proceed directly
    if (!targetServer) {
      startDeployDirectly(projectId)
      return
    }

    // Check required environments for this project runtime and deployment target mode
    const requiredKeys = getRequiredEnvKeys(
      targetProject.runtime,
      targetProject.deployTargetMode || 'docker'
    )
    setIsPreflightChecking(true)

    try {
      const res = await fetch(`/api/servers/${targetServer.id}/env/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: requiredKeys }),
      })

      if (res.ok) {
        const checkData = await res.json()
        const missing = (checkData.environments || []).filter(
          (env: ServerEnvInfo) => !env.installed
        )

        if (missing.length > 0) {
          // Missing dependencies detected! Trigger user prompt dialog
          setPreflightProject(targetProject)
          setPreflightServer(targetServer)
          setPreflightMissingEnvs(missing)
          setIsPreflightChecking(false)
          return
        }
      }
    } catch (err) {
      console.error('Pre-flight check error, proceeding to deploy', err)
    } finally {
      setIsPreflightChecking(false)
    }

    // All environments verified, start deploy directly
    startDeployDirectly(projectId)
  }

  // User triggers deploy -> show secondary confirmation modal
  const handleRequestDeploy = (projectId: string) => {
    const targetProject = projects.find((p) => p.id === projectId)
    if (targetProject) {
      setConfirmDeployProject(targetProject)
    } else {
      handleDeploy(projectId)
    }
  }

  const handleConfirmDeploy = () => {
    if (!confirmDeployProject) return
    const pid = confirmDeployProject.id
    setConfirmDeployProject(null)
    handleDeploy(pid)
  }

  // Delete project
  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('确定要删除该项目流水线吗？删除后不可恢复。')) return
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId))
        if (activeDetailProject?.id === projectId) {
          setActiveDetailProject(null)
        }
      }
    } catch (err) {
      console.error('Delete project error', err)
    }
  }

  const handleProjectCreated = (newProject: Project) => {
    setShowNewProjectWizard(false)
    setProjects((prev) => [newProject, ...prev])
    setView('projects')
  }

  if (authChecking) {
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
    <>
      <Dashboard
        view={view}
        onViewChange={setView}
        onCreateProject={() => setShowNewProjectWizard(true)}
        onOpenHelp={() => setShowHelpModal(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenDeployLog={(depId) => setActiveDeployId(depId)}
        onOpenProjectDetail={(projectId) => {
          const p = projects.find((x) => x.id === projectId)
          if (p) {
            setActiveDetailProject(p)
          } else {
            setView('projects')
          }
        }}
      >
        {view === 'dashboard' && (
          <DashboardOverview
            projects={projects}
            loading={loadingProjects}
            onDeploy={(id) => handleRequestDeploy(id)}
            onViewDetails={(p) => setActiveDetailProject(p)}
            onDeleteProject={handleDeleteProject}
            onCreateProject={() => setShowNewProjectWizard(true)}
            onOpenDeploymentLog={(depId) => setActiveDeployId(depId)}
            onCloneProject={(p) => setCloneSourceProject(p)}
          />
        )}

        {view === 'projects' && (
          <div className="space-y-4">
            <ProjectList
              projects={projects}
              loading={loadingProjects}
              onDeploy={(id) => handleRequestDeploy(id)}
              onViewDetails={(p) => setActiveDetailProject(p)}
              onDeleteProject={handleDeleteProject}
              onCloneProject={(p) => setCloneSourceProject(p)}
              onProjectUpdated={(updatedProject) => {
                setProjects((prev) =>
                  prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
                )
              }}
              onRefreshProjects={loadData}
            />
          </div>
        )}

        {view === 'servers' && <ServerManagement />}

        {view === 'settings' && <SystemSettings />}
      </Dashboard>

      {/* New Project Wizard Modal */}
      {showNewProjectWizard && (
        <NewProjectWizard
          onClose={() => setShowNewProjectWizard(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}

      {/* Clone Project Modal */}
      {cloneSourceProject && (
        <CloneProjectModal
          isOpen={!!cloneSourceProject}
          project={cloneSourceProject}
          servers={servers}
          onClose={() => setCloneSourceProject(null)}
          onSuccess={(newProject) => {
            setCloneSourceProject(null)
            loadData()
          }}
        />
      )}

      {/* Real-time Streaming Deploy Terminal Modal */}
      {activeDeployId && (
        <DeployModal
          deploymentId={activeDeployId}
          onClose={() => {
            setActiveDeployId(null)
            loadData()
          }}
          onReDeploy={(id) => handleRequestDeploy(id)}
        />
      )}

      {/* Project Detail & Rollback Modal */}
      {activeDetailProject && (
        <ProjectDetailModal
          project={activeDetailProject}
          onClose={() => setActiveDetailProject(null)}
          onDeploy={(id) => handleRequestDeploy(id)}
          onOpenDeploymentLog={(depId) => setActiveDeployId(depId)}
          onClone={(p) => {
            setActiveDetailProject(null)
            setCloneSourceProject(p)
          }}
          onProjectUpdated={() => {
            loadData()
            fetch(`/api/projects/${activeDetailProject.id}`)
              .then((r) => r.json())
              .then((updated) => setActiveDetailProject(updated))
              .catch(console.error)
          }}
        />
      )}

      {/* Pre-flight Environment Check & User Decision Dialog */}
      {preflightProject && preflightMissingEnvs.length > 0 && (
        <PreflightEnvDialog
          project={preflightProject}
          server={preflightServer}
          missingEnvs={preflightMissingEnvs}
          onClose={() => {
            setPreflightProject(null)
            setPreflightMissingEnvs([])
          }}
          onProceedDeploy={() => {
            const pid = preflightProject.id
            setPreflightProject(null)
            setPreflightMissingEnvs([])
            startDeployDirectly(pid)
          }}
        />
      )}

      {/* Secondary Confirmation Dialog before Deployment */}
      {confirmDeployProject && (
        <ConfirmDeployDialog
          isOpen={!!confirmDeployProject}
          project={confirmDeployProject}
          onClose={() => setConfirmDeployProject(null)}
          onConfirm={handleConfirmDeploy}
        />
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}
    </>
  )
}
