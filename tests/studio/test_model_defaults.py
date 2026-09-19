from backend.studio.models import RecipeCreate


def test_new_recipe_defaults_to_gpt_image():
    recipe = RecipeCreate(node_id="cut", prompt="Storyboard frame", intent="First take")
    assert recipe.provider == "higgsfield"
    assert recipe.model == "gpt_image_2_5"
    assert recipe.settings == {}
    assert recipe.model_dump()["model"] == "gpt_image_2_5"


def test_explicit_model_and_settings_survive_round_trip():
    recipe = RecipeCreate(
        node_id="cut", model="nano_banana_2", prompt="Storyboard frame",
        intent="Existing recipe", settings={"resolution": "2k"},
    )
    restored = RecipeCreate.model_validate(recipe.model_dump())
    assert restored.model == "nano_banana_2"
    assert restored.settings == {"resolution": "2k"}
