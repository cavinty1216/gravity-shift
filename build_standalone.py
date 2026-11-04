#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gravity Shift 빌드 스크립트 (휴대용 / Portable)
────────────────────────────────────────────────
  python3 build_standalone.py

이 스크립트는 **이 폴더 안에서만** 파일을 만들고 지워요. 인터넷도, 추가 설치도
필요 없습니다. 폴더를 통째로 옮기거나 ZIP으로 풀어도 그대로 동작해요.

만들어지는 것 (모두 이 스크립트가 있는 폴더 기준):
  1. gravity-shift-standalone.html                ← css·js를 한 파일에 담은 독립 실행 버전
  2. dist/gravity-shift.zip                       ← 나눠서 공유할 때 쓰는 ZIP
                                                    (index.html, css/, js/, standalone HTML,
                                                     이 스크립트, README.md 포함)

앱(Pickle) 위젯 번들은 기본으로 만들지 않아요. 작업 공간 안에서 위젯 번들까지
갱신하고 싶을 때만 아래처럼 실행하세요. (공유 ZIP에서는 쓰지 않는 옵션이에요)
  python3 build_standalone.py --widget
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))

STANDALONE = "gravity-shift-standalone.html"
ZIP_REL = os.path.join("dist", "gravity-shift.zip")
ZIP_TOP = "gravity-shift"          # ZIP 안의 최상위 폴더 이름
SOURCES = ["index.html", "css/style.css", "js/game.js"]
EXTRAS = ["README.md", "build_standalone.py"]   # ZIP에 같이 넣을 문서/스크립트


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path) or ROOT, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote", os.path.relpath(path, ROOT))


def inline(html_text, css_text, js_text):
    """index.html의 link/script를 인라인으로 바꾼 한 파일 버전을 만든다."""
    link_tag = '<link rel="stylesheet" href="css/style.css">'
    script_tag = '<script src="js/game.js"></script>'
    assert link_tag in html_text, "index.html에 css link 태그가 없어요"
    assert script_tag in html_text, "index.html에 game.js script 태그가 없어요"

    out = html_text.replace(link_tag, "<style>\n" + css_text + "\n</style>")
    out = out.replace(script_tag, "<script>\n" + js_text + "\n</script>")

    # 바깥 파일을 더 이상 불러오지 않는지 확인
    assert link_tag not in out and script_tag not in out, "바깥 파일 참조가 남아 있어요"
    assert 'href="css/' not in out and 'src="js/' not in out, "바깥 파일 참조가 남아 있어요"
    return out


def build_zip():
    zip_path = os.path.join(ROOT, ZIP_REL)
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    names = SOURCES + [STANDALONE] + EXTRAS

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in names:
            src = os.path.join(ROOT, rel)
            if not os.path.exists(src):
                raise SystemExit("빌드 실패: %s 파일이 없어요" % rel)
            z.write(src, ZIP_TOP + "/" + rel.replace(os.sep, "/"))
    print("wrote", os.path.relpath(zip_path, ROOT))
    return zip_path, [ZIP_TOP + "/" + n for n in names]


def verify_zip(zip_path, expected):
    """ZIP을 다시 열어 CRC와 파일 목록을 검사한다."""
    with zipfile.ZipFile(zip_path) as z:
        bad = z.testzip()
        if bad is not None:
            raise SystemExit("ZIP CRC 오류: %s" % bad)
        got = z.namelist()
        if sorted(got) != sorted(expected):
            raise SystemExit("ZIP 파일 목록이 다름: %s" % got)
        for name in got:
            if z.read(name) != open(
                os.path.join(ROOT, name.split("/", 1)[1]), "rb"
            ).read():
                raise SystemExit("ZIP 안 파일이 원본과 다름: %s" % name)
    print("ZIP 검사 통과: %d개 파일, CRC 정상" % len(expected))


def build_widget(html_text, css_text):
    """(선택) Pickle 앱 위젯 번들 — --widget 옵션을 줄 때만 실행."""
    workspace = os.path.dirname(os.path.dirname(ROOT))
    widget_dir = os.path.join(workspace, "widgets", "gravity-shift", "bundle")
    if not os.path.isdir(widget_dir):
        print("위젯 번들 폴더가 없어서 건너뜀:", widget_dir)
        return
    font_line = ('font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", '
                 '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif;')
    css_widget = css_text.replace(font_line, "") if font_line in css_text else css_text
    js_text = read("js", "game.js")
    path = os.path.join(widget_dir, "index.html")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(inline(html_text, css_widget, js_text))
    print("wrote", path)


def main():
    html = read("index.html")
    css = read("css", "style.css")
    js = read("js", "game.js")

    standalone = inline(html, css, js)
    write(STANDALONE, standalone)

    zip_path, expected = build_zip()
    verify_zip(zip_path, expected)

    if "--widget" in sys.argv[1:]:
        build_widget(html, css)
    else:
        print("위젯 번들은 건너뜀 (필요하면 --widget 옵션)")

    print("\n완료! 브라우저에서 %s 를 열면 바로 실행돼요." % STANDALONE)


if __name__ == "__main__":
    main()
