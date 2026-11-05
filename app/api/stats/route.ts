import { NextResponse } from 'next/server'
import { getDashboardStats } from '@/lib/db'

export async function GET() {
  try {
    const stats = await getDashboardStats()
    return NextResponse.json(stats)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
