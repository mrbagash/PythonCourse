# JavaScript Module Map

`index.html` owns the page markup and loads these browser scripts in order. These are classic scripts, not ES modules, so existing global functions still work.

- `python-module.js` - Skulpt runner and reusable Python editor (`window.PyLearn`).
- `binary-module.js` - Binary/hex table widgets and practice helpers (`window.BinaryLesson`).
- `app-core.js` - Shared app state, lesson loading, progress, navigation, and generic MCQ helpers.
- `auth-module.js` - Login, logout, admin/teacher/student identity, and auth UI state.
- `admin-module.js` - Admin panel, class dashboards, reports, imports, exports, teacher permissions, and quiz/AP result views.
- `quiz-state.js` - Shared quiz/AP state, lobby-code generation, AP question/spec builders.
- `assessment-module.js` - Assessment Point setup, host controls, student AP entry flow, autosave, and question-paper rendering.
- `assessment-scratch-module.js` - Scratch AP validation, AP project inspection helpers, and Scratch criteria checks.
- `assessment-results-module.js` - AP results views, released feedback, individual practice, manual score editing, and AP layout controls.
- `quiz-host-module.js` - Quiz setup, hosted quiz flow, timers, answer reveal, scoring, leaderboard, and permanent quiz history.
- `quiz-student-module.js` - Student quiz join flow, student question UI, and leaderboard/reveal screens.
- `scratch-pybot-module.js` - Scratch quiz iframe handling, PyBot quiz iframe handling, Scratch runtime tests, and Scratch block validation helpers.
- `quiz-answer-module.js` - Student answer locking, answer submission, code validation, and quiz exit/rejoin handlers.

When adding new functionality, prefer the narrowest matching file. If a feature touches multiple areas, keep shared state/helpers in the earliest file that both areas can see, then keep UI-specific behaviour in the relevant host/student/admin module.
