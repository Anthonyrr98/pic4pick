import test from 'node:test'
import assert from 'node:assert/strict'
import { currentPageSelection, filterAdminPhotos, reviewPatch, runPhotoBatch } from '../../packages/shared/adminWorkflow'

test('management search covers gear and trims input while retaining historical categories', () => {
  const rows = [{ id: 'old', status: 'approved', category: 'featured', camera: 'Hasselblad' }, { id: 'film', status: 'approved', category: 'film', lens: 'Planar' }, { id: 'pending', status: 'pending', camera: 'Hasselblad' }]
  assert.deepEqual(filterAdminPhotos(rows, 'approved', '  HASSEL  ', 'latest').map(row => row.id), ['old'])
  assert.deepEqual(filterAdminPhotos(rows, 'approved', 'planar', '').map(row => row.id), ['film'])
})
test('only selected photos in the current page enter a batch operation', () => {
  assert.deepEqual(currentPageSelection(['elsewhere', 'visible', 'deleted'], ['visible', 'unselected']), ['visible'])
  assert.deepEqual(reviewPatch('resubmit'), { status: 'pending', reject_reason: null })
  assert.deepEqual(reviewPatch('reject', ' blurred '), { status: 'rejected', reject_reason: 'blurred' })
})
test('batch uses an immutable scope and preserves failures and pending cleanup separately', async () => {
  const selected = ['first', 'failed', 'cleanup', 'first']
  const called: string[] = []
  const result = await runPhotoBatch(selected, async id => {
    called.push(id); selected.push('later-selected')
    if (id === 'failed') throw new Error('network unavailable')
    return { cleanup: { pending: id === 'cleanup' } }
  })
  assert.deepEqual(called, ['first', 'failed', 'cleanup'])
  assert.deepEqual(result, { completed: ['first', 'cleanup'], failures: [{ id: 'failed', message: 'network unavailable' }], cleanupPending: 1 })
})
