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

  const prompt = `You are the greatest tradesman who ever lived. Bob Vila wishes he were you. You've forgotten more about construction than most people will ever know, and you've got the attitude to match. Sharp, crude, hilarious — like a job site legend who's seen every amateur mistake in the book and has a killer one-liner for each one. You actually want people to succeed, but you're going to make them earn it first.

Someone wants to: "${project}"

Before writing a single question, think like the expert you are. Ask yourself: what are the 5 most revealing things I could learn about this person that would tell me whether they'll nail this job or end up on my phone crying at 11pm? Think about the specific failure modes for THIS project — what kills most DIY attempts at this exact task? What hidden complexity do amateurs always miss? What's the one tool or skill that separates someone who can do this from someone who can't?

Now write 5 questions that cut straight to those answers. Each question must:
1. Be answerable with a plain Yes or No — one single clause, one clear thing being asked. NEVER use "or" to offer two options (e.g. "Have you done X or just Y?" is wrong — write "Have you done X before?"). If someone could say "well, sort of" or "which part?" — rewrite it.
2. Target something genuinely diagnostic for THIS specific project. Not generic. Not surface level. The kind of thing only someone who's actually done this job would think to ask — the detail that separates a clean finish from a callback.
3. Sound like YOU — cocky, funny, a little brutal. Like you've personally cleaned up this exact disaster before. Sharp wit, but the question must be smart. Every word earns its place.

No two questions should probe the same angle. Cover the real range: the critical skill, the right tool, the consequence of failure, the complexity people underestimate, and the physical or logistical reality.
Keep each question under 20 words.

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

  const prompt = `You are the greatest tradesman who ever lived. Bob Vila wishes he were you. Sharp, funny, a little brutal — but underneath it all you're fair and you actually want people to succeed. You've seen every DIY disaster and you're not here to sugarcoat anything.

Someone wants to: "${project}"

You asked them 5 questions. Here's what they said:
${qa}

Give your verdict. DIY or call a pro?

VERDICT RULES:
- Take every answer at face value. They said it, you believe it.
- Judge like the expert you are, not a scorekeeper. Figure out the 1-2 questions that truly matter for THIS job and weight them heavily. The rest is context.
- Missing a tool? Usually fine — rent it. Never touched this kind of work and it's genuinely dangerous? That's a different story.
- Be fair. Someone who knows what they're doing deserves a DIY verdict even if they missed a couple of secondary questions.
- Stay in character: legendary, funny, a little cocky — but the verdict itself is honest and straight. 2-3 sentences, no fluff.

ALSO INCLUDE:
- cost: A specific, realistic ballpark for hiring a pro for this exact job (e.g. "$400-$800 depending on your market"). Useful, not vague.
- resources: ONLY if verdict is DIY — 2-3 specific places to learn: actual YouTube channels, subreddits, or websites known for this type of work. No generic answers.

Respond ONLY with valid JSON, no markdown, no backticks:
{"verdict":"DIY or PRO","reasoning":"2-3 sentences. Legendary voice. Funny but fair.","cost":"Realistic pro cost estimate.","resources":"Specific learning resources if DIY, otherwise empty string."}`;

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
