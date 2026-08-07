#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, sys

try:
    from jsonschema import Draft202012Validator, FormatChecker
    from referencing import Registry, Resource
except Exception as exc:
    print("Missing dependency: jsonschema/referencing:", exc)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
EXAMPLES = ROOT / "examples"

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def canonical_sha256(obj):
    raw = json.dumps(
        obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

schema_files = list(SCHEMAS.glob("*.schema.json"))
resources = []
for p in schema_files:
    obj = load(p)
    resources.append((obj["$id"], Resource.from_contents(obj)))
registry = Registry().with_resources(resources)

def validate(schema_name, example_name):
    schema = load(SCHEMAS / schema_name)
    instance = load(EXAMPLES / example_name)
    v = Draft202012Validator(
        schema,
        registry=registry,
        format_checker=FormatChecker()
    )
    return sorted(v.iter_errors(instance), key=lambda e: list(e.absolute_path))

def semantic_protocol_errors(protocol):
    errors = []
    phases = protocol.get("phases", [])
    phase_ids = [p.get("phase_id") for p in phases]
    unique = set(phase_ids)

    if len(phase_ids) != len(unique):
        errors.append("duplicate phase_id")

    initial = protocol.get("initial_phase_id")
    if initial not in unique:
        errors.append(f"initial_phase_id not found: {initial}")

    side_ids = [s.get("side_id") for s in protocol.get("participant_policy", {}).get("sides", [])]
    if len(side_ids) != len(set(side_ids)):
        errors.append("duplicate side_id")

    role_classes = [r.get("role_class") for r in protocol.get("required_roles", [])]
    if len(role_classes) != len(set(role_classes)):
        errors.append("duplicate required role_class")

    for p in phases:
        pid = p.get("phase_id")
        for t in p.get("transitions", []):
            target = t.get("target")
            if target != "$end" and target not in unique:
                errors.append(f"{pid}: transition target not found: {target}")

        if p.get("kind") == "human_gate":
            if p.get("actor", {}).get("selector") != "human_arbiter":
                errors.append(f"{pid}: human_gate actor must be human_arbiter")
            if p.get("completion", {}).get("mode") != "human_decision":
                errors.append(f"{pid}: human_gate completion must be human_decision")

    graph = {pid: [] for pid in unique}
    for p in phases:
        for t in p.get("transitions", []):
            graph[p["phase_id"]].append(t["target"])

    seen = set()
    stack = [initial] if initial in unique else []
    end_reachable = False
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        for nxt in graph.get(cur, []):
            if nxt == "$end":
                end_reachable = True
            elif nxt not in seen:
                stack.append(nxt)

    for pid in sorted(unique - seen):
        errors.append(f"unreachable phase: {pid}")
    if not end_reachable:
        errors.append("$end is not reachable from initial_phase_id")

    policy = protocol.get("participant_policy", {})
    if policy.get("min_advisors", 0) > policy.get("max_advisors", 0):
        errors.append("participant_policy min_advisors > max_advisors")

    sum_min = 0
    sum_max = 0
    for s in policy.get("sides", []):
        if s.get("min_members", 0) > s.get("max_members", 0):
            errors.append(f"side {s.get('side_id')}: min_members > max_members")
        sum_min += s.get("min_members", 0)
        sum_max += s.get("max_members", 0)

    if sum_min > policy.get("max_advisors", 0):
        errors.append("sum(side.min_members) > max_advisors")
    if sum_max < policy.get("min_advisors", 0):
        errors.append("sum(side.max_members) < min_advisors")

    for r in protocol.get("required_roles", []):
        if r.get("min_count", 0) > r.get("max_count", 0):
            errors.append(f"required role {r.get('role_class')}: min_count > max_count")

    if protocol.get("default_visibility_mode") not in protocol.get("allowed_visibility_modes", []):
        errors.append("default_visibility_mode is not in allowed_visibility_modes")
    return errors

def semantic_meeting_errors(meeting, protocol):
    errors = []
    meeting_id = meeting.get("meeting_id")

    # Protocol snapshot integrity: canonical JSON hash, ID and version.
    snap = meeting.get("protocol_snapshot", {})
    if snap.get("protocol_id") != protocol.get("protocol_id"):
        errors.append("protocol_snapshot.protocol_id mismatch")
    if snap.get("version") != protocol.get("version"):
        errors.append("protocol_snapshot.version mismatch")
    if snap.get("sha256") != canonical_sha256(protocol):
        errors.append("protocol_snapshot.sha256 mismatch")

    phase_map = {p["phase_id"]: p for p in protocol.get("phases", [])}
    valid_phase_ids = set(phase_map)
    if meeting.get("current_phase_id") is not None and meeting.get("current_phase_id") not in valid_phase_ids:
        errors.append("current_phase_id not found in protocol")
    for pid in meeting.get("completed_phase_ids", []):
        if pid not in valid_phase_ids:
            errors.append(f"completed phase not found in protocol: {pid}")

    if meeting.get("visibility_mode") not in protocol.get("allowed_visibility_modes", []):
        errors.append("meeting visibility_mode not allowed by protocol")

    # IDs must be unique.
    groups = {
        "role_id": [x.get("role_id") for x in meeting.get("roles", [])],
        "participant_id": [x.get("participant_id") for x in meeting.get("participants", [])],
        "event_id": [x.get("event_id") for x in meeting.get("events", [])],
        "message_id": [x.get("message_id") for x in meeting.get("messages", [])],
        "checkpoint_id": [x.get("checkpoint_id") for x in meeting.get("checkpoints", [])],
        "artifact_id": [x.get("artifact_id") for x in meeting.get("artifacts", [])],
        "annotation_id": [x.get("annotation_id") for x in meeting.get("annotations", [])],
    }
    for label, ids in groups.items():
        if len(ids) != len(set(ids)):
            errors.append(f"duplicate {label}")

    role_map = {r["role_id"]: r for r in meeting.get("roles", [])}
    participant_map = {p["participant_id"]: p for p in meeting.get("participants", [])}

    # Participant -> Role integrity.
    for p in meeting.get("participants", []):
        role = role_map.get(p.get("role_id"))
        if not role:
            errors.append(f"participant {p.get('participant_id')}: role_id not found: {p.get('role_id')}")
            continue
        if p.get("role_class") != role.get("role_class"):
            errors.append(f"participant {p.get('participant_id')}: role_class mismatch")

    # Protocol role-count requirements.
    counts = {}
    advisor_count = 0
    side_counts = {}
    for p in meeting.get("participants", []):
        rc = p.get("role_class")
        counts[rc] = counts.get(rc, 0) + 1
        if rc == "advisor":
            advisor_count += 1
            side = p.get("side_id")
            if side is not None:
                side_counts[side] = side_counts.get(side, 0) + 1

    policy = protocol.get("participant_policy", {})
    if not (policy.get("min_advisors", 0) <= advisor_count <= policy.get("max_advisors", 0)):
        errors.append("advisor count violates participant_policy")

    side_policy = {s["side_id"]: s for s in policy.get("sides", [])}
    for side_id in side_counts:
        if side_id not in side_policy:
            errors.append(f"participant uses unknown side_id: {side_id}")
    for side_id, sp in side_policy.items():
        c = side_counts.get(side_id, 0)
        if not (sp["min_members"] <= c <= sp["max_members"]):
            errors.append(f"side {side_id} member count violates participant_policy")

    for req in protocol.get("required_roles", []):
        c = counts.get(req["role_class"], 0)
        if not (req["min_count"] <= c <= req["max_count"]):
            errors.append(f"role_class {req['role_class']} count violates required_roles")

    # Deterministic Event Log: contiguous seq starting from 0.
    events = meeting.get("events", [])
    seqs = [e.get("seq") for e in events]
    if seqs != list(range(len(events))):
        errors.append(f"event seq must be contiguous 0..N-1, got {seqs}")

    event_ids = set(groups["event_id"])
    event_seqs = set(seqs)
    message_ids = set(groups["message_id"])
    artifact_ids = set(groups["artifact_id"])
    checkpoint_ids = set(groups["checkpoint_id"])

    for e in events:
        pid = e.get("phase_id")
        if pid is not None and pid not in valid_phase_ids:
            errors.append(f"event {e.get('event_id')}: phase_id not found")
        aid = e.get("actor_id")
        if e.get("actor_type") in {"agent", "chair", "secretary"} and aid not in participant_map:
            errors.append(f"event {e.get('event_id')}: actor_id not found")

    for m in meeting.get("messages", []):
        if m.get("meeting_id") != meeting_id:
            errors.append(f"message {m.get('message_id')}: meeting_id mismatch")
        if m.get("phase_id") not in valid_phase_ids:
            errors.append(f"message {m.get('message_id')}: phase_id not found")
        if m.get("event_seq") is not None and m.get("event_seq") not in event_seqs:
            errors.append(f"message {m.get('message_id')}: event_seq not found")
        sender = m.get("sender", {})
        if sender.get("actor_type") in {"agent", "chair", "secretary"} and sender.get("actor_id") not in participant_map:
            errors.append(f"message {m.get('message_id')}: sender actor_id not found")
        if m.get("accepted_by_runtime") and m.get("validation", {}).get("status") not in {"valid", "corrected"}:
            errors.append(f"message {m.get('message_id')}: accepted but validation is not valid/corrected")

    for cp in meeting.get("checkpoints", []):
        if events and cp.get("at_event_seq") not in event_seqs:
            errors.append(f"checkpoint {cp.get('checkpoint_id')}: at_event_seq not found")
        if cp.get("phase_id") not in valid_phase_ids:
            errors.append(f"checkpoint {cp.get('checkpoint_id')}: phase_id not found")

    for a in meeting.get("artifacts", []):
        if a.get("meeting_id") != meeting_id:
            errors.append(f"artifact {a.get('artifact_id')}: meeting_id mismatch")
        prov = a.get("provenance", {})
        for ref in prov.get("source_event_ids", []):
            if ref not in event_ids:
                errors.append(f"artifact {a.get('artifact_id')}: source event not found: {ref}")
        for ref in prov.get("source_message_ids", []):
            if ref not in message_ids:
                errors.append(f"artifact {a.get('artifact_id')}: source message not found: {ref}")
        for ref in prov.get("source_artifact_ids", []):
            if ref not in artifact_ids:
                errors.append(f"artifact {a.get('artifact_id')}: source artifact not found: {ref}")

    artifact_map = {a["artifact_id"]: a for a in meeting.get("artifacts", [])}
    for ann in meeting.get("annotations", []):
        if ann.get("meeting_id") != meeting_id:
            errors.append(f"annotation {ann.get('annotation_id')}: meeting_id mismatch")
        t = ann.get("target", {})
        typ, tid = t.get("target_type"), t.get("target_id")
        if typ == "meeting" and tid != meeting_id:
            errors.append(f"annotation {ann.get('annotation_id')}: meeting target mismatch")
        elif typ == "message" and tid not in message_ids:
            errors.append(f"annotation {ann.get('annotation_id')}: message target not found")
        elif typ == "event" and tid not in event_ids:
            errors.append(f"annotation {ann.get('annotation_id')}: event target not found")
        elif typ == "artifact" and tid not in artifact_ids:
            errors.append(f"annotation {ann.get('annotation_id')}: artifact target not found")
        elif typ == "checkpoint" and tid not in checkpoint_ids:
            errors.append(f"annotation {ann.get('annotation_id')}: checkpoint target not found")
        elif typ == "decision_report":
            if tid not in artifact_map or artifact_map[tid].get("artifact_type") != "decision-report":
                errors.append(f"annotation {ann.get('annotation_id')}: decision_report target not found")

    if meeting.get("status") == "waiting_human":
        cur = meeting.get("current_phase_id")
        if not cur or phase_map.get(cur, {}).get("kind") != "human_gate":
            errors.append("waiting_human requires current human_gate phase")

    return errors

checks = [
    ("role.schema.json", "valid-role-strategic-advocate.json", True),
    ("role.schema.json", "valid-role-risk-challenger.json", True),
    ("role.schema.json", "valid-role-chair-secretary.json", True),
    ("message.schema.json", "valid-message.json", True),
    ("artifact.schema.json", "valid-artifact.json", True),
    ("annotation.schema.json", "valid-annotation.json", True),
    ("protocol.schema.json", "valid-protocol-committee-mvp.json", True),
    ("meeting.schema.json", "valid-meeting-resume-demo.json", True),
    ("protocol.schema.json", "invalid-protocol-schema.json", False),
    ("meeting.schema.json", "invalid-meeting-semantic.json", True),  # structure is intentionally valid
]

failed = 0
for schema_name, example_name, should_pass in checks:
    errors = validate(schema_name, example_name)
    passed = (not errors) if should_pass else bool(errors)
    print(f"[{'PASS' if passed else 'FAIL'}] {example_name} vs {schema_name}")
    if not passed:
        failed += 1
        for e in errors[:8]:
            print("  -", list(e.absolute_path), e.message)

protocol = load(EXAMPLES / "valid-protocol-committee-mvp.json")
bad_protocol = load(EXAMPLES / "invalid-protocol-semantic.json")
meeting = load(EXAMPLES / "valid-meeting-resume-demo.json")
bad_meeting = load(EXAMPLES / "invalid-meeting-semantic.json")

semantic_checks = [
    ("valid protocol semantic validation", semantic_protocol_errors(protocol), False),
    ("invalid semantic protocol rejected", semantic_protocol_errors(bad_protocol), True),
    ("valid meeting cross-schema validation", semantic_meeting_errors(meeting, protocol), False),
    ("invalid semantic meeting rejected", semantic_meeting_errors(bad_meeting, protocol), True),
]

for label, errors, should_have_errors in semantic_checks:
    passed = bool(errors) if should_have_errors else not errors
    print(f"[{'PASS' if passed else 'FAIL'}] {label}")
    if errors:
        for e in errors[:12]:
            print("  - detected:" if should_have_errors else "  -", e)
    if not passed:
        failed += 1

if failed:
    print(f"RESULT: FAIL ({failed} checks)")
    sys.exit(1)
print("RESULT: PASS")
