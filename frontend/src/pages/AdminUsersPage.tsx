import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, SelectNative } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/stores/authStore'
import { getUsers, updateUser, deactivateUser, api } from '@/api/client'
import type { User } from '@/types/wms'
import { formatDate } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор', manager: 'Менеджер', storekeeper: 'Кладовщик', brigadier: 'Бригадир', operator: 'Оператор', viewer: 'Наблюдатель',
}
const ROLE_TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'primary' | 'info'> = {
  admin: 'danger', manager: 'primary', storekeeper: 'success', brigadier: 'info', operator: 'warning', viewer: 'neutral',
}

export default function AdminUsersPage() {
  const currentUser = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ role: '', is_active: true, full_name: '', password: '' })
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [removeUser, setRemoveUser] = useState<User | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ username: '', password: '', full_name: '', role: 'viewer' })

  const loadUsers = async () => { setLoading(true); try { setUsers(await getUsers()) } catch {} finally { setLoading(false) } }
  const handleEdit = (u: User) => { setEditUser(u); setEditForm({ role: u.role, is_active: u.is_active, full_name: u.full_name || '', password: '' }) }
  const handleSave = async () => {
    if (!editUser) return
    const p: Record<string, unknown> = {}
    if (editForm.role !== editUser.role) p.role = editForm.role
    if (editForm.is_active !== editUser.is_active) p.is_active = editForm.is_active
    if (editForm.full_name !== (editUser.full_name || '')) p.full_name = editForm.full_name
    if (editForm.password) p.password = editForm.password
    if (!Object.keys(p).length) { setEditUser(null); return }
    await updateUser(editUser.id, p); setEditUser(null); loadUsers()
  }
  const handleDeactivate = async () => { if (!deleteUser) return; await deactivateUser(deleteUser.id); setDeleteUser(null); loadUsers() }
  const handleRemove = async () => { if (!removeUser) return; try { await api.delete(`/admin/users/${removeUser.id}/permanent`) } catch (e: any) { alert(e?.response?.data?.detail || 'Ошибка') }; setRemoveUser(null); loadUsers() }
  const handleCreate = async () => { try { await api.post('/admin/users', createForm); setCreateOpen(false); setCreateForm({ username: '', password: '', full_name: '', role: 'viewer' }); loadUsers() } catch (e: any) { alert(e?.response?.data?.detail || 'Ошибка') } }

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      void loadUsers()
    }
  }, [currentUser?.role])

  if (token && !currentUser) {
    return (
      <div className="mx-auto max-w-6xl p-3 sm:p-6">
        <Card>
          <Card.Content className="pt-6 text-sm text-muted-foreground">Проверяем права доступа...</Card.Content>
        </Card>
      </div>
    )
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="mx-auto max-w-6xl p-3 sm:p-6">
        <Card>
          <Card.Content className="pt-6 text-sm text-muted-foreground">Нет доступа к управлению пользователями.</Card.Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <Card>
        <Card.Header>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <Card.Title>Пользователи</Card.Title>
            <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">Создать</Button>
          </div>
        </Card.Header>
        <Card.Content>
          {loading ? <p>Загрузка...</p> : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Пользователь</th>
                    <th className="p-2 hidden sm:table-cell">Роль</th>
                    <th className="p-2 hidden sm:table-cell">Статус</th>
                    <th className="p-2 hidden sm:table-cell">Вход</th>
                    <th className="p-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={`border-b hover:bg-muted/50 ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="p-2">
                        <div className="font-semibold">{u.username}</div>
                        <div className="text-xs text-muted-foreground">{u.full_name || '—'}</div>
                        <div className="sm:hidden mt-1 flex gap-1">
                          <Badge tone={ROLE_TONES[u.role] || 'neutral'}>{ROLE_LABELS[u.role] || u.role}</Badge>
                          <Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Активен' : 'Блок.'}</Badge>
                        </div>
                      </td>
                      <td className="p-2 hidden sm:table-cell"><Badge tone={ROLE_TONES[u.role] || 'neutral'}>{ROLE_LABELS[u.role] || u.role}</Badge></td>
                      <td className="p-2 hidden sm:table-cell"><Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Активен' : 'Блок.'}</Badge></td>
                      <td className="p-2 hidden sm:table-cell text-xs">{u.last_login ? formatDate(u.last_login) : '—'}</td>
                      <td className="p-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(u)}>Ред.</Button>
                          {u.id !== currentUser?.id && u.is_active && <Button variant="danger" size="sm" onClick={() => setDeleteUser(u)}>Блок.</Button>}
                          {u.id !== currentUser?.id && <Button variant="danger" size="sm" onClick={() => setRemoveUser(u)}>Удал.</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Создать пользователя">
          <div className="space-y-3">
            <div><Label>Имя пользователя</Label><Input value={createForm.username} onChange={e => setCreateForm({...createForm, username: e.target.value})} /></div>
            <div><Label>Пароль</Label><Input type="password" value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} /></div>
            <div><Label>Полное имя</Label><Input value={createForm.full_name} onChange={e => setCreateForm({...createForm, full_name: e.target.value})} /></div>
            <div><Label>Роль</Label><SelectNative value={createForm.role} onChange={e => setCreateForm({...createForm, role: e.target.value})}>{Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</SelectNative></div>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button><Button onClick={handleCreate} disabled={!createForm.username || !createForm.password}>Создать</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent title={`Ред.: ${editUser?.username}`}>
          <div className="space-y-3">
            <div><Label>Полное имя</Label><Input value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} /></div>
            <div><Label>Роль</Label><SelectNative value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})}>{Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</SelectNative></div>
            <Checkbox
              isSelected={editForm.is_active}
              onChange={(is_active) => setEditForm({ ...editForm, is_active })}
            >
              Активен
            </Checkbox>
            <div><Label>Новый пароль</Label><Input type="password" value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} placeholder="Минимум 4 символа" /></div>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditUser(null)}>Отмена</Button><Button onClick={handleSave}>Сохранить</Button></div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteUser} onOpenChange={o => { if (!o) setDeleteUser(null) }} title="Заблокировать?" description={`${deleteUser?.username} будет деактивирован.`} confirmLabel="Заблокировать" onConfirm={handleDeactivate} />
      <ConfirmDialog open={!!removeUser} onOpenChange={o => { if (!o) setRemoveUser(null) }} title="Удалить?" description={`${removeUser?.username} будет удалён.`} confirmLabel="Удалить" onConfirm={handleRemove} />
    </div>
  )
}
