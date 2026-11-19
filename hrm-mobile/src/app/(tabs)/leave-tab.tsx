import { Redirect } from 'expo-router';

/**
 * Bottom-tab entry for leave. The tab press is intercepted in the tabs layout and pushes the
 * real /leave stack (so its detail and new-request screens keep their back navigation); this
 * screen only renders if the route is opened directly.
 */
export default function LeaveTab() {
  return <Redirect href="/leave" />;
}
