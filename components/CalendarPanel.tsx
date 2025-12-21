"use client";

import { useEffect, useState } from 'react';
import { format, isSameDay, addDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, addMinutes, isBefore } from 'date-fns';
import { tr } from 'date-fns/locale';
import clsx from 'clsx';

interface Event {
    id: string;
    title: string;
    start: string;
    end: string;
    type: 'Surgery' | 'Control' | 'Online' | 'Busy' | 'Available' | 'Cancelled';
    count?: number;
}

export default function CalendarPanel() {
    const [events, setEvents] = useState<Event[]>([]);
    const [showWeeklyModal, setShowWeeklyModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState<Event | null>(null);
    const [patientName, setPatientName] = useState('');
    const [selectedTime, setSelectedTime] = useState('');

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
            end: addDays(today, 6)
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
            alert('Lütfen geçerli bir isim giriniz (en az 3 karakter).');
            return;
        }

        const dateStr = format(new Date(selectedSlot.start), 'dd.MM.yyyy', { locale: tr });

        // Updated Message Format: Name on new line
        const message = `İbrahim Yağcı takvimi için ${dateStr} saat ${selectedTime} itibariyle bir ${type} randevusu talep ediyorum.\n\nHasta ismi: ${patientName}`;
        const url = `https://wa.me/905511999963?text=${encodeURIComponent(message)}`;

        window.open(url, '_blank');
        setSelectedSlot(null);
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 font-sans">
            {/* Header */}
            <header className="flex flex-row justify-between items-start mb-8 gap-4 sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-sm p-4 -mx-4 rounded-b-xl transition-all">
                <div className="flex flex-col flex-1 min-w-0 mr-2">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-800 break-words leading-tight">
                        Op.Dr. İbrahim YAĞCI randevu ekranı
                        <span className="text-xs md:text-sm font-normal text-gray-500 block mt-1">
                            {format(currentTime, 'd MMMM yyyy HH:mm', { locale: tr })}
                        </span>
                    </h1>
                </div>

                <button
                    onClick={() => setShowWeeklyModal(true)}
                    className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex flex-col items-center justify-center leading-tight h-full min-h-[44px]"
                >
                    <span>Haftalık</span>
                    <span>program</span>
                </button>
            </header>

            {/* Grid */}
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
                                    <span className="leading-none">{format(day, 'EEEE', { locale: tr })}</span>
                                    <span className={clsx("text-sm font-medium leading-none", isToday ? "text-blue-600" : "text-orange-600/70")}>
                                        {format(day, 'd MMM', { locale: tr })}
                                    </span>
                                </div>
                                {dayEvents.filter(e => e.type === 'Surgery').length > 0 && (
                                    <span className="text-xs font-normal italic text-gray-600 mt-1">
                                        (Bugün için planlanan ameliyat sayısı: {dayEvents.filter(e => e.type === 'Surgery').length})
                                    </span>
                                )}
                            </h2>

                            {/* Content Area */}
                            <div className="p-3 flex flex-col gap-2 flex-grow bg-white/50">
                                {dayEvents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm italic py-4">
                                        <span className="text-2xl mb-2 opacity-20">📅</span>
                                        Etkinlik yok
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {dayEvents.map(event => (
                                            <div key={event.id} onClick={() => handleSlotClick(event)} className={clsx("transition-transform", event.type === 'Available' && "cursor-pointer active:scale-95")}>
                                                <EventCard event={event} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Weekly Program Modal */}
            {showWeeklyModal && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-2 md:p-4 backdrop-blur-sm" onClick={() => setShowWeeklyModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-5xl p-4 shadow-2xl transform transition-all" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg md:text-2xl font-bold text-gray-900">Haftalık Cerrahi Programı</h3>
                            <button onClick={() => setShowWeeklyModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors">
                                <span className="sr-only">Kapat</span>
                                <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 md:gap-3 w-full">
                            {getWeeklyStats().map((stat) => (
                                <div key={stat.date.toISOString()} className={clsx(
                                    "border rounded-lg md:rounded-xl p-1 md:p-3 flex flex-col items-center justify-between min-h-[60px] md:min-h-[100px] transition-colors",
                                    isSameDay(stat.date, new Date()) ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
                                )}>
                                    <span className="text-[10px] md:text-sm font-bold text-gray-600 mb-1 md:mb-2 text-center leading-tight">
                                        {format(stat.date, 'd EEE', { locale: tr })}
                                    </span>

                                    <span className={clsx(
                                        "text-xl md:text-3xl font-bold",
                                        stat.count > 0 ? "text-blue-600" : "text-gray-300"
                                    )}>
                                        {stat.count}
                                    </span>

                                    <span className="hidden md:block text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">
                                        Ameliyat
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Booking Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSlot(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl transform transition-all" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-900">Randevu Talep Et</h3>
                            <button onClick={() => setSelectedSlot(null)} className="text-gray-400 hover:text-gray-600">
                                <span className="sr-only">Kapat</span>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-6 bg-blue-50 p-4 rounded-xl text-center">
                            <p className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-wide">Seçilen Tarih</p>
                            <p className="text-2xl font-bold text-blue-900 mb-4">
                                {format(new Date(selectedSlot.start), 'd MMMM yyyy', { locale: tr })}
                            </p>

                            {/* Time Selection */}
                            <div className="mb-2">
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide">Randevu Saati</label>
                                <div className="relative">
                                    <select
                                        value={selectedTime}
                                        onChange={(e) => setSelectedTime(e.target.value)}
                                        className="w-full text-center text-xl font-bold text-blue-900 bg-white border-2 border-blue-100 rounded-lg py-2 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none appearance-none cursor-pointer hover:border-blue-300 transition-colors"
                                    >
                                        {generateTimeSlots(selectedSlot.start, selectedSlot.end).map(time => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-blue-500">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Hasta İsmi:</label>
                            <input
                                type="text"
                                value={patientName}
                                onChange={(e) => setPatientName(e.target.value)}
                                placeholder="Ad Soyad giriniz..."
                                className={clsx(
                                    "w-full px-4 py-3 border rounded-lg outline-none transition-all text-gray-800",
                                    patientName.length > 0 && patientName.length < 3 ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200" : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                )}
                                autoFocus
                            />
                            {patientName.length < 3 && (
                                <p className="text-xs text-gray-400 mt-2 font-medium italic">
                                    * Bu bölüm doldurulmadan talepte bulunamazsınız
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: 'Muayene', icon: '🩺' },
                                { label: 'Online Görüşme (OPD)', icon: '📹' },
                                { label: 'Kontrol', icon: '📋' },
                                { label: 'Ameliyat', icon: '🏥' }
                            ].map((option) => {
                                const isDisabled = patientName.length < 3 || !selectedTime;
                                return (
                                    <button
                                        key={option.label}
                                        onClick={() => handleBooking(option.label)}
                                        disabled={isDisabled}
                                        className={clsx(
                                            "w-full flex items-center p-4 rounded-xl border transition-all font-semibold group",
                                            isDisabled
                                                ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-60"
                                                : "border-gray-200 hover:border-blue-500 hover:bg-blue-50 text-gray-700 hover:text-blue-700 shadow-sm hover:shadow-md"
                                        )}
                                    >
                                        <span className={clsx("text-2xl mr-4 transition-transform", !isDisabled && "group-hover:scale-110")}>{option.icon}</span>
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-xs text-center text-gray-400 mt-6">
                            WhatsApp üzerinden yönlendirileceksiniz.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

function EventCard({ event }: { event: Event }) {
    const startTime = format(new Date(event.start), 'HH:mm');
    const endTime = format(new Date(event.end), 'HH:mm');

    const styles = {
        Surgery: 'bg-violet-50 border-l-4 border-violet-500 text-violet-900 min-h-[7rem] flex flex-col justify-center',
        Control: 'bg-blue-50 border-l-4 border-blue-500 text-blue-900',
        Online: 'bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900',
        Busy: 'bg-gray-50 border-l-4 border-gray-400 text-gray-700',
        Available: 'bg-green-50 border border-green-200 text-green-700 border-dashed opacity-80 hover:opacity-100 hover:bg-green-100/80 hover:border-green-300 hover:shadow-sm cursor-pointer',
        Cancelled: 'hidden'
    };

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
                    <span className="text-xs uppercase font-bold tracking-wider text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Müsait</span>
                </div>
            ) : (
                <div className="flex flex-row items-center gap-4">
                    <span className="font-bold opacity-90 whitespace-nowrap min-w-[5.5rem]">
                        {startTime} - {endTime}
                    </span>

                    <span className="font-medium leading-tight text-left">
                        {event.title}
                    </span>
                </div>
            )}
        </div>
    );
}
