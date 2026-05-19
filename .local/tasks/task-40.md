---
title: Fix AI call goodbye cut-off
---
# Fix AI Call Goodbye Cut-Off

## What & Why
When the AI receptionist ends a call (e.g. "Thanks for calling, have a good one!"), the audio is cut off about 1–2 seconds before it finishes speaking. This happens because the system hangs up 2 seconds after the AI's transcript text is finalized, but OpenAI generates the text faster than the audio actually plays out to Twilio. Longer goodbyes don't fit in the 2-second window, so the caller hears the call end mid-sentence.

## Done looks like
- The AI's final goodbye plays in full before the call ends, no matter how long the sentence is.
- Short goodbyes still hang up promptly — no awkward dead-air pause.
- No regressions to transfer-to-office handoff or other call-ending paths.

## Out of scope
- The silence-timeout wrap-up path (the message after ~35s of caller silence). That code already has a longer 5-second buffer for a much shorter sentence and is working fine — leave it untouched.
- Changing the AI's farewell wording or persona instructions.
- Changing any silence-timeout thresholds or behavior.
- Any changes to the transfer-to-office flow timing.

## Steps
1. **Tie the goodbye hangup to audio completion, not transcript completion** — When `[END_CALL]` is detected in the transcript, set a flag instead of starting the hangup timer immediately. In the `response.done` handler (which fires after OpenAI finishes sending audio), check the flag and only then schedule the hangup with a small drain buffer (~1.5–2s) so Twilio can play out its remaining buffered audio chunks. Do NOT touch the silence-timeout wrap-up path.
2. **Verify on a real call** — Place a test call, let the AI wrap up naturally with a longer goodbye, and confirm the full sentence plays before hangup. Confirm short goodbyes still end promptly.

## Relevant files
- `server/aiAssistantCall.ts:648-678`