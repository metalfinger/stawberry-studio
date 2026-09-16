"""Regression: when an agent fires multiple add_scene/add_shot/add_cut calls
in parallel (Pydantic AI lets it), they used to all read the same MAX value
and emit duplicate scene_number/shot_number/cut_number. Fixed by moving
the MAX inside the INSERT (atomic at SQLite level)."""
import asyncio
import pytest

from backend import db
create_project = db.create_project
from backend import db
add_scene = db.add_scene
from backend import db
add_shot = db.add_shot
add_cut = db.add_cut


@pytest.mark.asyncio
async def test_parallel_add_scene_unique_numbers(tmp_db):
    p = create_project("Parallel")
    pid = p["id"]
    # Fire 5 add_scene concurrently
    results = await asyncio.gather(*[
        asyncio.to_thread(add_scene, pid, title=f"S{i}") for i in range(5)
    ])
    nums = sorted(r["scene_number"] for r in results)
    assert nums == [1, 2, 3, 4, 5], f"got {nums}"


@pytest.mark.asyncio
async def test_parallel_add_shot_unique_numbers(tmp_db):
    p = create_project("Parallel2")
    pid = p["id"]
    scene = add_scene(pid, title="X")
    results = await asyncio.gather(*[
        asyncio.to_thread(add_shot, scene["id"], description=f"shot {i}") for i in range(5)
    ])
    nums = sorted(r["shot_number"] for r in results)
    assert nums == [1, 2, 3, 4, 5], f"got {nums}"


@pytest.mark.asyncio
async def test_parallel_add_cut_unique_numbers(tmp_db):
    p = create_project("Parallel3")
    pid = p["id"]
    scene = add_scene(pid, title="X")
    shot = add_shot(scene["id"], description="x")
    results = await asyncio.gather(*[
        asyncio.to_thread(add_cut, shot["id"], action=f"a{i}") for i in range(5)
    ])
    nums = sorted(r["cut_number"] for r in results)
    assert nums == [1, 2, 3, 4, 5], f"got {nums}"
