# Confluxe Dashboard

A production-style React application scaffolded with Vite and organized into feature modules.

## Scripts

- `npm run dev` - start local development server
- `npm run build` - create production build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint

## Structure

- `src/app` - app shell and high-level composition
- `src/features` - feature-specific views
- `src/lib` - API client utilities
- `src/styles` - global styling and Tailwind directives

## Setup

1. Install dependencies:
   - `npm install`
2. Configure backend API (optional if using default localhost):
   - `cp .env.example .env.local`
3. Start the app:
   - `npm run dev`
