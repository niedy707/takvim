/**
 * Categorizes calendar events into surgery, checkup, appointment, or blocked
 * Adapted from rinoapp-panel for Takvim project
 */
export function categorizeEvent(
    title: string,
    color?: string,
    start?: Date | string,
    end?: Date | string
): 'Surgery' | 'Control' | 'Exam' | 'Online' | 'Busy' | 'Available' | 'Cancelled' | 'Anesthesia' {
    const lowerTitle = title.toLowerCase();
    const turkishLowerTitle = title.toLocaleLowerCase('tr-TR');

    // XXX Check: Treat as Busy (Mesai Dışı) - Overrides everything else
    if (turkishLowerTitle.includes('xxx')) {
        return 'Busy';
    }


    // ANESTHESIA Check: starts with "anest"
    if (turkishLowerTitle.startsWith('anest')) {
        return 'Anesthesia';
    }

    // IGNORE/CANCELLED: Red events, or explicit ignore keywords
    // New Criteria: red color, or starts with: ipt, ert, bilgi, ℹ️, ℹ
    if (color === '#dc2127' || color === '#DC2127' || color === '11') {
        return 'Cancelled';
    }

    // Check if starts with ignore/cancelled prefixes
    const cancelledPrefixes = ['ipt', 'ert', 'iptal', 'ertelendi', 'bilgi', 'ℹ️', 'ℹ'];
    if (cancelledPrefixes.some(prefix => turkishLowerTitle.startsWith(prefix))) {
        return 'Cancelled';
    }

    // BUSY (Dolu): Occupies calendar but not a patient
    // New Criteria: starts with xxx, izin, kongre, toplantı, off, yokum, cumartesi, pazar, yok, gitmem
    const busyKeywords = ['xxx', 'izin', 'kongre', 'toplantı', 'off', 'yokum', 'cumartesi', 'pazar', 'hasta görebiliriz', 'hasta görme', 'hasta görelim', 'çıkış', 'yok', 'gitmem', 'vizite'];
    if (busyKeywords.some(keyword => turkishLowerTitle.includes(keyword))) { // Keeping 'includes' for broader matching as discussed
        return 'Busy';
    }

    // ONLINE Check (Specific to Takvim needs)
    if (lowerTitle.includes('online') || lowerTitle.includes('meet') || lowerTitle.includes('görüşme') || lowerTitle.includes('video') || lowerTitle.includes('opd')) {
        return 'Online';
    }

    // SURGERY: starts with 🔪 OR HH:MM/HH.MM time format
    // BUT exclude if it's a time-based appointment note (e.g., "07:15 muayene")
    if (title.includes('🔪') || lowerTitle.includes('ameliyat') || lowerTitle.includes('surgery')) {
        return 'Surgery';
    }

    if (/^\d{1,2}[:.]\d{2}/.test(title)) {
        // If starts with time but contains "muayene", it's an appointment note, not surgery
        if (turkishLowerTitle.includes('muayene')) {
            return 'Exam'; // Was 'blocked' in original, but 'muayene' implies Exam here? 
            // Actually rinoapp said 'blocked' for "07:15 muayene", probably because it's a note?
            // Let's stick to simple detection: if it explicitly says muayene, treat as exam.
            return 'Exam';
        }
        return 'Surgery';
    }

    // SURGERY: Duration-based check - if event is 60+ minutes, it's likely a surgery
    if (start && end) {
        const startDate = typeof start === 'string' ? new Date(start) : start;
        const endDate = typeof end === 'string' ? new Date(end) : end;
        const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);

        if (durationMinutes >= 60) {
            // Only if it doesn't explicitly look like something else
            if (!turkishLowerTitle.includes('kontrol') && !turkishLowerTitle.includes('muayene')) {
                return 'Surgery';
            }
        }
    }

    // CHECKUP (Control): k, k1, k2, or patterns like "1m ", "3m ", "1.5m " (with space after), or explicit 'kontrol'
    if (/^[kK]\d?/.test(title) || /^\d+\.?\d*m\s/.test(lowerTitle) || turkishLowerTitle.includes('kontrol')) {
        return 'Control';
    }

    // APPOINTMENT (Exam/Muayene): m or op prefix, or explicit 'muayene'
    if (/^[mM]\s/.test(title) || /^op\s/i.test(title) || turkishLowerTitle.includes('muayene') || turkishLowerTitle.includes('exam')) {
        return 'Exam';
    }

    // precise fallback
    return 'Busy';
}
