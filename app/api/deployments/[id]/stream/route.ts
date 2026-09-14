import { NextRequest } from 'next/server'
import { getDeploymentById } from '@/lib/db'
import { pipelineManager, StreamEvent } from '@/lib/pipeline-runner'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const deployment = getDeploymentById(id)

  if (!deployment) {
    return new Response('Deployment not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: StreamEvent) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch (e) {
          // stream might be closed
        }
      }

      // 1. Replay initial history logs
      if (deployment.logs && deployment.logs.length > 0) {
        deployment.logs.forEach((log) => {
          sendEvent({
            type: 'log',
            deploymentId: id,
            payload: log,
          })
        })
      }

      // 2. Send initial status
      sendEvent({
        type: 'status',
        deploymentId: id,
        payload: {
          status: deployment.status,
          currentStep: deployment.currentStep,
          durationSeconds: deployment.durationSeconds,
        },
      })

      // 3. If finished, end stream
      if (
        deployment.status === 'success' ||
        deployment.status === 'failed' ||
        deployment.status === 'cancelled'
      ) {
        sendEvent({
          type: 'end',
          deploymentId: id,
          payload: { status: deployment.status },
        })
        controller.close()
        return
      }

      // 4. Subscribe for live streaming
      const unsubscribe = pipelineManager.subscribe(id, (event) => {
        sendEvent(event)
        if (event.type === 'end') {
          try {
            controller.close()
          } catch (e) {}
          unsubscribe()
        }
      })

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        unsubscribe()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
