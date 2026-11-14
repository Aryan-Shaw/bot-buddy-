# Rize Buddy (Windows)
Rize tracker + a warm AI study buddy ("Sunny" by default, rename it in Buddy settings).

## Build (once)
Double-click build.bat (Python 3.10+ with "Add to PATH") -> dist\\RizeBuddy.exe. Pin it to the taskbar.
Dev mode: pip install -r requirements.txt ; python tracker.py
Data: %APPDATA%\\RizeBuddy\\rize-data.json (backups in the backups folder next to it, a key-less copy in Documents\\RizeBuddy-backup, problems in rize.log) (goals, dates, mood, chat and API keys are in the "buddy" part).
This version uses its own port (8766) and data folder, so it can sit next to the original Rize.

## First run
1. Buddy's window opens by itself (bottom-right) with a short check-in: name, mood, today's goals, weekly goals (Mondays), upcoming tests.
2. In Buddy: gear icon -> paste your OpenRouter keys (one per line, 2-3 is great) -> "Save & test".
   When one key hits its free limit the next key is used automatically, and the same for models.
   Free models change often: put your favourites in "Models to try first", otherwise Buddy discovers free ones itself.

## What Buddy does
- Off-task for N minutes (Settings > Off-task alert) -> Buddy pops up, writes a nudge and says it out loud.
- Daily check-in the first time the laptop is used each day.
- New exam / chapter / task added in the dashboard, or the + button in Buddy -> Buddy reacts.
- Talk by mic or type. Replies mirror the student's slang/language (English, Hinglish...).
- It knows: goals of the day/week, exams and chapter progress, productive time today, and the app currently open (app name only, can be switched off).
- Crisis words (self-harm etc.) show a care message with the helpline (editable in settings).
- Without internet / keys Buddy still sends short kind canned messages.

Voice: mic uses Edge's speech recognition (needs internet). Spoken replies use Edge voices, with Windows' built-in voice as fallback.

## v2 additions
- Corner pop-up (replaces the always-on floating widget): click the tray icon (or every N min, set in Buddy settings) and a small card shows for ~9 s: work time on your goal, current goal, live streak, and bars for today's goals, week goals and exam chapters with deadline countdowns.
- Current goal: pick it from the top bar (🎯), in Review, or in Buddy's check-in. Only work on that goal counts for work hours, streaks and off-task detection. Add each subject under Areas with keywords so apps/videos are recognised.
- Focus streaks: unbroken work on the goal (breaks up to 5 min allowed, editable). Streaks view + Report card show a per-day graph with a crown on the best day. Buddy cheers at 30/60/90... min and when a streak breaks.
- Coach rules: default motivation prompts in Buddy settings (editable) steer how Buddy motivates and stops time wasting.
- Robot: the PySide6 mascot is ported to the browser (robot.js), so nothing extra to install. It shows emotions that match Buddy's replies; click it to poke it.
- ☰ button hides/shows the left side panel.

## v3 changes
- New robot: orange helmet, black glass screen, solid glowing eyes (8 expressions, react to Buddy's mood).
- Corner pop-up is compact and sits flush in the bottom-right corner. Click it to pin it and edit: move the progress sliders (goals and exam chapters), change the current goal, add a new goal with a deadline.
- Current goal is picked from exam topics, exams and tasks (or typed as something new): top bar 🎯, Review, Buddy and the pop-up.
- In Review, the dropdown next to each app/site/video now lets you choose which exam topic / task it belongs to. Focus work that is not for the current goal counts as Unproductive ("Break" is renamed Unproductive).
- Rize Buddy's own windows (Buddy, Rize Peek, dashboard) are no longer tracked as sites.

## v4 changes
- **90 % algorithm / 10 % AI** (`algo.py`): all automatic messages (streaks, nudges, celebrations, check-in replies) come from rules + templates + your quotes. The AI is only used for questions you ask directly (prompt capped at 900 tokens: system + your coach rules + short context + your message) and for roughly 1 in 10 cheers.
- **Celebrations with voice**: hitting your daily target (default 6 h) gives a big "WOW ... CONGRATULATIONS" message, confetti and an excited voice. Voice tone/speed follow the emotion; pick the voice, speed and pitch in Buddy settings.
- **Distractions**: when you drift off your goal Buddy asks what you are doing, the algorithm judges whether it matters for your current goal/exam, then allows it or convinces you. Everything is logged in the new **Analyze > Distractions** page (what, when, what you said, verdict, did you return).
- **Not annoying**: only checks in when you have a goal or a focus timer, Quiet/Balanced/Chatty level (min gap + daily cap), backs off when ignored, no periodic pop-up by default.
- **One Buddy window only**: the real window is looked up and brought to front instead of opening another.
- **Pauses media while Buddy speaks**: your own focus sound ducks, and videos/music are paused via the Windows media key and resumed afterwards (needs `pycaw`, installed by requirements.txt).
- **Goals = exams or tasks only**: Study timer now picks an exam/chapter; Buddy's "today / week" goals are real Tasks (with deadline). The current-goal picker keeps a history of previous goals with minutes worked and a Resume button.
- **Focus sound**: presets (brown/pink/white noise, rain, waves, focus tone) or upload your own audio; auto start/stop with the timer.
- **Import / export**: exams & tasks (Exams and Tasks pages, Settings) and everything (Settings). Merge or replace. API keys only if you tick the box.
- **Delete all data** (Settings, or Buddy settings): type DELETE; Buddy asks the first-run questions again.
- **Quotes & motivation messages**: add your own (dashboard Settings or Buddy settings, or import a .txt); Buddy mixes them into replies.
- **Light / dark / auto theme** with a professional indigo palette; button in the top bar and Buddy window.
- New "disappointed" robot face when you are distracted; the confused face while waiting is gone.

## v5 changes
- **Natural voice (Chatterbox Multilingual, Hindi + English)**: run `setup-voice.bat` once (about 3 GB, own Python env so the exe stays small). RizeBuddy.exe then starts `voice_server.py` by itself. Tone follows Buddy's emotion (cheering = more expressive and livelier, sleepy/sad = softer). Settings > Voice engine: Auto / Natural only / Browser only, plus an Expressiveness slider. The first sentence streams while the next is prepared. If the natural voice is missing, loading or fails, the browser/Edge voice takes over, and Bengali always uses the browser voice (Chatterbox has no Bengali). Optional: put a clean 10 s recording in `%APPDATA%\RizeBuddy\voice-ref.wav` to give Buddy that voice. With a Hindi voice language Buddy answers in Devanagari so it is read correctly.
- **Icons**: the globe in Buddy's window is now the robot face, the app (dashboard, favicon, sidebar logo, Quick look) uses the orange R. The window icon is also set natively, so Edge's generic globe cannot come back.
- **Review: link one site/app/video to several topics or tasks**: linked ones show as green ticks, "+ Link another" adds more, the x on a tick removes it. Completed tasks and chapters stay visible (marked "done") and stay linkable under "Completed".
- **Minutes from Review**: the time of sites/apps you linked now adds up on Tasks and on exam chapters ("from linked sites/apps"). A site linked to two tasks splits its time between them, and minutes the timer already logged for the same task are not counted twice.
- **Break reminder, now conditional** (works with the dashboard closed). It fires only after N min of unbroken work (Settings, default 50), never while you are idle, paused, on something unproductive or running a Pomodoro, and a pause longer than the streak gap resets it. If you ignore it, it returns after +15, +40, +70 min of the same stretch, not every few minutes. Buttons: "Taking a break" / "10 more minutes". The message adapts (shorter break when an exam is near, longer after a long stretch). With Buddy switched off you get a tray notification instead.
- **Smarter relevance check**: the distraction judge no longer just matches keywords. It scores what you say against your goal, the exam and its other topics, subject vocabulary (physics: optics, lens...), and what is really open on screen. It handles "not studying", treats a study claim on a feed/game page as not credible, and trusts a real study tool or a page that matches your topic.
- Fixed: a crash for old area-style goals (`area_of` was missing in focus.py).

## v6 changes
- **Who answers what.** Anticipated questions are answered by the system from your data (no AI): "what should I do next?", "which chapter?", "my priorities", "how are you / what's your name", plus yes/ok follow-ups. Open or engaging questions go to the live AI. If the AI can't answer, Buddy now says why: no key yet (button to add one) or not reachable (Try again / Check keys), instead of a canned line.
- **Exam priorities.** Exams page: every upcoming exam has a unique rank (no two exams are equally important), changed with the up / down arrows. Priority score = points from your rank (best rank = most points) + 1 for the nearest exam. Equal scores: the nearer exam goes first. Dev knob: `PROX_BONUS` in `algo.py`.
- **"What should I do next?"** Picks the top exam, then its chapter by importance x how much is left x deadline pressure, and offers a "Set as my goal" button. A task that is overdue or due within 12 h comes first, unless the top exam is 2 days away or less.
- **Plan button (📊) in Buddy's window**: current goal, next-up pick, exams by priority with score / your rank / readiness / re-rank arrows, their chapters (importance, %, deadline, set-as-goal), today's and this week's tasks.
- **Source dot (developer feature, on by default, Buddy settings to turn off)**: a small dot on every Buddy reply, green = system algorithm, blue = live AI. Stored with the chat, so it survives a restart.
- Fixed: the robot was stretched when the Buddy window was enlarged (the canvas now follows its size).

## v7 changes
- **RizeBuddy.exe now opens Buddy first** (also when you start it a second time). The dashboard is opened from Buddy's side panel, or from the tray menu (Open dashboard).
- **Buddy side panel** (the ☰ button, top-left of Buddy): every dashboard page, **most opened first**, with how many times you opened it. It collapses to a thin icon rail and opens over the chat, so it takes no space. Click a page and the dashboard opens **on only that page** (if the dashboard is already open it is raised and switched to that page). Ties keep the dashboard's usual order. Views are counted whenever the dashboard shows a page.
- **Today's numbers in Buddy**: Streak, Productive (time on your goals today) and Wasted (time filed under Unproductive) sit as three chips next to the robot, **biggest on top**, and slide into their new order live.
- **Robot mood follows the leader**: wasted highest -> sad and depressed (slumped, dim eyes, tears, little rain cloud); streak highest -> over-excited (cheering, jumping); productive highest -> quietly happy (giggling to itself: ^ ^ eyes, pink cheeks, small shakes, soft "he he"). Chat reactions still show for a few seconds, then the robot returns to this mood. Dev knob: `STREAK_LEAD` at the top of the stats block in `companion.js`.
- Internals: `VERSION` is now `B7` so an older running copy is replaced on the next start. New endpoints: `/api/nav/ranks`, `/api/nav/view`, `/api/dash/open`; `/api/buddy/state` now carries `stats`.

## v8 changes
- **Finished exams**: once an exam's date and time have passed it shows "Completed" (no countdown) in the dashboard, moves to the bottom of Exams, and disappears from Buddy's Coming up, priorities, "what next?", goal picker and the corner pop-up.
- **➕ in Buddy now adds goals** (Today / This week; test, mood and note are under "More"). Optional deadline, optional **link to an exam topic**, and "make it my current goal".
- **Task -> syllabus progress**: link a task to an exam chapter (Buddy ➕ sheet, the 🔗 selector on each goal, or the dashboard Tasks page). The chapter's % becomes the average of its linked tasks (done = 100) and updates by itself; its slider is locked and marked "auto".
- **Bigger Buddy window** (560 x 900, capped to 45 % of the screen width) and applied again each time Buddy opens. The side rail is gone: only the ☰ button is left, it opens the page list over the chat.
- **"explorer" in your stats**: explorer.exe is also the desktop, taskbar and Alt-Tab. When one of those held focus (for example the other monitor's wallpaper while you read Claude) the time was booked to "explorer". Now the shell is never an activity: the time goes to the top-most visible app window, or is not counted if the desktop is empty. Real File Explorer folders still show as "explorer". Old sessions are not rewritten (delete them on the Privacy page with match "explorer" if you like).
- **New site / app review**: a never-reviewed site or app gets the benefit of the doubt (no off-task alert). After you have spent N minutes on it (Buddy settings, default 20) Buddy asks in one short line whether it is productive and aligned with your goal: Yes / Productive but other goal / Not productive / Later. Text only, never spoken; max 4 questions a day, 10 min apart. When more than 50 (editable) new sites are waiting, Buddy offers a one-minute clean-up sheet once a day.
- **Streak protection timer**: when you drift from your goal with a streak of 2+ min, Buddy's window shows a countdown to the break point (your streak-gap setting, default 5 min). Amber while you are off goal, green if you are just away, red and pulsing in the last minute; one chat warning at 60 s for streaks of 10+ min.
- **Quiet on productive sites + welcome back**: while the page in front of you counts for your current goal Buddy is silent (no cheers, no hour / halfway messages, no check-in pop-up, no window, no voice; break reminders become a silent tray toast). Milestones and the daily-goal celebration are kept. When you open Buddy again (3+ min later, editable via `welcomeMin`) it cheers and lists the goal-linked sites / apps you used with start-end times and the goal each one served, plus the daily-goal party if you reached it.
- Internals: `VERSION = B8`; new endpoints `/api/buddy/guard`, `/seen`, `/welcome`, `/reviews`, `/review`, `/tasklink`.

## v9 changes
- **Lost data after shutdown: fixed at the root.** v8 wrote its file without forcing it to disk and ignored load errors, so a shutdown / power cut could leave an empty file that the next save then wrote over everything. Now (`store.py`): saves are flushed + fsynced and swapped atomically; an empty dataset never overwrites real data and nothing is saved at all after an unreadable load; rolling backups every ~5 min (last 12) + one per day (last 30) in `%APPDATA%\\RizeBuddy\\backups`; a key-less copy in `Documents\\RizeBuddy-backup` (survives an APPDATA clean-up, synced if Documents is on OneDrive); the newest good backup is restored automatically if the main file is damaged and Buddy tells you; a last save when Windows shuts down / restarts / logs off. **Settings > Data safety**: health, Back up now, Open data folder, Restore any backup (your current data is snapshotted first, so a restore can be undone). Imports snapshot first as well. "Delete all data" also deletes the backups.
- **Dashboard can no longer overwrite newer changes.** v8 loaded settings once and posted the whole thing back on every save, so an open dashboard could silently undo tasks, progress and links changed from Buddy. Saves now carry a revision and are three-way merged on the tray app (field by field, item by item).
- **Everything is linked (`links.py`).** One engine for tasks, chapters, exams, Review links, Timer entries and the current goal:
  - Time per task / chapter / exam is now calculated by the tray app (Timer entries + linked sites / apps, shared sites split their time, nothing counted twice) and used by Buddy, the plan and the dashboard.
  - **Progress follows the work.** Give a task an estimate (Tasks page, or Buddy's add sheet) and its % moves with your time (max 95 %, you finish it; moving the slider re-bases it). Give a chapter a study-time estimate (chapter form) and it does the same; chapters with linked tasks use their average as before.
  - **Tasks auto-link to chapters** when the title clearly matches one ("Solve optics worksheet" -> Optics). Remove the link and it stays removed.
  - **Goal families.** A task counts for its chapter, a chapter for its linked tasks, an exam for everything under it, both for time counted and for "is this on-goal" (tray app and dashboard).
  - **Finishing the current goal moves you on.** Done / deleted task, chapter at 100 %, finished exam: Buddy sets the next best goal from your exam priorities and says so (switch off in Settings > Automation).
  - Fixed: un-ticking a task reset it to 0 % (it now restores what it had); deleting a task / chapter / exam left dangling links and a dead current goal; a task added twice dropped its chapter link; tasks ticked in the dashboard had no done-day.
- **Auto-review (`autorev.py`)** does most of Review for you. It sorts new sites / apps / videos into Productive / Unproductive / Meeting / Other and links Productive ones to the right topic or task, using: a lexicon of study vs distraction sites and apps, a model trained on what YOU already labelled (words + letter patterns), the words of your exams / chapters / tasks, the company an item keeps, and for links what you were doing while it was open (Timer entries count fully, the current goal half). Confident (>= 80 %) = applied and marked "auto"; unsure = a one-tap suggestion (Review banner, Buddy's question, "Accept all"); the rest is left to you. Every correction teaches it and moves the confidence bar (stricter if it errs, looser if it is accurate but automates too little). **Review shows the live share of your new items it sorted for you.** On my synthetic test student it sorted about 60 % at ~99 % accuracy; your real share depends on how much of your use is well-known or similar-to-labelled sites, and grows as you label.
- Buddy window: goal rows show time spent and whether the % follows your time, auto-linked chapters are marked "(auto)", the add sheet takes an estimate, the plan shows time studied, new messages for finished goals, restored data and auto-review.
- Internals: `VERSION = B9`. New modules `store.py`, `links.py`, `autorev.py`, dashboard `auto.js`. New endpoints `/api/health`, `/api/backups[...]`, `/api/auto/*`, `/api/links/minutes`, `/api/data/folder`. The exe has no console, so problems are written to `%APPDATA%\\RizeBuddy\\rize.log`.

## v10 changes
- **Goal reminders.** Give a goal a start time, any number of extra times between start and deadline, and a deadline (the add sheet, the 🔔 next to every goal in Buddy, or the Tasks page). Buddy pops up at each one. After the deadline it asks "you need to finish this, what are you doing right now?" every 30 minutes (change it in Settings; 0 = never) until the goal is done. Answer with the chips or type it: working on it, break, something else, I need more time (moves the deadline), it's done, stop asking. Missed reminders (PC was off) are not replayed, and Buddy doesn't nag about a goal you are working on right now.
- **Two new line libraries next to quotes** (Buddy Settings and dashboard Settings): what Buddy says when you are distracted, and what it says when you hit a streak or complete a goal. Use {name} and {goal}. With your own lines Buddy uses one about 7 times out of 10 (`CUSTOM_SHARE` in algo.py). Without, it mixes in a few built-in ones.
- **Goal priority order.** Every open goal has a rank (#1 = most important), shown in Buddy, the corner pop-up and the dashboard Tasks page ("Goal priorities"). Move goals with ▲ ▼. Buddy's "what should I do next?" and the next-goal pick after you finish one follow your #1 (an exam within 2 days still wins).
- **Timer in Buddy's window and the corner pop-up.** Same timer as the dashboard Timer page: start it anywhere and the others follow. Started from Buddy it is booked to your current goal; finished blocks are saved like the dashboard does, and Buddy announces break / focus time. New files: `timer.py`, `reminders.py` (both added to build.bat).

## v11 changes
- **Fixed: chapter progress could not be changed once tasks were linked.** The slider was locked, and linking the first task also reset the chapter to the tasks' average (a chapter at 40 % dropped to 0 %). Now the chapter value is always yours: drag the slider (dashboard, Buddy or quick look) and it stays; the linked tasks then move it from there up to 100 % (all tasks done = 100). Adding or removing a task never makes it jump, except that unfinished work added to a "complete" chapter reopens it. The same rule applies to chapters that follow your time.
- **Review now has a live section** ("What am I doing now?", on the dashboard Review page and Buddy's new 🔍 button): the thing in front of you with its category and whether it counts for your goal, then the last 2 productive and last 2 not productive sites / apps / videos you used before it. One tap flips any of them and auto-review learns from it.
- **Review -> progress.** Review shows how much of your productive time is linked to a goal, and lists what is not linked yet with a one-tap "Link to…". **Exams > Progress map** shows every exam -> chapter -> task with progress, minutes and the reviewed sites that feed it.
- **Link everything.** Tasks can link to a whole exam as well as a chapter (dashboard, Buddy, add sheet); Timer entries follow their task by id (a renamed task keeps its time); deleting an exam / chapter cleans every link; exams show minutes from their direct tasks. See DATA-MAP.md for every kind of data and how it connects.
- Fixed: `VERSION` was still `B9` in v10, so an old running copy would not be replaced; it is `B11` now. New module `progress.py` (added to build.bat).

## v12 changes
- **Deadlines & exam timers (📅 in Buddy).** Exams (date **and time**), goal/task deadlines and project deadlines in one list with a live `dd hh:mm:ss` countdown (amber under 24 h, red when overdue). Change any date/time right there and the timer jumps at once. Each task has a 🔗 selector to link its deadline to an exam, topic or project. Projects now have a deadline and a "% done" from their tasks. Buddy's AI also gets exam / deadline time left ("in 5h 59m"), not just days.
- **Review from Buddy's chat.** In 🔍 and 🧹 every site / app / video has a "🔗 Link to exam / topic / task" selector (and ✕ unlink). Typing "review my sites", "smart review" or "deadlines" in the chat opens the right sheet.
- **No more 5-6 s wait when linking an exam to a site.** The old code waited for the whole save (minutes, progress, disk, reload) before redrawing. Now the screen updates first and the save runs in the background (dashboard: `saveBg()` in app.js; Buddy: `/api/buddy/rlink` answers instantly and recalculates after the reply).
- **🔄 Refresh** in Buddy's header re-scans sites, recomputes links / progress and reloads everything.
- **✨ Smart review.** Sends up to 50 new sites + your upcoming exams (name, time left, open topics) and open tasks in ONE request; the AI answers with a short JSON (category + which exam/topic/task). Results are suggestions: accept one, reject one, or accept all.
- **Groq + OpenRouter.** Paste keys one per line in Buddy settings: keys starting with `gsk_` go to Groq (`api.groq.com/openai/v1`, llama-3.3-70b / 3.1-8b), all others to OpenRouter's free models. Same request format, tried in order with automatic fallback.
- **Conversation memory (stateless API).** Every request now carries: a static system prompt (identical prefix = provider caching), the last 8 messages, and a last message holding live context + a one-line summary of older chat + the question. Hard cap `AI_BUDGET_TOKENS = 1300`, trimmed in order: coach rules, context, oldest messages. The full history stays in the data file (last 400 messages).
- Internals: `VERSION = B12`, new module `smart.py` (added to build.bat). New endpoints `/api/buddy/deadlines`, `/deadline`, `/taskproj`, `/rlinks`, `/rlink`, `/refresh`, `/smartreview`.
- **Reference keywords ("this word = this exam / chapter").** Every exam and every chapter has labels with a green **+** (dashboard Exams page and Buddy's 📅 sheet). Add words like `lens, refraction` to a chapter or `ncert, physics 12` to an exam; × removes one. A site, app or video that contains one counts for that exam / chapter exactly like its name does: Review auto-linking, the on-goal / off-task check, the goal family, and Smart review (the AI sees the keywords next to each exam / topic). Stored as `refs` on the exam / chapter.
- **Exam cards in Buddy like the dashboard:** days / hrs / mins / secs timer boxes (red when past), readiness, open tasks, editable date + time, and the chapters with their keyword labels.

## v13 changes
- **New Buddy structure.** Opens on the robot. The 🎯 button opens your goals *in the robot's place*: the robot folds smoothly into a slim strip (goal, mood, today's numbers, streak-protection timer) and the goals unfold below the timer. The ⌃ / strip toggles it by hand; short windows fold it automatically. Goals are now an accordion (Today / This week / Coming up, state remembered) with proper cards, so text no longer squeezes into a narrow column. Responsive down to ~340 px; secondary buttons (refresh, voice, theme, settings) live in a ⋯ menu.
- **Better timer**: progress ring, big play button, Focus / Short / Long selector that folds away while running.
- **Clear site / app names** (`names.py`, display only, review keys unchanged): ScreenClippingHost -> "Snipping Tool", cmd -> "Command Prompt", 127.0.0.1:8766 -> "Rize dashboard", blank titles -> "Untitled page", plus a type tag (App / Website / YouTube / Local page) and the raw name in small text.
- **Review inside Buddy** (🔍 Right now, new 🗂 icon with a red count badge for To review): one card at a time with ✅ Productive / 🚫 Not / ➖ other goal / ⏭ Skip, accept 💡 suggestions, link to a topic, keys P N A S, "Up next" list, Accept all, Smart review. No dashboard needed.
- **Buddy prompts for review when needed**: the existing "after N min on a new site" question now has a "Review all" chip; the 50-site clean-up stays; new soft reminder when N sites are waiting (default 10, max 2/day, Settings). The 🗂 badge pulses when something is past the review minutes.
- **Quotes and your own lines are now really used**: shuffle rotation so every quote / distracted line / win line gets a turn, 90 % use (slider in Settings), quotes also follow your lines, the live AI is told to use them word for word, "used N×" counters, and test buttons in Settings.
- Fixed: deadline countdown could overwrite the goal countdowns. `VERSION = B13`; new `names.py` is in build.bat.

## v14 changes
- **Buddy opens by itself when you start the PC.** Windows now launches Rize Buddy at login with `--startup`: it starts tracking in the tray and, after the local server is ready, opens Buddy's window (the daily check-in follows). Switch it off in dashboard Settings ("Open Buddy's window when the PC starts") or in the tray menu; "Start with Windows" still controls whether the app starts at all. Old `--hidden` entries are refreshed to the new one on the next launch. The setting survives "Delete all data".
- Fixed: `VERSION = B14` so an older running copy is replaced. New endpoints `/api/autoopen` (GET/POST).

## v15 changes
- **Tools fold right-to-left.** 🔍 🗂️ 📅 📊 🎯 ➕ 🗓️ now live in a strip that slides away behind a single **‹** button (click it and they slide out to the left, **›** folds them again; remembered). The 🗂️ review count shows as a red dot on **‹** while folded. In narrow windows the strip folds itself after you use a tool.
- **"What did I miss?" after the app was closed.** Buddy keeps a heartbeat; when you open it after 30+ minutes closed (e.g. 11:30 PM -> 8:00 AM) it asks: 😴 Sleep / 📚 Studied / 🏫 College-School / ✍️ Something else (your own text), with editable from-to times. Each answer becomes a block in the calendar (Time entries); if you only cover part of the gap it asks about the rest. Sleep is pre-selected for overnight gaps. Skip clears it.
- **Small calendar in Buddy (🗓️).** One day at a time: your blocks on the left, tracked apps / sites (3 min+) on the right, exam / deadline markers, previous / next / today, add a block, delete a block. Same data as the dashboard calendar.
- `VERSION = B15`. New endpoints `/api/buddy/gap`, `/cal`, `/calentry`.

## B17
- **Tease Buddy** is now a dropdown button at the top-left of Buddy's stage (pick a tease, Buddy reacts). It is no longer in the ☰ menu.
- **🌐 Browser** button under the Streak / Productive / Wasted chips opens the Rize Browser.
- **Rize Browser: every site is checked** as Productive, Meeting or Unproductive (never "Other"): your blocked / distraction / productive words first, then the built-in lexicon (feeds, streaming, shopping, games vs study / dev / AI tools); a site nobody can place counts as Productive. Your own Review always wins. Other browsers are unchanged.
- **YouTube is judged by video title (and length), never by the domain.** The YouTube home page counts as a video too.
- **YouTube page (dashboard): "Unproductive YouTube"** graph with minutes over time (per hour / day / month) and a list of the unproductive videos by title with one-click Productive / Unproductive review.
- Fixed: `name 'web' is not defined` at start-up.
