import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from open_webui.utils.hermes_media import (
    DEFAULT_MAX_BYTES,
    HermesMediaError,
    configured_hermes_media_max_bytes,
    configured_hermes_media_roots,
    open_hermes_image,
)

PNG = b'\x89PNG\r\n\x1a\n'


class HermesMediaTests(unittest.TestCase):
    def test_opens_supported_image_inside_allowed_root(self):
        with tempfile.TemporaryDirectory() as root:
            image_path = Path(root) / 'chart.png'
            image_path.write_bytes(PNG)

            image = open_hermes_image(str(image_path), [str(Path(root) / 'missing'), root])
            try:
                self.assertEqual(image.content_type, 'image/png')
                self.assertEqual(image.size, len(PNG))
                self.assertEqual(image.file.read(), PNG)
            finally:
                image.file.close()

    def test_rejects_paths_outside_allowed_roots_and_sibling_prefixes(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / 'allowed'
            sibling = Path(parent) / 'allowed-other'
            root.mkdir()
            sibling.mkdir()
            image_path = sibling / 'chart.png'
            image_path.write_bytes(PNG)

            with self.assertRaisesRegex(HermesMediaError, 'outside allowed roots'):
                open_hermes_image(str(image_path), [str(root)])

    def test_rejects_symlinks_content_mismatches_and_oversized_images(self):
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            image_path = root_path / 'chart.png'
            image_path.write_bytes(PNG)
            link_path = root_path / 'link.png'
            link_path.symlink_to(image_path)
            fake_path = root_path / 'fake.png'
            fake_path.write_bytes(b'not an image')

            with self.assertRaisesRegex(HermesMediaError, 'symbolic links are not allowed'):
                open_hermes_image(str(link_path), [root])
            with self.assertRaisesRegex(HermesMediaError, 'image content does not match extension'):
                open_hermes_image(str(fake_path), [root])
            with self.assertRaisesRegex(HermesMediaError, 'image too large'):
                open_hermes_image(str(image_path), [root], max_bytes=4)

    def test_pins_validation_and_reads_to_the_same_descriptor(self):
        with tempfile.TemporaryDirectory() as root:
            image_path = Path(root) / 'chart.png'
            original = PNG + b'original'
            image_path.write_bytes(original)

            image = open_hermes_image(str(image_path), [root])
            try:
                image_path.rename(Path(root) / 'original.png')
                image_path.write_bytes(b'replacement secret')
                self.assertEqual(image.file.read(), original)
            finally:
                image.file.close()

    def test_reads_roots_and_size_limit_from_environment(self):
        roots = os.pathsep.join(['/one', '/two'])
        with patch.dict(os.environ, {'HERMES_MEDIA_ROOTS': roots, 'HERMES_MEDIA_MAX_BYTES': '4096'}):
            self.assertEqual(configured_hermes_media_roots(), ['/one', '/two'])
            self.assertEqual(configured_hermes_media_max_bytes(), 4096)
        with patch.dict(os.environ, {'HERMES_MEDIA_MAX_BYTES': 'invalid'}, clear=True):
            self.assertEqual(configured_hermes_media_max_bytes(), DEFAULT_MAX_BYTES)


if __name__ == '__main__':
    unittest.main()
