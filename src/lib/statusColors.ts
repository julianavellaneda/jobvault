import type { Status } from '@/types'

export const STATUS_BADGE: Record<Status, string> = {
  pending: 'bg-st-pending/16 text-st-pending ring-1 ring-inset ring-st-pending/40',
  applied: 'bg-st-applied/16 text-st-applied ring-1 ring-inset ring-st-applied/40',
  interview: 'bg-st-interview/16 text-st-interview ring-1 ring-inset ring-st-interview/40',
  offer: 'bg-st-offer/16 text-st-offer ring-1 ring-inset ring-st-offer/40',
  rejected: 'bg-st-rejected/16 text-st-rejected ring-1 ring-inset ring-st-rejected/40',
}

export const STATUS_COLUMN_TINT: Record<Status, string> = {
  pending: 'bg-gradient-to-b from-st-pending/[0.07] to-transparent',
  applied: 'bg-gradient-to-b from-st-applied/[0.07] to-transparent',
  interview: 'bg-gradient-to-b from-st-interview/[0.07] to-transparent',
  offer: 'bg-gradient-to-b from-st-offer/[0.07] to-transparent',
  rejected: 'bg-gradient-to-b from-st-rejected/[0.07] to-transparent',
}

export const STATUS_DOT: Record<Status, string> = {
  pending: 'bg-st-pending',
  applied: 'bg-st-applied',
  interview: 'bg-st-interview',
  offer: 'bg-st-offer',
  rejected: 'bg-st-rejected',
}

export const STATUS_BORDER: Record<Status, string> = {
  pending: 'border-l-st-pending',
  applied: 'border-l-st-applied',
  interview: 'border-l-st-interview',
  offer: 'border-l-st-offer',
  rejected: 'border-l-st-rejected',
}
