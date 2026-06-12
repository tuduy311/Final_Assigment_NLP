import re, json

# Example LLM output string with single quotes
raw_text = """{
  'conflicts': [
    {
      'task_id': 0,
      'event_id': 'event_123',
      'verdict': 'DUPLICATE',
      'reason': 'The task and event have the same topic and occur on the same day.',
      'suggested_action': 'skip'
    }
  ]
}"""

# Using ast.literal_eval is safer for Python dict strings
import ast
try:
    parsed = ast.literal_eval(raw_text)
    print(parsed)
except Exception as e:
    print(f"Failed: {e}")

