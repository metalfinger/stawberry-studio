"""
Element Generator Agent
Generates master images and variants for characters, locations, and props
Using Gemini 3 Pro Image (Nano Banana Pro)
"""
import google.generativeai as genai

from backend.tools import element_generation

# Agent System Message
SYSTEM_MESSAGE = """You are the Element Generator, responsible for creating high-quality reference images for characters, locations, and props.

Your role:
- Generate master reference images from text descriptions
- Create variant views (sides, angles, expressions) from masters
- Maintain visual consistency across all variants
- Use Gemini 3 Pro Image (Nano Banana Pro) for studio-quality results

Workflow:
1. Master Generation: Create a primary reference image from asset description
2. Variant Generation: Create alternative views using image-to-image from the master
3. Quality Check: Ensure consistency and quality

Available tools:
- generate_element_master() - Create master reference image
- compile_element_master_prompt() - Preview/edit prompt before generating
- generate_element_variant() - Create variant view from master
- generate_all_standard_variants() - Generate full variant set
- get_asset_elements_summary() - Check what exists for an asset
- get_generation_history() - View past generations

Best practices:
- Always preview the compiled prompt before generating
- Use Gemini 3 Pro Image for masters (highest quality)
- Use Gemini 2.5 Flash for variants (faster, good for i2i)
- Maintain consistency: white background, studio lighting, photorealistic
- For characters: neutral pose, front view for master
- For locations: hero establishing shot for master
- For props: clean product shot for master

When user requests generation:
1. Show what you're about to generate
2. Display the compiled prompt
3. Ask for confirmation or edits
4. Generate and report results
5. Suggest next steps (generate variants, etc.)

Be helpful, explain what you're doing, and guide the user through the generation process.
"""

def create_agent():
    """Create Element Generator agent instance."""
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash-exp",
        system_instruction=SYSTEM_MESSAGE
    )

    # Register tools
    tools = [
        element_generation.generate_element_master,
        element_generation.compile_element_master_prompt,
        element_generation.generate_element_variant,
        element_generation.compile_element_variant_prompt,
        element_generation.generate_all_standard_variants,
        element_generation.get_element_master,
        element_generation.get_element_variants,
        element_generation.get_asset_elements_summary,
        element_generation.get_generation_history,
        element_generation.delete_element_variant,
        element_generation.deactivate_element_variant,
    ]

    return model, tools


# Example usage in chat flow:
"""
User: "Generate master image for Sarah character"

Element Generator:
1. Calls get_asset_elements_summary("sarah_asset_id")
   → Checks if master already exists

2. Calls compile_element_master_prompt("sarah_asset_id")
   → Shows user the prompt that will be used

3. Displays prompt to user:
   "I'll generate a master reference image for Sarah using this prompt:

   [Shows compiled prompt]

   This will create a full-body, front-view photorealistic render on white background.
   Should I proceed?"

4. User confirms

5. Calls generate_element_master("sarah_asset_id", auto_generate=True)
   → Generates master using Gemini 3 Pro Image

6. Reports result:
   "✅ Master generated successfully!
    View: [master_image_url]

    Next steps:
    - Generate standard variants (side, 3/4, back, face detail)
    - Or specify custom variants

    Would you like me to generate the standard variant set?"

7. If user agrees:
   Calls generate_all_standard_variants(master_id)
   → Generates 6 standard character variants

8. Reports completion:
   "✅ Generated 6 variants:
    - Side left
    - Side right
    - 3/4 left
    - 3/4 right
    - Back
    - Face detail

    Sarah's element is now complete with master + 6 variants.
    This can be used as reference in your cut generations."
"""
