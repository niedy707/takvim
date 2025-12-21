
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
        const timeZone = 'Europe/Istanbul';

        // Helper to get day limits
        const getDayLimits = (d: Date) => {
            const zoned = toZonedTime(d, timeZone);
            const day = zoned.getDay();

            // Standard Weekday (Mon=1 ... Fri=5)
            // User requested: Hafta içi 08:00 - 22:00
            if (day >= 1 && day <= 5) {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone)
                };
            }
            // Sunday (0) - Preserving existing logic
            else if (day === 0) {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone)
                };
            }
            // Saturday (6) - Keeping as default "Other days" behavior (until 23:00) or maybe treat as weekday?
            // Let's stick to old "else" behavior for now which was 23:00, or maybe 08:00-23:00?
            else {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 23, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone)
                };
            }
        };

        // Helper to apply blackout periods (Tue, Wed, Thu 19:30-20:30)
        const applyBlackout = (startArg: string, endArg: string, baseDate: Date): ProcessedEvent[] => {
            const startTs = new Date(startArg).getTime();
            const endTs = new Date(endArg).getTime();

            const zoned = toZonedTime(baseDate, timeZone);
            const day = zoned.getDay();

            // Tue(2), Wed(3), Thu(4)
            if (day >= 2 && day <= 4) {
                const blackoutStart = fromZonedTime(set(zoned, { hours: 19, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone).getTime();
                const blackoutEnd = fromZonedTime(set(zoned, { hours: 20, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone).getTime();

                // Check overlap
                // If gap is completely before blackout
                if (endTs <= blackoutStart) {
                    return [{ id: '', title: 'Müsait', start: startArg, end: endArg, type: 'Available' }];
                }
                // If gap is completely after blackout
                if (startTs >= blackoutEnd) {
                    return [{ id: '', title: 'Müsait', start: startArg, end: endArg, type: 'Available' }];
                }

                // If overlap exists
                const fragments: ProcessedEvent[] = [];

                // Fragment before blackout
                if (startTs < blackoutStart) {
                    // Check min duration 15m
                    if ((blackoutStart - startTs) / (1000 * 60) >= 15) {
                        fragments.push({
                            id: '',
                            title: 'Müsait',
                            start: startArg,
                            end: new Date(blackoutStart).toISOString(),
                            type: 'Available'
                        });
                    }
                }

                // Fragment after blackout
                if (endTs > blackoutEnd) {
                    if ((endTs - blackoutEnd) / (1000 * 60) >= 15) {
                        fragments.push({
                            id: '',
                            title: 'Müsait',
                            start: new Date(blackoutEnd).toISOString(),
                            end: endArg,
                            type: 'Available'
                        });
                    }
                }

                return fragments;
            }

            // No blackout for other days
            return [{ id: '', title: 'Müsait', start: startArg, end: endArg, type: 'Available' }];
        };

        for (let i = 0; i < groupedEvents.length; i++) {
            const current = groupedEvents[i];
            const currentStart = new Date(current.start);
            const currentEnd = new Date(current.end);

            // 0. START OF DAY GAP (Check if this is the first event of the day)
            // Check if previous event was on a different day or if this is the first event ever
            const isFirstOfDay = i === 0 || !isSameDay(new Date(groupedEvents[i - 1].end), currentStart);

            if (isFirstOfDay) {
                const limits = getDayLimits(currentStart);
                const dayStart = limits.start.getTime();
                const eventStart = currentStart.getTime();

                if (eventStart > dayStart) {
                    const gapMinutes = (eventStart - dayStart) / (1000 * 60);
                    if (gapMinutes >= 15) {
                        const fragments = applyBlackout(limits.start.toISOString(), current.start, currentStart);
                        fragments.forEach(f => {
                            finalEvents.push({ ...f, id: `gap-start-${current.id}-${Math.random()}` });
                        });
                    }
                }
            }

            finalEvents.push(current);

            // 1. GAP BETWEEN EVENTS
            if (i < groupedEvents.length - 1) {
                const next = groupedEvents[i + 1];
                const nextStart = new Date(next.start).getTime();
                const currentEndTs = currentEnd.getTime();

                if (isSameDay(currentEnd, next.start)) {
                    const limits = getDayLimits(currentEnd);
                    const dayStart = limits.start.getTime();
                    const dayEnd = limits.end.getTime();

                    // The gap exists between currentEnd ... nextStart
                    // We must clamp this gap to the working hours [dayStart, dayEnd]

                    const effectiveStart = Math.max(currentEndTs, dayStart);
                    const effectiveEnd = Math.min(nextStart, dayEnd);

                    const gapMinutes = (effectiveEnd - effectiveStart) / (1000 * 60);

                    if (effectiveEnd > effectiveStart && gapMinutes >= 15) {
                        const fragments = applyBlackout(new Date(effectiveStart).toISOString(), new Date(effectiveEnd).toISOString(), currentEnd);
                        fragments.forEach(f => {
                            finalEvents.push({ ...f, id: `gap-${current.id}-${Math.random()}` });
                        });
                    }
                }
            }

            // 2. END OF DAY AVAILABILITY
            const isLastOfTotal = i === groupedEvents.length - 1;
            const isLastOfDay = isLastOfTotal || !isSameDay(currentEnd, groupedEvents[i + 1].start);

            if (isLastOfDay) {
                const limits = getDayLimits(currentEnd);
                const dayEnd = limits.end.getTime();
                const currentEndTs = currentEnd.getTime();

                if (currentEndTs < dayEnd) {
                    const gapMinutes = (dayEnd - currentEndTs) / (1000 * 60);

                    if (gapMinutes >= 15) {
                        const fragments = applyBlackout(currentEnd.toISOString(), limits.end.toISOString(), currentEnd);
                        fragments.forEach(f => {
                            finalEvents.push({ ...f, id: `gap-eod-${current.id}-${Math.random()}` });
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
