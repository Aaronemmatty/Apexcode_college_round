#!/usr/bin/env python3
import os
import sys

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from scripts.try_ollama import main

if __name__ == "__main__":
    sys.exit(main())
