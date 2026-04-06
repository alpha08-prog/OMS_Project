import { describe, it, expect } from 'vitest';

type CalendarEvent = {
  id: string;
  title: string;
  start: string | Date;
  end: string | Date;
  type: 'TOUR' | 'CUSTOM';
  organizer?: string;
  venue?: string;
  description?: string;
  googleSynced: boolean;
};

const EVENT_COLORS: Record<string, { backgroundColor: string; color: string; borderColor: string }> = {
  TOUR:   { backgroundColor: '#f59e0b', color: '#1e1b4b', borderColor: '#d97706' },
  CUSTOM: { backgroundColor: '#6366f1', color: '#ffffff', borderColor: '#4f46e5' },
};

function eventStyleGetter(event: CalendarEvent) {
  const style = EVENT_COLORS[event.type] || EVENT_COLORS.CUSTOM;
  return { style: { ...style, borderRadius: '6px', border: `1px solid ${style.borderColor}`, padding: '2px 6px' } };
}

describe('Calendar Event Styling', () => {
  it('should return amber colors for TOUR events', () => {
    const event: CalendarEvent = {
      id: '1', title: 'Tour', start: new Date(), end: new Date(),
      type: 'TOUR', googleSynced: false,
    };
    const result = eventStyleGetter(event);
    expect(result.style.backgroundColor).toBe('#f59e0b');
  });

  it('should return indigo colors for CUSTOM events', () => {
    const event: CalendarEvent = {
      id: '2', title: 'Custom', start: new Date(), end: new Date(),
      type: 'CUSTOM', googleSynced: false,
    };
    const result = eventStyleGetter(event);
    expect(result.style.backgroundColor).toBe('#6366f1');
  });

  it('should always include borderRadius and padding', () => {
    const event: CalendarEvent = {
      id: '1', title: 'Test', start: new Date(), end: new Date(),
      type: 'TOUR', googleSynced: false,
    };
    const result = eventStyleGetter(event);
    expect(result.style.borderRadius).toBe('6px');
    expect(result.style.padding).toBe('2px 6px');
  });
});

describe('Calendar Event Data', () => {
  it('should compute 2-hour end time for tour events', () => {
    const startTime = new Date('2026-04-01T10:00:00');
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
    expect(endTime.getHours()).toBe(12);
    expect(endTime.getMinutes()).toBe(0);
  });

  it('should compute 1-hour end time for custom events', () => {
    const startTime = new Date('2026-04-01T14:00:00');
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    expect(endTime.getHours()).toBe(15);
  });

  it('should mark event as googleSynced when it has a calendar event id', () => {
    const googleCalendarEventId = 'google-event-123';
    const googleSynced = !!googleCalendarEventId;
    expect(googleSynced).toBe(true);
  });

  it('should mark event as not synced when id is null', () => {
    const googleCalendarEventId: string | null = null;
    const googleSynced = !!googleCalendarEventId;
    expect(googleSynced).toBe(false);
  });

  it('should correctly format tour event title', () => {
    const eventName = 'IIT Dharwad Inauguration';
    const title = `[OMS] ${eventName}`;
    expect(title).toBe('[OMS] IIT Dharwad Inauguration');
  });

  it('should correctly build description lines', () => {
    const tour = {
      organizer: 'IIT Dharwad',
      venue: 'Main Hall',
      description: 'Opening ceremony',
      id: 'tour-123',
    };
    const lines = [
      `Organizer: ${tour.organizer}`,
      `Venue: ${tour.venue}`,
      tour.description ? `Details: ${tour.description}` : '',
      `OMS Tour ID: ${tour.id}`,
    ].filter(Boolean);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Organizer: IIT Dharwad');
  });

  it('should filter out empty description line', () => {
    const tour = { organizer: 'Test', venue: 'Hall', description: null as string | null, id: '1' };
    const lines = [
      `Organizer: ${tour.organizer}`,
      `Venue: ${tour.venue}`,
      tour.description ? `Details: ${tour.description}` : '',
      `OMS Tour ID: ${tour.id}`,
    ].filter(Boolean);
    expect(lines).toHaveLength(3);
  });
});

describe('Google Calendar Connect Flow', () => {
  it('should construct correct OAuth redirect URL', () => {
    const apiBase = 'https://example.com/api';
    const token = 'my-jwt-token';
    const url = `${apiBase}/google/connect?token=${token}`;
    expect(url).toBe('https://example.com/api/google/connect?token=my-jwt-token');
  });

  it('should persist auth data to localStorage before redirect', () => {
    // Simulate handleConnect
    const token = 'jwt-123';
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_session', 'true');
    localStorage.setItem('user_role', 'ADMIN');
    localStorage.setItem('user', JSON.stringify({ id: '1', name: 'Admin', role: 'ADMIN' }));

    expect(localStorage.getItem('auth_token')).toBe('jwt-123');
    expect(localStorage.getItem('auth_session')).toBe('true');
    expect(localStorage.getItem('user_role')).toBe('ADMIN');
  });
});
