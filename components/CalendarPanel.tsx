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
            <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">
                    Op.Dr. İbrahim YAĞCI randevu ekranı
                    <span className="text-sm font-normal text-gray-500 ml-2 block md:inline">
                        {format(currentTime, 'd MMMM yyyy HH:mm', { locale: tr })}
                    </span>
                </h1>
            </header>

            {/* Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {daysToShow().map((day) => {
                    const dayEvents = getEventsForDay(day);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div key={day.toISOString()} className={clsx("flex flex-col gap-2 min-h-[300px] border p-3 rounded-xl bg-white", isToday ? "border-blue-200 shadow-sm ring-1 ring-blue-100" : "border-gray-100")}>
                            <h2 className={clsx("text-lg font-semibold mb-2 sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10 border-b", isToday ? "text-blue-700" : "text-gray-700")}>
                                {format(day, 'EEEE', { locale: tr })}
                                <span className="text-sm font-normal text-gray-400 block">
                                    {format(day, 'd MMM')}
                                </span>
                            </h2>

                            {dayEvents.length === 0 ? (
                                <p className="text-gray-400 text-sm italic py-4 text-center">Etkinlik yok</p>
                            ) : (
                                <div className="space-y-2">
                                    {dayEvents.map(event => (
                                        <div key={event.id} onClick={() => handleSlotClick(event)} className={clsx("transition-transform", event.type === 'Available' && "cursor-pointer active:scale-95")}>
                                            <EventCard event={event} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

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
        Surgery: 'bg-violet-50 border-l-4 border-violet-500 text-violet-900',
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
            <div className="flex justify-between items-center mb-1">
                <span className="font-bold opacity-90">
                    {startTime} - {endTime}
                </span>
                {event.type === 'Available' && (
                    <span className="text-xs uppercase font-bold tracking-wider text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Seç</span>
                )}
            </div>

            {(event.type !== 'Available' || event.title !== 'Müsait') && (
                <div className="font-medium leading-tight mt-1">
                    {event.title}
                </div>
            )}
        </div>
    );
}
