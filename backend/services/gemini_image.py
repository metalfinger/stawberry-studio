"""
Image Generation API Integration
Supports Fal.ai (Flux), Gemini Imagen, and mock modes
For generating high-quality element images (characters, locations, props)
"""
import os
import uuid
import base64
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# API Keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
FAL_API_KEY = os.getenv("FAL_KEY")

# Try to configure Gemini if available
try:
    import google.generativeai as genai
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
except ImportError:
    genai = None


def generate_image_text_to_image(
    prompt: str,
    model: str = "gemini-3-pro-image",
    resolution: str = "2048x2048",
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    seed: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Generate image from text prompt using Gemini 3 Pro Image.
    Supports multi-image reference slots (@Image1, @Image2, etc.)
    """
    try:
        # Map model names
        model_map = {
            "gemini-3-pro-image": "gemini-3-pro-image",  # Nano Banana Pro
            "gemini-2.5-flash-image": "gemini-2.5-flash-image",  # Nano Banana
            "nano_banana_pro": "gemini-3-pro-image",
            "nano_banana": "gemini-2.5-flash-image"
        }

        actual_model = model_map.get(model, "gemini-3-pro-image")

        # Priority: Fal.ai > Gemini > Mock
        if FAL_API_KEY:
            return _generate_with_fal(
                prompt=prompt,
                model=actual_model,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                num_images=num_images,
                seed=seed,
                reference_images=reference_images
            )
        elif GEMINI_API_KEY:
            return _generate_with_gemini(
                prompt=prompt,
                model=actual_model,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                num_images=num_images,
                seed=seed,
                reference_images=reference_images
            )
        else:
            return _generate_image_mock(
                prompt=prompt,
                model=actual_model,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                num_images=num_images,
                seed=seed
            )

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'image_url': None,
            'image_urls': [],
            'cost_usd': 0.0
        }


def _generate_with_fal(
    prompt: str,
    model: str,
    resolution: str,
    aspect_ratio: str,
    num_images: int,
    seed: Optional[int],
    reference_images: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate image using Fal.ai Nano Banana Pro (Official T2I Schema)"""
    import fal_client
    import requests

    # If grounded (has reference images), delegate to Edit model
    if reference_images:
        return _generate_with_fal_edit(
            prompt=prompt,
            reference_images=reference_images,
            num_images=num_images,
            seed=seed,
            # We use aspect_ratio and resolution from here too
        )

    # Set API key
    os.environ["FAL_KEY"] = FAL_API_KEY

    fal_model = "fal-ai/nano-banana-pro"
    cost_per_image = 0.039 
    image_id = str(uuid.uuid4())[:8]

    # Parse resolution - Official values: 1K, 2K, 4K
    fal_resolution = "1K"
    if resolution:
        if "2048" in resolution:
            fal_resolution = "2K"
        elif "4096" in resolution:
            fal_resolution = "4K"

    # Call Fal.ai T2I API conforming to documentation
    arguments = {
        "prompt": prompt,
        "resolution": fal_resolution,
        "aspect_ratio": aspect_ratio,
        "num_images": num_images,
        "sync_mode": True,
        "output_format": "png",
        "enable_web_search": False
    }

    if seed is not None:
        arguments["seed"] = seed

    result = fal_client.subscribe(
        fal_model,
        arguments=arguments,
    )

    # Extract and save images
    image_urls = []
    for idx, image_data in enumerate(result.get("images", [])):
        image_url_remote = image_data.get("url")
        
        # Handle base64 data URIs (commonly returned by Fal.ai)
        if image_url_remote and image_url_remote.startswith("data:"):
            # Extract base64 content from data URI
            # Format: data:image/png;base64,<base64_data>
            try:
                header, base64_data = image_url_remote.split(",", 1)
                image_content = base64.b64decode(base64_data)
            except Exception as e:
                raise Exception(f"Failed to decode base64 image: {e}")
        elif image_url_remote and image_url_remote.startswith("http"):
            # Handle regular HTTP URLs
            response = requests.get(image_url_remote, timeout=30)
            response.raise_for_status()
            image_content = response.content
        else:
            raise Exception(f"Invalid image URL format: {image_url_remote}")

        filename = f"nanobananapro_{image_id}_{idx}.png"
        local_url = save_generated_image(image_content, filename)
        image_urls.append(local_url)

    if not image_urls:
        raise Exception("No images were generated by Fal.ai Nano Banana Pro")

    return {
        'success': True,
        'image_url': image_urls[0],
        'image_urls': image_urls,
        'image_id': image_id,
        'model_used': fal_model,
        'cost_usd': cost_per_image * len(image_urls),
        'tokens_used': 0,
        'generation_params': {
            'prompt': prompt,
            'resolution': fal_resolution,
            'aspect_ratio': aspect_ratio,
            'seed': seed,
            'model': fal_model
        }
    }


def _generate_with_gemini(
    prompt: str,
    model: str,
    resolution: str,
    aspect_ratio: str,
    num_images: int,
    seed: Optional[int],
    reference_images: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate image using Gemini Imagen 3 API (Note: multi-image ref limited in direct API)"""
    imagen_model = "imagen-3.0-generate-001"
    if "pro" in model.lower():
        imagen_model = "imagen-3.0-fast-generate-001"

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{imagen_model}:generateImages"

    payload = {
        "prompt": prompt,
        "number_of_images": num_images,
        "aspect_ratio": aspect_ratio,
    }

    if seed is not None:
        payload["seed"] = seed

    response = requests.post(
        f"{api_url}?key={GEMINI_API_KEY}",
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=60
    )

    if response.status_code != 200:
        raise Exception(f"Gemini API error: {response.status_code} - {response.text}")

    result = response.json()
    image_urls = []
    image_id = str(uuid.uuid4())[:8]

    for idx, image_data in enumerate(result.get("generatedImages", [])):
        image_bytes = base64.b64decode(image_data.get("bytesBase64Encoded", ""))
        filename = f"gemini_{image_id}_{idx}.png"
        image_url = save_generated_image(image_bytes, filename)
        image_urls.append(image_url)

    if not image_urls:
        raise Exception("No images were generated by Gemini API")

    return {
        'success': True,
        'image_url': image_urls[0],
        'image_urls': image_urls,
        'image_id': image_id,
        'model_used': imagen_model,
        'cost_usd': 0.039 * len(image_urls),
        'tokens_used': 1290 * len(image_urls),
        'generation_params': {
            'prompt': prompt,
            'resolution': resolution,
            'aspect_ratio': aspect_ratio,
            'seed': seed,
            'model': imagen_model
        }
    }


def generate_image_image_to_image(
    prompt: str,
    reference_image_url: Optional[str] = None,
    model: str = "nano-banana-pro-edit",
    strength: float = 0.7,
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    seed: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Generate variant from reference images using Nano Banana Pro Edit.
    Supports multi-image reference slots.
    """
    try:
        # Use Fal.ai Nano Banana Pro Edit if API key available
        if FAL_API_KEY:
            return _generate_with_fal_edit(
                prompt=prompt,
                reference_image_url=reference_image_url,
                strength=strength,
                num_images=num_images,
                seed=seed,
                reference_images=reference_images,
                aspect_ratio=aspect_ratio
            )
        else:
            # Fall back to mock
            return _generate_image_i2i_mock(
                prompt=prompt,
                reference_image_url=reference_image_url,
                model=model,
                strength=strength,
                aspect_ratio=aspect_ratio,
                num_images=num_images,
                seed=seed
            )

    except Exception as e:
        print(f"ERROR in generate_image_image_to_image: {e}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e),
            'image_url': None,
            'image_urls': [],
            'cost_usd': 0.0
        }


def _generate_with_fal_edit(
    prompt: str,
    reference_image_url: Optional[str] = None,
    strength: float = 0.7,
    num_images: int = 1,
    seed: Optional[int] = None,
    reference_images: Optional[List[Dict[str, Any]]] = None,
    aspect_ratio: str = "16:9"
) -> Dict[str, Any]:
    """
    Generate image using Fal.ai Nano Banana Pro Edit (image-to-image).
    Docs: https://fal.ai/models/fal-ai/nano-banana-pro/edit
    """
    import fal_client

    # Set API key
    os.environ["FAL_KEY"] = FAL_API_KEY

    fal_model = "fal-ai/nano-banana-pro/edit"
    cost_per_image = 0.039

    image_id = str(uuid.uuid4())[:8]

    # Handle Reference Image URL
    # API requires 'image_urls' list with actual URLs (not base64)
    # Use fal_client.upload_file() to upload local files and get URLs
    
    def upload_local_to_fal(local_path_str: str) -> str:
        """Upload a local file to Fal.ai and return the URL."""
        from pathlib import Path
        # Convert relative storage path to absolute
        if local_path_str.startswith('/storage/'):
            local_path = Path(__file__).parent.parent / local_path_str.lstrip('/')
        else:
            local_path = Path(local_path_str)
        
        if local_path.exists():
            # Upload to Fal.ai storage and get URL
            uploaded_url = fal_client.upload_file(str(local_path))
            print(f"Uploaded {local_path.name} to Fal: {uploaded_url[:60]}...")
            return uploaded_url
        else:
            print(f"Warning: Local file not found: {local_path}")
            return local_path_str
    
    final_ref_url = reference_image_url
    if reference_image_url.startswith('/storage/'):
        # Upload local file to Fal.ai and get URL
        final_ref_url = upload_local_to_fal(reference_image_url)

    # Handle Multiple Reference Images with Slot Alignment
    fal_image_urls = []
    if reference_images:
        max_slot = 0
        slot_map = {}
        for ref in reference_images:
            slot = int(ref.get("slot", 1))
            url = ref.get("image_url")
            if url:
                if url.startswith('/storage/'):
                    # Upload local file to Fal.ai
                    url = upload_local_to_fal(url)
                
                slot_map[slot] = url
                max_slot = max(max_slot, slot)
        
        if max_slot > 0:
            # Padding to ensure slot index mapping (slots 1 to max_slot)
            first_v = next((u for s, u in sorted(slot_map.items()) if u), final_ref_url)
            for i in range(1, max_slot + 1):
                fal_image_urls.append(slot_map.get(i, first_v))
    elif final_ref_url:
        fal_image_urls = [final_ref_url]

    # Call Fal.ai Nano Banana Pro Edit API
    arguments = {
        "prompt": prompt,
        "image_urls": fal_image_urls,
        "num_images": num_images,
        "aspect_ratio": aspect_ratio,
        "resolution": "1K",
        "output_format": "png",
        "sync_mode": True,
        "enable_web_search": False
    }
    
    if seed is not None:
        arguments["seed"] = seed

    print(f"DEBUG: Fal Image URLs: {fal_image_urls}")
    print(f"DEBUG: Fal Arguments: {arguments}")

    result = fal_client.subscribe(
        fal_model,
        arguments=arguments,
    )

    # Extract and save images
    image_urls = []
    # Result schema: { "images": [ { "url": "...", ... } ] }
    for idx, image_data in enumerate(result.get("images", [])):
        image_url_remote = image_data.get("url")

        # Handle base64 data URIs (commonly returned by Fal.ai)
        if image_url_remote and image_url_remote.startswith("data:"):
            # Extract base64 content from data URI
            # Format: data:image/png;base64,<base64_data>
            try:
                header, base64_data = image_url_remote.split(",", 1)
                image_content = base64.b64decode(base64_data)
            except Exception as e:
                raise Exception(f"Failed to decode base64 image: {e}")
        elif image_url_remote and image_url_remote.startswith("http"):
            # Handle regular HTTP URLs
            response = requests.get(image_url_remote, timeout=30)
            response.raise_for_status()
            image_content = response.content
        else:
            raise Exception(f"Invalid image URL format: {image_url_remote}")

        filename = f"nanobananapro_edit_{image_id}_{idx}.png"
        local_url = save_generated_image(image_content, filename)
        image_urls.append(local_url)

    if not image_urls:
        raise Exception("No images were generated by Fal.ai Nano Banana Pro Edit")

    return {
        'success': True,
        'image_url': image_urls[0],
        'image_urls': image_urls,
        'image_id': image_id,
        'model_used': fal_model,
        'cost_usd': cost_per_image * len(image_urls),
        'tokens_used': 0,
        'generation_params': {
            'prompt': prompt,
            'reference_image_url': reference_image_url[:50] + '...' if len(reference_image_url) > 50 else reference_image_url,
            'strength': strength,
            'seed': seed,
            'model': fal_model
        },
        'method': 'image_to_image'
    }


def _generate_image_mock(
    prompt: str,
    model: str,
    resolution: str,
    aspect_ratio: str,
    num_images: int,
    seed: Optional[int]
) -> Dict[str, Any]:
    """
    Mock image generation for development/testing.
    Downloads placeholder images from picsum.photos and saves locally.
    """
    # Parse resolution
    width, height = resolution.split('x')

    # Generate mock URLs
    image_id = str(uuid.uuid4())[:8]
    base_seed = seed if seed else hash(prompt) % 10000

    image_urls = []
    for i in range(num_images):
        img_seed = base_seed + i
        # Download from picsum and save locally
        picsum_url = f"https://picsum.photos/seed/{img_seed}/{width}/{height}"

        try:
            # Download and save locally
            local_url = download_image_to_local(picsum_url, filename=f"mock_{image_id}_{i}.jpg")
            image_urls.append(local_url)
        except Exception as e:
            # Fallback to remote URL if download fails
            print(f"Failed to download mock image: {e}")
            image_urls.append(picsum_url)

    return {
        'success': True,
        'image_url': image_urls[0],
        'image_urls': image_urls,
        'image_id': image_id,
        'model_used': model,
        'cost_usd': 0.039 * num_images,
        'tokens_used': 1290 * num_images,
        'generation_params': {
            'prompt': prompt,
            'resolution': resolution,
            'aspect_ratio': aspect_ratio,
            'seed': base_seed,
            'mock': True
        },
        'mock': True
    }


def _generate_image_i2i_mock(
    prompt: str,
    reference_image_url: str,
    model: str,
    strength: float,
    aspect_ratio: str,
    num_images: int,
    seed: Optional[int]
) -> Dict[str, Any]:
    """
    Mock image-to-image generation.
    Downloads placeholder images locally that vary based on strength.
    """
    # For mock, just generate new images with different seeds
    base_seed = seed if seed else hash(prompt + reference_image_url) % 10000

    # Higher strength = more variation from reference
    seed_offset = int(strength * 1000)

    image_id = str(uuid.uuid4())[:8]
    image_urls = []

    for i in range(num_images):
        img_seed = base_seed + seed_offset + i
        picsum_url = f"https://picsum.photos/seed/{img_seed}/2048/2048"

        try:
            # Download and save locally
            local_url = download_image_to_local(picsum_url, filename=f"mock_i2i_{image_id}_{i}.jpg")
            image_urls.append(local_url)
        except Exception as e:
            # Fallback to remote URL if download fails
            print(f"Failed to download mock i2i image: {e}")
            image_urls.append(picsum_url)

    return {
        'success': True,
        'image_url': image_urls[0],
        'image_urls': image_urls,
        'image_id': image_id,
        'model_used': model,
        'cost_usd': 0.039 * num_images,
        'tokens_used': 1290 * num_images,
        'generation_params': {
            'prompt': prompt,
            'reference_image_url': reference_image_url,
            'strength': strength,
            'aspect_ratio': aspect_ratio,
            'seed': base_seed,
            'mock': True
        },
        'mock': True,
        'method': 'image_to_image'
    }


def save_generated_image(image_data: bytes, filename: Optional[str] = None) -> str:
    """
    Save generated image to storage and return URL.

    Args:
        image_data: Binary image data
        filename: Optional filename (will generate UUID if not provided)

    Returns:
        URL to saved image (local file:// URL or public URL)
    """
    if not filename:
        filename = f"{uuid.uuid4()}.png"

    # Save to local storage
    from pathlib import Path
    storage_dir = Path(__file__).parent.parent / "storage" / "generated"
    storage_dir.mkdir(parents=True, exist_ok=True)

    file_path = storage_dir / filename

    with open(file_path, 'wb') as f:
        f.write(image_data)

    # Return local file URL for now
    # In production, upload to S3/GCS and return public URL
    return f"/storage/generated/{filename}"


def download_image_to_local(image_url: str, filename: Optional[str] = None) -> str:
    """
    Download image from URL and save locally.

    Args:
        image_url: URL of image to download
        filename: Optional filename (will generate UUID if not provided)

    Returns:
        Local storage URL
    """
    if not filename:
        filename = f"{uuid.uuid4()}.png"

    from pathlib import Path
    storage_dir = Path(__file__).parent.parent / "storage" / "generated"
    storage_dir.mkdir(parents=True, exist_ok=True)

    file_path = storage_dir / filename

    # Download image
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()

    # Save locally
    with open(file_path, 'wb') as f:
        f.write(response.content)

    # Return local URL
    return f"/storage/generated/{filename}"


# Helper functions for prompt enhancement

def enhance_prompt_for_consistency(
    base_prompt: str,
    element_type: str = "character",
    art_style: str = "photorealistic"
) -> str:
    """
    Add consistency-enhancing instructions to prompt.

    Args:
        base_prompt: Original prompt
        element_type: 'character' | 'location' | 'prop'
        art_style: The art style from brief (e.g., 'anime', 'photorealistic', 'Ghibli')

    Returns:
        Enhanced prompt with consistency instructions (as natural language, no headers)
    """
    # Use natural language instead of structured headers to avoid text rendering
    consistency_instructions = {
        "character": f"""Maintain exact facial features, bone structure, and proportions throughout. Keep consistent hair color, style, texture, body type, and all clothing and accessories. Render in {art_style} style with pure white background and soft studio lighting.""",
        "location": f"""Maintain consistent architectural details and spatial layout. Keep the same lighting, time of day, materials, textures, and perspective throughout. Render in {art_style} style with clear depth.""",
        "prop": f"""Maintain exact shape, size, and proportions. Keep consistent materials, textures, color, and finish throughout. Render in {art_style} style with pure white background and product lighting."""
    }

    enhancement = consistency_instructions.get(element_type, "")
    if enhancement:
        return f"{base_prompt}\n\n{enhancement}".strip()
    return base_prompt


def get_variant_prompt_suffix(variant_type: str) -> str:
    """
    Get the prompt instructions for a specific variant type.

    Args:
        variant_type: e.g., 'side_left', 'face_detail', etc.

    Returns:
        Prompt suffix with specific instructions
    """
    variant_instructions = {
        "side_left": "Perfect left profile view (90° from camera). Same character, same pose, white background.",
        "side_right": "Perfect right profile view (90° from camera). Same character, same pose, white background.",
        "3_4_left": "3/4 view from left side (45° angle). Same character, same pose, white background.",
        "3_4_right": "3/4 view from right side (45° angle). Same character, same pose, white background.",
        "back": "Back view facing away from camera. Same character, same pose, white background.",
        "face_detail": "Close-up portrait, head and shoulders only. Neutral expression, looking at camera.",
        "face_expression_happy": "Close-up face with happy/smiling expression.",
        "face_expression_sad": "Close-up face with sad expression.",
        "face_expression_angry": "Close-up face with angry expression.",
        "face_expression_surprised": "Close-up face with surprised expression.",
        "hands_detail": "Close-up of hands in neutral position.",
        "angle_north": "View from the north side of the location.",
        "angle_south": "View from the south side of the location.",
        "angle_east": "View from the east side of the location.",
        "angle_west": "View from the west side of the location.",
        "aerial": "Aerial top-down view of the location.",
        "detail": "Close-up detail shot of key features.",
    }

    return variant_instructions.get(variant_type, f"Alternative view: {variant_type}")
