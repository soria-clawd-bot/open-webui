# Mid-Run Steering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a text message submitted during an active Hermes response steer that exact agent run while its existing SSE stream continues.

**Architecture:** Hermes registers each streaming Responses request by response ID, accepts idempotent steering requests, calls the existing `AIAgent.steer()`, and inserts a custom steering output item into the same stream. Open WebUI captures the response ID early, proxies steering through its authenticated OpenAI connection, renders the custom item in sequence, and queues only when steering is no longer possible.

**Tech Stack:** Python 3, aiohttp, FastAPI, Svelte 4, TypeScript, OpenAI Responses SSE.

---

### Task 1: Add the Hermes Response Steering Endpoint

**Files:**
- Modify: `gateway/platforms/api_server.py:850-930`
- Modify: `gateway/platforms/api_server.py:2660-3410`
- Modify: `gateway/platforms/api_server.py:5035-5090`

- [ ] **Step 1: Register active streaming Responses state**

Add an instance map:

```python
self._active_response_streams: Dict[str, Dict[str, Any]] = {}
```

After creating `response_id`, register `agent_ref`, `_stream_q`, and a request-ID set before entering `_write_sse_responses`. Remove the entry in a `finally` block when the stream ends.

- [ ] **Step 2: Implement authenticated, idempotent steering**

Add `POST /v1/responses/{response_id}/steer`. Parse `{input, request_id}`, reject empty text, return 404 for an unknown response, 409 when the response is no longer active or the agent is not ready, and call:

```python
accepted = bool(agent.steer(input_text))
```

On success, store `request_id` and queue:

```python
stream_q.put(("__steered__", {
    "text": input_text,
    "request_id": request_id,
}))
```

A repeated `request_id` returns accepted without calling `steer()` again.

- [ ] **Step 3: Emit a chronological steering output item**

Teach `_dispatch` to flush text, close the current Thought, and emit an item shaped as:

```python
{
    "id": f"steer_{uuid.uuid4().hex[:24]}",
    "type": "open_webui:steering",
    "status": "completed",
    "role": "user",
    "request_id": payload.get("request_id", ""),
    "content": [{"type": "input_text", "text": payload.get("text", "")}],
}
```

Emit standard `response.output_item.added` and `response.output_item.done` events and append the item to `emitted_items` so completion snapshots and refreshes retain it.

- [ ] **Step 4: Advertise the capability and route**

Add `response_steering: true` and the endpoint descriptor to `/v1/capabilities`, then register the POST route alongside the existing Responses routes.

- [ ] **Step 5: Run syntax compilation and commit**

Run: `python -m py_compile gateway/platforms/api_server.py`
Expected: exit status 0 with no output.

```bash
git add gateway/platforms/api_server.py
git commit -m "feat: steer active Responses runs"
```

### Task 2: Proxy Steering Through Open WebUI

**Files:**
- Modify: `backend/open_webui/routers/openai.py:1460-1565`
- Modify: `src/lib/apis/openai/index.ts:228-275`

- [ ] **Step 1: Add the verified-user proxy route**

Define a Pydantic form with `model`, `input`, and `request_id`. Resolve the model's connection exactly as `/responses` does, then POST to:

```python
request_url = f'{url}/responses/{response_id}/steer'
```

Forward the configured provider headers/cookies and pass through the upstream JSON body and status. Apply the existing model-access check before proxying.

- [ ] **Step 2: Add the frontend API helper**

```ts
export const steerOpenAIResponse = async (
\ttoken: string,
\tresponseId: string,
\tbody: { model: string; input: string; request_id: string }
) => {
\tconst res = await fetch(`${OPENAI_API_BASE_URL}/responses/${encodeURIComponent(responseId)}/steer`, {
\t\tmethod: 'POST',
\t\theaders: {
\t\t\tAuthorization: `Bearer ${token}`,
\t\t\t'Content-Type': 'application/json'
\t\t},
\t\tbody: JSON.stringify(body)
\t});
\tconst data = await res.json();
\treturn { ok: res.ok, status: res.status, data };
};
```

- [ ] **Step 3: Run backend syntax and frontend type checks**

Run: `python -m py_compile backend/open_webui/routers/openai.py`
Expected: exit status 0.

Run: `npm run check`
Expected: no new TypeScript/Svelte errors.

- [ ] **Step 4: Commit the proxy**

```bash
git add backend/open_webui/routers/openai.py src/lib/apis/openai/index.ts
git commit -m "feat: proxy Hermes response steering"
```

### Task 3: Capture the Active Provider Response ID

**Files:**
- Modify: `backend/open_webui/utils/middleware.py:424-750`
- Modify: `backend/open_webui/utils/middleware.py:3890-4140`
- Modify: `src/lib/components/chat/Chat.svelte:1962-2035`

- [ ] **Step 1: Extract IDs from early Responses events**

Handle `response.created` and `response.in_progress` by returning metadata containing the envelope ID:

```python
elif event_type in ('response.created', 'response.in_progress'):
    response_id = data.get('response', {}).get('id')
    return current_output, {'response_id': response_id} if response_id else None
```

- [ ] **Step 2: Emit and persist the ID**

When middleware receives `response_id`, set `last_response_id`, preserve it in `processed_data`, and immediately upsert `{'response_id': response_id}` on the active assistant message. Do not remove it from the frontend event payload.

- [ ] **Step 3: Store the ID in in-memory chat history**

Extend `chatCompletionEventHandler` to read `response_id` and assign:

```ts
if (response_id) {
\tmessage.responseId = response_id;
}
```

- [ ] **Step 4: Run syntax and type checks, then commit**

Run: `python -m py_compile backend/open_webui/utils/middleware.py`
Run: `npm run check`
Expected: both commands succeed without new errors.

```bash
git add backend/open_webui/utils/middleware.py src/lib/components/chat/Chat.svelte
git commit -m "feat: retain active Responses IDs in chat"
```

### Task 4: Render Steering Items in Sequence

**Files:**
- Modify: `src/lib/components/chat/Messages/structuredOutput.ts:1-330`
- Modify: `src/lib/components/chat/Messages/StructuredOutputRenderer.svelte:1-150`

- [ ] **Step 1: Add a steering display item**

Extend `OutputDisplayItem` with `{ type: 'steering'; id: string; text: string }`. When `item.type === 'open_webui:steering'`, flush pending details and read its content parts into this display item.

- [ ] **Step 2: Render the in-stream user direction**

Render steering items right-aligned without Markdown interpretation:

```svelte
{:else if displayItem.type === 'steering'}
\t<div class="my-2 flex justify-end">
\t\t<div class="max-w-[85%] rounded-3xl bg-gray-100 px-4 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-100 whitespace-pre-wrap">
\t\t\t{displayItem.text}
\t\t</div>
\t</div>
```

- [ ] **Step 3: Run the frontend check and commit**

Run: `npm run check`
Expected: no new discriminated-union or Svelte errors.

```bash
git add src/lib/components/chat/Messages/structuredOutput.ts src/lib/components/chat/Messages/StructuredOutputRenderer.svelte
git commit -m "feat: render in-stream steering messages"
```

### Task 5: Route Active Sends to Steering

**Files:**
- Modify: `src/lib/components/chat/Chat.svelte:2180-2220`

- [ ] **Step 1: Attempt steering before queue or interruption behavior**

When the current assistant is generating, has `responseId`, the prompt is text, and no files are attached, call `steerOpenAIResponse` with a UUID request ID. On success, clear the composer and return while leaving `taskIds` and the SSE untouched.

- [ ] **Step 2: Preserve safe fallback behavior**

For HTTP 404/409, or if no response ID exists yet, use the existing message queue. For network/server failure, show a warning and queue the text. Never call `stopResponse()` for a steerable Hermes response. File-bearing sends keep the existing queue path.

- [ ] **Step 3: Build production assets and commit**

Run: `npm run build`
Expected: Vite production build succeeds.

```bash
git add src/lib/components/chat/Chat.svelte
git commit -m "feat: steer active Hermes chats from composer"
```

### Task 6: Deploy and Manually Verify Steering

- [ ] **Step 1:** Deploy Hermes first and confirm `/v1/capabilities` advertises `response_steering`.
- [ ] **Step 2:** Deploy Open WebUI and confirm its health endpoint responds.
- [ ] **Step 3:** Start a long-running chat, wait for a tool or Thought event, send a second text instruction, and confirm it appears inside the same assistant event sequence.
- [ ] **Step 4:** Confirm the existing response keeps streaming, no second task starts, and Hermes follows the new direction at the next safe boundary.
- [ ] **Step 5:** Refresh after steering and confirm the steering item remains in the saved output.
- [ ] **Step 6:** Send after the run has just completed and confirm the text enters the normal next-turn queue exactly once.
- [ ] **Step 7:** Push both repository branches and confirm each is up to date with its fork remote.
