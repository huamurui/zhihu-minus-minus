#!/usr/bin/env bash
# JVM regression for the installed Expo AES functions and Android 8 output bounds.
# Requires JDK 17+, Node.js, and either kotlinc or a cached Kotlin compiler.
# Optional: KOTLIN_COMPILER_CLASSPATH containing compiler and runtime dependencies.
# This does not replace Android 8/armeabi-v7a device and Keystore validation.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cipher_source="$repo_root/node_modules/expo-crypto/android/src/main/java/expo/modules/crypto/aes/extensions/CipherExtensions.kt"
if [[ ! -f "$cipher_source" ]]; then
  echo 'Install locked dependencies with npm ci before running this regression.' >&2
  exit 1
fi

build_dir="$(mktemp -d "${TMPDIR:-/tmp}/zhihu-auth-crypto.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
mkdir -p "$build_dir/classes" "$build_dir/results"
sources=(
  "$cipher_source"
  "$repo_root/tests/native/AuthCryptoSealedData.kt"
  "$repo_root/tests/native/AuthCryptoRegression.kt"
)

if command -v kotlinc >/dev/null 2>&1 && [[ -z "${KOTLIN_COMPILER_CLASSPATH:-}" ]]; then
  kotlinc -jvm-target 17 -include-runtime -d "$build_dir/regression.jar" "${sources[@]}"
  java -jar "$build_dir/regression.jar" "$build_dir/results"
else
  # Resolve complete, already-cached compiler dependencies; never install tools.
  python3 - "${GRADLE_USER_HOME:-$HOME/.gradle}" > "$build_dir/compiler-paths" <<'PY'
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

custom = os.environ.get('KOTLIN_COMPILER_CLASSPATH')
if custom:
    jars = [Path(entry) for entry in custom.split(os.pathsep)]
    stdlib = next((jar for jar in jars if re.fullmatch(r'kotlin-stdlib-[\d.]+\.jar', jar.name)), None)
    if not stdlib or any(not jar.is_file() for jar in jars):
        raise SystemExit('KOTLIN_COMPILER_CLASSPATH must contain existing compiler dependencies, including kotlin-stdlib-<version>.jar.')
    print(custom)
    print(stdlib)
    sys.exit(0)

cache = Path(sys.argv[1]) / 'caches/modules-2/files-2.1'
compiler_root = cache / 'org.jetbrains.kotlin/kotlin-compiler-embeddable'
namespace = {'m': 'http://maven.apache.org/POM/4.0.0'}

def version_key(path):
    return tuple(int(part) for part in path.name.split('.'))

def jar_at(group, artifact, version):
    return next((cache / group / artifact / version).glob(f'*/{artifact}-{version}.jar'), None)

versions = sorted((path for path in compiler_root.glob('*')
                   if re.fullmatch(r'\d+(?:\.\d+)*', path.name)), key=version_key, reverse=True)
for version in versions:
    compiler = jar_at('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', version.name)
    pom = next(version.glob('*/kotlin-compiler-embeddable-*.pom'), None)
    annotations = jar_at('org.jetbrains', 'annotations', '13.0')
    if not compiler or not pom or not annotations:
        continue
    jars, stdlib = [compiler, annotations], None
    for dependency in ET.parse(pom).findall('./m:dependencies/m:dependency', namespace):
        group = dependency.findtext('m:groupId', namespaces=namespace)
        artifact = dependency.findtext('m:artifactId', namespaces=namespace)
        dependency_version = dependency.findtext('m:version', namespaces=namespace)
        if not group or not artifact or not dependency_version:
            break
        jar = jar_at(group, artifact, dependency_version)
        if not jar:
            break
        jars.append(jar)
        if artifact == 'kotlin-stdlib':
            stdlib = jar
    else:
        if stdlib:
            print(os.pathsep.join(str(jar) for jar in jars))
            print(stdlib)
            sys.exit(0)
raise SystemExit('No complete cached Kotlin compiler found. Install kotlinc or set KOTLIN_COMPILER_CLASSPATH; this script does not download tools.')
PY
  compiler_cp="$(sed -n '1p' "$build_dir/compiler-paths")"
  stdlib_jar="$(sed -n '2p' "$build_dir/compiler-paths")"
  java -cp "$compiler_cp" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
    -no-stdlib -no-reflect -jvm-target 17 -classpath "$stdlib_jar" \
    -d "$build_dir/classes" "${sources[@]}"
  java -cp "$build_dir/classes:$stdlib_jar" AuthCryptoRegressionKt "$build_dir/results"
fi

# Validate the UTF-8 payload with a real JSON parser, as account recovery does.
node --input-type=module - "$build_dir/results" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
for (const provider of ['android8-upper-bound', 'exact-output-bound']) {
  const snapshot = JSON.parse(readFileSync(join(process.argv[2], `${provider}.json`), 'utf8'));
  assert.deepEqual(snapshot, { state: { accounts: [], label: '合成🙂 é' }, version: 2 });
}
console.log('Passed both UTF-8 JSON account snapshot checks.');
JS
