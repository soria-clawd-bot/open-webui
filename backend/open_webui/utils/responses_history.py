from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ResponsesHistoryCompaction:
    original_bytes: int
    final_bytes: int
    original_tool_output_bytes: int
    final_tool_output_bytes: int
    compacted_tool_outputs: int

    @property
    def compacted(self) -> bool:
        return self.compacted_tool_outputs > 0


def compact_responses_history(
    payload: dict,
    *,
    max_replay_bytes: int,
    max_tool_output_bytes: int,
    preview_bytes: int,
) -> tuple[dict, ResponsesHistoryCompaction]:
    """Bound stateless Responses history without mutating stored chat data.

    Open WebUI persists complete Responses output items so users can inspect
    them later. Stateless providers, however, receive those items again on
    every follow-up. This function operates only on the outbound payload copy:
    older tool results are replaced with a small, deterministic reference while
    the newest results remain verbatim whenever the configured budgets allow.
    """

    original_bytes = _json_bytes(payload)
    input_items = payload.get('input')
    if not isinstance(input_items, list):
        return payload, ResponsesHistoryCompaction(
            original_bytes=original_bytes,
            final_bytes=original_bytes,
            original_tool_output_bytes=0,
            final_tool_output_bytes=0,
            compacted_tool_outputs=0,
        )

    tool_items = [
        (idx, item)
        for idx, item in enumerate(input_items)
        if isinstance(item, dict) and item.get('type') == 'function_call_output'
    ]
    original_tool_bytes = sum(_json_bytes(item.get('output')) for _, item in tool_items)

    updated_payload = payload
    updated_input = input_items
    final_tool_bytes = original_tool_bytes
    compacted_indices: set[int] = set()

    def compact_item(idx: int, item: dict) -> bool:
        nonlocal updated_payload, updated_input, final_tool_bytes

        original_output = item.get('output')
        compact_output = _compact_output(original_output, max(0, preview_bytes))
        original_size = _json_bytes(original_output)
        compact_size = _json_bytes(compact_output)
        if compact_size >= original_size:
            return False

        if updated_payload is payload:
            updated_input = list(input_items)
            updated_payload = {**payload, 'input': updated_input}

        updated_input[idx] = {**item, 'output': compact_output}
        final_tool_bytes += compact_size - original_size
        compacted_indices.add(idx)
        return True

    # Compact oldest results first so current tool-loop results retain their
    # full fidelity. Replacement previews count toward the same budget.
    if max_tool_output_bytes > 0 and final_tool_bytes > max_tool_output_bytes:
        for idx, item in tool_items:
            compact_item(idx, item)
            if final_tool_bytes <= max_tool_output_bytes:
                break

    final_bytes = _json_bytes(updated_payload)

    # The total serialized payload budget is the hard transport guard. If the
    # tool-specific pass was not enough, compact remaining results oldest-first.
    if max_replay_bytes > 0 and final_bytes > max_replay_bytes:
        for idx, item in tool_items:
            if idx in compacted_indices:
                continue
            if compact_item(idx, item):
                final_bytes = _json_bytes(updated_payload)
                if final_bytes <= max_replay_bytes:
                    break

    final_bytes = _json_bytes(updated_payload)
    return updated_payload, ResponsesHistoryCompaction(
        original_bytes=original_bytes,
        final_bytes=final_bytes,
        original_tool_output_bytes=original_tool_bytes,
        final_tool_output_bytes=final_tool_bytes,
        compacted_tool_outputs=len(compacted_indices),
    )


def _compact_output(output: Any, preview_bytes: int) -> str | list[dict[str, str]]:
    raw = _json_data(output)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    marker = (
        '[Earlier tool result compacted by Open WebUI before replay. '
        'The complete result remains in chat storage. '
        f'original_bytes={len(raw)} sha256={digest}]'
    )

    preview = _output_preview(output, preview_bytes)
    if preview:
        marker = f'{marker}\nPreview:\n{preview}'

    if isinstance(output, list):
        return [{'type': 'input_text', 'text': marker}]
    return marker


def _output_preview(output: Any, limit: int) -> str:
    if limit <= 0:
        return ''

    if isinstance(output, str):
        text = output
    elif isinstance(output, list):
        parts = []
        for part in output:
            if not isinstance(part, dict):
                continue
            value = part.get('text') or part.get('content')
            if value is not None:
                parts.append(str(value))
        text = '\n'.join(parts) if parts else _json_data(output).decode('utf-8', 'replace')
    else:
        text = _json_data(output).decode('utf-8', 'replace')

    data = text.encode('utf-8')
    if len(data) <= limit:
        return text
    return data[:limit].decode('utf-8', 'ignore').rstrip() + '…'


def _json_data(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8')


def _json_bytes(value: Any) -> int:
    return len(_json_data(value))
