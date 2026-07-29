import json

choices= [
            ("Tell everyone in the group chat immediately", "E"),
            ("Quietly commit it and move on to the next problem", "I"),
        ]
print(json.dumps(choices))