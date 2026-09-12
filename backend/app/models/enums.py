"""Controlled vocabularies.

These enums are the single source of truth for the whole system. The database
stores their ``value`` strings, Pydantic validates against them, and
``frontend/src/types/api.ts`` mirrors them. Nothing anywhere should compare
against a bare string such as ``"interview"``.
"""

from __future__ import annotations

from enum import Enum


class EmploymentType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERNSHIP = "INTERNSHIP"


class ApplicationStatus(str, Enum):
    """The hiring pipeline.

        APPLIED -> SCREENING -> INTERVIEW -> SELECTED
        APPLIED | SCREENING | INTERVIEW -> REJECTED

    ``SELECTED`` and ``REJECTED`` are terminal. The transition table below is
    the *only* implementation of these rules in the codebase (project rule R3);
    the admin API, the UI and the tests all defer to ``can_transition``.
    """

    APPLIED = "APPLIED"
    SCREENING = "SCREENING"
    INTERVIEW = "INTERVIEW"
    SELECTED = "SELECTED"
    REJECTED = "REJECTED"

    @classmethod
    def allowed_transitions(cls) -> dict[ApplicationStatus, set[ApplicationStatus]]:
        return {
            cls.APPLIED: {cls.SCREENING, cls.REJECTED},
            cls.SCREENING: {cls.INTERVIEW, cls.REJECTED},
            cls.INTERVIEW: {cls.SELECTED, cls.REJECTED},
            cls.SELECTED: set(),
            cls.REJECTED: set(),
        }

    @classmethod
    def can_transition(cls, current: ApplicationStatus, target: ApplicationStatus) -> bool:
        if current == target:
            return False  # a no-op status change is treated as a client mistake
        return target in cls.allowed_transitions()[current]

    @classmethod
    def next_statuses(cls, current: ApplicationStatus) -> list[ApplicationStatus]:
        """Used by the admin UI to render only the legal next steps."""
        return sorted(cls.allowed_transitions()[current], key=lambda s: s.value)

    @property
    def is_terminal(self) -> bool:
        return self in {ApplicationStatus.SELECTED, ApplicationStatus.REJECTED}


# Reference vocabularies for seed data, filter dropdowns and validation help.
# Departments/locations stay free-text columns (a startup adds new ones without
# a migration) but the UI offers these as the curated list.
DEPARTMENTS: tuple[str, ...] = (
    "Engineering",
    "Human Resources",
    "Finance",
    "Sales",
    "Marketing",
    "Operations",
    "Support",
    "Design",
    "Data",
)

LOCATIONS: tuple[str, ...] = (
    "Delhi NCR",
    "Bengaluru",
    "Mumbai",
    "Hyderabad",
    "Pune",
    "Remote",
)
