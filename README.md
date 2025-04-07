# Echo Desktop

Analytics debugging tool for Android and iOS applications.

## Features (Planned)

- Android debugging using ADB
- iOS debugging using proxy settings
- RTMP server for streaming data
- Supabase integration for auth and storage
- Capture and analyze mobile app analytics

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository
```
git clone https://github.com/enlighten/Echo-Desktop.git
cd Echo-Desktop
```

2. Install dependencies
```
npm install
```

3. Create a `.env.local` file based on the `.env.local.example` file and add your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Development

To run the app in development mode:

```
npm run dev
```

In a separate terminal, start Electron:

```
npm run dev:electron
```

### Build

To build the app for production:

```
npm run build
npm run build:electron
```

## Technology Stack

- Electron
- Next.js
- React
- Supabase (authentication and data storage)

## Design System

Echo Desktop follows the Enlighten brand guidelines, featuring:
- Travelia font for headers and buttons
- Azeret Mono for body text
- Doto Semi-Bold for subject lines and footers
- BN Hightide for display applications 