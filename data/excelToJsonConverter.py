import pandas as pd
import json

# Read the Excel file
df = pd.read_excel('C:/Users/arnak/Downloads/EC3OLS/Ontologies_forRepo.xlsx')  # Update the path to your Excel file

# Convert the DataFrame to JSON
games_json = df.to_json(orient='records')

# Save the JSON to a file
with open('C:/Users/arnak/Downloads/EC3OLS/Ontologies_forRepo.json', 'w') as f:
    f.write(games_json)

print("Conversion complete. JSON file saved as Ontologies_forRepo.json.")