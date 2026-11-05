import { NextRequest, NextResponse } from 'next/server'
import { getSettings } from '@/lib/db'
import {
  getArtifactDiskStats,
  cleanupScheduler,
} from '@/lib/cleanup-service'

export async function GET() {
  try {
    cleanupScheduler.init()
    const stats = await getArtifactDiskStats()
    const settings = await getSettings()

    return NextResponse.json({
      stats,
      lastArtifactCleanupAt: settings.lastArtifactCleanupAt || null,
      lastDockerPruneAt: settings.lastDockerPruneAt || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const type = (body.type as 'artifacts' | 'docker' | 'all') || 'all'

    cleanupScheduler.init()
    const result = await cleanupScheduler.triggerManualCleanup(type)
    const stats = await getArtifactDiskStats()

    return NextResponse.json({
      ok: true,
      result,
      stats,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
