import sys
import os

# Add the parent directory path so Python can find main.py and zenox_agent module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
