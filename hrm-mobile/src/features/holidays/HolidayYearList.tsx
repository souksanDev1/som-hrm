import type { Holiday } from '@hrm/shared';
import { Text, View } from 'react-native';
import { Badge, type BadgeTone } from '@/components/ui';
import { usePrefsStore, useT } from '@/lib/i18n';

const KIND_TONE: Record<Holiday['kind'], BadgeTone> = { PUBLIC: 'primary', TRADITIONAL: 'success', SUBSTITUTE: 'warning', NATIONAL_DAY: 'neutral' };

/** Read-only list of holidays (date, localized name, type). `today` dims days already past. */
export function HolidayYearList({ holidays, today }: { holidays: readonly Holiday[]; today: string }) {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const format = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'lo' ? 'lo-LA' : 'en-GB', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' });

  return (
    <View testID="holiday-year-list">
      {holidays.map((h) => (
        <View
          key={h.id}
          testID="holiday-row"
          className={`flex-row items-center gap-3 border-b border-line py-3 dark:border-night-line ${h.date < today ? 'opacity-50' : ''}`}
        >
          <Text className="w-24 text-sm text-ink-muted" style={{ fontVariant: ['tabular-nums'] }}>{format(h.date)}</Text>
          <View className="flex-1 gap-1">
            <Text className="text-sm font-medium text-ink dark:text-night-ink">{locale === 'lo' ? h.nameLo : h.nameEn}</Text>
            <View className="flex-row flex-wrap gap-1">
              <Badge label={t(`holiday.kind.${h.kind}`)} tone={KIND_TONE[h.kind]} />
              {h.womenOnly && <Badge label={t('holiday.womenOnly')} tone="danger" />}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
