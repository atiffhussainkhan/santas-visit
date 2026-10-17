#!/usr/bin/env python3
"""File integrity: every source file exists AND actually parses.

The first version of this counted braces and parens. That is not syntax
validation — balanced and invalid JavaScript passes it happily — and it missed
a real defect where a comment edit left an unclosed parenthesis in index.html.

So it now parses. JavaScriptCore ships with macOS, so `osascript -l JavaScript`
is the parser when there is no `node`; if neither is available the check says so
out loud rather than pretending a character count was a compile.
"""
import os
import subprocess
import sys

JS_FILES = ("santa.js", "santa-photo.js", "engine.js", "postcards.js", "export.js")
HTML_FILES = ("index.html", "mobile_test.html", "tools/quality-check.html")


def parser():
    """Return (name, function) or (None, None) if no JS engine is available."""
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
        return "node", "node"
    except Exception:
        pass
    # JXA is the same engine Safari uses; it reports syntax errors on stderr.
    try:
        subprocess.run(["osascript", "-l", "JavaScript", "-e", "1+1"],
                       capture_output=True, check=True)
        return "osascript", "osascript"
    except Exception:
        return None, None


def check_js(path, src, how):
    if how == "node":
        # `node --check` takes a FILE. Handing it index.html made the suite
        # fail on both HTML files whenever node was installed, because it was
        # handed markup instead of the extracted script. Write the source to a
        # real .js file and check that.
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8") as fh:
            fh.write(src)
            tmp = fh.name
        try:
            r = subprocess.run(["node", "--check", tmp], capture_output=True,
                               text=True)
        finally:
            os.unlink(tmp)
    else:
        # Wrap in a function so a bare top-level `return` or loose statement is
        # still valid input; we want the PARSER's opinion, not JXA's scoping.
        r = subprocess.run(["osascript", "-l", "JavaScript", "-e",
                            "new Function(%s)" % json_str(src)],
                           capture_output=True, text=True)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip().splitlines()
        return err[0] if err else "parse failed"
    return None


def json_str(s):
    out = ['"']
    for ch in s:
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ord(ch) < 32:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def extract_scripts(html):
    """Pull the inline <script> bodies out of an HTML file."""
    import re
    return re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S | re.I)


name, how = parser()
if how is None:
    print("  WARNING  no JavaScript engine found (no node, no osascript)")
    print("           falling back to a brace/paren COUNT, which is weaker")
    print("           than parsing and will not catch balanced-but-invalid code")

bad = 0
for f in JS_FILES + HTML_FILES:
    if not os.path.exists(f):
        print(f"  MISSING  {f}")
        bad += 1
        continue
    src = open(f, encoding="utf-8").read()
    if how is None:
        d = src.count("{") - src.count("}")
        q = src.count("(") - src.count(")")
        if d or q:
            print(f"  UNBALANCED  {f}  braces {d:+d}  parens {q:+d}")
            bad += 1
        else:
            print(f"  OK       {f:18s} {len(src) // 1024:>3} KB (counted)")
        continue

    units = [(f, src)] if f in JS_FILES else [("%s <script>" % f, s)
                                                for s in extract_scripts(src)]
    if f in HTML_FILES and not units:
        print(f"  OK       {f:18s} {len(src) // 1024:>3} KB (no inline script)")
        continue
    err = None
    for label, unit in units:
        if not unit.strip():
            continue
        e = check_js(f, unit, how)
        if e:
            err = "%s: %s" % (label, e)
            break
    if err:
        print(f"  PARSE ERROR  {f}  {err}")
        bad += 1
    else:
        tag = "%s <script>" % f if f in HTML_FILES else f
        print(f"  OK       {tag:18s} {len(src) // 1024:>3} KB (parsed, {name})")

sys.exit(1 if bad else 0)
