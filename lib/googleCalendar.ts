import { google } from 'googleapis';
import { CALENDAR_CONFIG } from './calendarConfig';
import { categorizeEvent } from './classification';

// Cache Interface
interface CacheEntry {
    data: any[];
    timestamp: number;
}

// Global Cache Variables
let eventsCache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper to classify/process raw events
function processEvents(rawEvents: any[]) {
    const colorMap: Record<string, string> = {
        '1': '#a4bdfc', '2': '#46a67a', '3': '#dbadff', '4': '#ff887c',
        '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
        '9': '#5484ed', '10': '#3d8b3d', '11': '#dc2127',
    };

    return rawEvents.map((event: any) => {
        const title = event.summary || 'Müsait Değil';
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        const colorId = event.colorId;
        const color = colorId ? colorMap[colorId] : undefined;

        if (!start || !end) return null;

        const category = categorizeEvent(title, color, start, end);
        if (category === 'ignore') return null;

        return {
            id: event.id,
            title: title,
            start: start,
            end: end,
            category: category,
            color: color,
            location: event.location,
            description: event.description,
        };
    }).filter(Boolean);
}

export async function fetchCalendarEvents() {
    // 1. Check Cache
    const now = Date.now();
    if (eventsCache && (now - eventsCache.timestamp < CACHE_TTL)) {
        console.log('Serving events from IN-MEMORY CACHE');
        return eventsCache.data;
    }

    console.log('Fetching fresh events from Google Calendar API...');

    try {
        // 2. Authenticate
        const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
        const privateKey = CALENDAR_CONFIG.key.replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CALENDAR_CONFIG.email,
                private_key: privateKey,
            },
            scopes: SCOPES,
        });
        const calendar = google.calendar({ version: 'v3', auth });

        // 3. Fetch Data (Pagination)
        const allEvents: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            const response: any = await calendar.events.list({
                calendarId: CALENDAR_CONFIG.calendarId,
                timeMin: '2024-01-01T00:00:00Z',
                maxResults: 2500,
                singleEvents: true,
                orderBy: 'startTime',
                pageToken: pageToken,
            });

            if (response.data.items) {
                allEvents.push(...response.data.items);
            }
            pageToken = response.data.nextPageToken;
        } while (pageToken);

        // 4. Process Data
        const processedEvents = processEvents(allEvents);

        // 5. Update Cache
        eventsCache = {
            data: processedEvents,
            timestamp: now
        };
        console.log(`Fetched and cached ${processedEvents.length} events.`);

        return processedEvents;

    } catch (error) {
        console.error('Error fetching calendar events:', error);

        // Return stale cache if available on error
        if (eventsCache) {
            console.warn('Returning stale cache due to error.');
            return eventsCache.data;
        }

        throw error;
    }
}
