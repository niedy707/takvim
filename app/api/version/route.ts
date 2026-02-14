
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'lib/classification.ts'); // Note: takvim structure is slightly different (lib is at root or src/lib?)
        // Let's check where lib is. Based on previous ls, it's at root 'lib'.
        const stats = fs.statSync(filePath);

        return NextResponse.json({
            project: 'takvim',
            lastModified: stats.mtime.toISOString(),
            lastModifiedLocale: stats.mtime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
        });
    } catch (error) {
        return NextResponse.json({
            project: 'takvim',
            error: 'File not found or error reading stats'
        }, { status: 500 });
    }
}
