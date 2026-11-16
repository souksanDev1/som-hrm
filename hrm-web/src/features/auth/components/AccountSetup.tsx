'use client';
import { pendingAccountSetup, type Me } from '@hrm/shared';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { ChangePasswordForm } from './ChangePasswordForm';
import { ChangePinForm } from './ChangePinForm';
import { VerifyPhoneForm } from './VerifyPhoneForm';

export interface AccountSetupProps {
  user: Me;
}

/**
 * The step the user must finish before using the app: phone verification first (FR-AUTH-02.1),
 * then replacing the temporary credential issued by HR (FR-AUTH-03.2). Each step updates `user`
 * through /auth/me, which moves the screen on.
 */
export function AccountSetup({ user }: AccountSetupProps) {
  const t = useT();
  const step = pendingAccountSetup(user);
  if (step === 'VERIFY_PHONE') {
    return (
      <Card title={t('authx.setup.verifyPhoneTitle')} data-testid="setup-verify-phone">
        <VerifyPhoneForm />
      </Card>
    );
  }
  if (step === 'CHANGE_CREDENTIAL') {
    return (
      <Card title={t('authx.setup.changeTitle')} data-testid="setup-change-credential">
        <p className="mb-4 text-sm text-ink-muted">{t('authx.setup.changeIntro')}</p>
        {user.hasPassword ? <ChangePasswordForm submitLabel={t('common.save')} /> : <ChangePinForm hasPin={user.hasPin} />}
      </Card>
    );
  }
  return null;
}
