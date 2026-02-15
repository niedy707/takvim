/**
 * Categorizes calendar events into surgery, checkup, appointment, or blocked
 * 
 * Not: Tüm kurallar büyük/küçük harf duyarsızdır ve Türkçe karakter eşleşmesi otomatik yapılır (ı=i, ş=s, ç=c, ö=o, ü=u). 
 * Varsayılan olarak yukarıdaki kategorilere girmeyen her şey RANDEVU (Appointment) olarak kabul edilir.
 * 
 * @param title - Event title
 * @param color - Event color (hex)
 * @param start - Event start time (optional)
 * @param end - Event end time (optional)
 * @returns Event category
 */
export function categorizeEvent(
    title: string,
    color?: string,
    start?: Date | string,
    end?: Date | string
): 'surgery' | 'checkup' | 'appointment' | 'blocked' | 'ignore' {
    const normalizedTitle = normalizeName(title);
    // console.log(`[DEBUG_CLASS] Check: "${title}" -> Norm: "${normalizedTitle}" Color: ${color}`);

    // BLOCKED: Occupies the calendar but is not a patient event (Busy)
    // Priority 1: Check blocked keywords regardless of color
    // Keywords: xxx, izin, kongre, toplantı, off, yokum, cumartesi, pazar
    // Normalized check handles case/char insensitivity
    const blockedKeywords = ['xxx', 'izin', 'kongre', 'toplanti', 'off', 'yokum', 'cumartesi', 'pazar'];

    if (blockedKeywords.some(keyword => normalizedTitle.includes(keyword))) {
        return 'blocked';
    }

    // IGNORE: Red events (Color 11) are explicitly ignored per user rule.
    // They are NOT surgeries.
    // Priority 2: Check Ignore criteria
    if (color === '#dc2127' || color === '#DC2127' || color === '11') {
        return 'ignore';
    }

    const ignorePrefixes = ['ipt', 'ert', 'iptal', 'ertelendi', 'bilgi', 'ℹ️', 'ℹ'];
    if (ignorePrefixes.some(prefix => normalizedTitle.startsWith(normalizeName(prefix)))) {
        return 'ignore';
    }

    // REMOVED: ignoreKeywords check ("hasta görebiliriz", etc.) as requested.

    // Calculate duration in minutes if start/end exist
    let durationMinutes = 0;
    if (start && end) {
        const startDate = typeof start === 'string' ? new Date(start) : start;
        const endDate = typeof end === 'string' ? new Date(end) : end;
        durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    }

    // SURGERY LOGIC
    // Constraint: MUST be >= 45 minutes to be a surgery.
    const isSurgeryCandidate =
        title.includes('🔪') ||
        normalizedTitle.includes('ameliyat') ||
        normalizedTitle.includes('surgery') ||
        (/^\d{1,2}[:.]\d{2}/.test(title) && !normalizedTitle.includes('muayene')); // Time pattern check

    if (isSurgeryCandidate) {
        if (durationMinutes >= 45) {
            return 'surgery';
        } else {
            // Even if it says "Ameliyat", if it's 30 mins, treat as appointment per user rule
            return 'appointment';
        }
    }

    // REMOVED: Implicit Surgery by Duration (>= 60 mins) as requested.

    // CHECKUP: k, k1, k2, or patterns like "1m ", "3m ", "1.5m " (with space after)
    if (/^[kK]\d?/.test(title) || /^\d+\.?\d*m\s/.test(normalizedTitle) || normalizedTitle.includes('kontrol')) {
        return 'checkup';
    }

    // APPOINTMENT: m or op prefix, or contains 'online'
    if (/^[mM]\s/.test(title) || /^op\s/i.test(title) || normalizedTitle.includes('online') || normalizedTitle.includes('muayene') || normalizedTitle.includes('exam')) {
        return 'appointment';
    }

    // Default to appointment
    return 'appointment';
}

/**
 * Calculates the control label based on time difference between surgery and event.
 * Rules:
 * - < 7 days: returns days (e.g. "3d")
 * - 7-25 days: returns weeks, rounded to nearest integer (e.g. "2w")
 * - > 25 days: returns months, rounded to nearest 0.5 (e.g. "1m", "1.5m", "2m")
 * 
 * @param surgeryDateStr - Surgery Date (YYYY-MM-DD or comparable)
 * @param eventDateStr - Event Date (YYYY-MM-DD or comparable)
 */
export function calculateControlLabel(surgeryDateStr: string | Date, eventDateStr: string | Date): string {
    const surgeryDate = new Date(surgeryDateStr);
    const eventDate = new Date(eventDateStr);

    // Calculate difference in days
    const diffTime = eventDate.getTime() - surgeryDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '?';

    if (diffDays < 7) {
        return `${diffDays}d`;
    } else if (diffDays <= 25) {
        const weeks = Math.round(diffDays / 7);
        return `${weeks}w`;
    } else {
        const months = diffDays / 30; // Approximation
        // Round to nearest 0.5
        const roundedMonths = Math.round(months * 2) / 2;
        return `${roundedMonths}m`;
    }
}

/**
 * Normalizes patient names by removing noise (titles, dates, phone numbers, specific keywords).
 * Implements user-specified rules:
 * - Case/Char insensitive (Turkish support)
 * - Remove 'tel' + numbers
 * - Remove 'yas'/'yaş' + numbers
 * - Remove specific keywords and everything after ('yabancı', 'ortak', 'rino', 'kosta', 'revizyon'...)
 */
export function normalizeName(name: string): string {
    let n = name.normalize('NFC').toLocaleLowerCase('tr-TR');

    // 1. Remove "tel" and digits (and common separators)
    n = n.replace(/tel\s*[:.]?\s*[\d\s]+/gi, ' ');

    // 2. Remove "yas"/"yaş" and digits
    n = n.replace(/(yas|yaş)\s*[:.]?\s*\d+/gi, ' ');

    // 3. Cut off from specific keywords to the end
    // "yabancı", "ortak", "rino", "kosta", "revizyon"
    // Also "iy" / "İy"
    // We replace the keyword and everything after it with empty string
    // Added 'sekonder', 'septorin' as likely noise too based on context
    n = n.replace(/(yabancı|ortak|rino|kosta|revizyon|sekonder|septorin|tiplasti|kbb|implant|iy\s|İy\s).*$/gi, '');

    // 4. Standard cleanups
    n = n.replace(/iptal/gi, ' ')
        .replace(/🔪/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\d{1,2}[:.]\d{2}/g, ' '); // clocks

    // 5. Turkish char normalization aliases
    n = n.replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ğ/g, 'g');

    // 6. Remove remaining non-word chars (but KEEP unicode letters)
    n = n.replace(/[^\p{L}\s\d]/gu, ' ');

    const ignoredWords = new Set(['anestezi', 'pcr', 'yenidogan', 'yatis', 'yatış', 'plasti', 'plasty', 'op', 'bilgi', 'formu', 'hazırlık', 'dosya', 'dr', 'protokol', 've', 'iy']);

    return n.trim().split(/\s+/)
        .filter(w => w.length > 1 && !ignoredWords.has(w))
        .map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
        .join(' ');
}
