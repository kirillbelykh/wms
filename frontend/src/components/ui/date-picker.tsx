import { Calendar, DateField, DatePicker, Label, useCalendarOrRangeState } from '@heroui/react'
import {
  CalendarDate,
  getLocalTimeZone,
  parseDate,
  today,
  type DateValue,
} from '@internationalized/date'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/** Сколько лет назад и вперёд от текущего — вместо дефолта HeroUI 1900–2099 */
const YEAR_LOOKBACK = 50
const YEAR_LOOKAHEAD = 5

function toDateValue(value?: string | null): DateValue | null {
  if (!value) return null
  try {
    return parseDate(value.slice(0, 10))
  } catch {
    return null
  }
}

function fromDateValue(value: DateValue | null): string {
  return value ? value.toString() : ''
}

function defaultBounds() {
  const t = today(getLocalTimeZone())
  return {
    minValue: new CalendarDate(t.year - YEAR_LOOKBACK, 1, 1),
    maxValue: new CalendarDate(t.year + YEAR_LOOKAHEAD, 12, 31),
  }
}

/** Годы сверху вниз: от текущего (или focused, если в будущем) назад */
function DescendingYearCells() {
  const state = useCalendarOrRangeState()
  const years = useMemo(() => {
    const now = new Date().getFullYear()
    const maxBound = state.maxValue?.year ?? now + YEAR_LOOKAHEAD
    const minYear = state.minValue?.year ?? now - YEAR_LOOKBACK
    const focused = state.focusedDate?.year ?? now
    const topYear = Math.min(maxBound, Math.max(now, focused))
    const list: number[] = []
    for (let year = topYear; year >= minYear; year -= 1) list.push(year)
    return list
  }, [state.focusedDate, state.maxValue, state.minValue])

  return years.map((year) => <Calendar.YearPickerCell key={year} year={year} />)
}

type DateInputProps = {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  name?: string
  id?: string
  className?: string
  isDisabled?: boolean
  /** YYYY-MM-DD — нижняя граница */
  min?: string
  /** YYYY-MM-DD — верхняя граница */
  max?: string
  'aria-label'?: string
}

export function DateInput({
  value,
  defaultValue,
  onChange,
  label,
  name,
  id,
  className,
  isDisabled,
  min,
  max,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const controlled = value !== undefined
  const bounds = defaultBounds()
  const minValue = toDateValue(min) ?? bounds.minValue
  const maxValue = toDateValue(max) ?? bounds.maxValue

  return (
    <DatePicker
      aria-label={ariaLabel ?? (label ? undefined : 'Дата')}
      className={cn('w-full', className)}
      defaultValue={controlled ? undefined : toDateValue(defaultValue)}
      id={id}
      isDisabled={isDisabled}
      maxValue={maxValue}
      minValue={minValue}
      name={name}
      value={controlled ? toDateValue(value) : undefined}
      onChange={(next) => onChange?.(fromDateValue(next))}
    >
      {label ? <Label>{label}</Label> : null}
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {/* isNonModal: без underlay/inert на #root — иначе клики по календарю не доходят */}
      <DatePicker.Popover isNonModal>
        <Calendar
          aria-label={ariaLabel ?? label ?? 'Выбор даты'}
          maxValue={maxValue}
          minValue={minValue}
        >
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <DescendingYearCells />
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  )
}
