"use client";

import { useEffect, useState } from 'react';
import { format, isSameDay, addDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, addMinutes, isBefore, subMinutes } from 'date-fns';
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
        title: 'Op.Dr. İbrahim YAĞCI randevu ekranı',
        plannedPatientsBtn: ['Planlı', 'hastalar'],
        weeklyProgramBtn: ['Haftalık', 'program'],
        surgeriesToday: 'Bugün için planlanan ameliyat sayısı:',
        noEvents: 'Etkinlik yok',
        plannedPatientsTitle: 'Planlı Hastalar',
        noPlannedSurgeries: 'Planlanmış ameliyat bulunmamaktadır.',
        patientCount: 'Hasta',
        totalPlanned: 'Toplam',
        totalPlannedSuffix: 'planlı hasta listelenmektedir.',
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
        title: 'Op.Dr. İbrahim YAĞCI Appointment Screen',
        plannedPatientsBtn: ['Planned', 'Patients'],
        weeklyProgramBtn: ['Weekly', 'Program'],
        surgeriesToday: 'Surgeries planned for today:',
        noEvents: 'No events',
        plannedPatientsTitle: 'Planned Patients',
        noPlannedSurgeries: 'No planned surgeries found.',
        patientCount: 'Patient',
        totalPlanned: 'Total',
        totalPlannedSuffix: 'planned patients listed.',
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
    const [showWeeklyModal, setShowWeeklyModal] = useState(false);
    const [showPlannedModal, setShowPlannedModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState<Event | null>(null);
    const [patientName, setPatientName] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [lang, setLang] = useState<'tr' | 'en'>('tr');

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

    const getWeeklyStats = () => {
        const today = new Date();
        const days = eachDayOfInterval({
            start: today,
            end: addDays(today, 13)
        });

        return days.map(day => {
            const dayEvents = events.filter(e => isSameDay(new Date(e.start), day));
            const surgeryCount = dayEvents.filter(e => e.type === 'Surgery').length;
            return { date: day, count: surgeryCount };
        });
    };

    const daysToShow = () => {
        const today = new Date();
        return eachDayOfInterval({
            start: today,
            end: addDays(today, 29)
        });
    };

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

        const url = `https://wa.me/905511999963?text=${encodeURIComponent(message)}`;

        window.open(url, '_blank');
        setSelectedSlot(null);
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

    const getPlannedPatients = () => {
        const todayStart = startOfDay(new Date());
        const plannedEvents = events
            .filter(e => e.type === 'Surgery' && new Date(e.start) >= todayStart)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        return plannedEvents.map((e, index) => ({
            ...e,
            index: `P${index + 1}`
        })) as (Event & { index: string })[];
    };

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

    // Modal Components
    const WeeklyModal = () => (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowWeeklyModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white flex justify-between items-center">
                    <h3 className="text-lg font-bold">{t.weeklyProgramTitle}</h3>
                    <button onClick={() => setShowWeeklyModal(false)} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-2">
                    <div className="space-y-2">
                        {getWeeklyStats().map((stat, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all">
                                <span className={clsx("font-medium", isSameDay(stat.date, new Date()) ? "text-blue-600 font-bold" : "text-gray-700")}>
                                    {format(stat.date, 'd MMMM EEEE', { locale })}
                                </span>
                                <span className={clsx("px-3 py-1 rounded-full text-sm font-bold shadow-sm", stat.count > 0 ? "bg-orange-100 text-orange-600" : "bg-green-100 text-green-600")}>
                                    {stat.count > 0 ? `${stat.count} ${t.surgery}` : t.empty}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-gray-50 p-3 text-center border-t border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">
                        {t.totalPlanned} {getWeeklyStats().reduce((a, b) => a + b.count, 0)} {t.totalPlannedSurgery}
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 font-sans">
            {/* Header */}
            <header className="flex flex-row justify-between items-start mb-8 gap-4 sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-sm p-4 -mx-4 rounded-b-xl transition-all">
                <div className="flex flex-col flex-1 min-w-0 mr-2">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-800 break-words leading-tight">
                        {t.title}
                        <span className="text-xs md:text-sm font-normal text-gray-500 block mt-1">
                            {format(currentTime, 'd MMMM yyyy HH:mm', { locale })}
                        </span>
                    </h1>
                </div>

                <div className="flex flex-col gap-2 items-end">
                    {/* Top Row: Language & Actions */}
                    <div className="flex gap-2 h-[44px]">
                        {/* Language Switcher */}
                        <div className="flex flex-col gap-1 mr-2 justify-center">
                            <button
                                onClick={() => setLang('tr')}
                                className={clsx("text-xl transition-transform hover:scale-110 grayscale-0 leading-none", lang !== 'tr' && "opacity-40 grayscale")}
                                title="Türkçe"
                            >
                                🇹🇷
                            </button>
                            <button
                                onClick={() => setLang('en')}
                                className={clsx("text-xl transition-transform hover:scale-110 grayscale-0 leading-none", lang !== 'en' && "opacity-40 grayscale")}
                                title="English"
                            >
                                🇬🇧
                            </button>
                        </div>

                        <button
                            onClick={() => setShowPlannedModal(true)}
                            className="flex-shrink-0 px-3 py-1 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors shadow-sm flex flex-col items-center justify-center leading-tight min-w-[70px]"
                        >
                            <span>{t.plannedPatientsBtn[0]}</span>
                            <span>{t.plannedPatientsBtn[1]}</span>
                        </button>

                        <button
                            onClick={() => setShowWeeklyModal(true)}
                            className="flex-shrink-0 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex flex-col items-center justify-center leading-tight min-w-[70px]"
                        >
                            <span>{t.weeklyProgramBtn[0]}</span>
                            <span>{t.weeklyProgramBtn[1]}</span>
                        </button>
                    </div>

                    {/* Bottom Row: Whatsapp Contacts */}
                    <div className="flex gap-2 w-full">
                        <a
                            href="https://wa.me/905555511578"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition-colors shadow-sm flex items-center justify-center gap-1.5 leading-tight"
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                            <span>Hekim</span>
                        </a>
                        <a
                            href="https://wa.me/905511999963"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1.5 leading-tight"
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                            <span>Asistan</span>
                        </a>
                    </div>
                </div>
            </header>

            {/* List */}
            <div className="flex flex-col gap-6">
                {daysToShow().map((day) => {
                    const dayEvents = getEventsForDay(day);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div key={day.toISOString()} className={clsx(
                            "flex flex-col min-h-[300px] border-2 rounded-xl bg-white transition-all",
                            isToday ? "border-blue-400 shadow-md ring-2 ring-blue-100" : "border-orange-200"
                        )}>
                            {/* Header with Background */}
                            <h2 className={clsx(
                                "text-lg font-bold sticky top-[84px] z-40 py-3 px-4 border-b-2 flex flex-col justify-center items-start backdrop-blur-md transition-all gap-1",
                                isToday
                                    ? "bg-blue-100/90 text-blue-800 border-blue-200"
                                    : "bg-orange-100/95 text-orange-900 border-orange-200"
                            )}>
                                <div className="flex justify-between items-center w-full">
                                    <span className="leading-none">{format(day, 'EEEE', { locale })}</span>
                                    <span className={clsx("text-sm font-medium leading-none", isToday ? "text-blue-600" : "text-orange-600/70")}>
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
                                            <span className="text-xs font-normal italic text-gray-600 mt-1">
                                                ({summaries.join(', ')})
                                            </span>
                                        );
                                    }
                                })()}
                            </h2>

                            {/* Content Area */}
                            <div className="p-3 flex flex-col gap-2 flex-grow bg-white/50">
                                {dayEvents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm italic py-4">
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
                })}
            </div>

            {/* Modals */}
            {showWeeklyModal && <WeeklyModal />}

            {/* Planned Patients Modal */}
            {showPlannedModal && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-2 md:p-4 backdrop-blur-sm" onClick={() => setShowPlannedModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl transform transition-all" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 md:p-6 border-b border-gray-100">
                            <h3 className="text-lg md:text-2xl font-bold text-gray-900">{t.plannedPatientsTitle}</h3>
                            <button onClick={() => setShowPlannedModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors">
                                <span className="sr-only">{t.close}</span>
                                <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-y-auto p-4 md:p-6">
                            {getPlannedPatients().length === 0 ? (
                                <div className="text-center text-gray-500 py-8">
                                    {t.noPlannedSurgeries}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Group by Date */}
                                    {Object.entries(getPlannedPatients().reduce((acc, patient) => {
                                        const dateKey = format(new Date(patient.start), 'yyyy-MM-dd');
                                        if (!acc[dateKey]) acc[dateKey] = [];
                                        acc[dateKey].push(patient);
                                        return acc;
                                    }, {} as Record<string, ReturnType<typeof getPlannedPatients>>)).map(([dateKey, patients]) => (
                                        <div key={dateKey} className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/30">
                                            {/* Date Header */}
                                            <div className="bg-violet-50/50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-800">
                                                        {format(new Date(dateKey), 'd MMMM yyyy', { locale })}
                                                    </span>
                                                    <span className="text-gray-400 font-normal">
                                                        {format(new Date(dateKey), 'EEEE', { locale })}
                                                    </span>
                                                </div>
                                                <span className="text-xs font-medium px-2 py-1 bg-violet-100 text-violet-700 rounded-full">
                                                    {patients.length} {t.patientCount}
                                                </span>
                                            </div>

                                            {/* Patients List */}
                                            <div className="divide-y divide-gray-100">
                                                {patients.map((patient) => (
                                                    <div key={patient.id} className="flex items-center gap-4 p-4 hover:bg-white transition-colors">
                                                        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-violet-100 text-violet-700 font-bold rounded-lg text-sm">
                                                            {patient.index}
                                                        </span>

                                                        {/* Privacy First: Formatted Name Only */}
                                                        <div className="flex-grow min-w-0 font-medium text-gray-900">
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

                        <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                            <p className="text-xs text-center text-gray-400">
                                {t.totalPlanned} {getPlannedPatients().length} {t.totalPlannedSuffix}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Booking Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}>
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all scale-100" onClick={e => e.stopPropagation()}>
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

                        <div className="p-6 md:p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700 pl-1">{t.nameLabel}</label>
                                <input
                                    type="text"
                                    value={patientName}
                                    onChange={(e) => setPatientName(e.target.value)}
                                    className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all text-gray-800 placeholder-gray-400 bg-gray-50 focus:bg-white font-medium shadow-sm hover:border-gray-300"
                                    placeholder={t.placeholderName}
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700 pl-1">{t.timeLabel}</label>
                                <div className="grid grid-cols-4 gap-2 max-h-[140px] overflow-y-auto p-1 custom-scrollbar">
                                    {generateTimeSlots(selectedSlot.start, selectedSlot.end).map((time) => (
                                        <button
                                            key={time}
                                            onClick={() => setSelectedTime(time)}
                                            className={clsx(
                                                "py-2 px-1 text-sm rounded-lg font-medium transition-all text-center border",
                                                selectedTime === time
                                                    ? "bg-violet-600 text-white border-violet-600 shadow-md transform scale-105"
                                                    : "bg-white text-gray-600 border-gray-100 hover:border-violet-200 hover:bg-violet-50"
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
                                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-200 transition-all group font-semibold"
                                >
                                    <span className="text-xl mb-1 group-hover:scale-110 transition-transform">🩺</span>
                                    {t.examBtn}
                                </button>
                                <button
                                    onClick={() => handleBooking('Surgery')}
                                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-200 transition-all group font-semibold"
                                >
                                    <span className="text-xl mb-1 group-hover:scale-110 transition-transform">🔪</span>
                                    {t.surgeryBtn}
                                </button>
                                <button
                                    onClick={() => handleBooking('Control')}
                                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200 transition-all group font-semibold"
                                >
                                    <span className="text-xl mb-1 group-hover:scale-110 transition-transform">✅</span>
                                    {t.controlBtn}
                                </button>
                                <button
                                    onClick={() => handleBooking('Online')}
                                    className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-transparent bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 transition-all group font-semibold text-center leading-tight"
                                >
                                    <span className="text-xl mb-1 group-hover:scale-110 transition-transform">💻</span>
                                    <span className="text-xs">{t.onlineBtn}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EventCard({ event, t }: { event: Event, t: any }) {
    const startTime = format(new Date(event.start), 'HH:mm');
    const endTime = format(new Date(event.end), 'HH:mm');

    const styles = {
        Surgery: 'bg-violet-200/80 border-l-4 border-violet-600 text-violet-950 min-h-[7rem] flex flex-col justify-center',
        Control: 'bg-blue-50 border-l-4 border-blue-500 text-blue-900',
        Online: 'bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900',
        Busy: 'bg-gray-50 border-l-4 border-gray-400 text-gray-700',
        Available: 'bg-green-50 border border-green-200 text-green-700 border-dashed opacity-80 hover:opacity-100 hover:bg-green-100/80 hover:border-green-300 hover:shadow-sm cursor-pointer',
        Cancelled: 'hidden',
        Anesthesia: 'bg-fuchsia-100 border-l-4 border-fuchsia-600 text-fuchsia-950',
        Exam: 'bg-teal-100 border-l-4 border-teal-600 text-teal-950'
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
                    <span className="font-bold opacity-90">
                        {startTime} - {endTime}
                    </span>
                    <span className="text-xs uppercase font-bold tracking-wider text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{t.available}</span>
                </div>
            ) : (
                <div className="flex flex-row xl:flex-col items-center xl:items-start gap-4 xl:gap-1">
                    <span className="font-bold opacity-90 whitespace-nowrap min-w-[5.5rem] xl:min-w-0">
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
