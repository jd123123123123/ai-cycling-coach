"""Guard properties: fixed geometry, no ghost frame, and private/versioned cache."""
import base64
import io
from datetime import datetime, timezone
from types import SimpleNamespace

import numpy as np
from PIL import Image
from app.services import scene_render, stage_frame, stage_swap
from test_stage_swap import _scene, _cutout


def test_cache_is_private_and_tracks_original_and_scene():
    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    a = SimpleNamespace(id=5, user_id=1, created_at=now, updated_at=now)
    other = SimpleNamespace(id=5, user_id=2, created_at=now, updated_at=now)
    assert scene_render.cache_key(a, 'mond') != scene_render.cache_key(other, 'mond')
    assert scene_render.cache_key(a, 'mond') != scene_render.cache_key(a, 'startrampe')


def test_all_scenes_share_exact_original_silhouette_position():
    cutout = _cutout()
    size = (1080, 1920)
    sep = stage_frame.TARGET_SEP * size[0]
    wheels = stage_frame.Wheels(540-sep/2, 540+sep/2, .735*1920-sep/2.93, sep/2.93)
    expected = stage_swap._placed(cutout, wheels, size).getbbox()
    boxes = []
    original = stage_swap._placed
    def capture(cut, w, sz):
        p = original(cut, w, sz); boxes.append(p.getbbox()); return p
    from unittest.mock import patch
    with patch.object(stage_swap, '_placed', side_effect=capture):
        for contact in (.72, .735, .75):
            image, report = stage_swap.merge(_scene(size=size), _scene(size=size, contact=contact), cutout, 2.93, locked_frame=True)
            assert image is not None and report.env_identical == 1
    assert boxes == [expected]*3


def test_cleanup_removes_candidate_edges_in_transparent_frame_holes():
    base = _scene()
    clean = Image.new('RGB', base.size, (110, 110, 110))
    result, report = stage_swap.merge(base, base, _cutout(), 560/191, clean_world=clean)
    assert result is not None and report.env_identical == 1
    # A sizeable set of pixels through the wheel/frame holes must be restored
    # from the clean world instead of retaining the model's duplicate spokes.
    same = np.all(np.asarray(result) == (110,110,110), axis=2)
    assert same.sum() > 10000


def test_unreadable_bike_never_exposes_raw_generation():
    b=io.BytesIO();Image.new('RGB',(20,20),'red').save(b,'PNG')
    invalid='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
    image, reason=scene_render.checked_image(scene_render.template('mond'), invalid, invalid)
    assert image is None and reason=='bike_geometry_unavailable'
