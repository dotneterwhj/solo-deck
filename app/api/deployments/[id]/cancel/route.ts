import { NextRequest, NextResponse } from 'next/server'
import { pipelineManager } from '@/lib/pipeline-runner'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const cancelled = await pipelineManager.cancel(id)
    return NextResponse.json({ success: cancelled })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
