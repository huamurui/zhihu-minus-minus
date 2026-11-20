"""Generate an AltStore Classic / SideStore source from a built IPA, offline."""

import argparse
import datetime
import json
import plistlib
import re
import struct
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from zipfile import BadZipFile, ZipFile


SOURCE_FILENAME = "altstore-source.json"
# Subscribers use the published source identifier independently of the IPA's bundle ID.
SOURCE_IDENTIFIER = "com.huamu013.ZhihuMinusMinus.source"
ROOT = Path(__file__).resolve().parent.parent


def require_string(values, key):
    value = values.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing or invalid {key}")
    return value


def unpack(data, offset, format_string):
    size = struct.calcsize(format_string)
    if offset < 0 or offset + size > len(data):
        raise ValueError("Truncated Mach-O or code signature")
    return struct.unpack_from(format_string, data, offset)


def entitlement_keys(data):
    """Read embedded XML entitlements, including all slices of a fat binary.

    Unsigned and ad-hoc signed executables without entitlements return an empty
    set. Never infer permissions from app.json or silently accept a DER-only
    signature that this standard-library parser cannot decode.
    """
    magic = data[:4]
    fat_formats = {
        b"\xca\xfe\xba\xbe": (">", False),
        b"\xbe\xba\xfe\xca": ("<", False),
        b"\xca\xfe\xba\xbf": (">", True),
        b"\xbf\xba\xfe\xca": ("<", True),
    }
    if magic in fat_formats:
        endian, is_64 = fat_formats[magic]
        count = unpack(data, 4, endian + "I")[0]
        keys = set()
        for index in range(count):
            entry = unpack(
                data, 8 + index * (32 if is_64 else 20),
                endian + ("IIQQII" if is_64 else "IIIII"),
            )
            offset, size = entry[2:4]
            if offset + size > len(data):
                raise ValueError("Truncated fat Mach-O slice")
            keys.update(entitlement_keys(data[offset:offset + size]))
        if count == 0:
            raise ValueError("Empty fat Mach-O")
        return keys

    thin_formats = {
        b"\xcf\xfa\xed\xfe": ("<", 32),
        b"\xfe\xed\xfa\xcf": (">", 32),
        b"\xce\xfa\xed\xfe": ("<", 28),
        b"\xfe\xed\xfa\xce": (">", 28),
    }
    if magic not in thin_formats:
        raise ValueError("App executable is not a supported Mach-O")
    endian, header_size = thin_formats[magic]
    count, commands_size = unpack(data, 16, endian + "II")
    commands_end = header_size + commands_size
    if commands_end > len(data):
        raise ValueError("Truncated Mach-O load commands")
    position = header_size
    keys = set()
    for _ in range(count):
        command, size = unpack(data, position, endian + "II")
        if size < 8 or position + size > commands_end:
            raise ValueError("Invalid Mach-O load command")
        if command == 0x1D:  # LC_CODE_SIGNATURE
            if size < 16:
                raise ValueError("Invalid code signature load command")
            offset, length = unpack(data, position + 8, endian + "II")
            if offset + length > len(data):
                raise ValueError("Truncated code signature")
            keys.update(signature_entitlement_keys(data[offset:offset + length]))
        position += size
    if position != commands_end:
        raise ValueError("Mach-O load command size mismatch")
    return keys


def signature_entitlement_keys(signature):
    magic, length, count = unpack(signature, 0, ">III")
    if magic != 0xFADE0CC0 or length > len(signature) or length < 12 + count * 8:
        raise ValueError("Invalid code signature superblob")
    xml = None
    has_der = False
    for index in range(count):
        _, offset = unpack(signature, 12 + index * 8, ">II")
        blob_magic, blob_length = unpack(signature, offset, ">II")
        if blob_length < 8 or offset + blob_length > length:
            raise ValueError("Invalid code signature blob")
        if blob_magic == 0xFADE7171:  # CSMAGIC_EMBEDDED_ENTITLEMENTS
            xml = plistlib.loads(signature[offset + 8:offset + blob_length])
        elif blob_magic == 0xFADE7172:  # DER entitlements
            has_der = True
    if xml is None:
        if has_der:
            raise ValueError("DER-only entitlements are not supported")
        return set()
    if not isinstance(xml, dict):
        raise ValueError("Entitlements must be a plist dictionary")
    return set(xml) - {"application-identifier", "com.apple.developer.team-identifier"}


def read_ipa(ipa_path):
    with ZipFile(ipa_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("IPA contains duplicate archive entries")
        main_plists = [name for name in names if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)]
        if len(main_plists) != 1:
            raise ValueError("Expected exactly one main app Info.plist")
        main_path = main_plists[0]
        main = plistlib.loads(archive.read(main_path))
        if not isinstance(main, dict):
            raise ValueError("App Info.plist must be a dictionary")
        permissions = {}
        entitlements = set()
        bundled_plists = [
            name for name in names
            if name == main_path or re.fullmatch(r"Payload/[^/]+\.app/.+\.appex/Info\.plist", name)
        ]
        for plist_path in sorted(bundled_plists):
            info = plistlib.loads(archive.read(plist_path))
            if not isinstance(info, dict):
                raise ValueError("Bundle Info.plist must be a dictionary")
            executable = require_string(info, "CFBundleExecutable")
            if "/" in executable or executable in (".", ".."):
                raise ValueError("Invalid bundle executable name")
            binary_path = str(PurePosixPath(plist_path).parent / executable)
            entitlements.update(entitlement_keys(archive.read(binary_path)))
            for key, value in sorted(info.items()):
                if "UsageDescription" not in key:
                    continue
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"Unsupported privacy description: {key}")
                if key in permissions and permissions[key] != value:
                    raise ValueError(f"Conflicting privacy descriptions: {key}")
                permissions[key] = value
        return main, {"entitlements": sorted(entitlements), "privacy": permissions}


def generate_source(ipa_path, config, repository, commit, date):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid GitHub repository")
    if not re.fullmatch(r"[a-fA-F0-9]{40}", commit):
        raise ValueError("Expected an immutable Git commit SHA")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("Expected an ISO release date (YYYY-MM-DD)")
    datetime.date.fromisoformat(date)
    expo = config["expo"]
    info, permissions = read_ipa(ipa_path)
    version = require_string(info, "CFBundleShortVersionString")
    bundle_id = require_string(info, "CFBundleIdentifier")
    if version != expo["version"] or bundle_id != expo["ios"]["bundleIdentifier"]:
        raise ValueError("IPA version or bundle identifier does not match app.json")
    expected_name = f"zhihu-minus-minus-v{version}-unsigned.ipa"
    if ipa_path.name != expected_name:
        raise ValueError(f"Expected IPA filename: {expected_name}")
    website = f"https://github.com/{repository}"
    icon_url = f"https://raw.githubusercontent.com/{repository}/{commit}/src/assets/images/icon.png"
    name = info.get("CFBundleDisplayName") or require_string(info, "CFBundleName")
    if not isinstance(name, str):
        raise ValueError("Invalid app display name")
    return {
        "name": "Zhihu--",
        "identifier": SOURCE_IDENTIFIER,
        "sourceURL": f"{website}/releases/latest/download/{SOURCE_FILENAME}",
        "subtitle": "轻量、无广告的第三方知乎客户端",
        "website": website,
        "iconURL": icon_url,
        "apps": [{
            "name": name,
            "bundleIdentifier": bundle_id,
            "developerName": "huamurui",
            "localizedDescription": "轻量、无广告的第三方知乎客户端，支持浏览、搜索、收藏和创作。",
            "iconURL": icon_url,
            "category": "social",
            "versions": [{
                "version": version,
                "buildVersion": require_string(info, "CFBundleVersion"),
                "date": date,
                "downloadURL": f"{website}/releases/download/{quote('v' + version, safe='')}/{quote(ipa_path.name, safe='')}",
                "size": ipa_path.stat().st_size,
                "minOSVersion": require_string(info, "MinimumOSVersion"),
            }],
            "appPermissions": permissions,
        }],
        "news": [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ipa", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--config", default=ROOT / "app.json", type=Path)
    args = parser.parse_args()
    try:
        source = generate_source(
            args.ipa, json.loads(args.config.read_text(encoding="utf-8")),
            args.repository, args.commit, args.date,
        )
        args.output.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (ValueError, KeyError, OSError, BadZipFile, struct.error) as error:
        parser.exit(1, f"Cannot generate AltStore source: {error}\n")


if __name__ == "__main__":
    main()
