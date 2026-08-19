import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, Plus, Trash2, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'

import {
  createEmployee,
  createEmployeeShift,
  deleteEmployee,
  deleteEmployeeShift,
  getEmployeeShifts,
  getEmployees,
  updateEmployee,
} from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { employeeDepartmentLabel } from '@/lib/production'
import { formatDate, getErrorMessage, todayInMsk } from '@/lib/utils'
import type { EmployeeDepartment } from '@/types/wms'

const departmentOptions: EmployeeDepartment[] = ['production', 'warehouse', 'other']

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const [employeeDraft, setEmployeeDraft] = useState({
    full_name: '',
    position: '',
    department: 'production' as EmployeeDepartment,
  })
  const [shiftDraft, setShiftDraft] = useState({
    employee_id: '',
    work_date: todayInMsk(),
    start_time: '08:00',
    end_time: '17:00',
    department: 'production' as EmployeeDepartment,
    comment: '',
  })

  const employeesQuery = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => getEmployees(true),
  })
  const shiftsQuery = useQuery({
    queryKey: ['employee-shifts'],
    queryFn: () => getEmployeeShifts(),
  })

  const employees = employeesQuery.data ?? []
  const shifts = shiftsQuery.data ?? []
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.is_active), [employees])

  const invalidateEmployees = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employees'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-shifts'] }),
      queryClient.invalidateQueries({ queryKey: ['production-order'] }),
      queryClient.invalidateQueries({ queryKey: ['production-labor-report'] }),
    ])
  }

  const createEmployeeMutation = useMutation({
    mutationFn: () => {
      if (!employeeDraft.full_name.trim()) throw new Error('Укажите ФИО сотрудника')
      return createEmployee({
        full_name: employeeDraft.full_name.trim(),
        position: employeeDraft.position.trim() || undefined,
        department: employeeDraft.department,
      })
    },
    onSuccess: async () => {
      toast.success('Сотрудник добавлен')
      setEmployeeDraft({ full_name: '', position: '', department: 'production' })
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deactivateEmployeeMutation = useMutation({
    mutationFn: (employeeId: number) => deleteEmployee(employeeId),
    onSuccess: async () => {
      toast.success('Сотрудник скрыт из активных')
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const hardDeleteEmployeeMutation = useMutation({
    mutationFn: (employeeId: number) => deleteEmployee(employeeId, { hard: true }),
    onSuccess: async () => {
      toast.success('Сотрудник удален из базы')
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const restoreEmployeeMutation = useMutation({
    mutationFn: (employeeId: number) => updateEmployee(employeeId, { is_active: true }),
    onSuccess: async () => {
      toast.success('Сотрудник возвращен в активные')
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const createShiftMutation = useMutation({
    mutationFn: () => {
      if (!shiftDraft.employee_id) throw new Error('Выберите сотрудника')
      return createEmployeeShift({
        employee_id: Number(shiftDraft.employee_id),
        work_date: shiftDraft.work_date,
        start_time: shiftDraft.start_time,
        end_time: shiftDraft.end_time,
        department: shiftDraft.department,
        comment: shiftDraft.comment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Смена добавлена')
      setShiftDraft((current) => ({ ...current, employee_id: '', comment: '' }))
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteShiftMutation = useMutation({
    mutationFn: (shiftId: number) => deleteEmployeeShift(shiftId),
    onSuccess: async () => {
      toast.success('Смена удалена')
      await invalidateEmployees()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <section className="page-shell space-y-5">
      <Card>
        <Card.Header>
          <Card.Title>Сотрудники</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_180px_auto]">
            <div className="space-y-2">
              <Label>ФИО</Label>
              <Input
                value={employeeDraft.full_name}
                onChange={(event) => setEmployeeDraft((current) => ({ ...current, full_name: event.target.value }))}
                placeholder="Иванов Иван"
              />
            </div>
            <div className="space-y-2">
              <Label>Должность</Label>
              <Input
                value={employeeDraft.position}
                onChange={(event) => setEmployeeDraft((current) => ({ ...current, position: event.target.value }))}
                placeholder="Бригадир"
              />
            </div>
            <div className="space-y-2">
              <Label>Участок</Label>
              <SelectNative
                value={employeeDraft.department}
                onChange={(event) =>
                  setEmployeeDraft((current) => ({ ...current, department: event.target.value as EmployeeDepartment }))
                }
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {employeeDepartmentLabel(department)}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button
              className="self-end"
              onClick={() => createEmployeeMutation.mutate()}
              disabled={createEmployeeMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              Добавить
            </Button>
          </div>

          {employeesQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Должность</TableHead>
                    <TableHead>Участок</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-[96px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.full_name}</TableCell>
                      <TableCell>{employee.position || '—'}</TableCell>
                      <TableCell>{employeeDepartmentLabel(employee.department)}</TableCell>
                      <TableCell>
                        <Badge tone={employee.is_active ? 'success' : 'neutral'}>
                          {employee.is_active ? 'Активен' : 'Скрыт'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {employee.is_active ? (
                            <ConfirmDialog
                              title="Скрыть сотрудника?"
                              description="Он останется в истории отчетов, но не будет предлагаться в новых сменах."
                              confirmLabel="Скрыть"
                              onConfirm={() => deactivateEmployeeMutation.mutate(employee.id)}
                            >
                              <Button variant="ghost" size="icon" disabled={deactivateEmployeeMutation.isPending}>
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </ConfirmDialog>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => restoreEmployeeMutation.mutate(employee.id)}
                              disabled={restoreEmployeeMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <ConfirmDialog
                            title="Удалить сотрудника навсегда?"
                            description="Сотрудник будет удален из базы. Его смены удалятся, а в учете времени имя будет очищено."
                            confirmLabel="Удалить навсегда"
                            onConfirm={() => hardDeleteEmployeeMutation.mutate(employee.id)}
                          >
                            <Button variant="ghost" size="icon" disabled={hardDeleteEmployeeMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </ConfirmDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Смены</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_150px_120px_120px_170px_1fr_auto]">
            <div className="space-y-2">
              <Label>Сотрудник</Label>
              <SelectNative
                value={shiftDraft.employee_id}
                onChange={(event) => setShiftDraft((current) => ({ ...current, employee_id: event.target.value }))}
              >
                <option value="">Выберите сотрудника</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="space-y-2">
              <DateInput
                label="Дата"
                value={shiftDraft.work_date}
                onChange={(work_date) => setShiftDraft((current) => ({ ...current, work_date }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Начало</Label>
              <Input
                type="time"
                value={shiftDraft.start_time}
                onChange={(event) => setShiftDraft((current) => ({ ...current, start_time: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Конец</Label>
              <Input
                type="time"
                value={shiftDraft.end_time}
                onChange={(event) => setShiftDraft((current) => ({ ...current, end_time: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Участок</Label>
              <SelectNative
                value={shiftDraft.department}
                onChange={(event) =>
                  setShiftDraft((current) => ({ ...current, department: event.target.value as EmployeeDepartment }))
                }
              >
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {employeeDepartmentLabel(department)}
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={shiftDraft.comment}
                onChange={(event) => setShiftDraft((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Необязательно"
              />
            </div>
            <Button
              className="self-end"
              onClick={() => createShiftMutation.mutate()}
              disabled={createShiftMutation.isPending}
            >
              Добавить
            </Button>
          </div>

          {shiftsQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Сотрудник</TableHead>
                    <TableHead>Время</TableHead>
                    <TableHead>Участок</TableHead>
                    <TableHead>Комментарий</TableHead>
                    <TableHead className="w-[64px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell>{formatDate(shift.work_date)}</TableCell>
                      <TableCell className="font-medium">{shift.employee_name || '—'}</TableCell>
                      <TableCell>{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</TableCell>
                      <TableCell>{employeeDepartmentLabel(shift.department)}</TableCell>
                      <TableCell>{shift.comment || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteShiftMutation.mutate(shift.id)}
                          disabled={deleteShiftMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card.Content>
      </Card>
    </section>
  )
}
