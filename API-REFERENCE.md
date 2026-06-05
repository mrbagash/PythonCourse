# PyLearn — Lesson Authoring API Reference

This document covers everything available to lesson authors: the JSON lesson format, the `window.PyLearn` JavaScript API, and the `window.__markStepComplete` hook.

---

## Table of Contents

1. [File Structure](#file-structure)
2. [lessons/index.json](#lessonsindexjson)
3. [Lesson JSON Format](#lesson-json-format)
4. [Step Fields](#step-fields)
5. [window.PyLearn](#windowpylearn)
   - [PyLearn.runPython()](#pythonrunpython)
   - [PyLearn.createEditor()](#pythoncreateditor)
   - [Editor Instance Methods](#editor-instance-methods)
   - [Validator Function](#validator-function)
6. [window.__markStepComplete](#window__markstepcomplete)
7. [Step CSS & JS Execution](#step-css--js-execution)
8. [Status Colours](#status-colours)
9. [Examples](#examples)

---

## File Structure

```
index.html
lessons/
  index.json              ← Master course/lesson list
  python-print.json       ← A lesson file (name is up to you)
  variables.json
  loops.json
  ...
firebase-rules.json
```

The app fetches `lessons/index.json` on load, then fetches each lesson file listed within it. All paths are relative to where `index.html` is served from.

---

## lessons/index.json

The master configuration file. **Must** be present at `lessons/index.json`.

```json
{
  "firebase": {
    "apiKey":            "YOUR_API_KEY",
    "authDomain":        "YOUR_PROJECT.firebaseapp.com",
    "databaseURL":       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    "projectId":         "YOUR_PROJECT_ID",
    "storageBucket":     "YOUR_PROJECT.appspot.com",
    "messagingSenderId": "YOUR_SENDER_ID",
    "appId":             "YOUR_APP_ID"
  },
  "lessons": [
    {
      "id":    "python-print",
      "title": "Print & Output",
      "file":  "lessons/python-print.json",
      "order": 1
    },
    {
      "id":    "variables",
      "title": "Variables",
      "file":  "lessons/variables.json",
      "order": 2
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `firebase` | object | Yes | Firebase project config — paste from Firebase Console |
| `lessons` | array | Yes | Ordered list of lessons to load |
| `lessons[].id` | string | Yes | Unique identifier — must match the `id` inside the lesson file |
| `lessons[].title` | string | Yes | Display name shown in the lesson tab bar |
| `lessons[].file` | string | Yes | Path to the lesson JSON file, relative to `index.html` |
| `lessons[].order` | number | No | Display order (lessons render in array order regardless) |

---

## Lesson JSON Format

Each lesson lives in its own JSON file. The filename can be anything — it is referenced from `index.json`.

```json
{
  "id":          "python-print",
  "title":       "Print & Output",
  "description": "Learn how to display text and data in Python.",
  "steps": [ ... ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Must match the `id` in `lessons/index.json` |
| `title` | string | Yes | Used as the lesson tab label |
| `description` | string | No | Short summary (not currently displayed in UI, useful for authoring) |
| `steps` | array | Yes | Ordered array of step objects |

---

## Step Fields

Each object in the `steps` array defines one step of the lesson.

```json
{
  "id":           "my-step",
  "title":        "Step Title",
  "autoComplete": true,
  "content":      "<p>HTML content rendered into the step area.</p>",
  "css":          "/* CSS injected into <head> while this step is active */",
  "js":           "/* JavaScript evaluated after content is rendered */"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | Yes | — | Unique identifier within this lesson. Used as the Firebase key for progress. |
| `title` | string | Yes | — | Shown in the step pill bar |
| `autoComplete` | boolean | No | `true` | If `true`, clicking **Next Step** automatically marks this step complete. Set to `false` for steps that require active validation (challenges, quizzes). |
| `content` | string | Yes | — | Raw HTML string rendered into the step content area. Tailwind classes work here. |
| `css` | string | No | `""` | CSS injected into a `<style>` tag in `<head>` when this step loads, and removed when navigating away. |
| `js` | string | No | `""` | JavaScript evaluated ~50 ms after content renders (allowing DOM to settle). Has access to `window.PyLearn` and `window.__markStepComplete`. |

> **`autoComplete: false`** — use this whenever a step requires the student to do something before proceeding. Call `window.__markStepComplete()` from your validation logic when they succeed.

---

## window.PyLearn

A global object available in all step JavaScript. Provides Skulpt-powered Python execution and a ready-made code editor component.

---

### PyLearn.runPython()

Run a Python code string directly and get back the output.

```js
const { output, error } = await PyLearn.runPython(code, inputFn);
```

**Parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `code` | string | Yes | The Python source code to execute |
| `inputFn` | async function | No | Called when Python code uses `input()`. Must return a `Promise<string>`. Defaults to returning an empty string. |

**Returns** `Promise<{ output: string, error: string|null }>`

| Property | Type | Description |
|---|---|---|
| `output` | string | Everything printed to stdout during execution |
| `error` | string \| null | Error message string if execution failed, otherwise `null` |

**Execution limits**

- Maximum run time: **5 seconds** (Skulpt `execLimit`). Code that loops forever is killed automatically.
- Skulpt supports most Python 3 built-ins and the standard library modules bundled with `skulpt-stdlib.js`. It does not support file I/O, networking, or C-extension modules.

**Example**

```js
const { output, error } = await PyLearn.runPython('print(2 ** 10)');
console.log(output); // "1024\n"
```

---

### PyLearn.createEditor()

Mount a full code editor widget inside a `<div>` in your step content. Handles running code, displaying output, and optionally validating results.

```js
const editor = PyLearn.createEditor(options);
```

**Options**

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `containerId` | string | Yes | — | The `id` of a `<div>` that already exists in the step content HTML |
| `initialCode` | string | No | `""` | Starter code pre-loaded into the editor |
| `label` | string | No | `"Python Editor"` | Label shown in the editor header bar |
| `readOnly` | boolean | No | `false` | Prevent the student from editing the code |
| `showOutput` | boolean | No | `true` | Show the output panel below the editor |
| `validate` | function | No | `null` | Called after each run — see [Validator Function](#validator-function) |
| `onPass` | async function | No | `null` | Called when `validate` returns `{ pass: true }`. Use this to call `__markStepComplete()`. |

**Minimal example — sandbox editor, no validation**

```js
// In step content HTML:
// <div id="editor-demo"></div>

PyLearn.createEditor({
  containerId: 'editor-demo',
  initialCode: 'print("Hello!")',
  label: 'Try it out',
});
```

**Full example — with validation and auto-completion**

```js
PyLearn.createEditor({
  containerId: 'editor-ch1',
  initialCode: '# Write your answer here\n',
  label: 'Challenge',
  validate: async function(output, error, code) {
    if (error) {
      return { pass: false, message: '❌ Error: ' + error };
    }
    if (output.trim() === 'Hello, Python!') {
      return { pass: true, message: '✅ Correct!' };
    }
    return { pass: false, message: '❌ Not quite — check your spelling.' };
  },
  onPass: async function() {
    await window.__markStepComplete();
  },
});
```

---

### Editor Instance Methods

`createEditor()` returns an object with three methods for programmatic control.

```js
const editor = PyLearn.createEditor({ containerId: 'my-editor', ... });

editor.getCode();       // → string: current code in the textarea
editor.setCode(str);    // sets the textarea content
editor.run();           // programmatically clicks the Run button
```

| Method | Returns | Description |
|---|---|---|
| `getCode()` | string | Current contents of the code textarea |
| `setCode(code)` | void | Replaces the textarea content with `code` |
| `run()` | void | Triggers a run as if the student clicked the Run button |

Returns `null` if `containerId` was not found in the DOM.

---

### Validator Function

The `validate` option is an `async` function called after every successful run.

```js
validate: async function(output, error, code) {
  // Return an object, or null to show nothing
  return { pass: boolean, message: string };
}
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `output` | string | The full stdout from the Python run (may include a trailing `\n`) |
| `error` | string \| null | Error string if the run failed, `null` if it succeeded |
| `code` | string | The source code as written in the editor at time of run |

**Return value**

| Property | Type | Description |
|---|---|---|
| `pass` | boolean | Whether the student's answer is correct |
| `message` | string | Feedback text shown below the editor |

Return `null` (or don't return) to suppress the feedback panel entirely.

**Feedback styling**

| `pass` | CSS class applied | Colour |
|---|---|---|
| `true` | `.pylearn-feedback.pass` | Green |
| `false` | `.pylearn-feedback.fail` | Amber |
| *(error shown)* | `.pylearn-feedback.err` | Red |

**Common validation patterns**

```js
// Exact output match
if (output.trim() === 'expected output') { ... }

// Output contains a value
if (output.includes('42')) { ... }

// Code inspection — check they used an f-string
if (!/f["']/.test(code)) {
  return { pass: false, message: 'Please use an f-string.' };
}

// Reject hardcoded answers
if (/102/.test(code) && !/\*/.test(code)) {
  return { pass: false, message: 'Use Python to calculate it, don\'t type the answer.' };
}

// Handle errors first
if (error) return { pass: false, message: '❌ Fix the error first: ' + error };
```

---

## window.__markStepComplete

An async function injected by the app each time a step loads. Call it from your step JS to mark the current step as complete in Firebase and update the progress UI.

```js
await window.__markStepComplete();
```

- Saves the current time-on-step to Firebase before marking complete
- Updates the step pill and lesson tab colours immediately
- Safe to call multiple times (Firebase write is idempotent)
- Has no effect if the user is not logged in (silently skips)

**Always use this inside `onPass`** for `autoComplete: false` steps:

```js
onPass: async function() {
  await window.__markStepComplete();
}
```

Or call it directly from quiz/custom logic:

```js
if (allCorrect) {
  await window.__markStepComplete();
}
```

---

## Step CSS & JS Execution

### CSS

The `css` string is injected into a `<style>` element appended to `<head>` when the step loads. It is removed when the student navigates to any other step. Use it to scope styles to elements you create in `content`.

```json
"css": "#my-widget { color: red; } .my-btn { padding: 0.5rem; }"
```

### JavaScript

The `js` string is evaluated with `eval()` approximately **50 ms** after `content` is injected into the DOM. This delay allows DOM elements (including those targeted by `containerId`) to be present before editor setup runs.

The step JS runs in the page's global scope and has access to:

| Global | Description |
|---|---|
| `window.PyLearn` | Python runner and editor factory |
| `window.__markStepComplete` | Mark this step complete |
| `document` | Full DOM access |
| All standard Web APIs | `fetch`, `setTimeout`, etc. |

> **Tip:** Wrap step JS in an IIFE `(function(){ ... })()` to avoid variable name clashes between steps.

---

## Status Colours

Progress is reflected in the lesson tab bar and the step pill bar using three colours.

| Colour | Condition |
|---|---|
| **Grey** (default) | Step/lesson not yet visited |
| **Yellow** | Step started (visited) but not marked complete |
| **Green** | Step marked complete |
| **Blue** | Currently active step or lesson |

These update in real time as the student progresses.

---

## Examples

### Minimal read-only demo step

```json
{
  "id": "demo",
  "title": "Live Demo",
  "autoComplete": true,
  "content": "<p class='mb-3'>Run this code to see a loop in action:</p><div id='editor-demo'></div>",
  "css": "",
  "js": "PyLearn.createEditor({ containerId: 'editor-demo', initialCode: 'for i in range(5):\n    print(i)', label: 'Loop demo', readOnly: true });"
}
```

### Challenge step with output + code inspection

```json
{
  "id": "challenge-loop",
  "title": "Challenge: Loop",
  "autoComplete": false,
  "content": "<h2>Print the numbers 1 to 5</h2><p>Use a <code>for</code> loop.</p><div id='editor-loop'></div>",
  "css": "",
  "js": "(function(){\n  PyLearn.createEditor({\n    containerId: 'editor-loop',\n    initialCode: '# Your code here\n',\n    label: 'Challenge',\n    validate: async function(output, error, code) {\n      if (error) return { pass: false, message: '❌ ' + error };\n      var lines = output.trim().split('\\n');\n      var correct = lines.length === 5 &&\n        lines.every(function(l, i){ return l.trim() === String(i+1); });\n      if (!correct) return { pass: false, message: '❌ Expected 1 through 5, one per line.' };\n      if (!/for/.test(code)) return { pass: false, message: '⚠️ Correct output, but please use a for loop.' };\n      return { pass: true, message: '✅ Great work!' };\n    },\n    onPass: async function() { await window.__markStepComplete(); }\n  });\n})();"
}
```

### Using PyLearn.runPython() directly (no editor UI)

```js
// In step JS — run Python silently and use the result in custom UI
const { output, error } = await PyLearn.runPython('print(len("hello"))');
document.getElementById('result-display').textContent = output.trim(); // "5"
```

### Providing an input() handler

```js
PyLearn.runPython(
  'name = input("Enter your name: ")\nprint("Hello,", name)',
  async function() {
    return Promise.resolve('Alice');  // always answer "Alice"
  }
);
```
