import urllib.request
import json

gw_id = "trial_a7986e6e"
req = urllib.request.Request(f"http://localhost:8000/api/trials/{gw_id}/trace")
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read())
    print("Event Types in Order:")
    for e in data['events']:
        print(f"  {e['type']}")
