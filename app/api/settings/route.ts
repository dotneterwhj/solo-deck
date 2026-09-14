import { NextRequest, NextResponse } from 'next/server'
import { getSettings, updateSettings } from '@/lib/db'
import { healthCheckScheduler } from '@/lib/health-checker'

export async function GET() {
  try {
    healthCheckScheduler.init()
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

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
