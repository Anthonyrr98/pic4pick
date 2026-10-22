import { normalizePhotoCategory } from './photoCategories'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export interface AdminListControl { page: number; query: string; category: string }
export const ADMIN_PAGE_SIZE = 20

export function filterAdminPhotos<T extends Record<string, any>>(rows: T[], status: ReviewStatus, query: string, category: string): T[] {
  const search = query.trim().toLowerCase()
  return rows.filter(row => row.status === status
    && (!category || normalizePhotoCategory(row.category) === category)
    && (!search || ['title', 'location', 'country', 'camera', 'lens'].some(key => String(row[key] || '').toLowerCase().includes(search))))
}

export function currentPageSelection(selected: string[], visibleIds: string[]) {
  const selectedSet = new Set(selected)
  return visibleIds.filter(id => selectedSet.has(id))
}

export function reviewPatch(action: 'approve' | 'reject' | 'resubmit', reason = '') {
  return { status: { approve: 'approved', reject: 'rejected', resubmit: 'pending' }[action] as ReviewStatus,
    reject_reason: action === 'reject' ? reason.trim() || null : null }
}

export async function runPhotoBatch(ids: string[], action: (id: string) => Promise<any>) {
  const completed: string[] = [], failures: Array<{ id: string; message: string }> = []
  let cleanupPending = 0
  // Snapshot and de-duplicate before the first await. Selection changes cannot widen the operation.
  for (const id of [...new Set(ids)]) {
    try {
      const result = await action(id)
      completed.push(id)
      if (result?.cleanup?.pending) cleanupPending += 1
    } catch (error) { failures.push({ id, message: error instanceof Error ? error.message : String(error) }) }
  }
  return { completed, failures, cleanupPending }
}
