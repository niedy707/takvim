
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
        const timeMin = searchParams.get('timeMin') || new Date().toISOString();

        // 1. Fetch from local logic (with caching)
        const apiEvents = await fetchCalendarEvents();

        // 2. Map to Takvim's internal types
        // calendar-api categories: surgery, checkup, appointment, blocked
        // takvim types: Surgery, Control, Exam, Online, Busy, Anesthesia
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

            return {
                id: event.id,
                title: displayTitle,
                patientName: event.title, // Keep original for internal use if needed (checking buffer logic)
                start: event.start,
                end: event.end,
                type: type
            } as ProcessedEvent;
        });

        // 4. Merge Logic (Controls & Exams)

        // 4. Merge Logic (Controls & Exams)
        const mergedEvents: ProcessedEvent[] = [];
        let buffer: ProcessedEvent[] = [];

        for (let i = 0; i < processedEvents.length; i++) {
            const current = processedEvents[i];

            // If Surgery -> Don't merge, push immediately (flush buffer first)
            if (current.type === 'Surgery') {
                if (buffer.length > 0) {
                    mergedEvents.push(createSummaryBlock(buffer));
                    buffer = [];
                }
                mergedEvents.push(current);
                continue;
            }

            // Logic for Controls/Exams/Busy/Anesthesia/Online: Check gaps
            if (buffer.length === 0) {
                buffer.push(current);
            } else {
                const lastInBuffer = buffer[buffer.length - 1];
                const gap = new Date(current.start).getTime() - new Date(lastInBuffer.end).getTime();

                // Merge if gap < 15 mins AND types are identical
                // This prevents "Exam" getting merged into "Control" and disappearing
                if (gap < 15 * 60 * 1000 && current.type === lastInBuffer.type) {
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
        const timeZone = 'Europe/Istanbul';

        // Helper to get day limits
        const getDayLimits = (d: Date) => {
            const zoned = toZonedTime(d, timeZone);
            const day = zoned.getDay();

            // Standard Weekday + Saturday (Mon=1 ... Sat=6)
            // User requested: Pazartesi-Cumartesi 08:00 - 22:00
            if (day >= 1 && day <= 6) {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone)
                };
            }
            // Sunday (0)
            else {
                return {
                    start: fromZonedTime(set(zoned, { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 }), timeZone),
                    end: fromZonedTime(set(zoned, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 }), timeZone)
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

        // --- NEW ALGORITHM: Interval Flattening ---

        // 1. Group by Day
        const eventsByDay: Record<string, ProcessedEvent[]> = {};
        for (const event of mergedEvents) {
            // Use event start to determine day bucket
            const dayKey = format(toZonedTime(new Date(event.start), timeZone), 'yyyy-MM-dd');
            if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
            eventsByDay[dayKey].push(event);
        }

        // Processing each day that has events (and potential gaps between them)
        // Note: This logic only fills gaps between interactions. 
        // We really want to iterate *each day in the range* to ensure empty days get full availability, 
        // but current logic mostly relies on day limits around known events or explicitly requested range.
        // For simplicity, let's stick to iterating the days we discovered events on, 
        // plus we should probably iterate the days in the requested view if we wanted to be perfect,
        // but the previous logic relied on "groupedEvents" which implies we only cared about days with data.
        // Wait, the previous logic: `isFirstOfDay`, `isLastOfDay` implies it filled empty space *around* events.
        // If a day has NO events, the previous logic wouldn't generate availability for it unless we iterated the full date range.
        // The previous code `for (let i = 0; i < groupedEvents.length; i++)` implies it only processed days with events.
        // Let's match that behavior for now to avoid scope creep, but ensure we handle the reported overlaps correctly.

        Object.keys(eventsByDay).forEach(dayKey => {
            const dayEvents = eventsByDay[dayKey];
            finalEvents.push(...dayEvents); // Add original events

            if (dayEvents.length === 0) return;

            // Get day boundaries
            const refDate = new Date(dayEvents[0].start);
            const limits = getDayLimits(refDate);
            const dayStart = limits.start.getTime();
            const dayEnd = limits.end.getTime();

            // 2. Create Busy Intervals
            // We consider everything in `dayEvents` as blocking, EXCEPT 'Available' (which shouldn't exist yet) 
            // and 'Cancelled' (already filtered).
            // Actually, we should check if any 'Available' snuck in, but `mergedEvents` are mostly our processed ones.

            let busyIntervals: { start: number, end: number }[] = dayEvents.map(e => {
                let s = new Date(e.start).getTime();
                const end = new Date(e.end).getTime();

                // BUFFER: If Surgery, block 10 mins before
                if (e.type === 'Surgery') {
                    s -= 10 * 60 * 1000;
                }

                return { start: s, end };
            });

            // Sort by start time
            busyIntervals.sort((a, b) => a.start - b.start);

            // 3. Flatten Intervals
            const mergedBusy: { start: number, end: number }[] = [];
            if (busyIntervals.length > 0) {
                let current = busyIntervals[0];
                for (let i = 1; i < busyIntervals.length; i++) {
                    const next = busyIntervals[i];
                    if (next.start < current.end) {
                        // Overlap: Merge
                        current.end = Math.max(current.end, next.end);
                    } else {
                        // No overlap: Push current, start new
                        mergedBusy.push(current);
                        current = next;
                    }
                }
                mergedBusy.push(current);
            }

            // 4. Generate Gaps (Inverse of Busy)
            // Cursor starts at dayStart
            let cursor = dayStart;

            for (const busy of mergedBusy) {
                // If there's a gap between cursor and busy.start
                const gapStart = Math.max(cursor, dayStart);
                const gapEnd = Math.min(busy.start, dayEnd);

                if (gapEnd > gapStart) {
                    const gapDuration = (gapEnd - gapStart) / (1000 * 60);
                    if (gapDuration >= 15) {
                        const fragments = applyBlackout(
                            new Date(gapStart).toISOString(),
                            new Date(gapEnd).toISOString(),
                            refDate
                        );
                        fragments.forEach(f => {
                            finalEvents.push({ ...f, id: `gap-${Math.random()}` });
                        });
                    }
                }
                // Move cursor to busy.end
                cursor = Math.max(cursor, busy.end);
            }

            // Final gap after last busy event
            if (cursor < dayEnd) {
                const gapDuration = (dayEnd - cursor) / (1000 * 60);
                if (gapDuration >= 15) {
                    const fragments = applyBlackout(
                        new Date(cursor).toISOString(),
                        new Date(dayEnd).toISOString(),
                        refDate
                    );
                    fragments.forEach(f => {
                        finalEvents.push({ ...f, id: `gap-eod-${Math.random()}` });
                    });
                }
            }
        });

        // NOTE: This logic only adds availability for days that HAVE at least one event.
        // Purely empty days (if any in the range) are not handled here, matching the old logic.
        // If we need empty days to show up as fully available, we would need to generate them separately.
        // Assuming Google Calendar returns *something* or we just accept this behavior.
        // For the specific issue (Dec 25), there ARE events, so this logic covers it.

        // 6. Surgery Counters (Post-Processing)
        const surgeriesByDay: Record<string, ProcessedEvent[]> = {};

        for (const event of finalEvents) {
            if (event.type === 'Surgery') {
                const dayKey = format(toZonedTime(new Date(event.start), timeZone), 'yyyy-MM-dd');
                if (!surgeriesByDay[dayKey]) {
                    surgeriesByDay[dayKey] = [];
                }
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

        // 7. Final Sort (Crucial: mix Gaps and Events chronologically)
        finalEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

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
