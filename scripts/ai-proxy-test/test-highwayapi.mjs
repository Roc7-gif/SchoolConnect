// Test de connectivité vers le proxy tiers HighwayAPI (api.highwayapi.ai).
// ATTENTION: ce n'est PAS l'API Anthropic officielle — ne pas utiliser en
// production avec des données d'élèves/parents tant que ce proxy n'a pas
// été validé (confidentialité, fiabilité). Voir data_import/ai_parser.py
// pour l'intégration officielle (SDK anthropic + ANTHROPIC_API_KEY).
import OpenAI from "openai";

const apiKey = process.env.HIGHWAY_API_KEY;
if (!apiKey) {
  console.error("Définir HIGHWAY_API_KEY dans l'environnement avant de lancer ce script.");
  process.exit(1);
}

const client = new OpenAI({
  baseURL: "https://api.highwayapi.ai/openai",
  apiKey,
});

const stream = true;

async function run() {
  const completion = await client.chat.completions.create({
    messages: [
      { role: "system", content: "Tu es un assistant utile." },
      { role: "user", content: "Hi there!" },
    ],
    model: "claude-sonnet-5",
    stream,
  });

  if (stream) {
    for await (const chunk of completion) {
      const delta = chunk.choices[0].delta.content;
      if (delta) process.stdout.write(delta);
      if (chunk.choices[0].finish_reason) {
        console.log(`\n[finish_reason: ${chunk.choices[0].finish_reason}]`);
      }
    }
  } else {
    console.log(JSON.stringify(completion, null, 2));
  }
}

run().catch((err) => {
  console.error("Échec de l'appel:", err.message ?? err);
  process.exit(1);
});
