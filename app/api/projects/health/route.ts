import { NextRequest, NextResponse } from 'next/server'
import { checkAllProjectsHealth, healthCheckScheduler } from '@/lib/health-checker'
import { getProjects } from '@/lib/db'

export async function POST() {
  try {
    const results = await checkAllProjectsHealth()
    const projects = await getProjects()
    return NextResponse.json({
      success: true,
      results,
      projects,
      scheduler: healthCheckScheduler.getStatus(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // probe=true: 立即对全部项目发起同步探针探测；默认静默获取当前最新心跳状态与调度引擎信息
    const shouldProbe = req.nextUrl.searchParams.get('probe') === 'true'
    let results = null
    if (shouldProbe) {
      results = await checkAllProjectsHealth()
    }
    const projects = await getProjects()
    return NextResponse.json({
      success: true,
      results,
      projects,
      scheduler: healthCheckScheduler.getStatus(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
