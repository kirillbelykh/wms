import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { getItems, getOrders, getProductionLaborReport, getStocks } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateInput } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { employeeDepartmentLabel, productionTaskTypeLabel } from '@/lib/production'
import { calculateOrderProgress, formatDate, inMskDateRange, todayInMsk } from '@/lib/utils'

function inPeriod(value: string, from: string, to: string) {
  return inMskDateRange(value, from, to)
}

function exportRows(filename: string, rows: Record<string, string | number>[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report')
  XLSX.writeFile(workbook, filename)
}

export function ReportsPage() {
  const today = todayInMsk()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today)
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })
  const stocksQuery = useQuery({ queryKey: ['stocks'], queryFn: getStocks })
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: () => getOrders() })
  const productionLaborQuery = useQuery({
    queryKey: ['production-labor-report', from, to],
    queryFn: () =>
      getProductionLaborReport({
        date_from: from || undefined,
        date_to: to || undefined,
      }),
  })

  const items = useMemo(() => 
    Array.isArray(itemsQuery.data) ? itemsQuery.data : [], 
    [itemsQuery.data]
  )
  const stocks = useMemo(() => 
    Array.isArray(stocksQuery.data) ? stocksQuery.data : [], 
    [stocksQuery.data]
  )
  const orders = useMemo(() => 
    Array.isArray(ordersQuery.data) ? ordersQuery.data : [], 
    [ordersQuery.data]
  )
  const productionLaborReport = productionLaborQuery.data

  const itemsById = useMemo(() => 
    new Map(items.map((item) => [item.id, item])), 
    [items]
  )

  const turnoverRows = useMemo(() => {
    return stocks
      .filter((stock) => inPeriod(stock.updated_at ?? stock.created_at, from, to))
      .map((stock) => {
        const item = itemsById.get(stock.item_id)
        return {
          Товар: item?.title ?? `#${stock.item_id}`,
          Тип: item?.product_type ?? '—',
          Цвет: item?.color ?? '—',
          Пары: stock.pairs_quantity || 0,
          'Пар/кор': stock.pairs_per_box ?? '—',
          Обновлено: formatDate(stock.updated_at || stock.created_at),
        }
      })
  }, [from, itemsById, stocks, to])

  const efficiencyRows = useMemo(() => {
    return orders
      .filter((order) => inPeriod(order.updated_at ?? order.created_at, from, to))
      .map((order) => {
        const progress = calculateOrderProgress(order)
        return {
          Заказ: order.name || '—',
          Клиент: order.customer || '—',
          Статус: order.status || '—',
          Приоритет: order.priority ?? '—',
          Отобрано: progress.picked,
          Всего: progress.total,
          Процент: progress.percent,
        }
      })
  }, [from, orders, to])

  const productionLaborTaskRows = useMemo(() => {
    return (productionLaborReport?.tasks ?? []).map((task) => ({
      Задание: task.production_order_name,
      Тип: productionTaskTypeLabel(task.task_type),
      Продукция: task.product || '—',
      Сырье: task.raw_material || '—',
      Партия: task.batch_number || '—',
      Размер: task.size || '—',
      Количество: task.quantity,
      Периоды: task.periods
        .map((period) => `${period.start_time.slice(0, 5)}-${period.end_time.slice(0, 5)} (${period.people_count})`)
        .join(', ') || '—',
    }))
  }, [productionLaborReport])

  const productionLaborEmployeeRows = useMemo(() => {
    return (productionLaborReport?.employees ?? []).map((employee) => ({
      Сотрудник: employee.employee_name,
      Участок: employeeDepartmentLabel(employee.department),
      Часы: employee.hours,
    }))
  }, [productionLaborReport])

  return (
    <section className="page-shell space-y-5">
      <Card>
        <Card.Content className="grid gap-3 pt-5 sm:grid-cols-[220px_220px]">
          <div className="space-y-2">
            <DateInput id="from" label="С даты" value={from} onChange={setFrom} />
          </div>
          <div className="space-y-2">
            <DateInput id="to" label="По дату" value={to} onChange={setTo} />
          </div>
        </Card.Content>
      </Card>

      <Tabs defaultValue="turnover">
        <TabsList>
          <TabsTrigger value="turnover">Оборотная ведомость</TabsTrigger>
          <TabsTrigger value="efficiency">Эффективность сборки</TabsTrigger>
          <TabsTrigger value="production-labor">Производство</TabsTrigger>
        </TabsList>
        <TabsContent value="turnover">
          <Card>
            <Card.Header className="flex-row items-center justify-between space-y-0">
              <Card.Title>Оборотная ведомость</Card.Title>
              <Button variant="outline" onClick={() => exportRows('turnover.xlsx', turnoverRows)}>
                <Download className="h-4 w-4" />
                Excel
              </Button>
            </Card.Header>
            <Card.Content className="overflow-x-auto">
              {turnoverRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет данных за выбранный период</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Товар</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Цвет</TableHead>
                      <TableHead>Пары</TableHead>
                      <TableHead>Пар/кор</TableHead>
                      <TableHead>Обновлено</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turnoverRows.map((row, index) => (
                      <TableRow key={`${row.Товар}-${index}`}>
                        <TableCell>{row.Товар}</TableCell>
                        <TableCell>{row.Тип}</TableCell>
                        <TableCell>{row.Цвет}</TableCell>
                        <TableCell>{row.Пары}</TableCell>
                        <TableCell>{row['Пар/кор']}</TableCell>
                        <TableCell>{row.Обновлено}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card.Content>
          </Card>
        </TabsContent>
        <TabsContent value="efficiency">
          <Card>
            <Card.Header className="flex-row items-center justify-between space-y-0">
              <Card.Title>Эффективность сборки</Card.Title>
              <Button variant="outline" onClick={() => exportRows('picking-efficiency.xlsx', efficiencyRows)}>
                <Download className="h-4 w-4" />
                Excel
              </Button>
            </Card.Header>
            <Card.Content className="overflow-x-auto">
              {efficiencyRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет данных за выбранный период</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Заказ</TableHead>
                      <TableHead>Клиент</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Отобрано</TableHead>
                      <TableHead>Всего</TableHead>
                      <TableHead>%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {efficiencyRows.map((row) => (
                      <TableRow key={row.Заказ}>
                        <TableCell>{row.Заказ}</TableCell>
                        <TableCell>{row.Клиент}</TableCell>
                        <TableCell>{row.Статус}</TableCell>
                        <TableCell>{row.Отобрано}</TableCell>
                        <TableCell>{row.Всего}</TableCell>
                        <TableCell>{row.Процент}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card.Content>
          </Card>
        </TabsContent>
        <TabsContent value="production-labor">
          <div className="space-y-5">
            <Card>
              <Card.Header className="flex-row items-center justify-between space-y-0">
                <Card.Title>Трудозатраты по заданиям</Card.Title>
                <Button
                  variant="outline"
                  onClick={() => exportRows('production-labor-tasks.xlsx', productionLaborTaskRows)}
                >
                  <Download className="h-4 w-4" />
                  Excel
                </Button>
              </Card.Header>
              <Card.Content className="overflow-x-auto">
                {productionLaborQuery.isLoading ? (
                  <p className="text-center text-muted-foreground py-8">Загрузка...</p>
                ) : productionLaborTaskRows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Нет данных за выбранный период</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Задание</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Продукция</TableHead>
                        <TableHead>Сырье</TableHead>
                        <TableHead>Партия</TableHead>
                        <TableHead>Размер</TableHead>
                        <TableHead>Количество</TableHead>
                        <TableHead>Периоды</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionLaborTaskRows.map((row) => (
                        <TableRow key={`${row.Задание}-${row.Тип}`}>
                          <TableCell className="font-medium">{row.Задание}</TableCell>
                          <TableCell>{row.Тип}</TableCell>
                          <TableCell>{row.Продукция}</TableCell>
                          <TableCell>{row.Сырье}</TableCell>
                          <TableCell>{row.Партия}</TableCell>
                          <TableCell>{row.Размер}</TableCell>
                          <TableCell>{row.Количество}</TableCell>
                          <TableCell>{row.Периоды}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card.Content>
            </Card>

            <Card>
              <Card.Header className="flex-row items-center justify-between space-y-0">
                <Card.Title>Сотрудники и часы</Card.Title>
                <Button
                  variant="outline"
                  onClick={() => exportRows('production-labor-employees.xlsx', productionLaborEmployeeRows)}
                >
                  <Download className="h-4 w-4" />
                  Excel
                </Button>
              </Card.Header>
              <Card.Content className="overflow-x-auto">
                {productionLaborEmployeeRows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Нет данных за выбранный период</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сотрудник</TableHead>
                        <TableHead>Участок</TableHead>
                        <TableHead>Часы</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionLaborEmployeeRows.map((row) => (
                        <TableRow key={row.Сотрудник}>
                          <TableCell className="font-medium">{row.Сотрудник}</TableCell>
                          <TableCell>{row.Участок}</TableCell>
                          <TableCell>{row.Часы}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card.Content>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
