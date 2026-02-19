
import { NextRequest, NextResponse } from 'next/server';
import { format, isSameDay, addDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, addMinutes, isBefore, set } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { tr } from 'date-fns/locale';
import { fetchCalendarEvents } from '@/lib/googleCalendar';

// Force dynamic usage
export const dynamic = 'force-dynamic';

interface ProcessedEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    type: 'Surgery' | 'Control' | 'Exam' | 'Online' | 'Busy' | 'Available' | 'Cancelled' | 'Anesthesia';
    patientName?: string;
    count?: number; // For merged summaries
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const timeMinParam = searchParams.get('timeMin');
        const timeMin = timeMinParam ? new Date(timeMinParam) : startOfDay(new Date());

        // 1. Fetch from local logic (with caching)
        const apiEvents = await fetchCalendarEvents();

        // 2. Map to Takvim's internal types
        let processedEvents: ProcessedEvent[] = apiEvents.map((event: any) => {
            let type: ProcessedEvent['type'] = 'Exam';
            const cat = event.category;
            const lowerTitle = event.title.toLowerCase();

            if (cat === 'surgery') type = 'Surgery';
            else if (cat === 'checkup') type = 'Control';
            else if (cat === 'blocked') type = 'Busy';
            else if (cat === 'appointment') {
                if (lowerTitle.includes('anestezi') || lowerTitle.includes('anesthesia')) {
                    type = 'Anesthesia';
                } else if (lowerTitle.includes('online')) {
                    type = 'Online';
                } else {
                    type = 'Exam';
                }
            }

            // Display Title Logic (Strict Privacy)
            let displayTitle = 'Meşgul';
            if (type === 'Surgery') displayTitle = 'Ameliyat';
            else if (type === 'Anesthesia') displayTitle = 'Anestezi';
            else if (type === 'Online') displayTitle = 'Online Görüşme';
            else if (type === 'Exam') displayTitle = 'Muayene';
            else if (type === 'Control') displayTitle = 'Kontrol';
            else if (type === 'Busy') displayTitle = 'Dolu';

            // FIX #2: Abbreviate patient name server-side (e.g. "Ibrahim Yağcı" → "Ibrahim Y.")
            // so the full name is never exposed in the API response.
            let abbreviatedName: string | undefined;
            if (type === 'Surgery' && event.title) {
                let namePart = event.title;
                if (event.title.includes('🔪')) namePart = event.title.split('🔪')[1].trim();
                const parts = namePart.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
                    abbreviatedName = `${firstName} ${parts[1].charAt(0).toUpperCase()}.`;
                } else if (parts.length === 1) {
                    abbreviatedName = parts[0];
                }
            }

            return {
                id: event.id,
                title: displayTitle,
                patientName: abbreviatedName, // Only abbreviated, never full name
                start: event.start,
                end: event.end,
                type: type
            } as ProcessedEvent;
        });

        // FIX #3: Filter events by timeMin
        processedEvents = processedEvents.filter(e => new Date(e.end) >= timeMin);

        // 4. Merge Logic (Controls & Exams)
        const mergedEvents: ProcessedEvent[] = [];
        let buffer: ProcessedEvent[] = [];

        for (let i = 0; i < processedEvents.length; i++) {
            const current = processedEvents[i];

            if (current.type === 'Surgery') {
                if (buffer.length > 0) {
                    mergedEvents.push(createSummaryBlock(buffer));
                    buffer = [];
                }
                mergedEvents.push(current);
                continue;
            }

            if (buffer.length === 0) {
                buffer.push(current);
            } else {
                const lastInBuffer = buffer[buffer.length - 1];
                const gap = new Date(current.start).getTime() - new Date(lastInBuffer.end).getTime();

                if (gap < 15 * 60 * 1000 && current.type === lastInBuffer.type) {
                    buffer.push(current);
                } else {
                    mergedEvents.push(createSummaryBlock(buffer));
                    buffer = [current];
                }
            }
        }
        if (buffer.length > 0) {
            mergedEvents.push(createSummaryBlock(buffer));
        }

        // 5. Generate Availability Gaps
        const finalEvents: ProcessedEvent[] = [];
        const timeZone = 'Europe/Istanbul';

        const getDayLimits = (d: Date) => {
            const zoned = toZonedTime(d, timeZone);
            const day = zoned.getDay();
            if (day >= 1 && day <= 6) {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 21, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone)
                };
            } else {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone)
                };
            }
        };

        const applyBlackout = (startArg: string, endArg: string, baseDate: Date): ProcessedEvent[] => {
            const startTs = new Date(startArg).getTime();
            const endTs = new Date(endArg).getTime();
            const zoned = toZonedTime(baseDate, timeZone);
            const day = zoned.getDay();

            if (day >= 2 && day <= 4) {
                const blackoutStart = fromZonedTime(set(zoned, { hours: 19, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone).getTime();
                const blackoutEnd = fromZonedTime(set(zoned, { hours: 20, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone).getTime();

                if (endTs <= blackoutStart || startTs >= blackoutEnd) {
                    return [{ id: '', title: 'Müsait', start: startArg, end: endArg, type: 'Available' }];
                }

                const fragments: ProcessedEvent[] = [];
                if (startTs < blackoutStart && (blackoutStart - startTs) / (1000 * 60) >= 15) {
                    fragments.push({ id: '', title: 'Müsait', start: startArg, end: new Date(blackoutStart).toISOString(), type: 'Available' });
                }
                if (endTs > blackoutEnd && (endTs - blackoutEnd) / (1000 * 60) >= 15) {
                    fragments.push({ id: '', title: 'Müsait', start: new Date(blackoutEnd).toISOString(), end: endArg, type: 'Available' });
                }
                return fragments;
            }
            return [{ id: '', title: 'Müsait', start: startArg, end: endArg, type: 'Available' }];
        };

        // Group events by day
        const eventsByDay: Record<string, ProcessedEvent[]> = {};
        for (const event of mergedEvents) {
            const dayKey = format(toZonedTime(new Date(event.start), timeZone), 'yyyy-MM-dd');
            if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
            eventsByDay[dayKey].push(event);
        }

        // FIX #4: Generate availability for ALL days in the display range (30 days from timeMin),
        // including completely empty days that previously had no entry.
        const displayDays = eachDayOfInterval({ start: timeMin, end: addDays(timeMin, 29) });

        displayDays.forEach(day => {
            const dayKey = format(toZonedTime(day, timeZone), 'yyyy-MM-dd');
            const dayEvents = eventsByDay[dayKey] || [];

            // Push real events
            finalEvents.push(...dayEvents);

            const refDate = day;
            const limits = getDayLimits(refDate);
            const dayStart = limits.start.getTime();
            const dayEnd = limits.end.getTime();

            let busyIntervals: { start: number, end: number }[] = dayEvents.map(e => {
                let s = new Date(e.start).getTime();
                const end = new Date(e.end).getTime();
                if (e.type === 'Surgery') s -= 10 * 60 * 1000;
                return { start: s, end };
            });

            busyIntervals.sort((a, b) => a.start - b.start);

            const mergedBusy: { start: number, end: number }[] = [];
            if (busyIntervals.length > 0) {
                let current = busyIntervals[0];
                for (let i = 1; i < busyIntervals.length; i++) {
                    const next = busyIntervals[i];
                    if (next.start < current.end) {
                        current.end = Math.max(current.end, next.end);
                    } else {
                        mergedBusy.push(current);
                        current = next;
                    }
                }
                mergedBusy.push(current);
            }

            let cursor = dayStart;
            for (const busy of mergedBusy) {
                const gapStart = Math.max(cursor, dayStart);
                const gapEnd = Math.min(busy.start, dayEnd);
                if (gapEnd > gapStart && (gapEnd - gapStart) / (1000 * 60) >= 15) {
                    applyBlackout(new Date(gapStart).toISOString(), new Date(gapEnd).toISOString(), refDate)
                        .forEach(f => finalEvents.push({ ...f, id: `gap-${Math.random()}` }));
                }
                cursor = Math.max(cursor, busy.end);
            }

            if (cursor < dayEnd && (dayEnd - cursor) / (1000 * 60) >= 15) {
                applyBlackout(new Date(cursor).toISOString(), new Date(dayEnd).toISOString(), refDate)
                    .forEach(f => finalEvents.push({ ...f, id: `gap-eod-${Math.random()}` }));
            }
        });

        // 6. Surgery Counters
        const surgeriesByDay: Record<string, ProcessedEvent[]> = {};
        for (const event of finalEvents) {
            if (event.type === 'Surgery') {
                const dayKey = format(toZonedTime(new Date(event.start), timeZone), 'yyyy-MM-dd');
                if (!surgeriesByDay[dayKey]) surgeriesByDay[dayKey] = [];
                surgeriesByDay[dayKey].push(event);
            }
        }
        Object.values(surgeriesByDay).forEach(dailySurgeries => {
            dailySurgeries.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
            const total = dailySurgeries.length;
            dailySurgeries.forEach((event, index) => {
                event.title = `${event.title} (${index + 1}/${total})`;
            });
        });

        // 7. Final Sort
        finalEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        // FIX #5: Cache-Control header — Vercel CDN caches for 5 min, reduces redundant API calls
        return NextResponse.json(finalEvents, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
            }
        });
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
    const turkishMap: Record<string, string> = {
        'Exam': 'Muayene',
        'Control': 'Kontrol',
        'Anesthesia': 'Anestezi',
        'Online': 'Online Görüşme',
        'Busy': 'Dolu',
        'Surgery': 'Ameliyat', // Should not happen given logic, but good for completeness
        'Available': 'Müsait',
        'Cancelled': 'İptal'
    };

    events.forEach(e => {
        const t = turkishMap[e.type] || 'Diğer';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    const summaryParts = Object.entries(typeCounts).map(([type, count]) => `${count} ${type}`);
    const title = summaryParts.join(', ');

    // Determine representative type
    // If all events are same type, use that type (preserves color)
    // Otherwise use 'Control' as generic
    const allSame = events.every(e => e.type === events[0].type);
    const resultType = allSame ? events[0].type : 'Control';

    return {
        id: `group-${events[0].id}`,
        title,
        start,
        end,
        type: resultType,
        count
    };
}
