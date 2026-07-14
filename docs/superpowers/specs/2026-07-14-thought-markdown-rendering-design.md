# Thought Markdown Rendering

## Goal

Make every reasoning Thought readable and open by default without changing the surrounding Open WebUI design or the behavior of tool-result blocks.

## Scope

- Open every Thought block by default.
- Preserve the existing ability to collapse and reopen a Thought manually.
- Render Thought contents as normal Markdown rather than forcing every line into a blockquote.
- Restore missing separators between streamed reasoning segments so headings, paragraphs, and lists render correctly.
- Repair previously stored reasoning text where adjacent bold headings were joined as four or more asterisks.
- Leave Thought headers, chevrons, colors, spacing outside the content, and animations unchanged.
- Leave all tool-result blocks and their default collapsed state unchanged.

## Implementation

The frontend reasoning-token formatter will normalize reasoning text before passing it to the existing Markdown renderer. It will:

1. Convert joined bold-boundary markers such as `****` into a closing marker, a blank line, and an opening marker.
2. Preserve valid Markdown headings, paragraphs, lists, emphasis, and code.
3. Stop prefixing each line with `> `.

The Hermes Responses stream will place a blank line between distinct reasoning summary segments when the provider did not supply whitespace. This prevents future segments from being concatenated while preserving the provider text.

Thought collapsibles will receive an initial open state. They will not be forced open after a user manually closes them. Tool-call collapsibles will keep their existing open-state logic.

## Error Handling

Normalization is text-only and must be idempotent. Empty reasoning remains empty, and already-correct Markdown remains unchanged.

## Verification

No automated test suite will be run, per user instruction. Verification will consist of successful production builds and a manual production UI check confirming that multiple Thoughts open by default, render Markdown cleanly, remain collapsible, and do not expand tool-result blocks.
