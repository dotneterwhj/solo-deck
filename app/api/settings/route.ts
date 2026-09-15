import { NextRequest, NextResponse } from 'next/server'
import { getSettings, updateSettings } from '@/lib/db'
import { healthCheckScheduler } from '@/lib/health-checker'
import { cleanupScheduler } from '@/lib/cleanup-service'

export async function GET() {
  try {
    healthCheckScheduler.init()
    cleanupScheduler.init()
    const settings = getSettings()
    return NextResponse.json(settings)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const updated = updateSettings(body)

    // 动态同步更新定时心跳检测引擎
    healthCheckScheduler.updateConfig(
      updated.enablePeriodicHealthCheck ?? true,
      updated.healthCheckIntervalSeconds || 30
    )

    // 动态同步更新产物与镜像定时清理调度引擎
    cleanupScheduler.updateConfig(updated)

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
