'use client';
import { PERMISSIONS } from '@hrm/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Field, QueryState } from '@/components/ui';
import { DeviceList } from '@/features/attendance-requests/components/DeviceList';
import { EmployeeSelect } from '@/features/attendance-requests/components/EmployeeSelect';
import { useEmployeeDevices, useResetDevice } from '@/features/attendance-requests/hooks';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useT } from '@/lib/i18n';

/** HR view of an employee's attendance phones with reset (FR-ATT-11). */
export default function AttendanceDevicesPage() {
  const t = useT();
  const [employeeId, setEmployeeId] = useState('');
  const query = useEmployeeDevices(employeeId || null);
  const reset = useResetDevice();
  return (
    <RequirePermission permission={PERMISSIONS.ATTENDANCE_DEVICE_MANAGE}>
      <PageHeader title={t('attreq.devices.title')} description={t('attreq.devices.subtitle')} />
      <Card className="max-w-3xl">
        <Field label={t('attreq.onBehalf.employee')} htmlFor="devices-employee">
          <EmployeeSelect id="devices-employee" value={employeeId} onChange={setEmployeeId} />
        </Field>
        {employeeId && (
          <div className="mt-4">
            <QueryState query={query}>{(data) => <DeviceList devices={data} onReset={(id) => reset.mutateAsync(id)} />}</QueryState>
          </div>
        )}
      </Card>
    </RequirePermission>
  );
}
