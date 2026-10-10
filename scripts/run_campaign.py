#!/usr/bin/env python3
import os
import sys

backend_scripts = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "scripts"))
if backend_scripts not in sys.path:
    sys.path.insert(0, backend_scripts)

from run_campaign import main

if __name__ == "__main__":
    main()
