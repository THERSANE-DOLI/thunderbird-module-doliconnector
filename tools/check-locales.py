#!/usr/bin/env python3
"""Compares every _locales/*/messages.json with the reference en-US one.

Lists, per language: missing keys, keys unknown to en-US, and messages whose $PLACEHOLDER$ tokens
differ from en-US. Run it before each release (see .claude/skills/release/SKILL.md) and tell the
translators which keys are missing.

Usage: tools/check-locales.py [--strict]
  --strict  exit code 1 when a language has missing keys (default: only for invalid JSON, unknown
            keys or placeholder mismatches, a missing key falls back to the default locale)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / '_locales'
REFERENCE = 'en-US'
TOKEN = re.compile(r'\$[A-Za-z0-9_@]+\$')


def load(lang):
    with open(LOCALES / lang / 'messages.json', encoding='utf-8') as f:
        return json.load(f)


def main():
    strict = '--strict' in sys.argv[1:]
    reference = load(REFERENCE)
    failed = False
    for folder in sorted(p.name for p in LOCALES.iterdir() if p.is_dir()):
        if folder == REFERENCE:
            continue
        try:
            messages = load(folder)
        except (OSError, json.JSONDecodeError) as e:
            print(f'{folder}: INVALID ({e})')
            failed = True
            continue
        missing = [k for k in reference if k not in messages]
        unknown = [k for k in messages if k not in reference]
        mismatch = [k for k in reference if k in messages
                    and sorted(TOKEN.findall(reference[k]['message'])) != sorted(TOKEN.findall(messages[k]['message']))]
        done = len(reference) - len(missing)
        print(f'{folder}: {done}/{len(reference)} ({done * 100 // len(reference)} %)')
        for title, keys in (('missing', missing), ('unknown', unknown), ('placeholders differ', mismatch)):
            if keys:
                print(f'  {title}: ' + ', '.join(keys))
        if unknown or mismatch or (strict and missing):
            failed = True
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
