"use client";

import { useEffect, useState, useMemo } from 'react';
import { format, isSameDay, addDays, eachDayOfInterval, startOfDay, addMinutes, isBefore, subMinutes, addMonths } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';
import clsx from 'clsx';

interface Event {
    id: string;
    title: string;
    start: string;
    end: string;
    type: 'Surgery' | 'Control' | 'Online' | 'Busy' | 'Available' | 'Cancelled' | 'Anesthesia' | 'Exam';
    count?: number;
    patientName?: string;
}

interface CalendarPanelProps {
    lastUpdate?: string;
}

const translations = {
    tr: {
        titleName: 'Op.Dr. İbrahim YAĞCI',
        titleSuffix: 'Randevu Ekranı',
        plannedPatientsBtn: ['Planlı', 'hastalar'],
        weeklyProgramBtn: ['Haftalık', 'program'],
        surgeriesToday: 'Bugün için planlanan ameliyat sayısı:',
        noEvents: 'Etkinlik yok',
        plannedPatientsTitle: 'Planlı Ameliyatlar',
        noPlannedSurgeries: 'Planlanmış ameliyat bulunmamaktadır.',
        patientCount: 'Hasta',
        totalPlanned: 'Toplam',
        totalPlannedSuffix: 'planlı ameliyat listelenmektedir.',
        createAppointment: 'Randevu Oluştur',
        nameLabel: 'Hasta Adı Soyadı:',
        timeLabel: 'Randevu Saati',
        placeholderName: 'Örn: Ahmet Yılmaz',
        examBtn: 'Muayene',
        surgeryBtn: 'Ameliyat',
        controlBtn: 'Kontrol',
        onlineBtn: 'Online Konsultasyon (OPD)',
        validNameAlert: 'Lütfen geçerli bir isim giriniz (en az 3 karakter).',
        available: 'Müsait',
        weeklyProgramTitle: '2 Haftalık Program',
        totalPlannedSurgery: 'ameliyat planlandı',
        empty: 'Boş',
        surgery: 'Ameliyat',
        whatsappTemplate: 'İbrahim Yağcı takvimi için {date} saat {time} itibariyle bir {type} randevusu talep ediyorum.\n\nHasta ismi: {name}',
        close: 'Kapat',
        eventTypes: {
            Surgery: 'Ameliyat',
            Control: 'Kontrol',
            Exam: 'Muayene',
            Online: 'Online Konsultasyon',
            Busy: 'Meşgul',
            Available: 'Müsait',
            Anesthesia: 'Anestezi',
            Cancelled: 'İptal'
        }
    },
    en: {
        titleName: 'Op.Dr. Ibrahim YAGCI',
        titleSuffix: 'Surgical Schedule',
        plannedPatientsBtn: ['Planned', 'Patients'],
        weeklyProgramBtn: ['Weekly', 'Program'],
        surgeriesToday: 'Surgeries planned for today:',
        noEvents: 'No events',
        plannedPatientsTitle: 'Planned Surgeries',
        noPlannedSurgeries: 'No planned surgeries found.',
        patientCount: 'Patient',
        totalPlanned: 'Total',
        totalPlannedSuffix: 'planned surgeries listed.',
        createAppointment: 'Create Appointment',
        nameLabel: 'Patient Name Surname:',
        timeLabel: 'Appointment Time',
        placeholderName: 'Ex: John Doe',
        examBtn: 'Examination',
        surgeryBtn: 'Surgery',
        controlBtn: 'Control',
        onlineBtn: 'Online Consultation (OPD)',
        validNameAlert: 'Please enter a valid name (min 3 characters).',
        available: 'Available',
        weeklyProgramTitle: '2 Week Program',
        totalPlannedSurgery: 'surgeries planned',
        empty: 'Empty',
        surgery: 'Surgery',
        whatsappTemplate: 'I am requesting a {type} appointment for Ibrahim Yagci calendar on {date} at {time}.\n\nPatient Name: {name}',
        close: 'Close',
        eventTypes: {
            Surgery: 'Surgery',
            Control: 'Control',
            Exam: 'Examination',
            Online: 'Online Consultation',
            Busy: 'Busy',
            Available: 'Available',
            Anesthesia: 'Anesthesia',
            Cancelled: 'Cancelled'
        }
    }
};

export default function CalendarPanel({ lastUpdate }: CalendarPanelProps) {
    const [events, setEvents] = useState<Event[]>([]);

    const [showMobilePlannedModal, setShowMobilePlannedModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState<Event | null>(null);
    const [patientName, setPatientName] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [lang, setLang] = useState<'tr' | 'en'>('en');

    const [lastSync, setLastSync] = useState<Date | null>(null);

    const t = translations[lang];
    const locale = lang === 'tr' ? tr : enUS;

    useEffect(() => {
        // Fetch events
        const fetchEvents = async () => {
            try {
                // Return start of the current day to ensure we see all of today's events, even past ones
                const res = await fetch('/api/calendar?timeMin=' + startOfDay(new Date()).toISOString());
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                setEvents(data);
                setLastSync(new Date());
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);



    const daysToShow = useMemo(() => {
        const today = new Date();
        return eachDayOfInterval({
            start: today,
            end: addDays(today, 29)
        });
    }, []);

    const getEventsForDay = (date: Date) => {
        return events.filter(e => isSameDay(new Date(e.start), date));
    };

    const handleSlotClick = (event: Event) => {
        if (event.type === 'Available') {
            setSelectedSlot(event);
            setPatientName('');
            setSelectedTime(format(new Date(event.start), 'HH:mm')); // Default to start time
        }
    };

    const generateTimeSlots = (startStr: string, endStr: string) => {
        const slots = [];
        let current = new Date(startStr);
        const end = new Date(endStr);

        while (isBefore(current, end)) {
            slots.push(format(current, 'HH:mm'));
            current = addMinutes(current, 15);
        }
        return slots;
    };

    const handleBooking = (type: string) => {
        if (!selectedSlot || !selectedTime) return;
        if (patientName.length < 3) {
            alert(t.validNameAlert);
            return;
        }

        const dateStr = format(new Date(selectedSlot.start), 'dd.MM.yyyy', { locale: tr }); // Always Turkish Locale for date in msg

        // Always use Turkish template
        const trTemplate = translations['tr'].whatsappTemplate;

        // Map generic types to Turkish if needed for the message body
        const typeMap: Record<string, string> = {
            'Surgery': 'Ameliyat',
            'Exam': 'Muayene',
            'Control': 'Kontrol',
            'Online': 'Online Konsultasyon'
        };

        const typeInTR = typeMap[type] || type;

        let message = trTemplate
            .replace('{date}', dateStr)
            .replace('{time}', selectedTime)
            .replace('{type}', typeInTR)
            .replace('{name}', patientName);

        if (lang === 'en') {
            message += "\n\n(This message was sent by an English speaking patient via the appointment system.)";
        }

        const url = `whatsapp://send?phone=+905511999963&text=${encodeURIComponent(message)}`;

        window.open(url, '_blank');
        setSelectedSlot(null);
    };

    const plannedPatients = useMemo(() => {
        const todayStart = startOfDay(new Date());
        const threeMonthsLater = addMonths(todayStart, 3);
        const plannedEvents = events
            .filter(e => {
                const eventDate = new Date(e.start);
                return e.type === 'Surgery' && eventDate >= todayStart && eventDate <= threeMonthsLater;
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        return plannedEvents.map((e, index) => ({
            ...e,
            index: `P${index + 1}`
        })) as (Event & { index: string })[];
    }, [events]);

    if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

    const formatName = (fullName: string) => {
        // 1. Handle "🔪" separator if present
        let namePart = fullName;
        if (fullName.includes('🔪')) {
            namePart = fullName.split('🔪')[1].trim();
        }

        // 2. Parse Name: First Word + Second Word First Letter
        const parts = namePart.trim().split(/\s+/);

        if (parts.length === 0) return "";

        // Helper to capitalize first letter
        const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

        if (parts.length === 1) return capitalize(parts[0]);

        const firstName = capitalize(parts[0]);
        const secondNameInitial = parts[1].charAt(0).toUpperCase();

        return `${firstName} ${secondNameInitial}.`;
    };


    return (
        <div className="h-screen flex flex-col bg-slate-950 font-sans overflow-hidden">
            {/* Header */}
            <header className="flex-shrink-0 flex flex-row items-center justify-between z-40 bg-slate-900 border-b border-slate-800 px-3 py-2 shadow-md gap-2">
                {/* Left: Logo + WhatsApp */}
                <div className="flex items-center gap-2">
                    {/* Logo */}
                    <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain flex-shrink-0" />
                    {/* Title */}
                    <div className="flex flex-col justify-center">
                        <span className="text-sm font-bold text-slate-100 leading-tight tracking-tight">{t.titleName}</span>
                        <span className="text-[11px] font-medium text-slate-500 leading-tight">{t.titleSuffix}</span>
                    </div>
                </div>

                {/* Right: WhatsApp + Lang + Time */}
                <div className="flex items-center gap-2">
                    {/* WhatsApp Button */}
                    <a
                        href="whatsapp://send?phone=+905511999963"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition-all shadow-sm"
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        <span className="font-semibold text-xs">Asistan</span>
                    </a>

                    {/* Divider */}
                    <div className="w-px h-6 bg-slate-700" />

                    {/* Language */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => setLang('tr')}
                            className={clsx("text-lg transition-all hover:scale-110 leading-none p-0.5 rounded hover:bg-slate-800")}
                            title="Türkçe"
                        >🇹🇷</button>
                        <button
                            onClick={() => setLang('en')}
                            className={clsx("text-lg transition-all hover:scale-110 leading-none p-0.5 rounded hover:bg-slate-800")}
                            title="English"
                        >🇬🇧</button>
                    </div>

                    {/* Divider */}
                    <div className="w-px h-6 bg-slate-700" />

                    {/* Date & Time */}
                    <div className="flex flex-col items-end">
                        <span className="text-[11px] font-semibold text-slate-300 leading-tight">
                            {format(currentTime, 'HH:mm')}
                        </span>
                        <span className="text-[9px] text-slate-500 leading-tight">
                            {format(currentTime, 'd MMM', { locale })} · GMT+3
                        </span>
                        {lastSync && (
                            <span className="text-[9px] text-emerald-500/80 leading-italic mt-0.5">
                                Last sync: {format(lastSync, 'dMMMHH:mm', { locale })}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content Grid */}
            <div className="flex-grow overflow-hidden p-1 md:p-4 pt-0">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 md:gap-4 h-full">
                    {/* Left Column: Calendar List */}
                    <div className="lg:col-span-3 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4 pb-4">
                        {
                            daysToShow.map((day) => {
                                const dayEvents = getEventsForDay(day);
                                const isToday = isSameDay(day, new Date());

                                return (
                                    <div key={day.toISOString()} className={clsx(
                                        "flex flex-col border-2 rounded-xl bg-slate-900 transition-all",
                                        isToday ? "border-blue-500/50 shadow-lg shadow-blue-900/20 ring-2 ring-blue-500/20" : "border-slate-800"
                                    )}>
                                        {/* Header with Background */}
                                        <h2 className={clsx(
                                            "text-lg font-bold py-3 px-4 border-b-2 flex flex-col justify-center items-start transition-all gap-1 rounded-t-xl",
                                            isToday
                                                ? "bg-blue-900/60 text-blue-200 border-blue-500/30"
                                                : "bg-slate-800 text-orange-200/80 border-slate-700/50"
                                        )}>
                                            <div className="flex justify-between items-center w-full">
                                                <span className="leading-none">{format(day, 'EEEE', { locale })}</span>
                                                <span className={clsx("text-sm font-medium leading-none", isToday ? "text-blue-400" : "text-orange-400/60")}>
                                                    {format(day, 'd MMM', { locale })}
                                                </span>
                                            </div>
                                            {(() => {
                                                const surgeryCount = dayEvents.filter(e => e.type === 'Surgery').reduce((sum, e) => sum + (e.count || 1), 0);
                                                const examCount = dayEvents.filter(e => e.type === 'Exam').reduce((sum, e) => sum + (e.count || 1), 0);
                                                const controlCount = dayEvents.filter(e => e.type === 'Control').reduce((sum, e) => sum + (e.count || 1), 0);

                                                const summaries = [];
                                                if (surgeryCount > 0) summaries.push(`${surgeryCount} ${t.eventTypes.Surgery}`);
                                                if (examCount > 0) summaries.push(`${examCount} ${t.eventTypes.Exam}`);
                                                if (controlCount > 0) summaries.push(`${controlCount} ${t.eventTypes.Control}`);

                                                if (summaries.length > 0) {
                                                    return (
                                                        <span className="text-xs font-normal italic text-slate-500 mt-1">
                                                            ({summaries.join(', ')})
                                                        </span>
                                                    );
                                                }
                                            })()}
                                        </h2>

                                        {/* Content Area */}
                                        <div className="p-3 flex flex-col gap-2 flex-grow bg-slate-950/30">
                                            {dayEvents.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-slate-700 text-sm italic py-4">
                                                    <span className="text-2xl mb-2 opacity-20">📅</span>
                                                    {t.noEvents}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {(() => {
                                                        // Group consecutive events of same type
                                                        const groupedEvents: Event[][] = [];
                                                        if (dayEvents.length > 0) {
                                                            let currentGroup = [dayEvents[0]];

                                                            for (let i = 1; i < dayEvents.length; i++) {
                                                                const prev = currentGroup[currentGroup.length - 1];
                                                                const curr = dayEvents[i];

                                                                // Group if generic types match (Surgery, Exam, Control)
                                                                // AND they are consecutive (optional, but grouping usually implies continuity or at least adjacency in list)
                                                                if (prev.type === curr.type && ['Surgery', 'Exam', 'Control'].includes(curr.type)) {
                                                                    currentGroup.push(curr);
                                                                } else {
                                                                    groupedEvents.push(currentGroup);
                                                                    currentGroup = [curr];
                                                                }
                                                            }
                                                            groupedEvents.push(currentGroup);
                                                        }

                                                        return groupedEvents.map((group, groupIndex) => {
                                                            const firstEvent = group[0];
                                                            const lastEvent = group[group.length - 1];
                                                            const isGroup = group.length > 1;

                                                            // Create a display event that represents the group
                                                            const displayEvent: Event = isGroup ? {
                                                                ...firstEvent,
                                                                end: lastEvent.end,
                                                                // For grouped items, we'll use the generic type name as title
                                                                title: t.eventTypes[firstEvent.type] || firstEvent.type,
                                                                count: group.length
                                                            } : firstEvent;

                                                            const isAvailable = displayEvent.type === 'Available';
                                                            const isPast = isAvailable
                                                                ? isBefore(subMinutes(new Date(displayEvent.end), 5), new Date())
                                                                : isBefore(new Date(displayEvent.start), new Date());
                                                            const isDisabled = isAvailable && isPast;

                                                            return (
                                                                <div
                                                                    key={firstEvent.id + (isGroup ? '-group' : '')}
                                                                    onClick={() => {
                                                                        if (!isDisabled) {
                                                                            // If it's a group, maybe just open the first one? 
                                                                            // Or if it's booked (surgery/exam), handleSlotClick usually does nothing or minimal.
                                                                            // handleSlotClick currently strictly handles 'Available' type only for booking.
                                                                            // For already booked slots, it doesn't do much.
                                                                            handleSlotClick(firstEvent);
                                                                        }
                                                                    }}
                                                                    className={clsx(
                                                                        "transition-transform",
                                                                        isAvailable && !isDisabled && "cursor-pointer active:scale-95",
                                                                        isDisabled && "opacity-40 cursor-not-allowed grayscale"
                                                                    )}
                                                                >
                                                                    <EventCard event={displayEvent} t={t} />
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Right Column: Planned Patients Side Panel (Desktop Only) */}
                    <div className="hidden lg:flex lg:col-span-1 h-full overflow-hidden flex-col bg-slate-900 border border-slate-800 rounded-xl">
                        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                            <h3 className="text-lg font-bold text-white">{t.plannedPatientsTitle}</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                {t.totalPlanned} {plannedPatients.length} {t.totalPlannedSuffix}
                            </p>
                        </div>
                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                            {plannedPatients.length === 0 ? (
                                <div className="text-center text-slate-500 py-8">
                                    {t.noPlannedSurgeries}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Group by Date */}
                                    {Object.entries(plannedPatients.reduce((acc, patient) => {
                                        const dateKey = format(new Date(patient.start), 'yyyy-MM-dd');
                                        if (!acc[dateKey]) acc[dateKey] = [];
                                        acc[dateKey].push(patient);
                                        return acc;
                                    }, {} as Record<string, typeof plannedPatients>)).map(([dateKey, patients]) => (
                                        <div key={dateKey} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
                                            {/* Date Header */}
                                            <div className="bg-violet-900/20 px-3 py-2 border-b border-slate-800 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-300 text-sm">
                                                        {format(new Date(dateKey), 'd MMM', { locale })}
                                                    </span>
                                                    <span className="text-slate-500 font-normal text-xs">
                                                        {format(new Date(dateKey), 'EEE', { locale })}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/20">
                                                    {patients.length}
                                                </span>
                                            </div>

                                            {/* Patients List */}
                                            <div className="divide-y divide-slate-800/50">
                                                {patients.map((patient) => (
                                                    <div key={patient.id} className="flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors">
                                                        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-violet-500/10 text-violet-400 font-bold rounded text-xs border border-violet-500/20">
                                                            {patient.index}
                                                        </span>
                                                        <div className="flex-grow min-w-0 font-medium text-slate-400 text-sm truncate">
                                                            {formatName(patient.patientName || patient.title)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Planned Patients Button */}
            <div className="lg:hidden fixed bottom-4 right-4 z-50">
                <button
                    onClick={() => setShowMobilePlannedModal(true)}
                    className="flex items-center gap-2 bg-violet-600 text-white px-5 py-3 rounded-full shadow-xl shadow-violet-900/40 border border-violet-500/50 hover:scale-105 transition-transform"
                >
                    <span className="text-xl">🔪</span>
                    <div className="flex flex-col items-start leading-none">
                        <span className="font-bold text-sm">{t.plannedPatientsTitle}</span>
                        <span className="text-[10px] opacity-80">{plannedPatients.length} {t.patientCount}</span>
                    </div>
                </button>
            </div>

            {/* Mobile Planned Patients Modal */}
            {showMobilePlannedModal && (
                <div
                    className="lg:hidden fixed inset-0 z-[70] flex items-end justify-center backdrop-blur-sm bg-black/60 animate-in fade-in duration-200"
                    onClick={() => setShowMobilePlannedModal(false)}
                >
                    <div
                        className="w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800">
                            <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                                <span>🔪</span> {t.plannedPatientsTitle}
                            </h3>
                            <button onClick={() => setShowMobilePlannedModal(false)} className="bg-slate-800 p-2 rounded-full text-white/70 hover:text-white">
                                <span className="sr-only">{t.close}</span>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-grow overflow-y-auto p-4 bg-slate-950">
                            {plannedPatients.length === 0 ? (
                                <div className="text-center text-slate-500 py-12">
                                    {t.noPlannedSurgeries}
                                </div>
                            ) : (
                                <div className="space-y-4 pb-8">
                                    {Object.entries(plannedPatients.reduce((acc, patient) => {
                                        const dateKey = format(new Date(patient.start), 'yyyy-MM-dd');
                                        if (!acc[dateKey]) acc[dateKey] = [];
                                        acc[dateKey].push(patient);
                                        return acc;
                                    }, {} as Record<string, typeof plannedPatients>)).map(([dateKey, patients]) => (
                                        <div key={dateKey} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                                            <div className="bg-violet-900/20 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-200">
                                                        {format(new Date(dateKey), 'd MMM', { locale })}
                                                    </span>
                                                    <span className="text-slate-500 text-sm">
                                                        {format(new Date(dateKey), 'EEEE', { locale })}
                                                    </span>
                                                </div>
                                                <span className="text-xs px-2 py-1 bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/20">
                                                    {patients.length}
                                                </span>
                                            </div>
                                            <div className="divide-y divide-slate-800/50">
                                                {patients.map((patient) => (
                                                    <div key={patient.id} className="flex items-center gap-4 p-4">
                                                        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-violet-500/10 text-violet-400 font-bold rounded-lg text-sm border border-violet-500/20">
                                                            {patient.index}
                                                        </span>
                                                        <div className="flex-grow font-medium text-slate-300">
                                                            {formatName(patient.patientName || patient.title)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Booking Modal */}
            {
                selectedSlot && (
                    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}>
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_50%_120%,white_0%,transparent_50%)]"></div>
                                <h3 className="text-2xl font-bold mb-1 relative z-10">{t.createAppointment}</h3>
                                <p className="text-white/80 text-sm relative z-10">
                                    {format(new Date(selectedSlot.start), 'd MMMM yyyy EEEE', { locale })}
                                </p>
                                <button onClick={() => setSelectedSlot(null)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors p-1 hover:bg-white/20 rounded-full z-50">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-300 pl-1">{t.nameLabel}</label>
                                    <input
                                        type="text"
                                        value={patientName}
                                        onChange={(e) => setPatientName(e.target.value)}
                                        className="w-full p-4 border border-slate-700 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all text-slate-200 placeholder-slate-600 bg-slate-950 focus:bg-slate-900 font-medium shadow-sm hover:border-slate-600"
                                        placeholder={t.placeholderName}
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-300 pl-1">{t.timeLabel}</label>
                                    <div className="grid grid-cols-4 gap-2 max-h-[140px] overflow-y-auto p-1 custom-scrollbar">
                                        {generateTimeSlots(selectedSlot.start, selectedSlot.end).map((time) => (
                                            <button
                                                key={time}
                                                onClick={() => setSelectedTime(time)}
                                                className={clsx(
                                                    "py-2 px-1 text-sm rounded-lg font-medium transition-all text-center border",
                                                    selectedTime === time
                                                        ? "bg-violet-600 text-white border-violet-600 shadow-md transform scale-105"
                                                        : "bg-slate-800 text-slate-300 border-slate-700 hover:border-violet-500/50 hover:bg-slate-700/80"
                                                )}
                                            >
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={() => handleBooking('Exam')}
                                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/30 transition-all group font-semibold"
                                    >
                                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">🩺</span>
                                        {t.examBtn}
                                    </button>
                                    <button
                                        onClick={() => handleBooking('Surgery')}
                                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/30 transition-all group font-semibold"
                                    >
                                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">🔪</span>
                                        {t.surgeryBtn}
                                    </button>
                                    <button
                                        onClick={() => handleBooking('Control')}
                                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-texts bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all group font-semibold"
                                    >
                                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">✅</span>
                                        {t.controlBtn}
                                    </button>
                                    <button
                                        onClick={() => handleBooking('Online')}
                                        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all group font-semibold text-center leading-tight"
                                    >
                                        <span className="text-xl mb-1 group-hover:scale-110 transition-transform">💻</span>
                                        <span className="text-xs">{t.onlineBtn}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

function EventCard({ event, t }: { event: Event, t: any }) {
    const startTime = format(new Date(event.start), 'HH:mm');
    const endTime = format(new Date(event.end), 'HH:mm');

    const styles = {
        Surgery: 'bg-violet-600/20 border-l-4 border-violet-500 text-violet-100 min-h-[7rem] flex flex-col justify-center',
        Control: 'bg-blue-600/10 border-l-4 border-blue-500 text-blue-100',
        Online: 'bg-indigo-600/10 border-l-4 border-indigo-500 text-indigo-100',
        Busy: 'bg-slate-800 border-l-4 border-slate-600 text-slate-400',
        Available: 'bg-emerald-900/20 border border-emerald-800 text-emerald-400 border-dashed opacity-80 hover:opacity-100 hover:bg-emerald-900/40 hover:border-emerald-600 hover:shadow-sm cursor-pointer',
        Cancelled: 'hidden',
        Anesthesia: 'bg-fuchsia-600/10 border-l-4 border-fuchsia-500 text-fuchsia-100',
        Exam: 'bg-teal-600/10 border-l-4 border-teal-500 text-teal-100'
    };

    // Translate Generic Titles
    let displayTitle = event.title;
    if (t.eventTypes && t.eventTypes[event.type]) {
        // logic: if title equals any of the known generic Turkish terms, replace it.
        const genericTerms = ['Ameliyat', 'Kontrol', 'Muayene', 'Online', 'Meşgul', 'Müsait', 'İptal', 'Anestezi'];
        if (genericTerms.some(term => event.title.includes(term)) || event.title === event.type) {
            displayTitle = t.eventTypes[event.type] || event.title;
        }
    }

    // Prepend count if grouped
    if (event.count && event.count > 1) {
        displayTitle = `${event.count} ${displayTitle}`;
    }

    return (
        <div className={clsx(
            "p-3 rounded-md shadow-sm transition-all hover:shadow-md text-sm",
            styles[event.type]
        )}>
            {/* New Layout: [Time] [Title] */}
            {event.type === 'Available' ? (
                // Available slots keep their own centering layout
                <div className="flex justify-between items-center">
                    <span className="font-bold opacity-90 text-slate-200">
                        {startTime} - {endTime}
                    </span>
                    <span className="text-xs uppercase font-bold tracking-wider text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-800">{t.available}</span>
                </div>
            ) : (
                <div className="flex flex-col items-start gap-1">
                    <span className="font-bold opacity-90 whitespace-nowrap">
                        {startTime} - {endTime}
                    </span>

                    <span className="font-medium leading-tight text-left">
                        {displayTitle}
                    </span>
                </div>
            )}
        </div>
    );
}
