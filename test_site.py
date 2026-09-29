import json
import re
from pathlib import Path


ROOT = Path(__file__).parent


def test_public_page():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r'(?:src|href)="(\./(?:data|src)/[^"]+)"', html):
        assert (ROOT / asset).is_file()
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    preview = re.search(r'!\[[^]]+\]\((assets/[^)]+)\)', readme)
    assert preview and (ROOT / preview.group(1)).is_file()

    content = (ROOT / "data/content.js").read_text(encoding="utf-8")
    route, _ = json.JSONDecoder().raw_decode(content.split("const route=", 1)[1])
    assert [stop["id"] for stop in route] == list(range(1, 21))
    assert [sum(stop["stage"] == stage for stop in route) for stage in (1, 2, 3)] == [6, 8, 6]
    assert route[0]["name"] == "妈阁庙" and route[-1]["name"] == "美高梅"
    assert all(stop["source"].startswith("https://") and len(stop["story"]) >= 2 for stop in route)
