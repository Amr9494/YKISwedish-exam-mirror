# YKI Swedish – Exam Mirror

A free practice site for the **speaking part of the YKI Swedish test (intermediate level / mellannivå)**.
It mirrors the four speaking tasks of the exam – **Dialoger, Reagera, Berätta, Din åsikt**. Each task has a *Words & toolkit* page (instruction words + ready answers to memorise) and exercises. For dialogues:

1. Read the situation.
2. Listen to the other person (browser text-to-speech, Swedish voice).
3. See the instruction in brackets – *(Svara.)*, *(Säg nej och förklara varför.)* …
4. Answer aloud – you are **recorded** with a countdown, like in the exam.
5. At the end, listen to your own answers and **reveal the model answers** to compare.

34 dialogues (179 lines), 99 Reagera situations, 14 Berätta topics and 14 opinion topics in 7 everyday themes. Every model answer is built from the toolkit patterns, so you memorise a small set of sentences and reuse them.
Model answers are deliberately **simple and correct (B1 level)**, with an alternative (*eller*) where useful.

## Run locally
No build step. Open `index.html` in Chrome / Edge / Safari, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
(The microphone needs `https://` or `localhost`.)

## Deploy on Vercel
Import this repository in Vercel → Framework preset **Other** → no build command, output directory `.` → Deploy.

## Privacy
Everything runs in the browser. Recordings are never uploaded; they disappear when you leave the page.
Settings and progress are kept in your browser's local storage.

## Voices
The site uses the device's Swedish text-to-speech voice. If none is installed, add a Swedish voice in your system's speech settings.

## Content
The dialogues and answers are original practice material written for this site, in the style of the YKI exam tasks.

## Roadmap
- [x] Dialoger
- [x] Reagera
- [x] Berätta
- [x] Din åsikt
- [x] Words & toolkit page for each task
