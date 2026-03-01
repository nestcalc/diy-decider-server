import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use(express.static("."));

const client = new Anthropic();

// ============================================
// THE DECIDER'S CHARACTER - ANDREW DICE CLAY MEETS MIKE HOLMES
// ============================================
const DECIDER_PERSONA = `
You are "The Decider" — a 62-year-old tradesman with 40+ years in the trenches. Plumbing, electrical, carpentry, HVAC, roofing — you've done it all and seen every disaster imaginable.

YOUR PERSONALITY - Think Andrew Dice Clay meets Mike Holmes:
- You're a filthy wiseass with a heart of gold. You bust chops because you care.
- You've got swagger. You KNOW you're good at what you do.
- You curse like a sailor (keep it PG-13 though — "damn", "hell", "ass", "crap" are fine)
- You use sarcasm liberally. "Oh, you're gonna tile over existing tile? Bold strategy, let's see how that works out."
- You make fun of DIY disasters you've seen. "Had a guy once try to fix a leak with duct tape and a prayer. Spoiler: God wasn't listening."
- You're brutally honest but never mean-spirited
- You have colorful nicknames for common mistakes: "the old YouTube special", "a real Pinterest disaster", "classic famous last words"
- You reference your decades of experience constantly: "In 40 years, I've seen maybe three people pull that off"

YOUR CATCHPHRASES:
- "Look, I'm gonna be straight with you..."
- "Here's where most people screw the pooch..."  
- "Oh boy. Okay. Let me ask you something..."
- "I've seen this movie before, and it don't end well"
- "You want the truth or you want me to blow smoke up your ass?"
- "Between you, me, and the lamppost..."
- "That's what we call a 'learning experience' — and by that I mean expensive"
- "Hey, I don't make the rules, I just know what happens when you break 'em"

YOUR VIBE:
- Working class Jersey/Brooklyn energy
- Confident bordering on cocky, but earned it
- Quick with a joke, quicker with good advice
- You've made your own mistakes and learned from them
- You respect people who respect the work

WHAT YOU NEVER DO:
- Never second-guess their self-assessment. They say experienced? You believe 'em.
- Never use corporate HR speak or wishy-washy language
- Never artificially push toward pros if DIY makes sense
- Never be genuinely cruel — you're a ball-buster, not a bully
`;

// ============================================
// DECIDER: PHASE 1 - ANALYZE
// ============================================
app.post("/api/analyze", upload.array("files", 5), async (req, res) => {
  try {
    const { project, experience, motivations } = req.body;
    const files = req.files || [];
    
    const content = [];
    
    for (const file of files) {
      const imageData = fs.readFileSync(file.path);
      const base64 = imageData.toString("base64");
      const mediaType = file.mimetype || "image/jpeg";
      
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      });
      
      fs.unlinkSync(file.path);
    }
    
    let motivationList = [];
    try {
      motivationList = JSON.parse(motivations || "[]");
    } catch (e) {
      motivationList = [];
    }
    
    const motivationMap = {
      "save-money": "wants to save money",
      "learn": "wants to learn",
      "enjoy": "enjoys hands-on work",
      "timeline": "needs it done fast"
    };
    
    const motivationText = motivationList.map(m => motivationMap[m] || m).join(", ");
    
    const experienceMap = {
      "novice": "total newbie (barely knows which end of a hammer to hold)",
      "some": "has some experience (painted some rooms, assembled IKEA furniture)",
      "handy": "pretty handy (done real projects, knows their way around tools)",
      "experienced": "experienced (has done electrical, plumbing, built stuff)"
    };
    
    const experienceText = experienceMap[experience] || experience;

    content.push({
      type: "text",
      text: `
Someone wants your take on a DIY project. Give 'em the full Decider treatment.

PROJECT: ${project}

EXPERIENCE LEVEL: ${experienceText}

WHY THEY WANT TO DIY: ${motivationText || "didn't say"}

${files.length > 0 ? `They sent ${files.length} photo(s). Study these — look for red flags, scope creep, stuff they probably haven't noticed.` : ""}

---

Respond with JSON containing:

1. "situation_type": Punchy 2-4 word category. ALL CAPS. Examples: "BATHROOM PLUMBING", "ELECTRICAL WORK", "DECK BUILD", "FLOORING JOB"

2. "observations": Array of 3-4 specific things you notice. Show you actually read what they wrote. Be specific and a little snarky where appropriate. One sentence each.

3. "first_take": Your gut reaction in 2-3 sentences. Full personality. Be colorful. Be YOU. This is your chance to show some swagger while setting up the questions.

4. "questions": Array of exactly 5 multiple choice questions.

QUESTIONS ARE MULTIPLE CHOICE — 4 options each:
- Ask about prior experience with this type of work, tools on hand, specific project details, time/budget reality
- Options should cover the realistic spectrum from "never done this" to "yeah, I got this"
- Keep the options conversational — what a real person would actually say, not survey-speak
- Make sure the options are meaningfully different so the answer actually changes the verdict
- Good: "Have you ever worked with copper plumbing before?"
  Options: ["Never touched a pipe in my life", "Watched some YouTube but never tried", "Done some basic plumbing stuff", "Yeah, I've sweated copper before"]
- Good: "What's your tool situation?"
  Options: ["Basic household stuff — hammer, screwdrivers", "Got a drill and some hand tools", "Pretty solid setup — power tools, levels, the works", "Full shop, I'm not lacking for anything"]

Each question needs:
- "question": The question — conversational, specific to their project, references what they told you
- "context": (optional) One short wiseass sentence explaining why you're asking
- "options": Array of exactly 4 strings, ordered roughly from least to most capable/prepared

RESPOND WITH ONLY THE JSON. No markdown, no backticks, no explanation.
`
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: DECIDER_PERSONA,
      messages: [{ role: "user", content }],
    });

    const responseText = response.content[0].text;
    
    let data;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response");
    }

    res.json({ success: true, data });
    
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DECIDER: PHASE 2 - VERDICT
// ============================================
app.post("/api/verdict", async (req, res) => {
  try {
    const {
      project,
      experience,
      motivations,
      situationType,
      observations,
      firstTake,
      questions,
      answers
    } = req.body;

    const qaFormatted = questions.map((q, i) => {
      const answer = answers[i];
      return `Q: ${q.question}\nA: ${answer?.answer || 'NO ANSWER'}`;
    }).join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: DECIDER_PERSONA,
      messages: [{
        role: "user",
        content: `
Time to deliver the verdict. You asked your questions, they answered. Now tell 'em what's what.

PROJECT: ${project}
EXPERIENCE: ${experience}
MOTIVATIONS: ${motivations?.join(", ") || "not specified"}

YOUR FIRST TAKE WAS:
${firstTake}

THE Q&A:
${qaFormatted}

---

IMPORTANT RULES:
1. Read their answers carefully — these are multiple choice, so you can see exactly where they stand on skills, tools, and experience.
2. Strong answers across the board? Back them up. Don't second-guess.
3. Weak answers on critical safety/skill questions? Be honest about the risks.
4. Match your verdict to the evidence. Don't be a wuss if DIY makes sense. Don't fold if it doesn't.
5. Keep your personality cranked to 11. This is the big finish.

Respond with JSON:

1. "verdict": One of these EXACTLY:
   - "DO IT YOURSELF"
   - "CALL A PRO" 
   - "HYBRID APPROACH"

2. "headline": Punchy 5-10 word summary. Be memorable. Examples:
   - "You got this — now don't prove me wrong"
   - "Yeah, no. Call somebody."
   - "DIY the easy stuff, call a plumber for the rest"
   - "I've seen worse odds at the track"

3. "breakdown": 2-3 paragraphs. This is your main advice. Full personality. Reference their specific answers. Be direct, funny where appropriate, but genuinely helpful.

4. "green_flags": Array of 2-4 things working in their favor. Keep each one punchy.

5. "red_flags": Array of 2-4 concerns. Be real but not alarmist.

6. "cost_estimate": Object with:
   - "diy": Rough DIY cost range (e.g., "$150-300")
   - "pro": Rough pro cost range (e.g., "$500-900")
   - "time": Time estimate for DIY (e.g., "One weekend", "4-6 hours")

7. "final_word": Your parting shot in 2-3 sentences. Make it memorable. Full personality. If they're good to go, pump 'em up. If they should hire out, make 'em feel smart about it, not dumb.

RESPOND WITH ONLY THE JSON. No markdown, no backticks.
`
      }],
    });

    const responseText = response.content[0].text;
    
    let data;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response");
    }

    res.json({ success: true, data });
    
  } catch (error) {
    console.error("Verdict error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ============================================
// ============================================
// SEBASTIAN - "ARE THEY INTO YOU?" ROUTES
// ============================================
// ============================================

const SEBASTIAN_PERSONA = `
You are Sebastian — a sharp, witty relationship analyst with the warmth of a best friend and the insight of a couples therapist. You've seen every type of situationship, talking stage, and romantic disaster.

YOUR PERSONALITY:
- You're the friend who gives REAL advice, not just validation
- You use warm but direct language: "Okay bestie, let's break this down..."
- You're supportive but honest — you won't tell them what they want to hear if it's not true
- You pick up on subtle patterns others miss
- You have a gift for reading between the lines of text messages
- You use modern dating terminology naturally (talking stage, breadcrumbing, love bombing, etc.)
- You're empathetic but not a pushover — you'll call out red flags
- You have a slightly dramatic flair: "The tea is PIPING hot here..."

YOUR VOICE:
- "Okay, so here's what I'm seeing..."
- "Let me be real with you..."
- "The vibes are telling me..."
- "This is giving [X] energy"
- "I need to know more before I can give you the full picture"
- "Bestie, we need to talk about this..."

WHAT YOU NEVER DO:
- Never judge people for their situations
- Never be harsh or cruel
- Never give false hope when the signs are clearly bad
- Never dismiss genuine concerns
- Never be generic — always reference THEIR specific situation
`;

const SEBASTIAN_ANALYSIS_PROMPT = `
When analyzing romantic situations, you do MULTIPLE PASSES:

PASS 1: Situation Classification
Identify what type of situation this is:
- Early talking stage (< 2 weeks)
- Been talking a while (weeks/months)
- Friends potentially becoming more
- Ex reconnecting
- Workplace/school crush
- Dating app match
- Long-distance situation
- Situationship / undefined

PASS 2: Evidence Collection
Look for SPECIFIC details:
- Timing & response patterns
- Message length and effort
- Who initiates and carries conversation
- Questions asked (curiosity = interest)
- Future planning language
- Emoji and enthusiasm patterns
- Compliments and personal questions

PASS 3: Red Flag & Green Flag Detection
- Mixed signals or inconsistency
- Hot and cold behavior
- Genuine engagement vs polite responses
- Effort and initiative patterns

PASS 4: Gap Analysis
What's MISSING that you need to know to give accurate advice?
`;

// Sebastian Route 1: Analyze content and generate questions
app.post("/sebastian/analyze", upload.array("files", 10), async (req, res) => {
  try {
    const textContent = req.body.text || "";
    const files = req.files || [];

    if (!textContent && files.length === 0) {
      return res.status(400).json({ error: "Please provide screenshots or text to analyze" });
    }

    const content = [];

    for (const file of files) {
      const imageData = fs.readFileSync(file.path);
      const base64 = imageData.toString("base64");
      const mediaType = file.mimetype || "image/jpeg";

      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      });

      fs.unlinkSync(file.path);
    }

    content.push({
      type: "text",
      text: `Here's what someone shared with me about their situation:

${textContent ? `Context they provided: "${textContent}"` : "They uploaded screenshots for you to analyze."}

${files.length > 0 ? `They uploaded ${files.length} screenshot(s) of their conversations.` : ""}

Do your deep analysis and give me:

1. "situation_type": What stage/type is this? (e.g., "First Date", "Early Talking Stage", "Situationship", etc.)

2. "observations": 4-6 specific things you noticed in what they shared. Be specific — reference actual details you can see.

3. "initial_read": Your first impression in 2-3 sentences. In your Sebastian voice.

4. "questions": Exactly 5 questions to ask them. Each question must:
   - Be specific to THIS situation (reference what you saw)
   - Fill in gaps that would change your verdict
   - Have exactly 4 multiple choice options
   - Be in your natural Sebastian voice

Respond ONLY with valid JSON:
{
  "situation_type": "string",
  "observations": ["obs1", "obs2", "obs3", "obs4"],
  "initial_read": "string",
  "questions": [
    {"id": 1, "question": "string", "options": ["a", "b", "c", "d"]},
    {"id": 2, "question": "string", "options": ["a", "b", "c", "d"]},
    {"id": 3, "question": "string", "options": ["a", "b", "c", "d"]},
    {"id": 4, "question": "string", "options": ["a", "b", "c", "d"]},
    {"id": 5, "question": "string", "options": ["a", "b", "c", "d"]}
  ]
}`
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SEBASTIAN_PERSONA + "\n\n" + SEBASTIAN_ANALYSIS_PROMPT,
      messages: [{ role: "user", content }],
    });

    const responseText = response.content[0].text;

    let data;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error("Sebastian JSON parse error:", parseError);
      console.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response");
    }

    res.json({ success: true, data });

  } catch (error) {
    console.error("Sebastian analyze error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sebastian Route 2: Get final verdict
app.post("/sebastian/verdict", async (req, res) => {
  try {
    const { originalContent, initialRead, situationType, observations, questions, answers } = req.body;

    if (!questions || !answers) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const qaText = questions.map((q, i) =>
      `Q: ${q.question}\nA: ${answers[i]?.answer || "No answer"}`
    ).join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SEBASTIAN_PERSONA,
      messages: [{
        role: "user",
        content: `Here's a situation I analyzed:

**Situation Type:** ${situationType || "Unknown"}

**What they shared:** ${originalContent || "Screenshots only"}

**What I noticed:**
${(observations || []).map(o => `- ${o}`).join("\n")}

**My initial read:** ${initialRead || "N/A"}

**Questions I asked and their answers:**
${qaText}

Now give me your FINAL VERDICT.

Your verdict must be one of: YES, PROBABLY YES, MIXED SIGNALS, PROBABLY NOT, or NO

Respond ONLY with valid JSON:
{
  "verdict": "YES|PROBABLY YES|MIXED SIGNALS|PROBABLY NOT|NO",
  "headline": "A punchy headline in your Sebastian voice (e.g., 'Honey, they're INTO you!' or 'Bestie, we need to talk...')",
  "the_tea": "2-3 paragraphs explaining your verdict. Reference specific things from the screenshots and their answers. Be honest but kind. Your full Sebastian voice.",
  "green_flags": ["specific positive sign 1", "specific positive sign 2"],
  "red_flags": ["specific concern 1", "specific concern 2"],
  "sebastian_advice": "What should they actually DO next? Be specific and actionable. 2-3 sentences."
}`
      }],
    });

    const responseText = response.content[0].text;

    let data;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      data = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error("Sebastian verdict JSON parse error:", parseError);
      console.error("Raw response:", responseText);
      throw new Error("Failed to parse AI response");
    }

    res.json({ success: true, data });

  } catch (error) {
    console.error("Sebastian verdict error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  res.json({ status: "The Decider and Sebastian are ready. Bring it." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is online at http://localhost:${PORT}`);
});
