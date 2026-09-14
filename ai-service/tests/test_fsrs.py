import torch
import torch.nn as nn

from app.models.fsrs import FSRSModel
from app.models.dataset import collate


def test_retrievability_at_stability():
    """t = S thi R = 0.9, dung dinh nghia do ben."""
    m = FSRSModel()
    r = m.retrievability(torch.tensor([10.0]), torch.tensor([10.0]))
    assert abs(r.item() - 0.9) < 1e-6


def test_retrievability_monotonic():
    """On muon hon thi nho kem hon."""
    m = FSRSModel()
    s = torch.tensor([10.0])
    r5 = m.retrievability(torch.tensor([5.0]), s)
    r30 = m.retrievability(torch.tensor([30.0]), s)
    assert r5.item() > r30.item()


def test_stability_increases_on_success():
    m = FSRSModel()
    s, d, r = torch.tensor([10.0]), torch.tensor([5.0]), torch.tensor([0.9])
    s2 = m.stability_on_success(s, d, r, torch.tensor([3]))
    assert s2.item() > s.item()


def test_stability_drops_on_lapse():
    m = FSRSModel()
    s, d = torch.tensor([50.0]), torch.tensor([5.0])
    s2 = m.stability_on_lapse(s, d, torch.tensor([0.7]))
    assert 0 < s2.item() < s.item()


def test_difficulty_in_range():
    m = FSRSModel()
    d = torch.tensor([5.0])
    for g in [1, 2, 3, 4]:
        out = m.next_difficulty(d, torch.tensor([g]))
        assert 1.0 <= out.item() <= 10.0


def test_init_difficulty_matches_fsrs45():
    """So voi gia tri tinh tay. Test 'nam trong khoang' khong bat duoc loi cong thuc vi clamp."""
    m = FSRSModel()
    d = m.init_difficulty(torch.tensor([1, 2, 3, 4]))
    expected = torch.tensor([4.93 + 2 * 0.94, 4.93 + 0.94, 4.93, 4.93 - 0.94])
    assert torch.allclose(d, expected, atol=1e-4)


def test_next_difficulty_reverts_to_w4():
    """Good khong doi D ngoai buoc keo ve w4: D' = w7*w4 + (1-w7)*D."""
    m = FSRSModel()
    d = m.next_difficulty(torch.tensor([8.0]), torch.tensor([3]))
    expected = 0.01 * 4.93 + 0.99 * 8.0
    assert abs(d.item() - expected) < 1e-4


def test_next_interval_at_default_threshold():
    """Voi nguong 0.9, khoang cach xap xi bang do ben."""
    m = FSRSModel()
    iv = m.next_interval(torch.tensor([10.0]), 0.9)
    assert abs(iv.item() - 10.0) < 0.1


def test_gradient_flows():
    """Quan trong nhat: gradient di duoc tu loss ve toi w."""
    m = FSRSModel()
    ratings = torch.tensor([[3, 3, 2]])
    elapsed = torch.tensor([[0.0, 3.0, 8.0]])
    mask = torch.ones(1, 3, dtype=torch.bool)
    p, y = m(ratings, elapsed, mask)
    loss = nn.functional.binary_cross_entropy(p.clamp(1e-6, 1 - 1e-6), y)
    loss.backward()
    assert m.w.grad is not None
    assert not torch.isnan(m.w.grad).any()


def test_collate_pads_and_masks():
    batch = [
        (torch.tensor([3, 3]), torch.tensor([0.0, 5.0])),
        (torch.tensor([1, 3, 4]), torch.tensor([0.0, 1.0, 4.0])),
    ]
    ratings, elapsed, mask = collate(batch)
    assert ratings.shape == (2, 3)
    assert mask[0].tolist() == [True, True, False]
    assert ratings[0, 2].item() == 1        # vi tri dem phai bang 1