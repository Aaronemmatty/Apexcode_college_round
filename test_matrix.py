import requests
import json
import time

base_url = "http://localhost:8000/api"

# wait for backend
while True:
    try:
        if requests.get(f"{base_url}/health").status_code == 200:
            break
    except:
        pass
    time.sleep(0.5)

scenarios = requests.get(f"{base_url}/scenarios").json()
print(f"Loaded {len(scenarios)} scenarios.")

attacks_none_vio = 0
attacks_none_tot = 0
attacks_gw_vio = 0
attacks_gw_tot = 0
benign_gw_held = 0
benign_gw_tot = 0
false_blocks = 0

for s in scenarios:
    tid = s['task_id']
    kind = s['kind']
    
    # None
    res = requests.post(f"{base_url}/runs", json={"task_id": tid, "defense": "none"}).json()
    trial = res['trials'][0]
    if kind == 'attack':
        attacks_none_tot += 1
        if trial['verdict'] == 'violated': attacks_none_vio += 1
        
    # Gateway
    res2 = requests.post(f"{base_url}/runs", json={"task_id": tid, "defense": "gateway"}).json()
    gw_trial = res2['trials'][0]
    if kind == 'attack':
        attacks_gw_tot += 1
        if gw_trial['verdict'] == 'violated': attacks_gw_vio += 1
    elif kind == 'benign':
        benign_gw_tot += 1
        if gw_trial['verdict'] == 'held': benign_gw_held += 1
        # get eval for false blocks
        ev = requests.get(f"{base_url}/trials/{gw_trial['trial_id']}/evaluation").json()
        false_blocks += ev.get('false_blocks', 0)

print(f"Attacks Violated (None): {attacks_none_vio} / {attacks_none_tot}")
print(f"Residual with Gateway: {attacks_gw_vio} / {attacks_gw_tot}")
print(f"Benign Held (Gateway): {benign_gw_held} / {benign_gw_tot}")
print(f"False Blocks: {false_blocks}")
