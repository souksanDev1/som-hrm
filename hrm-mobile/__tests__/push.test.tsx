import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/features/auth/store';
import { PushNotifications } from '@/features/notifications/PushNotifications';
import {
  isPushConfigured,
  registerForPushAsync,
  resetPushStateForTests,
  routeForPushData,
  unregisterPushToken,
} from '@/features/notifications/push';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} }, easConfig: null } }));

const N = Notifications as jest.Mocked<typeof Notifications>;
const config = Constants as unknown as { expoConfig: { extra: { eas?: { projectId?: string } } } };
const TOKEN = 'ExponentPushToken[device-1]';

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const calls = (spy: jest.SpyInstance) => spy.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${String(url).replace(/^.*\/api\/v1/, '')}`);

let fetchSpy: jest.SpyInstance;
let warn: jest.SpyInstance;
beforeEach(() => {
  resetPushStateForTests();
  config.expoConfig.extra = {};
  useAuthStore.setState({ accessToken: 'access', refreshToken: 'refresh' });
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => json({ token: TOKEN, platform: 'IOS', createdAt: 'x' }, init?.method === 'DELETE' ? 204 : 201));
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.clearAllMocks();
});
afterEach(() => {
  fetchSpy.mockRestore();
  warn.mockRestore();
});

const withProjectId = () => {
  config.expoConfig.extra = { eas: { projectId: 'eas-project-1' } };
};
const grant = () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  N.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN });
};

describe('push registration (FR-NOTI-01.1)', () => {
  it('without an EAS projectId does nothing: no prompt, no token, no API call, one log line', async () => {
    expect(isPushConfigured()).toBe(false);
    expect(await registerForPushAsync()).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(await registerForPushAsync()).toEqual({ status: 'unavailable', reason: 'not_configured' });
    expect(N.getPermissionsAsync).not.toHaveBeenCalled();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('registers the Expo push token with the API and removes it on sign-out', async () => {
    withProjectId();
    grant();
    expect(await registerForPushAsync()).toEqual({ status: 'registered', token: TOKEN });
    expect(N.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'eas-project-1' });
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled(); // already granted: no prompt
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(calls(fetchSpy)).toEqual(['POST /me/push-tokens']);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ token: TOKEN, platform: 'IOS' });
    expect((init as RequestInit & { headers: Record<string, string> }).headers.authorization).toBe('Bearer access');

    await unregisterPushToken();
    expect(calls(fetchSpy)).toEqual(['POST /me/push-tokens', `DELETE /me/push-tokens/${encodeURIComponent(TOKEN)}`]);
    await unregisterPushToken(); // nothing left to remove
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('asks only when the user was never asked, and respects a refusal', async () => {
    withProjectId();
    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' } as never);
    N.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' } as never);
    expect(await registerForPushAsync()).toEqual({ status: 'denied' });
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);

    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' } as never);
    expect(await registerForPushAsync()).toEqual({ status: 'denied' });
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(N.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('degrades quietly when the token cannot be issued (no FCM/APNs credentials yet)', async () => {
    withProjectId();
    N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
    N.getExpoPushTokenAsync.mockRejectedValue(new Error('Default FirebaseApp is not initialized in this process'));
    expect(await registerForPushAsync()).toEqual({ status: 'unavailable', reason: 'token_unavailable' });
    expect(await registerForPushAsync()).toEqual({ status: 'unavailable', reason: 'token_unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('push tap → screen (FR-NOTI-04.2)', () => {
  it('maps the push link through the shared mapping, falling back to the notification list', () => {
    expect(routeForPushData({ link: '/profile', notificationId: 'n1' })).toBe('/profile');
    expect(routeForPushData({ link: '/settings/holidays' })).toBe('/holidays');
    expect(routeForPushData({ link: '/employees/abc' })).toBe('/notifications');
    expect(routeForPushData({ link: 'https://evil.example' })).toBe('/notifications');
    expect(routeForPushData({ link: null })).toBe('/notifications');
    expect(routeForPushData(undefined)).toBe('/notifications');
  });

  const response = (data: Record<string, unknown>) => ({ notification: { request: { content: { data } } } }) as unknown as Notifications.NotificationResponse;
  const mount = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PushNotifications />
      </QueryClientProvider>,
    );

  it('opens the linked screen and marks the notification read when a push is tapped', async () => {
    withProjectId();
    grant();
    mount();
    await waitFor(() => expect(N.addNotificationResponseReceivedListener).toHaveBeenCalled());
    const onTap = N.addNotificationResponseReceivedListener.mock.calls[0]![0];
    onTap(response({ link: '/profile', notificationId: 'n1' }));
    expect(router.push).toHaveBeenCalledWith('/profile');
    await waitFor(() => expect(calls(fetchSpy)).toContain('POST /notifications/n1/read'));
  });

  it('handles the tap that launched the app', async () => {
    withProjectId();
    grant();
    N.getLastNotificationResponse.mockReturnValueOnce(response({ link: '/holidays' }));
    mount();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/holidays'));
    expect(N.clearLastNotificationResponse).toHaveBeenCalled();
  });

  it('subscribes to nothing when push is not configured', () => {
    mount();
    expect(N.setNotificationHandler).not.toHaveBeenCalled();
    expect(N.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
