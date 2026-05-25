import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// window.confirm() is disabled in Tauri 2's webview on macOS, so we route all
// confirmation prompts through this in-app dialog instead.

type Resolver = (value: boolean) => void

interface ConfirmState {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  resolve: Resolver
}

let setStateRef: ((s: ConfirmState | null) => void) | null = null

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise(resolve => {
    if (!setStateRef) {
      // Fallback if ConfirmRoot isn't mounted (shouldn't happen in app code).
      resolve(window.confirm(message))
      return
    }
    setStateRef({ message, resolve, ...opts })
  })
}

export function ConfirmRoot() {
  const [state, setState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    setStateRef = setState
    return () => {
      if (setStateRef === setState) setStateRef = null
    }
  }, [])

  const handle = (value: boolean) => {
    if (!state) return
    state.resolve(value)
    setState(null)
  }

  return (
    <Dialog
      open={!!state}
      onOpenChange={open => {
        if (!open) handle(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title ?? 'Confirm'}</DialogTitle>
          <DialogDescription>{state?.message}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handle(false)}>
            {state?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={state?.destructive ? 'destructive' : 'default'}
            onClick={() => handle(true)}
          >
            {state?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
