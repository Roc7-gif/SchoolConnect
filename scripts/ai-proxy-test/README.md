# Test proxy HighwayAPI (non officiel)

Script isolé pour tester la connectivité vers `api.highwayapi.ai`, un proxy
tiers non officiel qui expose une interface compatible OpenAI et prétend
servir `claude-sonnet-5`.

**Ce n'est pas l'API Anthropic.** Les données envoyées transitent par un
service tiers dont la fiabilité et la politique de confidentialité n'ont pas
été vérifiées. Ne pas y envoyer de données réelles d'élèves/parents.
L'intégration officielle du projet (mode IA de l'import Excel) utilise le
SDK Python `anthropic` directement — voir `backend/SchoolConnect/data_import/ai_parser.py`
et la variable `ANTHROPIC_API_KEY`.

## Statut

Testé avec une vraie clé le 2026-07-19 : **fonctionne en Python** (réponse
reçue en streaming). **Ne fonctionne pas en Node** dans cet environnement —
`openai` (Node) échoue systématiquement en `ETIMEDOUT`, alors qu'un `curl`
brut vers le même hôte réussit instantanément. Cause probable : une
restriction réseau propre au sandbox de développement, pas un problème côté
proxy ou côté clé. À revérifier sur une machine sans cette contrainte avant
de conclure que le SDK Node est en cause.

## Utilisation

### Python (fonctionne)

```bash
cd scripts/ai-proxy-test
pip install -r requirements.txt
export HIGHWAY_API_KEY="<votre clé>"
python test_highwayapi.py
```

### Node (échoue dans ce sandbox — ETIMEDOUT)

```bash
cd scripts/ai-proxy-test
npm install
export HIGHWAY_API_KEY="<votre clé>"
node test-highwayapi.mjs
```
