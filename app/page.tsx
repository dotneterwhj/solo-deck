'use client'

import { useState, useEffect } from 'react'
import { Dashboard } from '@/components/dashboard'
import { DashboardOverview } from '@/components/dashboard-overview'
import { ProjectList } from '@/components/project-list'
import { ServerManagement } from '@/components/server-management'
import { SystemSettings } from '@/components/system-settings'
import { NewProjectWizard } from '@/components/new-project-wizard'
import { DeployModal } from '@/components/deploy-modal'
import { ProjectDetailModal } from '@/components/project-detail-modal'
import { HelpModal } from '@/components/help-modal'
import { PreflightEnvDialog } from '@/components/preflight-env-dialog'
import { ViewType } from '@/components/sidebar'
import { Project, ServerNode, ServerEnvInfo } from '@/lib/types'
import { getRequiredEnvKeys } from '@/lib/env-presets'

export default function Page() {
  const [view, setView] = useState<ViewType>('dashboard')
  const [projects, setProjects] = useState<Project[]>([])
  const [servers, setServers] = useState<ServerNode[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // Modals state
  const [showNewProjectWizard, setShowNewProjectWizard] = useState(false)
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null)
  const [activeDetailProject, setActiveDetailProject] = useState<Project | null>(null)
  const [showHelpModal, setShowHelpModal] = useState(false)

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
    loadData()
  }, [])

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

    // Check required environments for this project runtime
    const requiredKeys = getRequiredEnvKeys(targetProject.runtime)
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
    setView('list')
  }

  return (
    <>
      <Dashboard
        view={view}
        onViewChange={setView}
        onCreateProject={() => setShowNewProjectWizard(true)}
        onOpenHelp={() => setShowHelpModal(true)}
      >
        {view === 'dashboard' && (
          <DashboardOverview
            projects={projects}
            loading={loadingProjects}
            onDeploy={(id) => handleDeploy(id)}
            onViewDetails={(p) => setActiveDetailProject(p)}
            onDeleteProject={handleDeleteProject}
            onCreateProject={() => setShowNewProjectWizard(true)}
            onOpenDeploymentLog={(depId) => setActiveDeployId(depId)}
          />
        )}

        {view === 'list' && (
          <div className="space-y-4">
            <ProjectList
              projects={projects}
              loading={loadingProjects}
              onDeploy={(id) => handleDeploy(id)}
              onViewDetails={(p) => setActiveDetailProject(p)}
              onDeleteProject={handleDeleteProject}
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

      {/* Real-time Streaming Deploy Terminal Modal */}
      {activeDeployId && (
        <DeployModal
          deploymentId={activeDeployId}
          onClose={() => {
            setActiveDeployId(null)
            loadData()
          }}
          onReDeploy={(id) => handleDeploy(id, true)}
        />
      )}

      {/* Project Detail & Rollback Modal */}
      {activeDetailProject && (
        <ProjectDetailModal
          project={activeDetailProject}
          onClose={() => setActiveDetailProject(null)}
          onDeploy={(id) => handleDeploy(id)}
          onOpenDeploymentLog={(depId) => setActiveDeployId(depId)}
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

      {/* Help Modal */}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}
    </>
  )
}
