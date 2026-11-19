import { interpolate, leaveCalendarDay, type LeaveCalendarEntry, type LeaveCalendarResponse, type Locale } from '@hrm/shared';
import { Pressable, Text, View } from 'react-native';
import { Badge } from '@/components/ui';
import { usePrefsStore, useT } from '@/lib/i18n';

type CalendarData = Pick<LeaveCalendarResponse, 'entries' | 'holidays' | 'restDays' | 'today' | 'viewer'>;

const intl = (locale: Locale) => (locale === 'lo' ? 'lo-LA' : 'en-GB');
export const formatDay = (iso: string, locale: Locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(intl(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayShort = (iso: string, locale: Locale) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(intl(locale), { weekday: 'narrow', timeZone: 'UTC' });

/** Same status colours as the web (FR-LV-13.7): approved green, pending amber with a dashed border. */
const STATUS_BOX: Record<string, string> = {
  APPROVED: 'border-success/30 bg-success-soft dark:bg-success/10',
  PENDING: 'border-dashed border-warning bg-warning-soft dark:bg-warning/10',
};

/** Initials come only from the calendar response; it has no employee photo field. */
function LeavePersonCircle({ entry, testID, small = false }: { entry: LeaveCalendarEntry; testID?: string; small?: boolean }) {
  const words = entry.employeeName.trim().split(/\s+/).filter(Boolean);
  const initials = words.length ? `${Array.from(words[0]!)[0]}${words.length > 1 ? Array.from(words[words.length - 1]!)[0] : ''}`.toLocaleUpperCase() : '—';
  return (
    <View
      testID={testID}
      className={`${small ? 'h-5 w-5 border' : 'h-7 w-7 border-2'} items-center justify-center rounded-full ${entry.status === 'PENDING' ? 'border-dashed border-warning bg-warning-soft dark:bg-warning/10' : 'border-success bg-success-soft dark:bg-success/10'}`}
    >
      <Text maxFontSizeMultiplier={1.3} className={`${small ? 'text-[8px]' : 'text-[10px]'} font-bold text-ink dark:text-night-ink`}>{initials}</Text>
    </View>
  );
}

/** One person off: name, type when visible (FR-LV-13.6), half day (FR-LV-13.2), pending badge. */
export function LeaveEntryRow({ entry }: { entry: LeaveCalendarEntry }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const type = entry.leaveType ? (locale === 'lo' ? entry.leaveType.nameLo : entry.leaveType.nameEn) : t('lcal.onLeave');
  return (
    <View testID={`lcal-entry-${entry.status}`} className={`mb-2 flex-row items-start gap-2 rounded-sm border px-3 py-3 ${STATUS_BOX[entry.status] ?? STATUS_BOX.APPROVED}`}>
      <LeavePersonCircle entry={entry} />
      <View className="flex-1">
        <Text className="text-sm font-medium text-ink dark:text-night-ink">{entry.employeeName.trim() || t('lvr.detail.employee')}</Text>
        <Text className="text-xs text-ink-muted dark:text-night-muted">{type}</Text>
        <View className="mt-2 flex-row flex-wrap gap-1">
          <Badge label={t(`leave.halfDay.${entry.halfDay}`)} tone={entry.halfDay === 'NONE' ? 'neutral' : 'primary'} />
          <Badge label={t(`lcal.status.${entry.status}`)} tone={entry.status === 'PENDING' ? 'warning' : 'success'} testID={entry.status === 'PENDING' ? 'lcal-entry-pending' : 'lcal-entry-approved'} />
        </View>
      </View>
    </View>
  );
}

/** Who is off on one date, with holiday / rest-day notices (FR-LV-13.2/13.8). */
export function LeaveDayList({ data, date, testID = 'lcal-day-list' }: { data: CalendarData; date: string; testID?: string }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const day = leaveCalendarDay(data, date);
  return (
    <View testID={testID}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" className="mb-2 text-base font-semibold text-ink dark:text-night-ink">
        {date === data.today ? t('lcal.todayOff') : interpolate(t('lcal.offOn'), { date: formatDay(date, locale) })}
      </Text>
      {day.holidays.map((h) => (
        <Text key={h.nameEn} testID="lcal-holiday" className="mb-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {`${locale === 'lo' ? h.nameLo : h.nameEn} — ${t(h.womenOnly ? 'lcal.holidayWomenOnly' : 'lcal.holiday')}`}
        </Text>
      ))}
      {day.isRestDay && (
        <Text testID="lcal-rest" className="mb-2 rounded-sm bg-canvas px-3 py-2 text-sm text-ink-muted dark:bg-night-canvas">
          {t('lcal.restDay')}
        </Text>
      )}
      {day.entries.length === 0 ? (
        <Text testID="lcal-empty" className="text-sm text-ink-muted dark:text-night-muted">
          {t('lcal.nobodyOff')}
        </Text>
      ) : (
        day.entries.map((e) => <LeaveEntryRow key={e.requestId} entry={e} />)
      )}
    </View>
  );
}

/** Week view on a phone: the seven days stacked, each with who is off (FR-LV-13.3). */
export function LeaveWeekList({ data, dates }: { data: CalendarData; dates: readonly string[] }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  return (
    <View testID="lcal-week">
      {dates.map((date) => {
        const day = leaveCalendarDay(data, date);
        const shade = day.holidays.length ? 'bg-danger-soft' : day.isRestDay ? 'bg-canvas dark:bg-night-canvas' : '';
        return (
          <View key={date} testID={`lcal-week-day-${date}`} className={`mb-2 rounded-sm border border-line p-2 dark:border-night-line ${shade} ${date === data.today ? 'border-primary' : ''}`}>
            <Text className="mb-1 text-sm font-semibold text-ink dark:text-night-ink">{formatDay(date, locale)}</Text>
            {day.holidays.map((h) => (
              <Text key={h.nameEn} className="mb-1 text-xs text-danger">
                {`${locale === 'lo' ? h.nameLo : h.nameEn}${h.womenOnly ? ` (${t('lcal.holidayWomenOnly')})` : ''}`}
              </Text>
            ))}
            {day.isRestDay && !day.holidays.length && <Text className="mb-1 text-xs text-ink-muted dark:text-night-muted">{t('lcal.restDay')}</Text>}
            {day.entries.map((e) => (
              <LeaveEntryRow key={e.requestId} entry={e} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Month grid (FR-LV-13.3): real people, status rings and an overflow count; tap for all details. */
export function LeaveMonthGrid({
  data,
  weeks,
  month,
  selected,
  onSelect,
}: {
  data: CalendarData;
  weeks: readonly (readonly string[])[];
  month: string;
  selected: string;
  onSelect(date: string): void;
}) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  return (
    <View testID="lcal-month">
      <View className="mb-2 flex-row py-1">
        {weeks[0]?.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs font-semibold text-ink-muted dark:text-night-muted">
            {weekdayShort(d, locale)}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} className="flex-row">
          {week.map((date) => {
            const day = leaveCalendarDay(data, date);
            // A person can have separate half-day requests. Count them once here, but keep every request in the day list.
            const people = new Map<string, LeaveCalendarEntry>();
            day.entries.forEach((entry) => {
              if (!people.has(entry.employeeId) || entry.status === 'PENDING') people.set(entry.employeeId, entry);
            });
            const entries = [...people.values()];
            const visible = entries.slice(0, 2);
            const extra = entries.length - visible.length;
            const shade = day.holidays.length ? 'bg-danger-soft dark:bg-danger/10' : day.isRestDay ? 'bg-canvas dark:bg-night-canvas' : 'bg-white dark:bg-night-surface';
            const summary = [
              formatDay(date, locale), date.slice(0, 4),
              ...(entries.length ? visible.map((e) => `${e.employeeName.trim() || t('lvr.detail.employee')}, ${t(`lcal.status.${e.status}`)}`) : [t('lcal.nobodyOff')]),
              ...(extra ? [interpolate(t('lcal.more'), { count: extra })] : []),
              ...day.holidays.map((h) => `${locale === 'lo' ? h.nameLo : h.nameEn}, ${t(h.womenOnly ? 'lcal.holidayWomenOnly' : 'lcal.holiday')}`),
              ...(day.isRestDay ? [t('lcal.restDay')] : []),
            ].join('. ');
            return (
              <Pressable
                key={date}
                testID={`lcal-month-day-${date}`}
                accessibilityRole="button"
                accessibilityLabel={summary}
                accessibilityState={{ selected: date === selected }}
                onPress={() => onSelect(date)}
                className={`m-0.5 min-h-[60px] min-w-0 flex-1 items-center rounded-sm border py-1 ${date === selected ? 'border-primary' : 'border-line dark:border-night-line'} ${shade}`}
              >
                <Text className={`mb-1 min-w-6 rounded-full text-center text-sm ${date === data.today ? 'bg-primary font-bold text-white' : date.slice(0, 7) !== month ? 'text-ink-muted dark:text-night-muted' : 'font-medium text-ink dark:text-night-ink'}`}>{Number(date.slice(8))}</Text>
                {entries.length > 0 && (
                  <View testID={`lcal-month-count-${date}`} className="flex-row items-center">
                    {visible.map((entry, i) => (
                      <View key={entry.employeeId} className={i > 0 ? '-ml-1.5' : ''}>
                        <LeavePersonCircle small entry={entry} testID={`lcal-month-person-${date}-${entry.employeeId}`} />
                      </View>
                    ))}
                    {extra > 0 && <Text testID={`lcal-month-more-${date}`} className="ml-0.5 text-[9px] font-semibold text-ink-muted dark:text-night-muted">+{extra}</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Colour legend; "pending" only for viewers who see pending requests. */
export function LeaveLegend({ data }: { data: CalendarData }) {
  const t = useT();
  const items = [
    { key: 'approved', label: t('lcal.status.APPROVED'), box: STATUS_BOX.APPROVED },
    ...(data.viewer.canSeePending ? [{ key: 'pending', label: t('lcal.status.PENDING'), box: STATUS_BOX.PENDING }] : []),
    { key: 'holiday', label: t('lcal.holiday'), box: 'border-danger/30 bg-danger-soft' },
    { key: 'rest', label: t('lcal.restDay'), box: 'border-line bg-canvas' },
  ];
  return (
    <View testID="lcal-legend" className="mt-2 flex-row flex-wrap gap-3">
      {items.map((i) => (
        <View key={i.key} testID={`lcal-legend-${i.key}`} className="flex-row items-center gap-1">
          <View className={`h-3 w-3 rounded-sm border ${i.box}`} />
          <Text className="text-xs text-ink-muted dark:text-night-muted">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
