# Strawberry Studio - Quick Start Guide 🍓

## Start the System

```bash
# From project root
./start.sh
```

Access at:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:8000/docs

---

## Create Your First Project

### 1. Create Project
Click "New Project" → Enter a name

### 2. Talk to Berry (Brief Phase)

**Instead of:**
```
User: What do you need?
Berry: Title? Logline? Genre?
User: *fills out form*
```

**Now:**
```
User: "I want to make a 30-second commercial about
       discovering water on Mars"

Berry: "MARS! I'm seeing grounded sci-fi vibes -
       The Martian meets Interstellar. Here's my take:

       Title: 'First Water' or 'Red Horizon'?
       Story: Lone astronaut's discovery changes everything
       Genre: Grounded Sci-Fi

       Visual style: Deakins lighting, Malick pacing
       Color: Desaturated reds with ice blue accents

       That feel right?"
```

Berry **automatically infers** 30+ metadata fields!

### 3. Phase Transition

When brief is complete:
```
Berry: "Perfect! We're locked. Let me hand you off..."

[Green Banner Appears]
┌──────────────────────────────────┐
│ 🎬  Phase Complete!              │
│     Brief → Story                │
└──────────────────────────────────┘

Berry (Story Architect): "I'm now your Writer.
Based on your brief, I'm seeing a tight 5-scene arc..."
```

### 4. Navigate Phases

```
Timeline Pills (Top of Chat):
┌─────┬─────┬─────┬─────┬─────┐
│ 💭✓ │ 📖● │ 🎭🔒│ 🎯🔒│ 🎬🔒│
│Brief│Story│Asset│ Gen │Final│
└─────┴─────┴─────┴─────┴─────┘
  ✓ = Completed (clickable)
  ● = Current
  🔒 = Locked (not started)
```

**Click any ✓ pill to review that phase!**

---

## Phase-by-Phase Workflow

### 📝 **BRIEF** - Define Vision
**Berry as Director/Producer**

**You provide:**
- Basic idea (30 seconds to 2 minutes of description)

**Berry infers:**
- Title, logline, genre
- Visual style, color theory, pacing
- Cinematic references
- Emotional arc
- Creative directions

**Example:**
```
You: "A runner pushes through pain to discover their limit"

Berry: [Infers]
- Genre: Inspirational Sports
- Style: Nike commercial energy meets Chariots of Fire
- Color: High contrast, golden hour to blue hour
- Arc: Struggle → Breaking Point → Transcendence
- Refs: "Prefontaine", "Free Solo"
```

---

### 📖 **STORY** - Structure Narrative
**Berry as Story Architect**

**Old way:**
```
Agent: How many scenes?
You: 5
Agent: What happens in Scene 1?
You: Landing...
Agent: What's the camera angle?
You: Uh... wide?
```

**New way:**
```
Berry: "Based on your brief, I'm seeing a 5-scene arc:

SCENE 1: ARRIVAL
Wide, lonely shots. Golden hour Mars. Purpose: Establish isolation.
Visual: Patient, contemplative. Think Malick.

SCENE 2: THE SEARCH
Tighter coverage, methodical work. Purpose: Hope emerging.
Visual: Shift from wide to medium.

SCENE 3: ANOMALY
Handheld POV, tension building. Purpose: Something's different.
Visual: Pacing accelerates.

SCENE 4: DISCOVERY - THE MOMENT
Close on ice → face → wide. Purpose: Emotional peak. Your viral moment.
Visual: HOLD these beats.

SCENE 5: AFTERMATH
Wide but hopeful. Purpose: What this means.

This structure: isolation → search → tension → revelation → meaning.
Want to build this out?"
```

**Berry proposes complete narrative + visual approach!**

---

### 🎭 **ASSETS** - Extract Visual Elements
**Berry as Designer/Analyst**

Automatically extracts:
- **Characters** (with consistency tokens, wardrobe)
- **Locations** (with mood, lighting, style)
- **Props** (with details)

Links assets to scenes/shots automatically.

---

### 🎯 **GENERATE** - Render Pipeline
**Berry as Production Lead**

**Multi-Agent Flow:**
1. **Prompter** - Prepares each cut
2. **Pre-Production** - Creates virtual asset references
3. **Renderer** - Generates final images
4. **QA** - Reviews consistency

**Example:**
```
You: "scene 1 shot 1 cut 1"

Prompter: [Finds cut, checks requirements]
"This cut needs Director character and NASA Headquarters location.
Handing off to Pre-Production..."

Pre-Production: [Automatically]
"Creating Director character reference..."
"Generating NASA Headquarters environment..."
"All assets prepared. Handing back."

Prompter: "Ready to render! Here's the prompt:
[Nano Banana Pro format with @Image references]"
```

**No asking for IDs. No manual steps. Fully autonomous!**

---

## Key Features

### 🧠 **Intelligence**
- Infers metadata from natural language
- Suggests creative directions
- References real films/techniques
- Understands narrative structure

### 🎨 **Creative Collaboration**
- Proposes, doesn't just ask
- Paints visual pictures
- Makes connections
- Gets you excited about your vision

### 🔄 **Smooth Workflow**
- Automatic phase transitions with notifications
- Navigate back to any completed phase
- Continue conversations in context
- Handoffs between specialized agents

### 📊 **Rich Data**
- 30+ metadata fields auto-filled per entity
- Cinematic language throughout
- Story arc awareness
- Production-ready specifications

---

## Tips & Tricks

### 1. **Be Conversational**
Don't treat it like a form. Talk naturally:
- ✅ "I want something like Blade Runner but warmer"
- ❌ "Genre: Sci-Fi, Style: Cyberpunk, Color: Warm"

### 2. **Let Berry Suggest**
Berry will offer multiple creative directions. Pick what resonates!

### 3. **Navigate Freely**
Click phase pills to review past work. You can edit/continue any phase.

### 4. **Trust the Handoffs**
When Berry hands off to Pre-Production or other agents, they work together autonomously.

### 5. **Use References**
Mention films, directors, photographers:
- "Roger Deakins lighting"
- "Terrence Malick pacing"
- "Wong Kar-wai colors"

Berry understands and applies these!

---

## Common Workflows

### Quick 30-Second Commercial:
```
1. Brief: Describe idea (2 min conversation)
2. Story: Accept Berry's 3-5 scene proposal
3. Assets: Auto-extracted
4. Generate: "process all cuts" → Done!
```

### Detailed Short Film:
```
1. Brief: Deep dive into vision (10 min)
2. Story: Collaborate on scene breakdown
3. Detail: "detail scene 1" → break into shots
4. Assets: Review and refine extracted elements
5. Generate: Cut-by-cut with QA review
```

### Iterate on Existing:
```
1. Click completed phase (e.g., Story ✓)
2. "Let's add a scene between 2 and 3"
3. Berry updates structure
4. Assets auto-update
5. Generate reflects changes
```

---

## Keyboard Shortcuts

- `Enter` - Send message
- `Shift + Enter` - New line
- Click phase pill - Navigate
- `✕` on banner - Dismiss notification

---

## Troubleshooting

### "Invalid format specifier" error
**Fixed!** Make sure `backend/tools/handoff.py` has `@tool` decorator.

### Can't navigate to past phases
**Already works!** Click any green checkmark (✓) pill.

### Phase transition not visible
**Fixed!** Green animated banner now appears.

### Agent asks for cut_id
**Fixed!** Agents now extract from context automatically.

---

## What Makes This Special

Traditional systems:
```
System: Field 1?
User: Value
System: Field 2?
User: Value
...repeat 30 times...
```

Strawberry Studio:
```
User: [Natural description of vision]
System: [Understands, infers, suggests, excites]
User: "Yes! Let's do it!"
System: [Autonomously executes production pipeline]
```

**From interrogation → Collaboration** 🎬

---

Ready to create something amazing! 🍓

Questions? Check:
- `V2_SUMMARY.md` - Complete system overview
- `UPGRADE_GUIDE.md` - Technical details
- `CRITICAL_FIXES_v2.md` - Recent fixes
