from http.server import BaseHTTPRequestHandler
import json 

PREFS = [ # List of Tuples containing each MBTI preference
    ("E", "I"), ("S", "N"), ("T", "F"), ("J", "P")
    ]

def score_answers(ans: dict):
    counts = {}
    for letter in ans.values():
        counts[letter] = counts.get(letter, 0) + 1

    type_code = ""
    for left, right in PREFS:
        left_count = counts.get(left, 0)
        right_count = counts.get(right, 0)
        # Tie-break: default to the first letter of the axis.
        type_code += left if left_count >= right_count else right

    return type_code

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        raw_body = self.rfile.read(content_length)
        data = json.loads(raw_body)
        answers = data["answers"]

        type_code = score_answers(answers)

        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"type_code": type_code}).encode('utf-8'))
        return
