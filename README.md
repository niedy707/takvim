# Takvim Panel (Op. Dr. İbrahim Yağcı)

Secure, privacy-focused interactive calendar panel for patient appointments.

## Features

- **Privacy First**: Dates and times are visible, but patient details are stripped server-side.
- **Interactive Booking**: Users can click "Available" slots to request appointments via WhatsApp.
- **Smart Logic**: 
  - Restricts Sunday availability to 08:00-09:30.
  - Merges small gaps between control/exam appointments.
- **Tech Stack**: Next.js 14, Tailwind CSS, Google Calendar API.

## Setup

1. Clone repository.
2. Install dependencies: `npm install`.
3. Configure `lib/calendarConfig.ts` with Google Service Account credentials.
4. Run locally: `npm run dev`.

## Data Source
Events are fetched in real-time from the designated Google Calendar, processed for privacy, and displayed in a rolling 7-day view.
