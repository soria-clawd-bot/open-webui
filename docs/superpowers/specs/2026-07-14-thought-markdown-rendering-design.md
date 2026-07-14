# Live Thought, Tool Preview, and Steering UX

## Goal

Make a live Hermes response easy to follow and redirect from Open WebUI: Thoughts are readable and open by default, collapsed tools show useful one-line previews, and a message sent during an active response steers that exact run.

## Thought Blocks

- Open every Thought block by default.
- Preserve the existing ability to collapse and reopen a Thought manually.
- Render Thought contents as normal Markdown rather than forcing every line into a blockquote.
- Restore missing separators between streamed reasoning segments so headings, paragraphs, and lists render correctly.
- Repair previously stored reasoning text where adjacent bold headings were joined as four or more asterisks.
- Leave Thought headers, chevrons, colors, spacing outside the content, and animations unchanged.

The frontend reasoning-token formatter will normalize reasoning text before passing it to the existing Markdown renderer. It will:

1. Convert joined bold-boundary markers such as `****` into a closing marker, a blank line, and an opening marker.
2. Preserve valid Markdown headings, paragraphs, lists, emphasis, and code.
3. Stop prefixing each line with `> `.

The Hermes Responses stream will place a blank line between distinct reasoning summary segments when the provider did not supply whitespace. This prevents future segments from being concatenated while preserving the provider text.

Thought collapsibles will receive an initial open state. They will not be forced open after a user manually closes them.

## Compact Tool Previews

Tool activity will match the compact preview pattern shown in the reference WebUI:

- The list of tool rows remains visible while a response runs and after it completes.
- Every tool's full input and output remains collapsed by default.
- A collapsed row shows the tool name followed by a single-line preview of its most useful input, such as a terminal command, file path, search query, URL, or the first scalar argument.
- Long previews are truncated visually with an ellipsis; they never wrap into a large block.
- Clicking a row preserves the existing behavior of expanding only that tool's full input and output.
- Running, completed, and failed status indicators remain visible.
- Thought expansion does not expand tool contents.

Preview extraction will use known argument keys first (`command`, `path`, `query`, `url`, and similar fields), then fall back to the first short scalar argument. The full original arguments remain available inside the expanded tool. Empty arguments show only the tool name.

## Mid-Run Steering

Submitting a message while the current Hermes response is active will steer the existing run. It must not stop the run, start a second run, or wait for normal completion before delivery.

The flow is:

1. Open WebUI detects that the current Hermes response is still active.
2. It records the new user message immediately in the chat timeline and sends it to a steering endpoint associated with the active Hermes response ID.
3. Hermes resolves that response ID to the active `AIAgent` and calls its existing `agent.steer(text)` primitive.
4. The current SSE stream remains connected. Hermes consumes the steering text at the next safe agent boundary and continues the same response with the new direction.
5. Open WebUI marks the message as steered rather than queued or submitted as a separate completion.

If the response is no longer active by the time the steering request arrives, Open WebUI will safely queue the text as the next normal turn. It will never silently drop the message or launch a parallel response. Attachments are not steered in the first version; a mid-run send containing files falls back to the normal queued-turn path.

The Hermes API will expose steering as an advertised capability and authenticate it identically to the active response. It will return a clear conflict response when the response exists but can no longer be steered, allowing the frontend to apply the queue fallback.

## Error Handling

- Thought normalization is text-only and idempotent. Empty reasoning remains empty, and already-correct Markdown remains unchanged.
- Tool preview generation is display-only and never mutates the full arguments or results.
- A failed steering request leaves the active stream untouched and moves the message into the normal queue with a visible queued state.
- Duplicate steering submissions are guarded by a client-generated request ID so a retry cannot inject the same text twice.

## Verification

No automated test suite will be run, per user instruction. Verification will consist of successful production builds and manual production checks confirming that:

- multiple Thoughts open by default, render Markdown cleanly, and remain manually collapsible;
- tool rows show useful truncated previews while their full contents remain closed;
- sending text during a long-running response visibly steers that same response;
- the original stream continues after steering;
- a late steering request falls back to the next-turn queue without duplication or message loss.
