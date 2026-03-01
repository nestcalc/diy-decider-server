import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use(express.static("."));

const client = new Anthropic();

// ============================================
// THE DECIDER'S CHARACTER PROFILE
// ============================================
const DECIDER_PERSONA = `
You are "The Decider" — a 62-year-old tradesman with 40+ years of experience across plumbing, electrical, carpentry, HVAC, roofing, and general contracting. You've seen it all: the triumphant DIY successes, the catastrophic failures, and everything in between.

YOUR PERSONALITY:
- You're direct but not mean. You tell it like it is because you respect people enough to give them the truth.
- You have a dry, sardonic wit. You've developed a dark sense of humor from decades of seeing "quick weekend projects" turn into month-long ordeals.
- You're genuinely helpful — beneath the gruff exterior, you actually want people to succeed. When someone CAN do something themselves, you're their biggest cheerleader.
- You use colorful, working-class language. You might say "that's a recipe for a flooded basement" instead of "that could cause water damage."
- You have strong opinions based on experience, not gatekeeping. You're not trying to protect the trades — you're trying to protect homeowners from costly mistakes.
- You reference your own war stories when relevant. "I once saw a guy try to..." or "Reminds me of a job back in '94..."

YOUR VOICE SOUNDS LIKE:
- "Look, I'm not gonna sugarcoat this..."
- "Here's the thing about [X]..."
- "Now, I've seen folks pull this off, but..."
- "This is where most DIYers go sideways..."
- "Between you and me..."
- "I'll give it to you straight..."

WHAT YOU NEVER DO:
- You never second-guess someone's honest self-assessment. If they say they're experienced, you believe them.
- You never use corporate-speak or hedge everything with excessive disclaimers.
- You never condescend or make people feel stupid for asking.
- You never artificially push people toward hiring pros when DIY is reasonable.

YOUR GOAL: Give people the honest assessment they need to make a smart decision — whether that's grabbing their tools or grabbing their phone.
`;

// ============================================
// PHASE 1: ANALYZE - First impressions & questions
// ============================================
app.post("/api/analyze", upload.array("files", 5), async (req, res) => {
  try {
    const { project, experience, motivations } = req.body;
    const files = req.files || [];
    
    // Build the content array with any uploaded images
    const content = [];
    
    // Add images if present
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
      
      // Clean up uploaded file
      fs.unlinkSync(file.path);
    }
    
    // Parse motivations
    let motivationList = [];
    try {
      motivationList = JSON.parse(motivations || "[]");
    } catch (e) {
      motivationList = [];
    }
    
    const motivationMap = {
      "save-money": "saving money",
      "learn": "wanting to learn",
      "enjoy": "enjoying hands-on work",
      "timeline": "needing it done quickly",
      "trust": "not trusting contractors",
      "small": "thinking it seems simple"
    };
    
    const motivationText = motivationList.map(m => motivationMap[m] || m).join(", ");
    
    const experienceMap = {
      "novice": "a complete novice (barely touched tools)",
      "some": "someone with some experience (painted rooms, assembled furniture, minor repairs)",
      "handy": "pretty handy (done real projects, comfortable with tools)",
      "experienced": "experienced (built things, done electrical or plumbing work)"
    };
    
    const experienceText = experienceMap[experience] || experience;

    // Add the text prompt
    content.push({
      type: "text",
      text: `
A homeowner is considering a DIY project and wants your honest assessment.

PROJECT DESCRIPTION:
${project}

THEIR EXPERIENCE LEVEL: ${experienceText}

THEIR MOTIVATIONS FOR DIY: ${motivationText || "not specified"}

${files.length > 0 ? `They've also shared ${files.length} photo(s) of the project area. Study these carefully for context clues about the scope, condition, potential complications, and what you're really dealing with here.` : ""}

---

Analyze this situation and respond with a JSON object containing:

1. "situation_type": A short, punchy category label for this project (e.g., "BATHROOM PLUMBING", "ELECTRICAL WORK", "FLOORING PROJECT", "DECK REPAIR", "KITCHEN REMODEL"). Make it specific to what they're actually doing. ALL CAPS, 2-4 words max.

2. "observations": An array of 3-5 specific things you notice about their situation. These should show you actually read/saw what they submitted. Be specific, not generic. Each observation should be one sentence. Examples:
   - "1985 build means you might be dealing with galvanized pipes or outdated fittings"
   - "Water damage under the vanity is a red flag — could be a bigger issue hiding there"
   - "That timeline pressure is going to work against you if you hit snags"
   
3. "first_take": Your initial gut reaction in 2-4 sentences, in your full personality. This is where you show who you are. Be honest, be colorful, be YOU. Set up what's coming next. Examples:
   - "Alright, a vanity swap with possible water damage in an older house. I've seen this story before — about half the time it's straightforward, and half the time you pull out the old vanity and discover the previous owner's 'creative' plumbing solutions. The water damage is what's got my attention. Let's dig into this..."
   - "Tile work on a concrete slab? That's actually one of the more DIY-friendly projects IF you've got the patience for prep work. Most people underestimate the prep and overestimate their tolerance for being on their knees for 8 hours. Let me ask you some things..."

4. "questions": An array of exactly 5 diagnostic questions. Each question should have:
   - "question": The yes/no question itself. Make these conversational and specific to THEIR project. Not generic questions that could apply to anything.
   - "context": (optional) A brief line explaining why you're asking, in your voice. Only include this for questions where the 'why' isn't obvious. Examples: "Here's why this matters..." or "This tells me a lot about scope..."
   
   Questions should probe the real risks and requirements for THIS specific project. Think about:
   - Do they have access to the tools they'll actually need?
   - Are there hidden complexity factors specific to this job?
   - Do they have the physical access and conditions to work?
   - Is this the kind of thing where a mistake has serious consequences?
   - Have they thought through the full scope, not just the obvious part?

RESPOND ONLY WITH THE JSON OBJECT. No markdown, no explanation, no preamble.
`
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: DECIDER_PERSONA,
      messages: [{ role: "user", content }],
    });

    const responseText = response.content[0].text;
    
    // Parse the JSON response
    let data;
    try {
      // Try to extract JSON if it's wrapped in anything
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
// PHASE 2: VERDICT - Final assessment
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

    // Format the Q&A for the prompt
    const qaFormatted = questions.map((q, i) => {
      const answer = answers[i];
      return `Q: ${q.question}\nA: ${answer?.answer?.toUpperCase() || 'NO ANSWER'}`;
    }).join("\n\n");

    // Count yes/no answers
    const yesCount = answers.filter(a => a.answer === "yes").length;
    const noCount = answers.filter(a => a.answer === "no").length;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: DECIDER_PERSONA,
      messages: [{
        role: "user",
        content: `
You already gave your first take on this project. Now you've asked your diagnostic questions and gotten answers. Time to deliver your verdict.

ORIGINAL PROJECT:
${project}

EXPERIENCE LEVEL: ${experience}
MOTIVATIONS: ${motivations?.join(", ") || "not specified"}

YOUR INITIAL OBSERVATIONS:
${observations?.join("\n") || "None recorded"}

YOUR FIRST TAKE:
${firstTake}

DIAGNOSTIC Q&A:
${qaFormatted}

ANSWER SUMMARY: ${yesCount} yes, ${noCount} no out of 5 questions

---

Based on everything — the project details, their experience level, the photos if any, your observations, and how they answered your questions — deliver your final verdict.

CRITICAL RULES:
1. If someone answered YES to most/all questions honestly, SUPPORT their DIY decision. Don't second-guess them.
2. If someone answered NO to critical safety or skill questions, be honest about the risks.
3. Your verdict should match the evidence. Don't be artificially cautious if the signs point to DIY success.

Respond with a JSON object containing:

1. "verdict": One of exactly these three values:
   - "DO IT YOURSELF" — They've got this. Green light.
   - "CALL A PRO" — This one's better left to professionals.
   - "HYBRID APPROACH" — DIY some parts, hire out the tricky bits.

2. "headline": A punchy 5-10 word summary of your verdict. Examples:
   - "You've got the skills — grab your tools"
   - "This one's got 'call a plumber' written all over it"
   - "Do the demo yourself, hire out the plumbing"
   - "Straightforward job for someone at your level"
   - "Too many red flags here — protect yourself"

3. "breakdown": 2-3 paragraphs explaining your reasoning. This is where you really break it down for them. Reference specific things from their answers and observations. Be direct and practical. In YOUR voice.

4. "green_flags": Array of 2-4 things working in their favor (only include if there are genuinely positive factors). Keep each one concise.

5. "red_flags": Array of 2-4 concerns or risks (only include if there are genuine concerns). Keep each one concise.

6. "cost_estimate": An object with rough cost comparisons:
   - "diy": Estimated DIY cost range (materials + any tool purchases), e.g., "$150-300"
   - "pro": Estimated professional cost range, e.g., "$400-800"
   - "time": Estimated time investment for DIY, e.g., "One weekend" or "4-6 hours" or "Multiple weekends"
   Note: These are rough estimates to help with the decision. Use your experience to give realistic ranges.

7. "final_word": Your closing advice in 2-4 sentences. This is your parting wisdom, in full personality. Make it memorable. If they're good to go, pump them up. If they should hire out, tell them why it's the smart move without making them feel bad. Reference something specific from their situation.

RESPOND ONLY WITH THE JSON OBJECT. No markdown, no explanation, no preamble.
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
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  res.json({ status: "The Decider is ready to size up your project." });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`The Decider is online at http://localhost:${PORT}`);
});
