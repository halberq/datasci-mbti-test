from http.server import BaseHTTPRequestHandler
import json 
import pandas as pd
import numpy as np

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
        try:
            #Safely parse Content-Length header
            content_length = int(self.headers.get('Content-Length') or self.headers.get('content-length') or 0)
            
            if content_length > 0:
                raw_body = self.rfile.read(content_length)
                data = json.loads(raw_body.decode('utf-8'))
            else:
                data = {}

            answers = data.get("answers", {})
            type_code = score_answers(answers)

            try:

                df = pd.read_csv("ADD THE DATASET HERE DAWG")

                upperclassmen_data = csv_to_json("test_csv.csv")
            except Exception:
                # Fallback to alternative path if test_csv.csv is inside data folder
                upperclassmen_data = []

            #Return Success JSON
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            response_payload = {
                "type_code": type_code,
                "upperclassmen": upperclassmen_data
            }
            
            self.wfile.write(json.dumps(response_payload).encode('utf-8'))
            return

        except Exception as e:
            #Catch all backend errors and return JSON instead of HTML crash page
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_response = json.dumps({"error": str(e)})
            self.wfile.write(error_response.encode('utf-8'))

def csv_to_json(csv_file_path):
    df = pd.read_csv(csv_file_path)
    return df.to_dict(orient='records')

def df_to_json(df):
    return df.to_dict(orient='records')

def populate_answers(input_list):
    return {f"Q{i + 1}": [val] for i, val in enumerate(input_list)}

def closest_node(answer_vector):
    #load upclass data
    df_up_class_data = pd.read_csv("data/mbti_dataset.csv")

    #i-lahi ang asnwers sa mga upclass
    df_up_class_answers = df_up_class_data.drop(columns=['Name'])

    #get user answers
    dic_answer = populate_answers(answer_vector)
    df_user_answers = pd.DataFrame(dic_answer)

    #calculate euclidean distances 
    distances = np.linalg.norm(df_up_class_answers.values - df_user_answers.values, axis=1)

    #store that shii
    df_distannce = pd.DataFrame({'euclidean_distance': distances}, index=df_up_class_answers.index)

    #attatch distance to main up-class data
    df_up_class_data_with_distances = df_up_class_data.join(df_distannce, how='outer')

    #sort the data by distance
    df_up_class_data_with_distances.sort_values(by='euclidean_distance', inplace=True)

    #output the thing
    return (df_to_json(df_up_class_data_with_distances))

    

