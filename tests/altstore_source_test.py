"""Offline IPA fixtures for the release source generator (run by Jest)."""

import importlib.util
import json
import plistlib
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/generate-altstore-source.py"
SPEC = importlib.util.spec_from_file_location("altstore_source", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
COMMIT = "a" * 40


def macho(signature=None):
    command = b"" if signature is None else struct.pack("<IIII", 0x1D, 16, 48, len(signature))
    header = struct.pack("<IIIIIIII", 0xFEEDFACF, 0x100000C, 0, 2, bool(command), len(command), 0, 0)
    return header + command + (signature or b"")


def signature(entitlements=None, der_only=False):
    if entitlements is None and not der_only:
        return struct.pack(">III", 0xFADE0CC0, 12, 0)
    payload = b"DER" if der_only else plistlib.dumps(entitlements)
    blob = struct.pack(">II", 0xFADE7172 if der_only else 0xFADE7171, 8 + len(payload)) + payload
    return struct.pack(">IIIII", 0xFADE0CC0, 20 + len(blob), 1, 7 if der_only else 5, 20) + blob


class AltStoreSourceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.ipa = Path(self.directory.name) / "zhihu-minus-minus-v1.2.3-unsigned.ipa"
        self.output = Path(self.directory.name) / "source.json"
        self.info = {
            "CFBundleDisplayName": "知乎--",
            "CFBundleName": "ZhihuMinusMinus",
            "CFBundleIdentifier": "com.example.ZhihuMinusMinus",
            "CFBundleShortVersionString": "1.2.3",
            "CFBundleVersion": "456",
            "CFBundleExecutable": "ZhihuMinusMinus",
            "MinimumOSVersion": "16.0",
            "NSPhotoLibraryUsageDescription": "选择发布图片",
            "NSCameraUsageDescription": "拍摄发布图片",
        }
        self.config = {"expo": {"version": "1.2.3", "ios": {"bundleIdentifier": "com.example.ZhihuMinusMinus"}}}

    def write_ipa(self, info=None, binary=None, extensions=None, second_app=False):
        with ZipFile(self.ipa, "w") as archive:
            archive.writestr("Payload/ZhihuMinusMinus.app/Info.plist", plistlib.dumps(info or self.info, fmt=plistlib.FMT_BINARY))
            archive.writestr("Payload/ZhihuMinusMinus.app/ZhihuMinusMinus", binary if binary is not None else macho())
            for name, extension_info, extension_binary in extensions or []:
                base = f"Payload/ZhihuMinusMinus.app/PlugIns/{name}.appex"
                archive.writestr(f"{base}/Info.plist", plistlib.dumps(extension_info))
                archive.writestr(f"{base}/{extension_info['CFBundleExecutable']}", extension_binary)
            if second_app:
                archive.writestr("Payload/Other.app/Info.plist", plistlib.dumps(self.info))

    def generate(self, **overrides):
        arguments = {
            "ipa_path": self.ipa, "config": self.config,
            "repository": "example/zhihu-minus-minus", "commit": COMMIT, "date": "2026-10-05",
        }
        arguments.update(overrides)
        return MODULE.generate_source(**arguments)

    def test_real_metadata_and_byte_size(self):
        self.write_ipa()
        source = self.generate()
        app = source["apps"][0]
        version = app["versions"][0]
        self.assertEqual(source["identifier"], "com.huamu013.ZhihuMinusMinus.source")
        self.assertEqual(app["name"], "知乎--")
        self.assertEqual(app["bundleIdentifier"], self.info["CFBundleIdentifier"])
        self.assertEqual(version["version"], "1.2.3")
        self.assertEqual(version["buildVersion"], "456")
        self.assertEqual(version["size"], self.ipa.stat().st_size)
        self.assertEqual(version["minOSVersion"], "16.0")
        self.assertEqual(version["downloadURL"], "https://github.com/example/zhihu-minus-minus/releases/download/v1.2.3/zhihu-minus-minus-v1.2.3-unsigned.ipa")
        self.assertEqual(source["sourceURL"], "https://github.com/example/zhihu-minus-minus/releases/latest/download/altstore-source.json")
        icon_url = f"https://raw.githubusercontent.com/example/zhihu-minus-minus/{COMMIT}/src/assets/images/icon.png"
        self.assertEqual(source["iconURL"], icon_url)
        self.assertEqual(app["iconURL"], icon_url)
        self.assertEqual(app["appPermissions"], {"entitlements": [], "privacy": {
            "NSCameraUsageDescription": "拍摄发布图片", "NSPhotoLibraryUsageDescription": "选择发布图片",
        }})
        self.assertNotIn("marketplaceID", app)
        self.assertNotIn("build", version)

    def test_identical_inputs_are_reproducible(self):
        self.write_ipa()
        self.assertEqual(json.dumps(self.generate()), json.dumps(self.generate()))

    def test_app_name_falls_back_to_bundle_name(self):
        info = dict(self.info)
        del info["CFBundleDisplayName"]
        self.write_ipa(info=info)
        self.assertEqual(self.generate()["apps"][0]["name"], "ZhihuMinusMinus")

    def test_ad_hoc_signature_without_entitlements(self):
        self.write_ipa(binary=macho(signature()))
        self.assertEqual(self.generate()["apps"][0]["appPermissions"]["entitlements"], [])

    def test_embedded_entitlements_and_extension_privacy_are_included(self):
        self.write_ipa(
            binary=macho(signature({"application-identifier": "redacted", "com.apple.developer.team-identifier": "redacted", "com.apple.security.application-groups": ["group.example"]})),
            extensions=[("Share", {"CFBundleExecutable": "Share", "NSMicrophoneUsageDescription": "录制声音"}, macho(signature({"com.apple.developer.siri": True})))],
        )
        permissions = self.generate()["apps"][0]["appPermissions"]
        self.assertEqual(permissions["entitlements"], ["com.apple.developer.siri", "com.apple.security.application-groups"])
        self.assertEqual(permissions["privacy"]["NSMicrophoneUsageDescription"], "录制声音")

    def test_fat_binary_permissions_union(self):
        slices = [macho(), macho(signature({"com.apple.developer.siri": True}))]
        offset = 8 + 20 * len(slices)
        entries = b""
        for binary in slices:
            entries += struct.pack(">IIIII", 0x100000C, 0, offset, len(binary), 0)
            offset += len(binary)
        binary = struct.pack(">II", 0xCAFEBABE, len(slices)) + entries + b"".join(slices)
        self.assertEqual(MODULE.entitlement_keys(binary), {"com.apple.developer.siri"})

    def test_der_only_permissions_fail_closed(self):
        self.write_ipa(binary=macho(signature(der_only=True)))
        with self.assertRaisesRegex(ValueError, "DER-only"):
            self.generate()

    def test_version_and_bundle_id_must_match_config(self):
        for key, value in [("CFBundleShortVersionString", "9.9.9"), ("CFBundleIdentifier", "com.other.app")]:
            with self.subTest(key=key):
                self.write_ipa(info={**self.info, key: value})
                with self.assertRaisesRegex(ValueError, "does not match"):
                    self.generate()

    def test_missing_metadata_fails(self):
        for key in ["MinimumOSVersion", "CFBundleVersion", "CFBundleExecutable"]:
            with self.subTest(key=key):
                info = dict(self.info)
                del info[key]
                self.write_ipa(info=info)
                with self.assertRaisesRegex(ValueError, key):
                    self.generate()

    def test_filename_must_match_release_name(self):
        self.write_ipa()
        renamed = self.ipa.with_name("other.ipa")
        self.ipa.rename(renamed)
        with self.assertRaisesRegex(ValueError, "Expected IPA filename"):
            self.generate(ipa_path=renamed)

    def test_reject_multiple_main_apps(self):
        self.write_ipa(second_app=True)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            self.generate()

    def test_conflicting_extension_privacy_fails(self):
        self.write_ipa(extensions=[("Share", {"CFBundleExecutable": "Share", "NSCameraUsageDescription": "不同用途"}, macho())])
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.generate()

    def test_structured_privacy_requires_explicit_support(self):
        self.write_ipa(info={**self.info, "NSLocationTemporaryUsageDescriptionDictionary": {"reason": "位置"}})
        with self.assertRaisesRegex(ValueError, "Unsupported privacy"):
            self.generate()

    def test_invalid_repository_commit_and_date(self):
        self.write_ipa()
        for arguments in [{"repository": "bad/path/extra"}, {"commit": "main"}, {"date": "2026-2-01"}, {"date": "2026-02-30"}]:
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                self.generate(**arguments)

    def test_invalid_executable_is_rejected(self):
        for binary in [b"not a binary", macho()[:20], struct.pack("<IIIIIIII", 0xFEEDFACF, 0x100000C, 0, 2, 1, 8, 0, 0) + struct.pack("<II", 1, 0)]:
            with self.subTest(binary=binary):
                self.write_ipa(binary=binary)
                with self.assertRaises(ValueError):
                    self.generate()

    def test_cli_writes_source_only_after_validation(self):
        self.write_ipa()
        config_path = Path(self.directory.name) / "app.json"
        config_path.write_text(json.dumps(self.config))
        arguments = [sys.executable, "-B", str(SCRIPT), "--ipa", str(self.ipa), "--output", str(self.output), "--config", str(config_path), "--repository", "example/zhihu-minus-minus", "--commit", COMMIT, "--date", "2026-10-05"]
        success = subprocess.run(arguments, capture_output=True, text=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(self.output.read_text()), self.generate())
        self.output.unlink()
        self.write_ipa(info={**self.info, "CFBundleVersion": ""})
        failure = subprocess.run(arguments, capture_output=True, text=True)
        self.assertEqual(failure.returncode, 1)
        self.assertIn("CFBundleVersion", failure.stderr)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
