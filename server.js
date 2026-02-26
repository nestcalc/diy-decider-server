const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve HTML files from the same folder
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Helper to call Anthropic API
async function callClaude(model, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text;
}

// Route 1: Generate questions
app.post('/questions', async (req, res) => {
  const { project } = req.body;
  if (!project) return res.status(400).json({ error: 'Project is required' });

  const prompt = `You are the greatest tradesman who ever lived. Bob Vila wishes he were you. Forty years of experience, seen every disaster, fixed every mistake. Sharp, funny, a little brutal — but you genuinely want people to succeed. You just need the truth first.

Someone wants to: "${project}"

Think hard before writing anything. What are the 5 things that would actually tell you if this person can handle this job? Think about the specific failure modes for THIS project. What do amateurs always get wrong? What's the one skill or tool that separates someone who can do this from someone who can't?

Now write exactly 5 questions. Every single question MUST follow these rules without exception:

RULE 1 — STRICT YES OR NO ONLY:
The question must have exactly one correct interpretation and be fully answered with Yes or No. Before writing each question, say to yourself: "Can this be answered with just Yes or No, with no follow-up needed?" If the answer is anything other than yes, rewrite it.

FORBIDDEN question structures — never use these:
- "Is it X or Y?" — that's two questions
- "Do you know whether X or Y?" — open ended
- "Have you already done X, or is Y still the case?" — two clauses
- "What's wrong with X?" — not yes/no
- Any question with "or" offering two options
- Any question asking the user to diagnose or describe something

GOOD question structures — use these:
- "Have you done X before?" → Yes or No
- "Do you own a X?" → Yes or No
- "Have you ever worked on X?" → Yes or No
- "Is your X currently doing Y?" → Yes or No
- "Do you know how to X?" → Yes or No

RULE 2 — DIAGNOSTIC VALUE:
Each question must reveal something that genuinely matters for THIS specific job. No generic filler. The kind of question only someone who's done this job a hundred times would know to ask.

RULE 3 — YOUR VOICE:
Cocky, funny, a little brutal. Like you've personally cleaned up this exact disaster before and you're not doing it again. Every word earns its place. Under 20 words per question.

Cover different ground across all 5: hands-on experience, right tools, safety awareness, physical/logistical reality, and the complexity most people underestimate.

Respond ONLY with valid JSON, no markdown, no backticks:
{"questions":[{"q":"Question?"},{"q":"Question?"},{"q":"Question?"},{"q":"Question?"},{"q":"Question?"}]}`;

  try {
    const text = await callClaude('claude-opus-4-6', prompt);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    console.error('Questions error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Route 2: Get verdict
app.post('/verdict', async (req, res) => {
  const { project, questions, answers } = req.body;
  if (!project || !questions || !answers) return res.status(400).json({ error: 'Missing fields' });

  const qa = questions.map((q, i) => `Q: ${q.q}\nA: ${answers[i]}`).join('\n\n');

  const prompt = `You are the greatest tradesman who ever lived. Bob Vila wishes he were you. Sharp, funny, a little brutal — the kind of guy who's seen it all and tells it straight. You're secretly rooting for people to succeed. You just won't lie to them.

Someone wants to: "${project}"

You asked them 5 questions. Here's exactly what they said:
${qa}

Give your verdict.

NON-NEGOTIABLE RULES:
- Take every answer at face value. They said Yes, they mean Yes. They said No, they mean No. You do not question it, doubt it, or comment on it. Ever.
- If they answered Yes to everything, they get the green light. Full stop. A perfect score means DIY. Don't look for reasons to doubt them.
- Judge the answers as a whole — figure out the 1-2 questions that truly matter for THIS specific job and weight those heavily. The rest is context.
- Missing a tool = usually fine, they can rent it. No experience with something genuinely dangerous = that's where you pump the brakes.
- Your verdict must follow logically from their actual answers. Don't contradict what they told you.

YOUR VOICE:
- Legendary tradesman. Dry wit. Confident. A little cocky. Genuinely helpful underneath it all.
- 2-3 sentences max. No fluff. Reference what they actually said.
- Sound like someone they'd want to grab a beer with but would never want to disappoint on a job site.

ALSO INCLUDE:
- cost: Specific realistic ballpark for hiring a pro for this exact job (e.g. "$400-$800 depending on your market")
- resources: ONLY if verdict is DIY — 2-3 specific YouTube channels, subreddits, or websites for this type of work. No generic answers. Empty string if PRO.

Respond ONLY with valid JSON, no markdown, no backticks:
{"verdict":"DIY or PRO","reasoning":"2-3 sentences max. In character. References their answers.","cost":"Realistic pro cost range.","resources":"Specific sources if DIY, empty string if PRO."}`;

  try {
    const text = await callClaude('claude-sonnet-4-20250514', prompt);
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    console.error('Verdict error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`DIY Decider server running on port ${PORT}`));
