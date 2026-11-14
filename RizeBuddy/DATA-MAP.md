# Rize Buddy data map (v11)

Everything lives in one file, `%APPDATA%\RizeBuddy\rize-data.json` (backups beside it, see README). This is every kind of data, who writes it, and how it is linked.

## 1. Tracked automatically (you never type these)
| Data | Where | Used by |
|---|---|---|
| `sessions`: every window you used (app, site / video title, start, end) | tracker loop | Review, Reports, streaks, minutes per goal, off-task alerts |
| `distractions`: each time Buddy asked "what are you doing?" and your answer | Buddy | Distractions page |
| `navViews`: how often each dashboard page is opened | dashboard | order of the page list in Buddy |
| `focus.log`: which goal was current when | goal picker | on-goal check, goal history |
| `auto`: what auto-review decided, suggestions, your corrections | auto-review | Review banner, accuracy |

## 2. Entered by you
| Data | Fields | Linked to |
|---|---|---|
| **Exams** | name, date, chapters (name, progress, deadline, importance, study-time estimate) | chapters <- tasks <- Review sites, Timer |
| **Tasks / goals** | title, scope (day / week), start, reminders, deadline, estimate, rank, progress, done, project | **chapter** (`chap`) or **whole exam** (`exam`), Timer entries (by id), Review sites |
| **Timer entries** | start, end, kind, project, area, note, `taskId` (+ `link.ch` for a chapter) | task (by id, survives renames), chapter, project |
| **Review labels** `v` | site / app / video -> Productive / Meeting / Unproductive / Other | sessions (category), auto-review (training) |
| **Review links** `va` | site / app / video -> exam, topic, task, area | minutes and progress of that goal |
| Projects, clients, areas | name, rate, client | tasks, entries, Profitability |
| Buddy: profile, lines, quotes, landmarks, keys | | Buddy messages |

## 3. Derived (always recomputed, never typed)
- **Minutes per task / chapter / exam** (`links.minutes`): Timer entries + the share of every linked site / app; a site linked to two things splits its time; time the Timer already booked is never counted twice; tasks add to their chapter, chapters and direct tasks add to the exam.
- **Progress**: task % follows its estimate vs time; chapter % starts from the value YOU set and its linked tasks move it up to 100; exam readiness = average of its chapters.
- **Current goal family**: a task counts for its chapter and exam, a chapter for its tasks, an exam for everything under it.

## 4. The link chain
```
site / app / video --(Review link `va`)--> task --(`chap`)--> chapter --> exam
                                           task --(`exam`)--------------> exam   (no chapter fits)
Timer entry --(`taskId`)--> task          Timer entry --(`link.ch`)--> chapter
```
Where to see it: **Exams > Progress map**, **Review > What am I doing now?** and **Review > Review -> progress**, Buddy's 📊 plan and 🔍 live review.
