# Thought Markdown and Tool Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every Thought as clean, initially expanded Markdown and show compact one-line previews for collapsed tool calls.

**Architecture:** Normalize reasoning text at the structured-output boundary, initialize collapsibles once instead of forcing their state reactively, and derive a display-only preview from decoded tool arguments. Hermes will distinguish token deltas from discrete reasoning segments so only true segment boundaries receive blank lines.

**Tech Stack:** Svelte 4, TypeScript, Marked, Python 3, Hermes Responses SSE.

---

### Task 1: Normalize Thought Markdown

**Files:**
- Modify: `src/lib/components/chat/Messages/structuredOutput.ts:105-135`

- [ ] **Step 1: Add an idempotent reasoning normalizer**

```ts
export function normalizeReasoningMarkdown(text: string): string {
\treturn text.replace(/\r\n/g, '\n').replace(/\*{4,}/g, '**\n\n**');
}
```

- [ ] **Step 2: Stop forcing blockquotes**

Replace the `split(...).map(...).join(...)` expression in `buildReasoningToken` with:

```ts
const text = normalizeReasoningMarkdown(getReasoningText(item));
```

- [ ] **Step 3: Run the frontend type/build check**

Run: `npm run check`
Expected: Svelte check completes without a new error in `structuredOutput.ts`.

- [ ] **Step 4: Commit the frontend formatter**

```bash
git add src/lib/components/chat/Messages/structuredOutput.ts
git commit -m "fix: render Thought text as Markdown"
```

### Task 2: Make Thought and Tool Lists Initially Visible

**Files:**
- Modify: `src/lib/components/chat/Messages/Markdown/ConsecutiveDetailsGroup.svelte:35-55`
- Modify: `src/lib/components/chat/Messages/StructuredOutputRenderer.svelte:75-145`
- Verify: `src/lib/components/chat/Messages/Markdown/MarkdownTokens.svelte:371-455`

- [ ] **Step 1: Initialize the outer detail group once**

Replace the forced reactive open statement with one-time initialization:

```svelte
let initialOpenApplied = false;

$: if (!initialOpenApplied && (reasoningCount > 0 || toolCallCount > 0)) {
\topen = true;
\tinitialOpenApplied = true;
}
```

This reveals the compact tool rows and Thoughts but preserves manual collapse after initialization.

- [ ] **Step 2: Initialize every Thought card open in both render paths**

For non-tool details in `StructuredOutputRenderer.svelte`, pass:

```svelte
open={detailToken.attributes?.type === 'reasoning' || ($settings?.expandDetails ?? false)}
```

Keep every `ToolCallDisplay` `open` expression unchanged. Confirm `MarkdownTokens.svelte` already uses the same reasoning-specific expression.

- [ ] **Step 3: Run the frontend check**

Run: `npm run check`
Expected: Svelte check completes without new errors in either component.

- [ ] **Step 4: Commit initial expansion behavior**

```bash
git add src/lib/components/chat/Messages/Markdown/ConsecutiveDetailsGroup.svelte src/lib/components/chat/Messages/StructuredOutputRenderer.svelte
git commit -m "feat: open Thought and tool activity lists by default"
```

### Task 3: Add Compact Tool Argument Previews

**Files:**
- Modify: `src/lib/components/common/ToolCallDisplay.svelte:1-175`

- [ ] **Step 1: Derive a safe single-line preview from raw arguments**

Add these helpers next to `parseArguments`:

```ts
const PREVIEW_KEYS = ['command', 'cmd', 'path', 'file_path', 'query', 'pattern', 'url', 'skill'];

function scalarPreview(value: unknown): string {
\tif (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
\t\treturn String(value).replace(/\s+/g, ' ').trim();
\t}
\treturn '';
}

function getArgumentPreview(raw: string): string {
\tconst parsed = parseArguments(raw);
\tif (!parsed) return raw.replace(/\s+/g, ' ').trim();
\tfor (const key of PREVIEW_KEYS) {
\t\tconst preview = scalarPreview(parsed[key]);
\t\tif (preview) return preview;
\t}
\tfor (const value of Object.values(parsed)) {
\t\tconst preview = scalarPreview(value);
\t\tif (preview) return preview;
\t}
\treturn '';
}
```

Decode arguments regardless of open state, while continuing to parse/render the full arguments only while expanded:

```svelte
$: rawArgs = decode(attributes?.arguments ?? '');
$: argumentPreview = getArgumentPreview(rawArgs);
$: args = open || (Array.isArray(embeds) && embeds.length > 0) ? rawArgs : '';
```

- [ ] **Step 2: Replace the generic collapsed label**

Render the header as a full-width, non-wrapping row:

```svelte
<div class="flex-1 min-w-0 flex items-baseline gap-1.5 text-xs">
\t<span class="shrink-0 font-medium text-gray-700 dark:text-gray-200">{attributes.name}</span>
\t{#if argumentPreview}
\t\t<span class="min-w-0 truncate font-normal text-gray-400 dark:text-gray-500">{argumentPreview}</span>
\t{/if}
</div>
```

Keep the status icon, chevron, expanded input/output, result truncation, files, and embeds unchanged.

- [ ] **Step 3: Build the production frontend**

Run: `npm run build`
Expected: Vite produces `build/` successfully.

- [ ] **Step 4: Commit compact tool previews**

```bash
git add src/lib/components/common/ToolCallDisplay.svelte
git commit -m "feat: show compact tool argument previews"
```

### Task 4: Separate Hermes Reasoning Segments

**Files:**
- Modify: `gateway/platforms/api_server.py:2850-3090` in the Hermes repository

- [ ] **Step 1: Distinguish provider deltas from discrete progress segments**

Queue provider tokens as `__reasoning_delta__` and progress commentary as `__reasoning_segment__`. Extend `_emit_reasoning_delta` with a `separate` flag that prepends `\n\n` only when a discrete segment follows non-whitespace text.

```python
async def _emit_reasoning_delta(delta_text: str, *, separate: bool = False) -> None:
    if not delta_text:
        return
    if reasoning_item_id is None:
        await _open_reasoning_item()
    if separate and reasoning_text_parts:
        previous = reasoning_text_parts[-1]
        if not previous.endswith((" ", "\n")) and not delta_text.startswith((" ", "\n")):
            delta_text = "\n\n" + delta_text
    reasoning_text_parts.append(delta_text)
    await _write_event("response.reasoning_summary_text.delta", {
        "type": "response.reasoning_summary_text.delta",
        "item_id": reasoning_item_id,
        "output_index": reasoning_output_index,
        "summary_index": 0,
        "delta": delta_text,
    })
```

- [ ] **Step 2: Run syntax compilation only**

Run: `python -m py_compile gateway/platforms/api_server.py`
Expected: exit status 0 and no output. This is a syntax/build check, not an automated test suite.

- [ ] **Step 3: Commit the Hermes separator**

```bash
git add gateway/platforms/api_server.py
git commit -m "fix: preserve reasoning segment boundaries"
```

### Task 5: Deploy and Manually Verify Presentation

- [ ] **Step 1:** Build and install the Open WebUI production bundle using the existing timestamped release procedure.
- [ ] **Step 2:** Restart the Open WebUI user service and confirm its health endpoint responds.
- [ ] **Step 3:** Install the Hermes release using the existing timestamped release procedure and restart the gateway service.
- [ ] **Step 4:** In a live long-running chat, confirm Thoughts open initially, manual close persists, Markdown headings/lists render, tool rows show ellipsized arguments, and each tool's full body stays closed.
- [ ] **Step 5:** Push both repository branches and confirm each branch is up to date with its fork remote.
