from __future__ import annotations

import copy
import json
import unittest

from open_webui.utils.responses_history import compact_responses_history


def payload_bytes(value) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


class ResponsesHistoryCompactionTests(unittest.TestCase):
    def test_small_payload_is_unchanged(self):
        payload = {
            'model': 'test',
            'input': [
                {'type': 'function_call_output', 'call_id': 'one', 'output': 'small'},
            ],
        }

        result, stats = compact_responses_history(
            payload,
            max_replay_bytes=10_000,
            max_tool_output_bytes=10_000,
            preview_bytes=32,
        )

        self.assertIs(result, payload)
        self.assertFalse(stats.compacted)

    def test_oldest_tool_results_are_compacted_and_newest_is_preserved(self):
        payload = {
            'model': 'test',
            'input': [
                {'type': 'function_call_output', 'call_id': str(idx), 'output': chr(65 + idx) * 2_000}
                for idx in range(4)
            ],
        }
        original = copy.deepcopy(payload)

        result, stats = compact_responses_history(
            payload,
            max_replay_bytes=100_000,
            max_tool_output_bytes=3_000,
            preview_bytes=64,
        )

        self.assertGreater(stats.compacted_tool_outputs, 0)
        self.assertEqual(payload, original, 'outbound compaction must not mutate stored history')
        self.assertIn('complete result remains in chat storage', result['input'][0]['output'])
        self.assertEqual(result['input'][-1]['output'], original['input'][-1]['output'])
        self.assertLessEqual(stats.final_tool_output_bytes, 3_000)

    def test_list_output_keeps_responses_content_shape(self):
        payload = {
            'input': [
                {
                    'type': 'function_call_output',
                    'call_id': 'one',
                    'output': [{'type': 'input_text', 'text': 'large result ' * 1_000}],
                }
            ]
        }

        result, stats = compact_responses_history(
            payload,
            max_replay_bytes=100_000,
            max_tool_output_bytes=1_000,
            preview_bytes=48,
        )

        self.assertTrue(stats.compacted)
        self.assertIsInstance(result['input'][0]['output'], list)
        self.assertEqual(result['input'][0]['output'][0]['type'], 'input_text')

    def test_total_payload_budget_compacts_remaining_tool_history(self):
        payload = {
            'model': 'test',
            'input': [
                {'type': 'function_call_output', 'call_id': str(idx), 'output': 'x' * 4_000}
                for idx in range(5)
            ],
        }

        result, stats = compact_responses_history(
            payload,
            max_replay_bytes=5_000,
            max_tool_output_bytes=100_000,
            preview_bytes=32,
        )

        self.assertTrue(stats.compacted)
        self.assertEqual(stats.final_bytes, payload_bytes(result))
        self.assertLessEqual(stats.final_bytes, 5_000)

    def test_non_tool_oversize_is_reported_without_destroying_messages(self):
        payload = {'input': [{'type': 'message', 'role': 'user', 'content': 'x' * 10_000}]}

        result, stats = compact_responses_history(
            payload,
            max_replay_bytes=1_000,
            max_tool_output_bytes=500,
            preview_bytes=32,
        )

        self.assertIs(result, payload)
        self.assertGreater(stats.final_bytes, 1_000)


if __name__ == '__main__':
    unittest.main()
