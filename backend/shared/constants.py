from __future__ import annotations

from datetime import timezone


PROJECT_NAME = "Marrow"
UTC = timezone.utc

DEFAULT_FORECAST_WINDOW_DAYS = 7
DEFAULT_DONOR_LIMIT = 10
CONVERSATION_MEMORY_TURNS = 6

DATASET_PATH_ENV = "MARROW_DATASET_PATH"
REPOSITORY_MODE_ENV = "MARROW_REPOSITORY"
PATIENTS_TABLE_ENV = "MARROW_PATIENTS_TABLE"
DONORS_TABLE_ENV = "MARROW_DONORS_TABLE"
INSIGHTS_TABLE_ENV = "MARROW_INSIGHTS_TABLE"
CONVERSATIONS_TABLE_ENV = "MARROW_CONVERSATIONS_TABLE"
DISTILL_FUNCTION_ENV = "MARROW_DISTILL_INSIGHT_FUNCTION"

DEFAULT_PATIENTS_TABLE = "Patients"
DEFAULT_DONORS_TABLE = "Donors"
DEFAULT_INSIGHTS_TABLE = "DonorInsights"
DEFAULT_CONVERSATIONS_TABLE = "Conversations"
DEFAULT_DISTILL_FUNCTION = "marrow-distill-insight"

NOTIFICATION_TRIGGERS = {
    "approval",
    "cycle_due",
    "eligibility_back",
    "refusal_expired",
    "curriculum_day_X",
}

INSIGHT_ALLOWED_ENGAGEMENT_STATES = {"warm", "drifting", "dormant", "lapsed"}
INSIGHT_ALLOWED_CHANNELS = {"whatsapp", "sms", "voice", "email"}
INSIGHT_ALLOWED_LANGUAGES = {"en", "hi", "te"}
INSIGHT_ALLOWED_TIME_WINDOWS = {"morning", "evening", "weekend", "any"}

BLOOD_COMPATIBILITY = {
    "O Negative": {
        "O Negative",
        "O Positive",
        "A Negative",
        "A Positive",
        "B Negative",
        "B Positive",
        "AB Negative",
        "AB Positive",
    },
    "O Positive": {"O Positive", "A Positive", "B Positive", "AB Positive"},
    "A Negative": {"A Negative", "A Positive", "AB Negative", "AB Positive"},
    "A Positive": {"A Positive", "AB Positive"},
    "B Negative": {"B Negative", "B Positive", "AB Negative", "AB Positive"},
    "B Positive": {"B Positive", "AB Positive"},
    "AB Negative": {"AB Negative", "AB Positive"},
    "AB Positive": {"AB Positive"},
}

REFUSAL_EXPIRY_DAYS = {
    "medical": 14,
    "travel": 30,
    "work": 60,
    "fear": None,
    "tired": 21,
    "trust": None,
}
