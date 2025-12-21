import CalendarPanel from '@/components/CalendarPanel';
import fs from 'fs';
import path from 'path';

export default function Home() {
    let lastUpdate = '';
    try {
        const stats = fs.statSync(__filename);
        lastUpdate = stats.mtime.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        lastUpdate = new Date().toLocaleString('tr-TR');
    }

    return (
        <main className="min-h-screen bg-white">
            <CalendarPanel lastUpdate={lastUpdate} />
        </main>
    );
}
