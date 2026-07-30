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

def handler(request):
    body = json.loads(request.body)
    answers = body["answers"]

    type_code = score_answers(answers)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps ({"type": type_code})
    }