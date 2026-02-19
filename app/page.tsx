import CalendarPanel from '@/components/CalendarPanel';
import fs from 'fs';
import path from 'path';

export default function Home() {
    let lastUpdate = '';
    try {
        const stats = fs.statSync(__filename);
        const day = stats.mtime.getDate().toString().padStart(2, '0');
        const month = (stats.mtime.getMonth() + 1).toString().padStart(2, '0');
        const year = stats.mtime.getFullYear().toString().slice(-2);
        const hour = stats.mtime.getHours().toString().padStart(2, '0');
        const minute = stats.mtime.getMinutes().toString().padStart(2, '0');

        lastUpdate = `${day}${month}${year}-${hour}${minute}`;
    } catch (e) {
        lastUpdate = 'UNKNOWN';
    }

    return (
        <main className="min-h-screen bg-slate-800">
            <CalendarPanel lastUpdate={lastUpdate} />
        </main>
    );
}
