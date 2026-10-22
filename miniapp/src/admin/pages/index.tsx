import { useEffect, useMemo, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import { PHOTO_CATEGORIES } from '../../../../packages/shared/photoCategories'
import { ADMIN_PAGE_SIZE, currentPageSelection, filterAdminPhotos, reviewPatch, runPhotoBatch, type ReviewStatus, type AdminListControl } from '../../../../packages/shared/adminWorkflow'
import { login, verify, listAdminPhotos, updatePhoto, deletePhoto, choosePhoto, photoSubmission, type SelectedFile } from '../../platform/admin'
import { readTable } from '../../platform/request'
import { storage, STORAGE_KEYS } from '../../platform/storage'
import { loadBrand } from '../../platform/photos'
import PhotoForm, { emptyForm, formPayload } from '../components/PhotoForm'
import ConfigPanel from '../components/ConfigPanel'
import './index.scss'

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [gear, setGear] = useState<any[]>([])
  const [brand, setBrand] = useState<any>(null)
  const [tab, setTab] = useState('upload')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<SelectedFile | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [progress, setProgress] = useState(0)
  const [controls, setControls] = useState<Record<ReviewStatus, AdminListControl>>({ pending: { page: 1, query: '', category: '' }, approved: { page: 1, query: '', category: '' }, rejected: { page: 1, query: '', category: '' } })
  const [selected, setSelected] = useState<string[]>([])
  const [edit, setEdit] = useState<any>(null)
  const [rejectIds, setRejectIds] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const submission = useRef<ReturnType<typeof photoSubmission> | null>(null)
  const operationLock = useRef(false)
  const theme = storage.get(STORAGE_KEYS.THEME, 'paper')
  const refresh = async () => {
    const data = await listAdminPhotos(); setRows(data)
    try { setGear(await readTable<any[]>('gear_presets', { select: '*', order: 'name.asc' })); setBrand(await loadBrand()) }
    catch (failure) { setMessage(`配置读取失败：${(failure as Error).message}`) }
  }
  useEffect(() => {
    let cancelled = false
    verify().then(async valid => { if (!cancelled) { setAuthenticated(valid); if (valid) await refresh() } })
      .catch(failure => { if (!cancelled) setMessage(failure.message) }).finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])
  const work = async (action: () => Promise<void>) => {
    if (operationLock.current) return
    operationLock.current = true; setBusy(true); setMessage('')
    try { await action() } catch (failure) { setMessage((failure as any).message || (failure as any).errMsg || '操作失败'); if (!storage.get(STORAGE_KEYS.AUTH_TOKEN, '')) setAuthenticated(false) }
    finally { operationLock.current = false; setBusy(false) }
  }
  const listTab = (['pending', 'approved', 'rejected'].includes(tab) ? tab : 'pending') as ReviewStatus
  const { page: requestedPage, query: search, category } = controls[listTab]
  const list = useMemo(() => filterAdminPhotos(rows, listTab, search, category), [rows, listTab, search, category])
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE)))
  const current = list.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE)
  const activeSelection = currentPageSelection(selected, current.map(row => row.id))
  const setControl = (patch: Partial<AdminListControl>) => { setControls(previous => ({ ...previous, [listTab]: { ...previous[listTab], ...patch } })); setSelected([]); setDeleteIds([]) }
  const switchTab = (next: string) => { if (operationLock.current) return; setTab(next); setSelected([]); setDeleteIds([]) }
  const patch = async (id: string, value: Record<string, any>) => {
    await updatePhoto(id, value)
    setRows(previous => previous.map(row => row.id === id ? { ...row, ...value } : row))
    try { await refresh() } catch (failure) { setMessage(`已保存，列表刷新失败：${(failure as Error).message}`) }
  }
  const batch = async (ids: string[], action: (id: string) => Promise<unknown>) => {
    const result = await runPhotoBatch(ids, action)
    setSelected(result.failures.map(failure => failure.id))
    let refreshError = ''
    try { await refresh() } catch (failure) { refreshError = `；列表刷新失败：${(failure as Error).message}` }
    const failures = result.failures.map(failure => `${rows.find(row => row.id === failure.id)?.title || failure.id}: ${failure.message}`)
    setMessage(`${result.completed.length}/${new Set(ids).size} 项操作成功${result.cleanupPending ? `，${result.cleanupPending} 项文件清理正在后台处理` : ''}${failures.length ? `；失败：${failures.join('；')}` : ''}${refreshError}`)
  }
  const selectFile = async () => {
    const next = await choosePhoto(); setFile(next); setForm({ ...emptyForm, ...next.metadata }); submission.current = photoSubmission(next)
  }
  const submit = async () => {
    if (!file || !submission.current) throw new Error('请先选择照片')
    const payload = formPayload(form)
    if (!String(payload.title || '').trim()) throw new Error('请输入标题')
    const attempt = await submission.current.getUpload(file, 'aliyun_oss', (next: number) => setProgress(next), true)
    await submission.current.commit(attempt, { ...payload, id: attempt.id, image_url: attempt.result.url, thumbnail_url: attempt.result.thumbnailUrl || null, hidden: false, status: 'pending' })
    setProgress(100); setFile(null); setForm({ ...emptyForm }); submission.current = null
    try { await refresh(); setMessage('作品已提交，等待审核') }
    catch (failure) { setMessage(`作品已提交，等待审核；列表刷新失败：${(failure as Error).message}`) }
  }
  if (checking) return <View className={`page-shell theme-${theme}`}><View className='status'>正在验证管理登录…</View></View>
  return <View className={`page-shell admin-shell theme-${theme}`}>
    <View className='admin-header'><Text className='serif section-title'>{brand?.admin_title || 'CAMARTS'}</Text><Text className='muted'>{brand?.admin_subtitle || 'ADMIN PANEL'}</Text>
      {authenticated && <Button onClick={() => { storage.remove(STORAGE_KEYS.AUTH_TOKEN); setAuthenticated(false); setPassword(''); setRows([]) }}>退出登录</Button>}</View>
    {message && <View className='admin-message'>{message}</View>}
    {!authenticated ? <View className='login-form'><Input value={username} placeholder='管理员账号' onInput={event => setUsername(event.detail.value)} /><Input password value={password} placeholder='密码' onInput={event => setPassword(event.detail.value)} /><Button className='primary' loading={busy} disabled={busy} onClick={() => void work(async () => { await login(username, password); setPassword(''); setAuthenticated(true); await refresh() })}>登录</Button></View> : <>
      <View className='admin-tabs'>{[['upload', '上传'], ['pending', '待审核'], ['approved', '已通过'], ['rejected', '已拒绝'], ['config', '配置']].map(([value, label]) => <View key={value} className={tab === value ? 'active' : ''} onClick={() => switchTab(value)}><Text>{label}</Text>{['pending', 'approved', 'rejected'].includes(value) && <Text className='tab-count'>{rows.filter(row => row.status === value).length}</Text>}</View>)}</View>
      {tab === 'upload' ? <>
        <View className='upload-zone' onClick={() => { if (!busy) void work(selectFile) }}>{file ? <Image src={file.path} mode='aspectFit' /> : <><Text className='upload-plus'>＋</Text><Text>选择照片或拍摄</Text><Text className='muted'>JPG / PNG / WEBP · 最大 100 MB</Text></>}</View>
        {file && <Text className='muted'>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</Text>}
        <PhotoForm value={form} onChange={setForm} gear={gear} />
        <Button className='primary' loading={busy} disabled={busy || !file} onClick={() => void work(submit)}>{busy ? `上传 / 保存中 ${progress}%` : '提交作品'}</Button>
      </> : tab === 'config' ? <ConfigPanel brand={brand} gear={gear} onRefresh={refresh} /> : <>
        <View className='stats-row'><Text>全部 {rows.length}</Text><Text>隐藏 {rows.filter(row => row.hidden).length}</Text><Text>点赞 {rows.reduce((sum, row) => sum + (row.likes || 0), 0)}</Text></View>
        <Input className='search-input' placeholder='搜索标题、地点、相机或镜头' value={search} onInput={event => setControl({ query: event.detail.value, page: 1 })} />
        <View className='list-filter'><Picker mode='selector' range={['全部分类', ...PHOTO_CATEGORIES.map(item => item.label)]} value={category ? PHOTO_CATEGORIES.findIndex(item => item.id === category) + 1 : 0} onChange={event => setControl({ category: Number(event.detail.value) ? PHOTO_CATEGORIES[Number(event.detail.value) - 1].id : '', page: 1 })}><View className='picker-value'>{PHOTO_CATEGORIES.find(item => item.id === category)?.label || '全部分类'} ▾</View></Picker><Text className='muted'>{list.length} 张作品</Text></View>
        <View className='batch-toolbar'><Button disabled={busy} onClick={() => setSelected(activeSelection.length === current.length ? [] : current.map(row => row.id))}>{current.length > 0 && activeSelection.length === current.length ? '取消当前页选择' : '选择当前页'}</Button><Button disabled={busy} onClick={() => setSelected([])}>取消选择</Button></View>
        {!!activeSelection.length && <View className='batch-toolbar'><Text>当前页已选 {activeSelection.length}</Text>{tab === 'pending' && <><Button disabled={busy} onClick={() => void work(() => batch(activeSelection, id => updatePhoto(id, reviewPatch('approve'))))}>批量通过</Button><Button disabled={busy} onClick={() => { setRejectIds([...activeSelection]); setReason('') }}>批量拒绝</Button></>}{tab === 'rejected' && <Button disabled={busy} onClick={() => void work(() => batch(activeSelection, id => updatePhoto(id, reviewPatch('resubmit'))))}>批量重新提交</Button>}<Button disabled={busy} onClick={() => { setDeleteIds([...activeSelection]); setDeleteConfirm('') }}>批量删除</Button></View>}
        {!list.length && <View className='status muted'>暂无作品</View>}
        {current.map(row => <View className='admin-photo' key={row.id}><View className='admin-photo-top'><Image src={row.thumbnail_url || row.image_url} mode='aspectFill' onClick={() => Taro.previewImage({ urls: [row.image_url], current: row.image_url })} /><View><Text className='photo-name'>{row.title || '未命名'}</Text><Text className='muted'>{row.country} · {row.location}</Text><Text>{row.camera} {row.lens}</Text>{row.hidden && <Text>已隐藏</Text>}{row.reject_reason && <Text className='reject-reason'>拒绝原因：{row.reject_reason}</Text>}</View></View>
          <View className='photo-actions'><Button disabled={busy} onClick={() => setSelected(previous => previous.includes(row.id) ? previous.filter(id => id !== row.id) : [...previous, row.id])}>{selected.includes(row.id) ? '已选' : '选择'}</Button><Button disabled={busy} onClick={() => setEdit({ ...row })}>编辑</Button>
            {tab === 'pending' && <><Button disabled={busy} onClick={() => void work(() => patch(row.id, reviewPatch('approve')))}>通过</Button><Button disabled={busy} onClick={() => { setRejectIds([row.id]); setReason('') }}>拒绝</Button></>}
            {tab === 'rejected' && <Button disabled={busy} onClick={() => void work(() => patch(row.id, { status: 'pending', reject_reason: null }))}>重新提交</Button>}
            {tab === 'approved' && <Button disabled={busy} onClick={() => void work(() => patch(row.id, { hidden: !row.hidden }))}>{row.hidden ? '公开' : '隐藏'}</Button>}
            <Button disabled={busy} onClick={() => { setDeleteIds([row.id]); setDeleteConfirm('') }}>删除</Button>
          </View></View>)}
        <View className='pagination'><Button disabled={busy || page <= 1} onClick={() => setControl({ page: page - 1 })}>上一页</Button><Text>{page} / {Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE))}</Text><Button disabled={busy || page * ADMIN_PAGE_SIZE >= list.length} onClick={() => setControl({ page: page + 1 })}>下一页</Button></View>
        <Button disabled={busy} onClick={() => void work(refresh)}>刷新</Button>
      </>}
    </>}
    {edit && <View className='admin-modal'><View className='admin-dialog'><Text className='section-title'>编辑作品</Text><PhotoForm value={edit} onChange={setEdit} gear={gear} /><View className='row'><Button disabled={busy} onClick={() => setEdit(null)}>取消</Button><Button disabled={busy} className='primary' onClick={() => void work(async () => { const payload = formPayload(edit); for (const key of ['id', 'created_at', 'likes']) delete payload[key]; await patch(edit.id, payload); setEdit(null) })}>保存</Button></View></View></View>}
    {!!rejectIds.length && <View className='admin-modal'><View className='admin-dialog'><Text>拒绝 {rejectIds.length} 张作品</Text><Text className='muted'>拒绝原因（可选）</Text><Textarea value={reason} onInput={event => setReason(event.detail.value)} /><View className='row'><Button disabled={busy} onClick={() => setRejectIds([])}>取消</Button><Button disabled={busy} onClick={() => void work(async () => { await batch(rejectIds, id => updatePhoto(id, reviewPatch('reject', reason))); setRejectIds([]) })}>确认拒绝</Button></View></View></View>}
    {!!deleteIds.length && <View className='admin-modal'><View className='admin-dialog'><Text>删除 {deleteIds.length} 张作品及其图片文件</Text><Text className='muted'>输入 DELETE 确认。本次只删除打开确认框时选择的作品。</Text><Input value={deleteConfirm} onInput={event => setDeleteConfirm(event.detail.value)} /><View className='row'><Button disabled={busy} onClick={() => setDeleteIds([])}>取消</Button><Button disabled={busy || deleteConfirm.trim().toUpperCase() !== 'DELETE'} onClick={() => void work(async () => { await batch(deleteIds, deletePhoto); setDeleteIds([]) })}>确认删除</Button></View></View></View>}
    <Button className='back-gallery' onClick={() => Taro.navigateBack()}>返回图库</Button>
  </View>
}
