# StudySpark AI

An AI study copilot for students — solo hackathon entry by **Jonathan Willis** for the
[ML Empowerment Build Challenge 3.0](https://ml-build-challenge-3.devpost.com).

Three tools in one web app, all powered by **Qwen3** on **Cloudflare Workers AI**:

1. **AI Tutor** — chat with an AI tutor that explains concepts step by step and checks understanding.
2. **Quiz Generator** — enter any topic → get a multiple-choice quiz with instant grading and explanations.
3. **Study Planner** — subjects + exam date → a day-by-day study plan with active-recall practice.

Zero spend: one Cloudflare Worker (free tier) + Workers AI free tier. No accounts, no API keys, no data stored.

## Run locally

```bash
node build.js          # embed public/index.html into src/index.js
npx wrangler dev       # or deploy:
npx wrangler deploy
```

## Endpoints

- `GET /` — the app
- `POST /api/tutor` — `{messages:[{role,content}]}` → `{reply}`
- `POST /api/quiz` — `{topic, difficulty, count}` → `{quiz:[{q, options[4], answer, explanation}]}`
- `POST /api/plan` — `{subjects, examDate, hoursPerDay}` → `{plan}` (markdown)
