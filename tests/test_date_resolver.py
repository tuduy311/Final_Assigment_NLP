import pytest
from datetime import datetime, timezone, timedelta
import sys
import os

# Adjust import path to find backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/app/backend')))

from services.date_resolver import _try_parse_absolute_date, _apply_offset

def test_parse_absolute_date():
    ref_date = datetime(2024, 6, 1)
    
    # ISO-like formats
    dt = _try_parse_absolute_date("2024-06-15", ref_date)
    assert dt is not None
    assert dt.strftime("%Y-%m-%d") == "2024-06-15"
    
    # Written formats
    dt2 = _try_parse_absolute_date("June 15", ref_date)
    assert dt2 is not None
    assert dt2.month == 6 and dt2.day == 15
    assert dt2.year == 2024  # Falls back to ref_date year

def test_apply_offset():
    base = datetime(2024, 6, 1, 10, 0, 0) # Saturday
    
    # Tomorrow
    dt = _apply_offset(base, "tomorrow")
    assert dt.strftime("%Y-%m-%d") == "2024-06-02"
    
    # +7 days
    dt2 = _apply_offset(base, "+7 days")
    assert dt2.strftime("%Y-%m-%d") == "2024-06-08"
    
    # Next Friday
    # Saturday (5) to next Friday (4) -> 6 days difference
    dt3 = _apply_offset(base, "next Friday")
    assert dt3.strftime("%Y-%m-%d") == "2024-06-07"
    
    # End of month
    dt4 = _apply_offset(base, "end of month")
    assert dt4.strftime("%Y-%m-%d") == "2024-06-30"
