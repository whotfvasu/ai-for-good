"""Generate marrow-architecture.excalidraw — a layered mindmap of the plan.

Run once: `python scripts/gen_mindmap.py`. Edits should be done in Excalidraw
itself; this script is just the first draft.
"""
import json, random, time, pathlib

random.seed(42)
def rid():  # excalidraw expects short opaque ids
    return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=16))
def nonce():
    return random.randint(1, 2**31)

NOW = int(time.time() * 1000)

COLORS = {
    "root":   ("#7c1d2f", "#fbe5eb"),  # maroon on pink
    "north":  ("#1971c2", "#d0ebff"),
    "stack":  ("#2f9e44", "#d3f9d8"),
    "cut":    ("#c92a2a", "#ffe3e3"),
    "layer":  ("#9c36b5", "#f3d9fa"),
    "person": ("#f08c00", "#fff3bf"),
}

def box(x, y, w, h, kind, label):
    stroke, fill = COLORS[kind]
    rect_id, text_id = rid(), rid()
    rect = {
        "id": rect_id, "type": "rectangle", "x": x, "y": y,
        "width": w, "height": h, "angle": 0,
        "strokeColor": stroke, "backgroundColor": fill,
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": {"type": 3}, "seed": nonce(), "version": 1,
        "versionNonce": nonce(), "isDeleted": False,
        "boundElements": [{"type": "text", "id": text_id}],
        "updated": NOW, "link": None, "locked": False,
    }
    text = {
        "id": text_id, "type": "text", "x": x + 8, "y": y + 8,
        "width": w - 16, "height": h - 16, "angle": 0,
        "strokeColor": stroke, "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": None, "seed": nonce(), "version": 1,
        "versionNonce": nonce(), "isDeleted": False, "boundElements": None,
        "updated": NOW, "link": None, "locked": False,
        "text": label, "fontSize": 18, "fontFamily": 2,
        "textAlign": "center", "verticalAlign": "middle",
        "baseline": 14, "containerId": rect_id,
        "originalText": label, "lineHeight": 1.25,
    }
    return rect, text, rect_id

def arrow(src_id, dst_id, src_xywh, dst_xywh):
    sx = src_xywh[0] + src_xywh[2] / 2
    sy = src_xywh[1] + src_xywh[3] / 2
    dx = dst_xywh[0] + dst_xywh[2] / 2
    dy = dst_xywh[1] + dst_xywh[3] / 2
    return {
        "id": rid(), "type": "arrow",
        "x": sx, "y": sy,
        "width": dx - sx, "height": dy - sy, "angle": 0,
        "strokeColor": "#495057", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": {"type": 2}, "seed": nonce(), "version": 1,
        "versionNonce": nonce(), "isDeleted": False, "boundElements": None,
        "updated": NOW, "link": None, "locked": False,
        "points": [[0, 0], [dx - sx, dy - sy]],
        "lastCommittedPoint": None,
        "startBinding": {"elementId": src_id, "focus": 0, "gap": 8},
        "endBinding": {"elementId": dst_id, "focus": 0, "gap": 8},
        "startArrowhead": None, "endArrowhead": "arrow",
    }

elements = []
nodes = {}  # name -> (id, x, y, w, h)

def add(name, x, y, w, h, kind, label):
    r, t, rid_ = box(x, y, w, h, kind, label)
    elements.extend([r, t])
    nodes[name] = (rid_, x, y, w, h)

# --- ROOT
add("root", 700, 480, 240, 100, "root", "MARROW\nThe Living Blood Network")

# --- NORTH STAR (right of root)
add("north", 1050, 480, 320, 100, "north",
    "North Star:\nReactive SOS → Predictive Supply")

# --- CONSTRAINTS (left of root)
add("cons", 300, 480, 320, 100, "cut",
    "Constraints:\n24 h · 2 people · $40 AWS cap")

# --- AWS STACK (top of root) and its children
add("stack", 700, 280, 240, 80, "stack", "AWS Stack")
add("s1", 380, 140, 200, 60, "stack", "Amplify (React)")
add("s2", 600, 140, 200, 60, "stack", "Lambda + APIGW")
add("s3", 820, 140, 200, 60, "stack", "DynamoDB on-demand")
add("s4", 1040, 140, 200, 60, "stack", "Bedrock Claude Haiku")

# --- NOT BUILDING (bottom-left)
add("cut", 220, 720, 320, 80, "cut", "NOT building")
add("c1", 80, 840, 180, 50, "cut", "Voice IVR / Bhashini")
add("c2", 280, 840, 180, 50, "cut", "Federated learning")
add("c3", 480, 840, 180, 50, "cut", "GraphSAGE / KG")
add("c4", 80, 910, 180, 50, "cut", "Real WhatsApp API")
add("c5", 280, 910, 180, 50, "cut", "Cognito sign-in")
add("c6", 480, 910, 180, 50, "cut", "RDS / OpenSearch / EKS")

# --- LAYERS (bottom of root)
add("layers", 700, 720, 240, 80, "layer", "Layered Build")
add("L0", 760, 840, 240, 70, "layer",
    "L0 · Foundation (h0–4)\nrepo · deploy · csv→dynamo")
add("L1", 760, 925, 240, 90, "layer",
    "L1 · MVP (h4–14)\nforecast · rank · Saathi · NL query\n→ tag v1-mvp")
add("L2", 760, 1030, 240, 90, "layer",
    "L2 · Differentiators (h14–22)\nchat memory · XGBoost · loop close\n· Hindi/Telugu")
add("L3", 760, 1135, 240, 70, "layer",
    "L3 · Polish (h22–24)\ndemo script · README · teardown")

# --- WORK SPLIT (bottom-right)
add("split", 1100, 720, 260, 80, "person", "Work Split")
add("vasu", 1080, 840, 280, 110, "person",
    "Vasu — Frontend + AI prompts\n• React dashboard\n• Donor chat UI\n• Bedrock Saathi prompt design")
add("harsh", 1080, 970, 280, 110, "person",
    "Harsh — Data + Backend\n• Lambda + APIGW\n• Forecast + ranking logic\n• XGBoost propensity")

# --- ARROWS from root outward
def connect(a, b):
    aid, *aw = nodes[a]; bid, *bw = nodes[b]
    elements.append(arrow(aid, bid, aw, bw))

for child in ["north", "cons", "stack", "cut", "layers", "split"]:
    connect("root", child)
for child in ["s1", "s2", "s3", "s4"]:
    connect("stack", child)
for child in ["c1", "c2", "c3", "c4", "c5", "c6"]:
    connect("cut", child)
for child in ["L0", "L1", "L2", "L3"]:
    connect("layers", child)
for child in ["vasu", "harsh"]:
    connect("split", child)

doc = {
    "type": "excalidraw",
    "version": 2,
    "source": "marrow-plan",
    "elements": elements,
    "appState": {"viewBackgroundColor": "#fff8f0", "gridSize": None},
    "files": {},
}

docs_dir = pathlib.Path(__file__).parent.parent / "docs"
out = docs_dir / "marrow-architecture.excalidraw"
out.write_text(json.dumps(doc, indent=2))
print(f"wrote {out} ({len(elements)} elements)")

# Obsidian Excalidraw plugin format — markdown wrapper with embedded JSON.
# Spec: https://github.com/zsviczian/obsidian-excalidraw-plugin
md_out = docs_dir / "marrow-architecture.excalidraw.md"
md = f"""---
excalidraw-plugin: parsed
tags: [excalidraw]
---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==


# Text Elements

# Drawing
```json
{json.dumps(doc, indent=2)}
```
%%
"""
md_out.write_text(md)
print(f"wrote {md_out}")
