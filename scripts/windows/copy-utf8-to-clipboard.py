#!/usr/bin/env python3
from __future__ import annotations

import ctypes
from ctypes import wintypes
from pathlib import Path
import sys
import time

CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002
OPEN_RETRIES = 40
OPEN_RETRY_SECONDS = 0.05


class ClipboardError(RuntimeError):
    pass


def read_utf8_text(path: Path) -> str:
    try:
        text = path.read_bytes().decode("utf-8-sig")
    except FileNotFoundError as exc:
        raise ClipboardError("SOURCE_FILE_NOT_FOUND") from exc
    except UnicodeDecodeError as exc:
        raise ClipboardError("SOURCE_FILE_NOT_UTF8") from exc
    if "\x00" in text:
        raise ClipboardError("SOURCE_TEXT_CONTAINS_NUL")
    return text


def _windows_apis():
    if sys.platform != "win32":
        raise ClipboardError("WINDOWS_REQUIRED")

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    user32.IsClipboardFormatAvailable.restype = wintypes.BOOL

    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HANDLE
    kernel32.GlobalLock.argtypes = [wintypes.HANDLE]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HANDLE]
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalFree.argtypes = [wintypes.HANDLE]
    kernel32.GlobalFree.restype = wintypes.HANDLE

    return user32, kernel32


def _open_clipboard(user32) -> None:
    for _ in range(OPEN_RETRIES):
        if user32.OpenClipboard(None):
            return
        time.sleep(OPEN_RETRY_SECONDS)
    raise ClipboardError(f"OPEN_CLIPBOARD_FAILED_{ctypes.get_last_error()}")


def set_unicode_text(text: str) -> None:
    user32, kernel32 = _windows_apis()
    payload = text.encode("utf-16-le") + b"\x00\x00"
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(payload))
    if not handle:
        raise ClipboardError(f"GLOBAL_ALLOC_FAILED_{ctypes.get_last_error()}")

    ownership_transferred = False
    try:
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            raise ClipboardError(f"GLOBAL_LOCK_FAILED_{ctypes.get_last_error()}")
        try:
            ctypes.memmove(pointer, payload, len(payload))
        finally:
            kernel32.GlobalUnlock(handle)

        _open_clipboard(user32)
        try:
            if not user32.EmptyClipboard():
                raise ClipboardError(f"EMPTY_CLIPBOARD_FAILED_{ctypes.get_last_error()}")
            if not user32.SetClipboardData(CF_UNICODETEXT, handle):
                raise ClipboardError(f"SET_CLIPBOARD_FAILED_{ctypes.get_last_error()}")
            ownership_transferred = True
        finally:
            user32.CloseClipboard()
    finally:
        if not ownership_transferred:
            kernel32.GlobalFree(handle)


def get_unicode_text() -> str:
    user32, kernel32 = _windows_apis()
    _open_clipboard(user32)
    try:
        if not user32.IsClipboardFormatAvailable(CF_UNICODETEXT):
            raise ClipboardError("CF_UNICODETEXT_NOT_AVAILABLE")
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            raise ClipboardError(f"GET_CLIPBOARD_FAILED_{ctypes.get_last_error()}")
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            raise ClipboardError(f"GLOBAL_LOCK_FAILED_{ctypes.get_last_error()}")
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def copy_file(path: Path) -> None:
    expected = read_utf8_text(path)
    set_unicode_text(expected)
    actual = get_unicode_text()
    if actual != expected:
        raise ClipboardError(
            f"ROUNDTRIP_MISMATCH_EXPECTED_{len(expected)}_ACTUAL_{len(actual)}"
        )
    print("SOURCE_ENCODING=UTF-8")
    print(f"SOURCE_BYTES={path.stat().st_size}")
    print(f"SOURCE_CHARACTERS={len(expected)}")
    print("CLIPBOARD_FORMAT=CF_UNICODETEXT")
    print("CLIPBOARD_UNICODE_ROUNDTRIP=PASS")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("ERROR=USAGE_COPY_UTF8_TO_CLIPBOARD_FILE", file=sys.stderr)
        return 2
    try:
        copy_file(Path(argv[1]).resolve())
        return 0
    except ClipboardError as exc:
        print(f"ERROR={exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}".encode("ascii", "backslashreplace").decode("ascii")
        print(f"ERROR={message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
