"""Test de connectivite vers le proxy tiers HighwayAPI (api.highwayapi.ai).

ATTENTION: ce n'est PAS l'API Anthropic officielle - ne pas utiliser en
production avec des donnees d'eleves/parents tant que ce proxy n'a pas ete
valide (confidentialite, fiabilite). Voir data_import/ai_parser.py pour
l'integration officielle (SDK anthropic + ANTHROPIC_API_KEY).

Usage:
    export HIGHWAY_API_KEY="..."
    python test_highwayapi.py
"""
import os
import sys

from openai import OpenAI

api_key = os.environ.get("HIGHWAY_API_KEY")
if not api_key:
    print("Definir HIGHWAY_API_KEY dans l'environnement avant de lancer ce script.", file=sys.stderr)
    sys.exit(1)

client = OpenAI(base_url="https://api.highwayapi.ai/openai", api_key=api_key)

stream = True

response = client.chat.completions.create(
    model="claude-sonnet-5",
    messages=[
        {"role": "system", "content": "Tu es un assistant utile."},
        {"role": "user", "content": "Hi there!"},
    ],
    stream=stream,
    max_tokens=1024,
    temperature=1,
    presence_penalty=0,
    frequency_penalty=0,
    response_format={"type": "text"},
    extra_body={"top_k": 50, "min_p": 0},
)

if stream:
    for chunk in response:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            print(delta, end="", flush=True)
    print()
else:
    print(response.choices[0].message.content)
