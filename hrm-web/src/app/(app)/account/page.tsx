'use client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui';
import { DelegationsCard } from '@/features/approvals/components/DelegationsCard';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';
import { ChangePinForm } from '@/features/auth/components/ChangePinForm';
import { LanguageSelect } from '@/features/auth/components/LanguageSelect';
import { useAuthStore } from '@/features/auth/store';
import { LineManagerCard } from '@/features/employees/components/LineManagerCard';
import { useMyProfile } from '@/features/employees/hooks';
import { useT } from '@/lib/i18n';

/** Self-service account settings: language, password, PIN, approval delegates. */
export default function AccountPage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const profile = useMyProfile();
  return (
    <>
      <PageHeader title={t('authx.account.title')} description={user?.displayName} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {profile.data && <LineManagerCard manager={profile.data.manager} isTopLevel={profile.data.isTopLevel} department={profile.data.department} />}
        <Card title={t('authx.account.language')}>
          <LanguageSelect />
        </Card>
        {user?.hasPassword && (
          <Card title={t('authx.password.change')}>
            <ChangePasswordForm />
          </Card>
        )}
        {user && (
          <Card title={t(user.hasPin ? 'auth.changePin' : 'authx.pin.set')}>
            {!user.hasPin && <p className="mb-4 text-sm text-ink-muted">{t('authx.pin.setIntro')}</p>}
            <ChangePinForm key={String(user.hasPin)} hasPin={user.hasPin} />
          </Card>
        )}
        <div className="lg:col-span-2">
          <DelegationsCard />
        </div>
      </div>
    </>
  );
}
