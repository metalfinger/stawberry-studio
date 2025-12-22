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
    params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate image from text prompt using Gemini 3 Pro Image.

    Args:
        prompt: Text description of what to generate
        model: 'gemini-3-pro-image' (Nano Banana Pro) or 'gemini-2.5-flash-image' (Nano Banana)
        resolution: '1024x1024' | '2048x2048' | '4096x4096'
        aspect_ratio: '1:1' | '16:9' | '9:16' | '3:2' | '2:3' | etc.
        num_images: Number of images to generate (1-4)
        seed: Optional seed for reproducibility
        params: Additional generation parameters

    Returns:
        {
            'success': bool,
            'image_url': str,           # First generated image
            'image_urls': List[str],    # All generated images
            'image_id': str,
            'model_used': str,
            'cost_usd': float,
            'tokens_used': int,
            'generation_params': dict,
            'error': str (if failed)
        }
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
                seed=seed
            )
        elif GEMINI_API_KEY:
            return _generate_with_gemini(
                prompt=prompt,
                model=actual_model,
                resolution=resolution,
                aspect_ratio=aspect_ratio,
                num_images=num_images,
                seed=seed
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
    seed: Optional[int]
) -> Dict[str, Any]:
    """Generate image using Fal.ai Nano Banana Pro (text-to-image)"""
    import fal_client

    # Set API key
    os.environ["FAL_KEY"] = FAL_API_KEY

    # Parse resolution to get image size
    width, height = resolution.split('x')
    width, height = int(width), int(height)

    # Use Nano Banana Pro for all generations
    fal_model = "fal-ai/nano-banana-pro"
    cost_per_image = 0.039  # Similar to Gemini pricing

    image_id = str(uuid.uuid4())[:8]

    # Call Fal.ai Nano Banana Pro API
    result = fal_client.subscribe(
        fal_model,
        arguments={
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, distorted, deformed",
            "image_size": {
                "width": width,
                "height": height
            },
            "num_images": num_images,
            "seed": seed,
            "guidance_scale": 7.5,
            "num_inference_steps": 30,
            "enable_safety_checker": False,
            "output_format": "png"
        },
    )

    # Extract and save images
    image_urls = []
    for idx, image_data in enumerate(result.get("images", [])):
        image_url_remote = image_data.get("url")

        # Download and save locally
        response = requests.get(image_url_remote, timeout=30)
        response.raise_for_status()

        filename = f"nanobananapro_{image_id}_{idx}.png"
        local_url = save_generated_image(response.content, filename)
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
            'resolution': resolution,
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
    seed: Optional[int]
) -> Dict[str, Any]:
    """Generate image using Gemini Imagen 3 API"""
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
    reference_image_url: str,
    model: str = "nano-banana-pro-edit",
    strength: float = 0.7,
    aspect_ratio: str = "1:1",
    num_images: int = 1,
    seed: Optional[int] = None,
    params: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate variant from reference image using Nano Banana Pro Edit.

    Args:
        prompt: What to change/generate
        reference_image_url: Base image URL
        model: Model to use
        strength: 0.0-1.0, how much to deviate from reference
        aspect_ratio: Aspect ratio
        num_images: Number of variants
        seed: Optional seed
        params: Additional parameters

    Returns: Same structure as generate_image_text_to_image
    """
    try:
        # Use Fal.ai Nano Banana Pro Edit if API key available
        if FAL_API_KEY:
            return _generate_with_fal_edit(
                prompt=prompt,
                reference_image_url=reference_image_url,
                strength=strength,
                num_images=num_images,
                seed=seed
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
        return {
            'success': False,
            'error': str(e),
            'image_url': None,
            'image_urls': [],
            'cost_usd': 0.0
        }


def _generate_with_fal_edit(
    prompt: str,
    reference_image_url: str,
    strength: float = 0.7,
    num_images: int = 1,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """Generate image using Fal.ai Nano Banana Pro Edit (image-to-image)"""
    import fal_client

    # Set API key
    os.environ["FAL_KEY"] = FAL_API_KEY

    fal_model = "fal-ai/nano-banana-pro/edit"
    cost_per_image = 0.039

    image_id = str(uuid.uuid4())[:8]

    # If reference_image_url is a local path, we need to read it and convert to base64
    if reference_image_url.startswith('/storage/'):
        # Read local file
        from pathlib import Path
        local_path = Path(__file__).parent.parent / reference_image_url.lstrip('/')
        with open(local_path, 'rb') as f:
            image_data = f.read()
        # Convert to data URL
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        reference_image_url = f"data:image/png;base64,{image_base64}"

    # Call Fal.ai Nano Banana Pro Edit API
    result = fal_client.subscribe(
        fal_model,
        arguments={
            "prompt": prompt,
            "image_url": reference_image_url,
            "strength": strength,
            "negative_prompt": "blurry, low quality, distorted, deformed",
            "num_images": num_images,
            "seed": seed,
            "guidance_scale": 7.5,
            "num_inference_steps": 30,
            "enable_safety_checker": False,
            "output_format": "png"
        },
    )

    # Extract and save images
    image_urls = []
    for idx, image_data in enumerate(result.get("images", [])):
        image_url_remote = image_data.get("url")

        # Download and save locally
        response = requests.get(image_url_remote, timeout=30)
        response.raise_for_status()

        filename = f"nanobananapro_edit_{image_id}_{idx}.png"
        local_url = save_generated_image(response.content, filename)
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
    element_type: str = "character"
) -> str:
    """
    Add consistency-enhancing instructions to prompt.

    Args:
        base_prompt: Original prompt
        element_type: 'character' | 'location' | 'prop'

    Returns:
        Enhanced prompt with consistency instructions
    """
    consistency_instructions = {
        "character": """
CONSISTENCY REQUIREMENTS:
- Photorealistic 3D render quality
- Exact same facial features, bone structure, and proportions
- Consistent hair color, style, and texture
- Same body type and build
- Identical clothing and accessories
- Pure white background for easy extraction
- Studio lighting with no background shadows
""",
        "location": """
CONSISTENCY REQUIREMENTS:
- Photorealistic architectural detail
- Consistent lighting and time of day
- Same spatial layout and proportions
- Matching materials and textures
- Clear depth and perspective
""",
        "prop": """
CONSISTENCY REQUIREMENTS:
- Photorealistic product photography quality
- Exact same shape, size, and proportions
- Consistent materials and textures
- Same color and finish
- Pure white background
- Studio product lighting
"""
    }

    enhancement = consistency_instructions.get(element_type, "")
    return f"{base_prompt}\n\n{enhancement}".strip()


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
