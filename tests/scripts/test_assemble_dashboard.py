"""Tests for scripts/assemble_dashboard.py — module concatenation build step."""
import os

import assemble_dashboard as asm


class TestAssemble:
    def test_matches_manifest_concatenation(self):
        expected = b""
        for name in asm.MANIFEST:
            with open(os.path.join(asm.SRC, name), "rb") as fh:
                expected += fh.read()
        assert asm.assemble() == expected

    def test_all_manifest_files_exist(self):
        for name in asm.MANIFEST:
            assert os.path.exists(os.path.join(asm.SRC, name)), name

    def test_output_is_nonempty_bytes(self):
        built = asm.assemble()
        assert isinstance(built, bytes)
        assert len(built) > 0
