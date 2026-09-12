"""The hiring pipeline rules, tested directly on the single implementation."""

from __future__ import annotations

import pytest

from app.models.enums import ApplicationStatus as S

LEGAL = [
    (S.APPLIED, S.SCREENING),
    (S.APPLIED, S.REJECTED),
    (S.SCREENING, S.INTERVIEW),
    (S.SCREENING, S.REJECTED),
    (S.INTERVIEW, S.SELECTED),
    (S.INTERVIEW, S.REJECTED),
]

ILLEGAL = [
    (S.APPLIED, S.INTERVIEW),      # no stage skipping
    (S.APPLIED, S.SELECTED),
    (S.SCREENING, S.SELECTED),
    (S.INTERVIEW, S.SCREENING),    # no going backwards
    (S.SCREENING, S.APPLIED),
    (S.SELECTED, S.REJECTED),      # terminal
    (S.REJECTED, S.SCREENING),     # terminal
    (S.SELECTED, S.INTERVIEW),
    (S.APPLIED, S.APPLIED),        # a no-op is a client mistake
]


@pytest.mark.parametrize(("current", "target"), LEGAL)
def test_allowed_transitions(current, target):
    assert S.can_transition(current, target) is True


@pytest.mark.parametrize(("current", "target"), ILLEGAL)
def test_forbidden_transitions(current, target):
    assert S.can_transition(current, target) is False


def test_terminal_states_have_no_next_steps():
    assert S.next_statuses(S.SELECTED) == []
    assert S.next_statuses(S.REJECTED) == []
    assert S.SELECTED.is_terminal and S.REJECTED.is_terminal
    assert not S.APPLIED.is_terminal


def test_every_status_is_covered_by_the_transition_table():
    table = S.allowed_transitions()
    assert set(table) == set(S)


def test_rejection_is_reachable_from_every_live_stage():
    for status in (S.APPLIED, S.SCREENING, S.INTERVIEW):
        assert S.REJECTED in S.next_statuses(status)
