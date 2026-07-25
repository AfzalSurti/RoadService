# RoadService Mobile (Expo)

Surveyor + Contractor app. Talks to the FastAPI backend only.

## Setup

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your machine IP when testing on a device
npm install
npx expo start
```

## Flows

- **Surveyor:** create issue → camera-only photo + GPS → submit (status Open)
- **Contractor:** start work → complete with camera + GPS
- **Surveyor:** approve/reject verification with fresh camera + GPS

Gallery upload is intentionally not offered — `CameraCapture` uses `expo-camera` only.
