import json
import os
for file in sorted(os.listdir('backend/scenarios')):
    if not file.endswith('.json'):
        continue
    with open(f'backend/scenarios/{file}', 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
        p = data.get("permissions", {})
        print(f"scenario_id: {data['scenario_id']}")
        print(f"kind: {data['kind']}, category: {data['category']}")
        print(f"permitted_tools: {p.get('permitted_tools')}")
        print(f"permitted_recipients: {p.get('permitted_recipients')}")
        print(f"max_customer_records: {p.get('max_customer_records')}")
        print(f"expected: {json.dumps(data.get('expected'))}\n")
