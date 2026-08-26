# EEG Marker Event Inventory

Complete inventory of experiment events that need EEG markers, derived from the actual
screen modules in `js/screens/` and `js/eeg.js`. No marker IDs assigned yet — this is
the raw event list to design the marker scheme from.

## Session level

| Event | File | Varies by |
|---|---|---|
| Session start | `js/eeg.js` (`initEEGMode`, called from `instructions.js` when EEG mode is on) | — (EEG-mode sessions only) |
| Session end | `js/screens/done.js` (`mount`) | — |

## Baseline (EEG mode only)

| Event | File | Varies by |
|---|---|---|
| Baseline start | `js/screens/baseline.js` (`mount`) | — |
| Baseline end | `js/screens/baseline.js` (`advance`) | — |

## Fixation (EEG mode only, once per text)

| Event | File | Varies by |
|---|---|---|
| Fixation onset | `js/screens/fixation.js` (`mount`) | text index |
| Fixation offset / dismissal | **not currently stubbed** — `advance()` in `fixation.js` has no marker comment before `goToPhase('stimulus')` | text index |

## Stimulus — all 4 conditions

(Passive/Control render the full text as consecutive pure-text slides; Active/Constructive
interleave pure-text sections between question probes/guided-resolution.)

| Event | File | Varies by |
|---|---|---|
| Title slide shown | `js/screens/stimulus.js` (`renderTitleSlide`) — **not stubbed** | text index, condition |
| Title slide dismissed (spacebar) | `js/screens/stimulus.js` (`dismissTitleSlide`) — **not stubbed** | text index, condition |
| Slide onset | `js/screens/stimulus.js` (`renderContentSlide`) | text index, condition, slide index |
| Slide advance (spacebar or auto-timeout) | `js/screens/stimulus.js` (`advance`) | text index, condition, slide index, advance method (spacebar/auto-timeout) |

## embeddedTask — Active/Constructive only

| Event | File | Varies by |
|---|---|---|
| Thinking phase start | `js/screens/embeddedTask.js` (`mount`) | text index, condition (active/constructive), section index |
| Option navigated (arrow up) | `js/screens/embeddedTask.js` (`handleArrowUp`) — Active only | text index, section index |
| Option navigated (arrow down) | `js/screens/embeddedTask.js` (`handleArrowDown`) — Active only | text index, section index |
| Response phase start | `js/screens/embeddedTask.js` (`enterResponsePhase`) | text index, condition, section index |
| Response submitted | `js/screens/embeddedTask.js` (`finalizeSubmission`) | text index, condition, section index, auto-submitted flag |

## guidedResolution — Active/Constructive only

| Event | File | Varies by |
|---|---|---|
| Guided resolution onset | `js/screens/guidedResolution.js` (`mount`) — **currently gated behind the `if (!maxTimeMs) return` early exit, so it only fires when a max duration is configured** | text index, section index |
| Guided resolution end (dismissed) | `js/screens/guidedResolution.js` (`advance`) | text index, section index |

## PRA — all 4 conditions, 6 questions per text

| Event | File | Varies by |
|---|---|---|
| PRA start | `js/screens/pra.js` (`mount`, only when `questionIndex === 0`) | text index |
| Question onset | `js/screens/pra.js` (`mount`) | text index, question index, question type (MC/written) |
| Thinking phase start | `js/screens/pra.js` (`mount`) | text index, question index |
| Option navigated (arrow up) — MC | `js/screens/pra.js` (`handleArrowUp`) | text index, question index |
| Option navigated (arrow down) — MC | `js/screens/pra.js` (`handleArrowDown`) | text index, question index |
| Response phase start | `js/screens/pra.js` (`enterResponsePhase`) | text index, question index, question type (MC/written) |
| Response submitted | `js/screens/pra.js` (`finalizeSubmission`) | text index, question index, question type, auto-submitted flag |
| PRA end | `js/screens/pra.js` (`advanceToNextQuestion`, after 6th question) | text index |

## postTextFeedback

| Event | File | Varies by |
|---|---|---|
| Post-text feedback onset | `js/screens/postTextFeedback.js` (`mount`) — **not currently stubbed at all** | text index |
| Post-text feedback submitted | `js/screens/postTextFeedback.js` (`handleSubmit`) — **not currently stubbed** | text index |

## Break screen

| Event | File | Varies by |
|---|---|---|
| Break screen onset | `js/screens/breakScreen.js` (`mount`) — **not stubbed** | text index (which text just completed) |
| Break dismissed (begin next text) | `js/screens/breakScreen.js` (`handleBeginNext`) — **not stubbed** | text index |

## EEG integrity events (session-wide, not tied to a screen)

| Event | File | Varies by |
|---|---|---|
| Tab hidden detected | `js/eeg.js` (`lockTabSwitching`) | current phase (logged as context) |
| Tab visible (returned) | `js/eeg.js` (`lockTabSwitching`) | current phase (logged as context) |
| Full-screen exit detected | `js/eeg.js` (`enforceFullScreen`) — **visibility overlay logic exists but no marker stub comment present**, unlike tab hidden/visible | current phase |

## Done

Session end is already listed above (only event on this screen).

---

## Notes on gaps found while reading the code

Relevant for marker-scheme design, flagged for completeness:

- Fixation offset, title-slide onset/dismissal, break-screen onset/dismissal, and
  postTextFeedback onset/submitted have no `MARKER STUB` comments yet — they exist as
  code events but aren't in the phase-1 skeleton.
- Guided-resolution onset marker is placed after an early `return` when no max duration
  is configured, so it would silently not fire in that case — worth fixing when markers
  go live.
- Full-screen-exit has visibility-overlay handling but, unlike tab-hidden/tab-visible,
  has no stub comment at all.
