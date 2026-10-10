import os
import sys

# Ensure backend is on sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from scripts.run_matrix import main

if __name__ == "__main__":
    main()
