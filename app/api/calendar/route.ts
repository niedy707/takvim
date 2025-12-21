
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';
import { format, isSameDay, addDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, addMinutes, isBefore, set } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { tr } from 'date-fns/locale';
import { categorizeEvent } from '@/lib/eventCategories';

// Force dynamic usage
export const dynamic = 'force-dynamic';

interface ProcessedEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    type: 'Surgery' | 'Control' | 'Exam' | 'Online' | 'Busy' | 'Available' | 'Cancelled';
    count?: number; // For merged summaries
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const timeMin = searchParams.get('timeMin') || new Date().toISOString();

        // 1. Initial Auth & Setup
        // Handle key formatting: replace literal \n with real newlines if present
        const privateKey = CALENDAR_CONFIG.key.replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CALENDAR_CONFIG.email,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });

        const calendar = google.calendar({ version: 'v3', auth });

        // 2. Fetch Events
        // Fetch a bit more future to ensure we have enough data for gap calculation
        const response = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.calendarId, // Fixed property name
            timeMin: timeMin,
            maxResults: 500,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const items = response.data.items || [];

        // 3. Process & Categorize
        let processedEvents: ProcessedEvent[] = items.map(event => {
            const start = event.start?.dateTime || event.start?.date || '';
            const end = event.end?.dateTime || event.end?.date || '';
            const title = event.summary || 'Meşgul';
            const color = event.colorId || undefined;

            // Check validity
            if (!start || !end) return null;

            const category = categorizeEvent(title, color, start, end);

            let displayTitle = 'Meşgul';

            // STRICT PRIVACY: Map category to generic title
            if (category === 'Surgery') displayTitle = 'Ameliyat';
            else if (category === 'Online') displayTitle = 'Online Görüşme';
            else if (category === 'Exam') displayTitle = 'Muayene';
            else if (category === 'Control') displayTitle = 'Kontrol';
            else if (category === 'Busy') displayTitle = 'Dolu';

            return {
                id: event.id || Math.random().toString(),
                title: displayTitle,
                start,
                end,
                type: category
            } as ProcessedEvent;
        }).filter((e): e is ProcessedEvent => e !== null && e.type !== 'Cancelled') as ProcessedEvent[];

        // 4. Merge Logic (Controls & Exams)
        const mergedEvents: ProcessedEvent[] = [];
        let buffer: ProcessedEvent[] = [];

        for (let i = 0; i < processedEvents.length; i++) {
            const current = processedEvents[i];

            // If Surgery or Online -> Don't merge, push immediately (flush buffer first)
            if (current.type === 'Surgery' || current.type === 'Online') {
                if (buffer.length > 0) {
                    mergedEvents.push(createSummaryBlock(buffer));
                    buffer = [];
                }
                mergedEvents.push(current);
                continue;
            }

            // Logic for Controls/Exams/Busy: Check gaps
            if (buffer.length === 0) {
                buffer.push(current);
            } else {
                const lastInBuffer = buffer[buffer.length - 1];
                const gap = new Date(current.start).getTime() - new Date(lastInBuffer.end).getTime();

                // Merge if gap < 15 mins
                if (gap < 15 * 60 * 1000) {
                    buffer.push(current);
                } else {
                    mergedEvents.push(createSummaryBlock(buffer));
                    buffer = [current];
                }
            }
        }
        // Flush remaining buffer
        if (buffer.length > 0) {
            mergedEvents.push(createSummaryBlock(buffer));
        }

        // 5. Generate Availability Gaps
        const finalEvents: ProcessedEvent[] = [];

        // Sort merged events by start time just in case
        const groupedEvents = mergedEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        for (let i = 0; i < groupedEvents.length; i++) {
            const current = groupedEvents[i];
            finalEvents.push(current);

            // 1. GAP BETWEEN EVENTS
            if (i < groupedEvents.length - 1) {
                const next = groupedEvents[i + 1];
                const currentEnd = new Date(current.end).getTime();
                const nextStart = new Date(next.start).getTime();

                if (isSameDay(currentEnd, nextStart)) {
                    let effectiveStart = currentEnd;
                    let effectiveEnd = nextStart;
                    const timeZone = 'Europe/Istanbul';
                    // Convert timestamp to Istanbul time for logical Day checking
                    const zonedDate = toZonedTime(currentEnd, timeZone);

                    // SUNDAY CHECK (Day 0)
                    if (zonedDate.getDay() === 0) {
                        // Construct 08:00 Istanbul Time (using 'set' on the zoned date structure)
                        // Then convert BACK to UTC timestamp for comparison
                        const sundayLimitStart = fromZonedTime(
                            set(zonedDate, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }),
                            timeZone
                        );

                        const sundayLimitEnd = fromZonedTime(
                            set(zonedDate, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 }),
                            timeZone
                        );

                        // Intersect gap with 08:00-09:30 window
                        // Available Start = Max(GapStart, WindowStart)
                        effectiveStart = Math.max(currentEnd, sundayLimitStart.getTime());
                        // Available End = Min(GapEnd, WindowEnd)
                        effectiveEnd = Math.min(nextStart, sundayLimitEnd.getTime());
                    }

                    const gapMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);

                    // Only push if effective range is valid and long enough
                    if (effectiveEnd > effectiveStart && gapMinutes >= 15) {
                        finalEvents.push({
                            id: `gap - ${current.id} `,
                            title: 'Müsait',
                            start: new Date(effectiveStart).toISOString(),
                            end: new Date(effectiveEnd).toISOString(),
                            type: 'Available'
                        });
                    }
                }
            }

            // 2. END OF DAY AVAILABILITY
            const isLastOfTotal = i === groupedEvents.length - 1;
            const isLastOfDay = isLastOfTotal || !isSameDay(new Date(current.end).getTime(), new Date(groupedEvents[i + 1].start).getTime());

            if (isLastOfDay) {
                const currentEnd = new Date(current.end);

                const timeZone = 'Europe/Istanbul';
                const zonedCurrentEnd = toZonedTime(currentEnd, timeZone);

                // Determine End Target
                let endOfDayTarget;

                if (zonedCurrentEnd.getDay() === 0) {
                    // Sunday: End at 09:30 Istanbul Time
                    endOfDayTarget = fromZonedTime(
                        set(zonedCurrentEnd, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 }),
                        timeZone
                    );
                } else {
                    // Other days: End at 23:00 Istanbul Time
                    endOfDayTarget = fromZonedTime(
                        set(zonedCurrentEnd, { hours: 23, minutes: 0, seconds: 0, milliseconds: 0 }),
                        timeZone
                    );
                }

                if (currentEnd.getTime() < endOfDayTarget.getTime()) {
                    let effectiveStart = currentEnd.getTime();
                    const effectiveEnd = endOfDayTarget.getTime();

                    // Ensure Sunday start constraint (08:00) is met if gap starts too early
                    if (zonedCurrentEnd.getDay() === 0) {
                        const sundayStartLimit = fromZonedTime(
                            set(zonedCurrentEnd, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }),
                            timeZone
                        );
                        effectiveStart = Math.max(currentEnd.getTime(), sundayStartLimit.getTime());
                    }

                    const gapToEod = (effectiveEnd - effectiveStart) / (1000 * 60);

                    if (effectiveEnd > effectiveStart && gapToEod >= 15) {
                        finalEvents.push({
                            id: `gap - eod - ${current.id} `,
                            title: 'Müsait',
                            start: new Date(effectiveStart).toISOString(),
                            end: new Date(effectiveEnd).toISOString(),
                            type: 'Available'
                        });
                    }
                }
            }
        }

        return NextResponse.json(finalEvents);
    } catch (error) {
        console.error('Calendar API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch events', details: String(error) }, { status: 500 });
    }
}

function createSummaryBlock(events: ProcessedEvent[]): ProcessedEvent {
    if (events.length === 1) return events[0];

    const start = events[0].start;
    const end = events[events.length - 1].end;
    const count = events.length;

    // Create a nice summary string e.g. "3 Kontrol"
    // Count exact types
    const typeCounts: Record<string, number> = {};
    events.forEach(e => {
        const t = e.type === 'Exam' ? 'Muayene' : (e.type === 'Control' ? 'Kontrol' : 'Diğer');
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    const summaryParts = Object.entries(typeCounts).map(([type, count]) => `${count} ${type} `);
    const title = summaryParts.join(', ');

    return {
        id: `group - ${events[0].id} `,
        title,
        start,
        end,
        type: 'Control', // Generic type for styling
        count
    };
}
