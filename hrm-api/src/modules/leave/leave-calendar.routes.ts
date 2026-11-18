import { leaveCalendarQuerySchema, leaveCalendarResponseSchema } from '@hrm/shared';
import type { AppInstance } from '../../app';

/** Leave calendar (FR-LV-13): every signed-in user; what each one sees is decided by the service. */
export const leaveCalendarRoutes = async (app: AppInstance) => {
  app.get(
    '/leave/calendar',
    { schema: { querystring: leaveCalendarQuerySchema, response: { 200: leaveCalendarResponseSchema } } },
    async (req) => app.services.leaveCalendar.calendar(req.auth, req.query),
  );
};
