from __future__ import annotations

import errno
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

IMAGE_CONTENT_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
}
DEFAULT_MAX_BYTES = 20 * 1024 * 1024


class HermesMediaError(ValueError):
    pass


@dataclass
class OpenedHermesImage:
    file: BinaryIO
    content_type: str
    size: int


def configured_hermes_media_roots() -> list[str]:
    return [root.strip() for root in os.getenv('HERMES_MEDIA_ROOTS', '').split(os.pathsep) if root.strip()]


def configured_hermes_media_max_bytes() -> int:
    try:
        value = int(os.getenv('HERMES_MEDIA_MAX_BYTES', str(DEFAULT_MAX_BYTES)))
    except ValueError:
        return DEFAULT_MAX_BYTES
    return value if value > 0 else DEFAULT_MAX_BYTES


def _detect_image_content_type(header: bytes) -> str | None:
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if header.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if header.startswith((b'GIF87a', b'GIF89a')):
        return 'image/gif'
    if len(header) >= 12 and header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    return None


def open_hermes_image(
    requested_path: str,
    allowed_roots: list[str],
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> OpenedHermesImage:
    path = Path(requested_path)
    if not path.is_absolute():
        raise HermesMediaError('image path must be absolute')

    expected_content_type = IMAGE_CONTENT_TYPES.get(path.suffix.lower())
    if expected_content_type is None:
        raise HermesMediaError('unsupported image type')

    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        if error.errno == errno.ELOOP:
            raise HermesMediaError('symbolic links are not allowed') from error
        raise

    file = os.fdopen(descriptor, 'rb', closefd=True)
    try:
        descriptor_path = Path(os.readlink(f'/proc/self/fd/{descriptor}'))
        resolved_roots = []
        for root in allowed_roots:
            try:
                resolved_roots.append(Path(root).resolve(strict=True))
            except OSError:
                continue
        if not any(descriptor_path == root or descriptor_path.is_relative_to(root) for root in resolved_roots):
            raise HermesMediaError('outside allowed roots')

        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise HermesMediaError('not a regular file')
        if metadata.st_size > max_bytes:
            raise HermesMediaError('image too large')

        header = os.pread(descriptor, 12, 0)
        detected_content_type = _detect_image_content_type(header)
        if detected_content_type != expected_content_type:
            raise HermesMediaError('image content does not match extension')

        return OpenedHermesImage(
            file=file,
            content_type=detected_content_type,
            size=metadata.st_size,
        )
    except Exception:
        file.close()
        raise
