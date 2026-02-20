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

    // BLOCKED: Occupies the calendar but is not a patient event (Busy)
    // Normalized check handles case/char insensitivity
    const blockedKeywords = ['xxx', 'izin', 'kongre', 'toplanti', 'off', 'yokum', 'cumartesi', 'pazar'];

    // Note: normalizedTitle is Title Case (e.g. "Ceren Ozen"). keywords are lowercase.
    // This check might be failing or working unexpectedly if case sensitivity matters.
    const lowerNorm = normalizedTitle.toLowerCase();

    if (blockedKeywords.some(keyword => lowerNorm.includes(keyword))) {
        console.log(`[DEBUG_CLASS] Blocked by keyword: ${blockedKeywords.find(k => lowerNorm.includes(k))}`);
        return 'blocked';
    }

    // IGNORE: Red events (Color 11) are explicitly ignored per user rule.
    // They are NOT surgeries.
    // Priority 2: Check Ignore criteria
    if (color === '#dc2127' || color === '#DC2127' || color === '11') {
        return 'ignore';
    }

    // Check symbols on raw title first (before normalization strips them)
    if (title.includes('ℹ️') || title.includes('ℹ')) {
        return 'ignore';
    }

    const ignorePrefixes = ['ipt', 'ert', 'iptal', 'ertelendi', 'bilgi'];
    const matchedPrefix = ignorePrefixes.find(prefix => normalizedTitle.toLowerCase().startsWith(prefix.toLowerCase()));
    if (matchedPrefix) {
        console.log(`[DEBUG_CLASS] Ignored by prefix: ${matchedPrefix}`);
        return 'ignore';
    }

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

    // CHECKUP: k, k1, k2, or patterns like "1m ", "3m ", "1.5m " (with space after)
    // Also: "Op " prefix = examination/checkup (not surgery)
    if (/^[kK]\d?/.test(title) || /^\d+\.?\d*m\s/.test(normalizedTitle) || normalizedTitle.includes('kontrol') || /^op\s/i.test(title)) {
        return 'checkup';
    }

    // APPOINTMENT: m prefix, online, muayene, exam
    if (/^[mM]\s/.test(title) || normalizedTitle.includes('online') || normalizedTitle.includes('muayene') || normalizedTitle.includes('exam')) {
        return 'appointment';
    }

    // Default to appointment
    return 'appointment';
}

/**
 * Calculates the control label based on time difference between surgery and event.
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

/**
 * Cleans the display name for storage and UI while preserving original characters and case.
 * Rules:
 * - Remove emoji 🔪
 * - Remove time patterns (e.g. 09:00, 14.30)
 * - Remove parentheses and their content: (abc)
 * - Remove standalone word "iy" (case-insensitive)
 * - Remove "tel" or "telefon" followed by digits
 * - Remove "yas" or "yaş" followed by a 2-digit age
 * - Remove specific keywords: Kosta, kostalı, rino, revizyon, ortak, vaka
 * - PRESERVE: 🎂YYYY birth-year annotations (e.g. 🎂2002)
 * - PRESERVE: [Rev1], [Rev2] revision tags
 */
export function cleanDisplayName(name: string): string {
    let n = name.normalize('NFC');

    // 0. Extract preserved suffixes (🎂YYYY and [RevN]) before cleaning
    const cakeMatch = n.match(/\s*(🎂\S*)/);
    const revMatch = n.match(/\s*(\[Rev\d+\])/);
    const cakeSuffix = cakeMatch ? cakeMatch[1] : '';
    const revSuffix = revMatch ? revMatch[1] : '';
    if (cakeSuffix) n = n.replace(cakeMatch![0], '');
    if (revSuffix) n = n.replace(revMatch![0], '');

    // 1. Remove emoji and time
    n = n.replace(/🔪/g, ' ')
        .replace(/\d{1,2}[:.]\d{2}/g, ' ');

    // 2. Remove parentheses and content
    n = n.replace(/\([^)]*\)/g, ' ');

    // 3. Remove "tel/telefon" + numbers (using word boundaries to avoid matching inside names like "Chantelle")
    n = n.replace(/\b(tel|telefon)\b\s*[:.]?\s*[\d\s]+/gi, ' ');

    // 4. Remove standalone "yas/yaş" + 2-digit numbers
    n = n.replace(/(?<!\p{L})(yas|yaş)(?!\p{L})\s*[:.]?\s*\d{2}/gui, ' ');

    // 5. Remove specific keywords and "iy"
    const noise = ['kosta', 'kostalı', 'rino', 'revizyon', 'ortak', 'vaka', 'iy'];
    n = n.split(/\s+/)
        .filter(word => {
            const low = word.toLocaleLowerCase('tr-TR');
            return !noise.includes(low);
        })
        .join(' ');

    // 5.5. Strip leading comma/punctuation (e.g. ", Hatice Kaya" → "Hatice Kaya")
    n = n.replace(/^[,;.\-/\s]+/, '');

    // NOTE: "|" is intentionally NOT removed — it denotes a separate procedure
    // e.g. "Özge Kaplan | Otoplasti" = same patient, different operation type

    // 6. Title Case Formatting
    const cleaned = n.replace(/\s+/g, ' ').trim()
        .split(' ')
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
        })
        .join(' ');

    // 7. Reattach preserved suffixes
    const extras = [cakeSuffix, revSuffix].filter(Boolean).join(' ');
    return extras ? `${cleaned} ${extras}` : cleaned;
}

/**
 * Extracts the surgery procedure type from a calendar event title.
 * Returns a clean, human-readable procedure name or undefined if not detectable.
 *
 * Priority:
 *  1. Pipe notation: "Adı Soyadı | Rinoplasti" → "Rinoplasti"
 *  2. Keyword scan on the raw title
 */
export function extractSurgeryType(title: string): string | undefined {
    // 1. Pipe notation — en güvenilir kaynak
    if (title.includes('|')) {
        const part = title.split('|')[1].trim();
        if (part.length >= 3) return part;
    }

    // 2. Keyword → canonical isim eşlemesi (Türkçe/ingilizce takvim girdileri)
    const t = title.toLowerCase();
    const map: [RegExp, string][] = [
        [/septorino|septorinoplast/,     'Septorino'],
        [/rinoplast|rhinoplast|rino/,    'Rinoplasti'],
        [/otoplast/,                     'Otoplasti'],
        [/septoplast/,                   'Septoplasti'],
        [/blefar/,                       'Blefaroplasti'],
        [/tipplast|tip plast/,           'Tipplasti'],
        [/mentoplast|genioplast/,        'Mentoplasti'],
        [/implant/,                      'İmplant'],
        [/fess|endoskop/,               'FESS'],
        [/dudak/,                        'Dudak'],
        [/kulak|kulağ/,                  'Kulak'],
    ];

    for (const [pattern, label] of map) {
        if (pattern.test(t)) return label;
    }

    return undefined;
}
