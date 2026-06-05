# PyLearn — Setup Guide

## File Structure

```
index.html               ← Main app (serve this)
lessons/
  index.json             ← Lesson/course list
  python-print.json      ← Example lesson
firebase-rules.json      ← Paste into Firebase Realtime Database Rules tab
```

## 1. Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (start in test mode, then apply rules below)
3. Enable **Anonymous Authentication** under Authentication → Sign-in method
4. Copy your Firebase config from Project Settings → Your apps → SDK setup
5. Paste it into `lessons/index.json` under the `"firebase"` key

## 2. Firebase Rules

Paste the contents of `firebase-rules.json` into:
Firebase Console → Realtime Database → Rules tab

**Important:** The rules allow anonymous users to read/write their own progress only.
For admin access to all progress data, either:
- Use the Firebase Console directly
- Or add your admin UID to the rules (see comment in firebase-rules.json)

## 3. Admin Access

Client-side admin-code login has been removed. Do not put admin credentials in a public GitHub Pages app.

Use Firebase Auth users with server-issued custom claims such as `admin: true` or `teacher: true`, then apply `firebase-rules.json` in the Realtime Database Rules tab.

The admin can:
- Generate new student login codes
- View all codes and their progress/time data

## 4. Generating Student Codes

Log in with an authorised admin/teacher account → click **Admin** → **Generate New Code**.
Codes are saved to Firebase. Share each code with the student.

## 5. Adding Lessons

1. Create a new JSON file in `lessons/` following the structure of `python-print.json`
2. Add an entry to the `lessons` array in `lessons/index.json`

### Lesson JSON Structure

```json
{
  "id": "unique-lesson-id",
  "title": "Lesson Title",
  "description": "Short description",
  "steps": [
    {
      "id": "step-id",
      "title": "Step Title",
      "autoComplete": true,        // false = student must complete manually (e.g. quiz)
      "content": "<p>HTML content</p>",
      "css": "/* optional CSS */",
      "js": "/* optional JS */"
    }
  ]
}
```

### Step JS API

Inside step JS, you can call:
- `window.__markStepComplete()` — marks the step as complete and saves time (use when autoComplete is false)

## 6. Serving the App

This app must be served over HTTP (not opened as a file://), because it fetches JSON files.

**Quick local server:**
```bash
python3 -m http.server 8080
# Then open http://localhost:8080
```

Or deploy to any static host (Netlify, GitHub Pages, Vercel, etc).

## Status Colours

| Colour | Meaning |
|--------|---------|
| Grey   | Not started |
| Yellow | Started but not complete |
| Green  | Complete |

## Student Login Flow

Students enter their first and last name (stored in localStorage only — never sent to Firebase)
and their login code. Progress is stored against the code, not their name.
