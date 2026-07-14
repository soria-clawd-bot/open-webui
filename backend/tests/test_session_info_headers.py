from __future__ import annotations

import os
import unittest

os.environ.setdefault('WEBUI_SECRET_KEY', 'test-session-info-secret-key')

from open_webui.utils.headers import include_session_info_headers


class SessionInfoHeadersTests(unittest.TestCase):
    def test_primary_chat_forwards_chat_and_message_ids(self):
        result = include_session_info_headers(
            {'Authorization': 'Bearer test'},
            {'chat_id': 'chat-123', 'message_id': 'message-456'},
        )

        self.assertEqual(result['X-OpenWebUI-Chat-Id'], 'chat-123')
        self.assertEqual(result['X-OpenWebUI-Message-Id'], 'message-456')
        self.assertEqual(result['Authorization'], 'Bearer test')

    def test_auxiliary_task_does_not_forward_session_ids(self):
        result = include_session_info_headers(
            {},
            {'chat_id': 'chat-123', 'message_id': 'message-456', 'task': 'title_generation'},
        )

        self.assertNotIn('X-OpenWebUI-Chat-Id', result)
        self.assertNotIn('X-OpenWebUI-Message-Id', result)

    def test_missing_chat_id_forwards_nothing(self):
        result = include_session_info_headers({}, {'message_id': 'message-456'})

        self.assertEqual(result, {})


if __name__ == '__main__':
    unittest.main()
